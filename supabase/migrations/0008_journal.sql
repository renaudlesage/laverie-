-- 0008_journal.sql — Journal, projections et recalcul (jalon M5).
-- À exécuter après 0007_reglages.sql.
--
-- Principe : une seule fonction de transition, prive.appliquer, porte la machine à états de
-- docs/CONCEPT.md §5. Elle sert à l'ingestion (ingerer_evenements) ET au rejeu du journal
-- (recalculer_vetement) : la projection rejouée est identique à la projection maintenue.
-- Le rejeu suit l'ordre d'ingestion (evenements.numero), pas l'horloge des appareils.
-- Annulation : seul le dernier événement de statut non annulé d'un vêtement s'annule, avec un
-- motif ; on corrige plus ancien en annulant à rebours. Tags et enrôlement ne s'annulent pas.

begin;

-- ---------------------------------------------------------------------------
-- Ordre d'ingestion
-- ---------------------------------------------------------------------------

alter table public.evenements add column numero bigint generated always as identity;
create unique index evenements_numero_idx on public.evenements (numero);
create index evenements_vetement_numero_idx on public.evenements (vetement_id, numero);

-- ---------------------------------------------------------------------------
-- Machine à états
-- ---------------------------------------------------------------------------

create type prive.etat_vetement as (
  statut public.statut_vetement,
  contamine boolean,
  site_id uuid,
  porteur_id uuid,
  lot_id uuid,
  derniere_lecture_le timestamptz,
  controle_renforce boolean
);

create function prive.exiger_statut(actuel public.statut_vetement, admis public.statut_vetement[], evenement public.type_evenement)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if actuel is null or not (actuel = any (admis)) then
    raise exception 'Transition impossible : « % » depuis le statut « % »', evenement, coalesce(actuel::text, 'aucun')
      using errcode = 'check_violation';
  end if;
end;
$$;

-- Applique un événement de statut à un état. Lève une erreur si la transition est interdite.
-- Les événements de tag et l'annulation n'y passent pas (ils ne changent pas le statut).
create function prive.appliquer(
  e prive.etat_vetement, type public.type_evenement, site uuid, lot uuid, quand timestamptz, d jsonb, nominatif boolean
) returns prive.etat_vetement
language plpgsql immutable set search_path = '' as $$
declare
  r prive.etat_vetement := e;
begin
  r.derniere_lecture_le := greatest(e.derniere_lecture_le, quand);

  case type
    when 'enrolement' then
      if e.statut is not null then
        raise exception 'Vêtement déjà enrôlé' using errcode = 'check_violation';
      end if;
      r := row('en_stock', false, site, null, null, quand, false)::prive.etat_vetement;

    when 'attribution' then
      perform prive.exiger_statut(e.statut, '{en_stock}', type);
      r.statut := 'en_service';
      r.porteur_id := (d ->> 'porteur_id')::uuid;
      r.site_id := coalesce(site, e.site_id);

    when 'restitution' then
      perform prive.exiger_statut(e.statut, '{en_service}', type);
      r.statut := 'en_stock';
      r.porteur_id := case when nominatif then e.porteur_id end;
      r.site_id := coalesce(site, e.site_id);

    when 'contamination' then
      perform prive.exiger_statut(e.statut, '{en_service,en_stock,collecte,en_laverie}', type);
      r.statut := case when e.statut in ('collecte', 'en_laverie') then 'en_laverie' else 'a_decontaminer' end;
      r.contamine := true;
      r.site_id := coalesce(site, e.site_id);

    when 'collecte' then
      perform prive.exiger_statut(e.statut, '{en_service,en_stock,a_decontaminer}', type);
      r.statut := 'collecte';
      r.lot_id := lot;

    when 'reception' then
      perform prive.exiger_statut(e.statut, '{collecte}', type);
      r.statut := 'en_laverie';
      r.site_id := coalesce(site, e.site_id);
      r.lot_id := null;

    when 'ajout_lot' then
      perform prive.exiger_statut(e.statut, '{en_laverie}', type);
      r.statut := 'en_traitement';
      r.lot_id := lot;

    when 'retrait_lot' then
      perform prive.exiger_statut(e.statut, '{en_traitement}', type);
      r.statut := 'en_laverie';
      r.lot_id := null;

    when 'traitement' then
      perform prive.exiger_statut(e.statut, '{en_traitement}', type);
      r.statut := 'traite';
      r.lot_id := null;
      r.controle_renforce := false; -- un nouveau passage appelle un nouveau contrôle

    when 'controle' then
      perform prive.exiger_statut(e.statut, '{traite}', type);
      r.statut := case d ->> 'verdict'
        when 'conforme' then 'pret'
        when 'a_reparer' then 'a_reparer'
        when 'reforme' then 'reforme'
      end;
      if r.statut is null then
        raise exception 'Contrôle : verdict attendu conforme, a_reparer ou reforme' using errcode = 'check_violation';
      end if;
      if d ->> 'verdict' = 'conforme' then
        r.controle_renforce := coalesce((d ->> 'renforce')::boolean, false);
        if coalesce((d ->> 'decontamine')::boolean, false) then r.contamine := false; end if;
      end if;

    when 'reparation' then
      perform prive.exiger_statut(e.statut, '{a_reparer}', type);
      r.statut := 'traite';

    when 'livraison' then
      perform prive.exiger_statut(e.statut, '{pret}', type);
      r.statut := case when e.porteur_id is not null then 'en_service' else 'en_stock' end;
      r.site_id := coalesce(site, e.site_id);

    when 'vu_en_inventaire' then
      r.site_id := coalesce(site, e.site_id);

    when 'perte' then
      perform prive.exiger_statut(e.statut,
        '{en_stock,en_service,a_decontaminer,collecte,en_laverie,en_traitement,traite,a_reparer,pret}', type);
      r.statut := 'perdu';

    when 'retrouve' then
      perform prive.exiger_statut(e.statut, '{perdu}', type);
      r.statut := 'en_stock';
      r.site_id := coalesce(site, e.site_id);

    when 'reforme' then
      perform prive.exiger_statut(e.statut,
        '{en_stock,en_service,a_decontaminer,collecte,en_laverie,en_traitement,traite,a_reparer,pret,perdu}', type);
      r.statut := 'reforme';
      r.porteur_id := null;
      r.lot_id := null;

    else
      raise exception 'Événement « % » sans effet de statut', type using errcode = 'check_violation';
  end case;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seuils (attribution et livraison refusées sans contrôle renforcé ou réforme)
-- ---------------------------------------------------------------------------

create function prive.seuil_atteint(vetement uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
      select 1
      from public.compteurs c
      join public.vetements v on v.id = c.vetement_id
      left join public.vetements_limites vl on vl.vetement_id = v.id and vl.traitement_id = c.traitement_id
      left join public.articles_limites al on al.article_id = v.article_id and al.traitement_id = c.traitement_id
      where c.vetement_id = vetement and c.passages >= coalesce(vl.limite, al.limite)
    )
    or exists (
      select 1 from public.vetements v join public.articles a on a.id = v.article_id
      where v.id = vetement and a.duree_vie_mois is not null and v.mis_en_service_le is not null
        and v.mis_en_service_le + make_interval(months => a.duree_vie_mois) < current_date
    );
$$;

-- ---------------------------------------------------------------------------
-- Recalcul : rejoue le journal et réécrit toutes les projections du vêtement
-- ---------------------------------------------------------------------------

create function prive.recalculer(vetement uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v public.vetements;
  ev record;
  etat prive.etat_vetement;
  compteurs jsonb := '{}'::jsonb;    -- traitement_id → passages
  tags jsonb := '{}'::jsonb;         -- identifiant_id → { actif, pose_le, retire_le, motif, passages }
  cle text;
  traitement uuid;
  avant text;
  apres text;
begin
  select * into v from public.vetements where id = vetement for update;
  if v.id is null then
    raise exception 'Vêtement introuvable' using errcode = 'no_data_found';
  end if;
  avant := (select row(v.statut, v.contamine, v.site_id, v.porteur_id, v.lot_id, v.derniere_lecture_le, v.controle_renforce)::text)
    || coalesce((select string_agg(c.traitement_id || ':' || c.passages, ',' order by c.traitement_id) from public.compteurs c where c.vetement_id = vetement and c.passages > 0), '')
    || coalesce((select string_agg(i.id || ':' || i.actif || ':' || i.passages_depuis_pose || ':' || coalesce(i.retire_le::text, ''), ',' order by i.id) from public.identifiants i where i.vetement_id = vetement), '');

  for ev in
    select e.* from public.evenements e
    where e.vetement_id = vetement and e.annule_par is null and e.type <> 'annulation'
    order by e.numero
  loop
    if ev.type = 'tag_pose' then
      tags := tags || jsonb_build_object(ev.donnees ->> 'identifiant_id',
        jsonb_build_object('actif', true, 'pose_le', ev.survenu_le, 'retire_le', null, 'motif', null, 'passages', 0));
    elsif ev.type = 'tag_retire' then
      cle := ev.donnees ->> 'identifiant_id';
      tags := jsonb_set(tags, array[cle], (tags -> cle) || jsonb_build_object('actif', false, 'retire_le', ev.survenu_le, 'motif', ev.donnees ->> 'motif'));
    else
      etat := prive.appliquer(etat, ev.type, ev.site_id, ev.lot_id, ev.survenu_le, ev.donnees, v.nominatif);
      if ev.type = 'traitement' then
        traitement := coalesce((ev.donnees ->> 'traitement_id')::uuid, (select l.traitement_id from public.lots l where l.id = ev.lot_id));
        compteurs := compteurs || jsonb_build_object(traitement, coalesce((compteurs ->> traitement::text)::int, 0) + 1);
        for cle in select k from jsonb_each(tags) t(k, x) where (x ->> 'actif')::boolean loop
          tags := jsonb_set(tags, array[cle, 'passages'], to_jsonb((tags #>> array[cle, 'passages'])::int + 1));
        end loop;
      elsif ev.type = 'reforme' then
        for cle in select k from jsonb_each(tags) t(k, x) where (x ->> 'actif')::boolean loop
          tags := jsonb_set(tags, array[cle], (tags -> cle) || jsonb_build_object('actif', false, 'retire_le', ev.survenu_le, 'motif', 'Réforme'));
        end loop;
      end if;
    end if;
  end loop;

  if etat.statut is null then
    raise exception 'Journal sans enrôlement pour le vêtement %', vetement using errcode = 'check_violation';
  end if;

  update public.vetements set
    statut = etat.statut, contamine = etat.contamine, site_id = etat.site_id, porteur_id = etat.porteur_id,
    lot_id = etat.lot_id, derniere_lecture_le = etat.derniere_lecture_le, controle_renforce = etat.controle_renforce
  where id = vetement;

  -- Compteurs : valeurs rejouées ; les traitements absents du journal reviennent à 0.
  update public.compteurs c set passages = 0
  where c.vetement_id = vetement and not compteurs ? c.traitement_id::text;
  insert into public.compteurs (organisation_id, vetement_id, traitement_id, passages)
  select v.organisation_id, vetement, k::uuid, (x #>> '{}')::int from jsonb_each(compteurs) t(k, x)
  on conflict (vetement_id, traitement_id) do update set passages = excluded.passages;

  -- Identifiants : d'abord les retraits (libère l'index unique), puis les états actifs.
  update public.identifiants i set
    actif = false, retire_le = (x ->> 'retire_le')::timestamptz, motif_retrait = x ->> 'motif',
    pose_le = (x ->> 'pose_le')::timestamptz, passages_depuis_pose = (x ->> 'passages')::int
  from jsonb_each(tags) t(k, x)
  where i.id = k::uuid and not (x ->> 'actif')::boolean;
  update public.identifiants i set
    actif = true, retire_le = null, motif_retrait = null,
    pose_le = (x ->> 'pose_le')::timestamptz, passages_depuis_pose = (x ->> 'passages')::int
  from jsonb_each(tags) t(k, x)
  where i.id = k::uuid and (x ->> 'actif')::boolean;

  apres := (select row(etat.statut, etat.contamine, etat.site_id, etat.porteur_id, etat.lot_id, etat.derniere_lecture_le, etat.controle_renforce)::text)
    || coalesce((select string_agg(c.traitement_id || ':' || c.passages, ',' order by c.traitement_id) from public.compteurs c where c.vetement_id = vetement and c.passages > 0), '')
    || coalesce((select string_agg(i.id || ':' || i.actif || ':' || i.passages_depuis_pose || ':' || coalesce(i.retire_le::text, ''), ',' order by i.id) from public.identifiants i where i.vetement_id = vetement), '');
  return avant is distinct from apres; -- vrai si la projection a dû être corrigée
end;
$$;

-- ---------------------------------------------------------------------------
-- Ingestion d'un événement de statut (hors enrôlement, tags et annulation)
-- ---------------------------------------------------------------------------

-- Qui peut émettre quoi (la visibilité du vêtement est vérifiée en plus).
create function prive.peut_emettre(org uuid, type public.type_evenement) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when type in ('attribution', 'restitution', 'perte', 'retrouve', 'reforme', 'annulation')
      then prive.a_role(org, 'admin', 'gestionnaire')
    when type = 'contamination'
      then prive.a_role(org, 'admin', 'gestionnaire', 'operateur_laverie', 'laverie_externe')
    when type = 'vu_en_inventaire'
      then prive.a_role(org, 'admin', 'gestionnaire', 'operateur_laverie')
    else false -- collecte, réception, lots, contrôle, livraison : jalon M6
  end;
$$;

create function prive.ingerer_statut(org uuid, ev jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  genre public.type_evenement := (ev ->> 'type')::public.type_evenement;
  v public.vetements;
  d jsonb := coalesce(ev -> 'donnees', '{}'::jsonb);
  quand timestamptz := coalesce((ev ->> 'survenu_le')::timestamptz, now());
  etat prive.etat_vetement;
  nouveau prive.etat_vetement;
begin
  select * into v from public.vetements where id = (ev ->> 'vetement_id')::uuid and organisation_id = org for update;
  if v.id is null or not prive.vetement_visible(v.id) then
    raise exception 'Vêtement introuvable ou non accessible' using errcode = 'no_data_found';
  end if;

  -- Règles vérifiées à l'ingestion seulement (le rejeu les suppose acquises).
  if genre = 'attribution' then
    if not exists (select 1 from public.porteurs p where p.id = (d ->> 'porteur_id')::uuid and p.organisation_id = org and p.actif) then
      raise exception 'Porteur inconnu ou inactif' using errcode = 'check_violation';
    end if;
    if prive.seuil_atteint(v.id) and not v.controle_renforce then
      raise exception 'Seuil atteint : contrôle renforcé ou réforme nécessaire avant attribution' using errcode = 'check_violation';
    end if;
  elsif genre = 'reforme' and nullif(btrim(d ->> 'motif'), '') is null then
    raise exception 'Motif de réforme obligatoire' using errcode = 'check_violation';
  end if;

  etat := row(v.statut, v.contamine, v.site_id, v.porteur_id, v.lot_id, v.derniere_lecture_le, v.controle_renforce)::prive.etat_vetement;
  nouveau := prive.appliquer(etat, genre, (ev ->> 'site_id')::uuid, (ev ->> 'lot_id')::uuid, quand, d, v.nominatif);

  insert into public.evenements (id, organisation_id, vetement_id, type, survenu_le, site_id, lot_id, lecteur_id, auteur_id, source, donnees)
  values ((ev ->> 'id')::uuid, org, v.id, genre, quand, (ev ->> 'site_id')::uuid, (ev ->> 'lot_id')::uuid,
          (ev ->> 'lecteur_id')::uuid, auth.uid(), 'app', d);

  update public.vetements set
    statut = nouveau.statut, contamine = nouveau.contamine, site_id = nouveau.site_id, porteur_id = nouveau.porteur_id,
    lot_id = nouveau.lot_id, derniere_lecture_le = nouveau.derniere_lecture_le, controle_renforce = nouveau.controle_renforce
  where id = v.id;

  if genre = 'reforme' then
    update public.identifiants set actif = false, retire_le = quand, motif_retrait = 'Réforme'
    where vetement_id = v.id and actif;
  end if;
end;
$$;

-- Annulation du dernier événement de statut non annulé, puis recalcul.
create function prive.annuler(org uuid, ev jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d jsonb := coalesce(ev -> 'donnees', '{}'::jsonb);
  cible public.evenements;
  dernier uuid;
begin
  select * into cible from public.evenements where id = (d ->> 'evenement_id')::uuid and organisation_id = org;
  if cible.id is null or not prive.vetement_visible(cible.vetement_id) then
    raise exception 'Événement à annuler introuvable' using errcode = 'no_data_found';
  end if;
  if (ev ->> 'vetement_id') is not null and (ev ->> 'vetement_id')::uuid <> cible.vetement_id then
    raise exception 'L''événement annulé appartient à un autre vêtement' using errcode = 'check_violation';
  end if;
  if cible.type in ('enrolement', 'tag_pose', 'tag_retire', 'annulation') then
    raise exception 'Un événement « % » ne s''annule pas' , cible.type using errcode = 'check_violation';
  end if;
  if cible.annule_par is not null then
    raise exception 'Événement déjà annulé' using errcode = 'check_violation';
  end if;
  if nullif(btrim(d ->> 'motif'), '') is null then
    raise exception 'Motif d''annulation obligatoire' using errcode = 'check_violation';
  end if;
  perform 1 from public.vetements where id = cible.vetement_id for update;
  select e.id into dernier from public.evenements e
  where e.vetement_id = cible.vetement_id and e.annule_par is null
    and e.type not in ('enrolement', 'tag_pose', 'tag_retire', 'annulation')
  order by e.numero desc limit 1;
  if dernier <> cible.id then
    raise exception 'Seul le dernier événement du vêtement s''annule : annulez d''abord les plus récents' using errcode = 'check_violation';
  end if;

  insert into public.evenements (id, organisation_id, vetement_id, type, survenu_le, auteur_id, source, donnees)
  values ((ev ->> 'id')::uuid, org, cible.vetement_id, 'annulation', coalesce((ev ->> 'survenu_le')::timestamptz, now()),
          auth.uid(), 'app', jsonb_build_object('evenement_id', cible.id, 'type_annule', cible.type, 'motif', btrim(d ->> 'motif')));
  update public.evenements set annule_par = (ev ->> 'id')::uuid where id = cible.id;
  perform prive.recalculer(cible.vetement_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Point d'entrée unique de la file d'événements de l'app
-- evenements : [{ id, vetement_id, type, survenu_le, site_id?, lot_id?, lecteur_id?, donnees? }]
-- Réponse : [{ id, statut: 'accepte' | 'doublon' | 'rejete', motif? }], dans l'ordre reçu.
-- Chaque événement est traité à part : un rejet n'annule pas les autres.
-- ---------------------------------------------------------------------------

create function public.ingerer_evenements(org uuid, evenements jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ev jsonb;
  genre public.type_evenement;
  resultat jsonb := '[]'::jsonb;
begin
  if not prive.est_membre(org) then
    raise exception 'Organisation non accessible' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(evenements) <> 'array' or jsonb_array_length(evenements) > 500 then
    raise exception 'Liste de 500 événements au plus attendue' using errcode = 'program_limit_exceeded';
  end if;

  for ev in select * from jsonb_array_elements(evenements) loop
    if exists (select 1 from public.evenements e where e.id = (ev ->> 'id')::uuid) then
      resultat := resultat || jsonb_build_object('id', ev -> 'id', 'statut', 'doublon');
      continue;
    end if;
    begin
      genre := (ev ->> 'type')::public.type_evenement;
      if genre in ('enrolement', 'tag_pose', 'tag_retire') then
        perform prive.exiger_enrolement(org);
        if genre = 'enrolement' then
          perform prive.enroler(org, coalesce(ev -> 'donnees', '{}'::jsonb) || jsonb_build_object(
            'evenement_id', ev -> 'id', 'vetement_id', ev -> 'vetement_id', 'survenu_le', ev -> 'survenu_le',
            'site_id', ev -> 'site_id', 'lecteur_id', ev -> 'lecteur_id'), 'app');
        elsif genre = 'tag_pose' then
          perform prive.poser_identifiant(org, (ev ->> 'vetement_id')::uuid, (ev ->> 'id')::uuid,
            (ev #>> '{donnees,technologie}')::public.technologie_id, ev #>> '{donnees,valeur}',
            coalesce((ev ->> 'survenu_le')::timestamptz, now()), (ev ->> 'lecteur_id')::uuid, 'app');
        else
          perform prive.retirer_identifiant(org, (ev #>> '{donnees,identifiant_id}')::uuid, (ev ->> 'id')::uuid,
            ev #>> '{donnees,motif}', coalesce((ev ->> 'survenu_le')::timestamptz, now()), 'app');
        end if;
      elsif not prive.peut_emettre(org, genre) then
        raise exception 'Vous ne pouvez pas émettre « % »', genre using errcode = 'insufficient_privilege';
      elsif genre = 'annulation' then
        perform prive.annuler(org, ev);
      else
        perform prive.ingerer_statut(org, ev);
      end if;
      resultat := resultat || jsonb_build_object('id', ev -> 'id', 'statut', 'accepte');
    exception when others then
      resultat := resultat || jsonb_build_object('id', ev -> 'id', 'statut', 'rejete', 'motif', sqlerrm, 'code', sqlstate);
    end;
  end loop;
  return resultat;
end;
$$;

-- Diagnostic (admin) : rejoue le journal d'un vêtement ; vrai si la projection a été corrigée.
create function public.recalculer_vetement(vetement uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  org uuid := (select v.organisation_id from public.vetements v where v.id = vetement);
begin
  if org is null or not prive.a_role(org, 'admin') then
    raise exception 'Réservé aux administrateurs' using errcode = 'insufficient_privilege';
  end if;
  return prive.recalculer(vetement);
end;
$$;

-- L'enrôlement initialise aussi la date de dernière lecture, comme le rejeu.
create or replace function prive.enroler(org uuid, p jsonb, src public.source_evenement) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  vetement uuid := coalesce((p ->> 'vetement_id')::uuid, gen_random_uuid());
  quand timestamptz := coalesce((p ->> 'survenu_le')::timestamptz, now());
  article uuid := (p ->> 'article_id')::uuid;
  ident jsonb;
begin
  if not exists (select 1 from public.articles a where a.id = article and a.organisation_id = org and a.actif) then
    raise exception 'Article inconnu ou inactif : seul un article actif peut être enrôlé' using errcode = 'check_violation';
  end if;

  insert into public.vetements (id, organisation_id, article_id, taille, numero_serie, nominatif, site_id, mis_en_service_le, derniere_lecture_le)
  values (vetement, org, article, nullif(btrim(p ->> 'taille'), ''), nullif(btrim(p ->> 'numero_serie'), ''),
          coalesce((p ->> 'nominatif')::boolean, false), (p ->> 'site_id')::uuid,
          nullif(p ->> 'mis_en_service_le', '')::date, quand);

  insert into public.evenements (id, organisation_id, vetement_id, type, survenu_le, site_id, lecteur_id, auteur_id, source, donnees)
  values ((p ->> 'evenement_id')::uuid, org, vetement, 'enrolement', quand, (p ->> 'site_id')::uuid,
          (p ->> 'lecteur_id')::uuid, auth.uid(), src,
          jsonb_build_object('article_id', article, 'taille', nullif(btrim(p ->> 'taille'), ''),
                             'numero_serie', nullif(btrim(p ->> 'numero_serie'), ''),
                             'nominatif', coalesce((p ->> 'nominatif')::boolean, false)));

  for ident in select * from jsonb_array_elements(coalesce(p -> 'identifiants', '[]'::jsonb)) loop
    perform prive.poser_identifiant(org, vetement, (ident ->> 'evenement_id')::uuid,
      (ident ->> 'technologie')::public.technologie_id, ident ->> 'valeur', quand, (p ->> 'lecteur_id')::uuid, src);
  end loop;
  return vetement;
end;
$$;

-- Droits
revoke all on function
  prive.exiger_statut(public.statut_vetement, public.statut_vetement[], public.type_evenement),
  prive.appliquer(prive.etat_vetement, public.type_evenement, uuid, uuid, timestamptz, jsonb, boolean),
  prive.seuil_atteint(uuid), prive.recalculer(uuid), prive.peut_emettre(uuid, public.type_evenement),
  prive.ingerer_statut(uuid, jsonb), prive.annuler(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.ingerer_evenements(uuid, jsonb), public.recalculer_vetement(uuid) from public, anon;
grant execute on function public.ingerer_evenements(uuid, jsonb), public.recalculer_vetement(uuid) to authenticated;

-- Remise en cohérence des vêtements existants : date de dernière lecture issue du journal.
select prive.recalculer(v.id) from public.vetements v
where exists (select 1 from public.evenements e where e.vetement_id = v.id and e.type = 'enrolement');

commit;
