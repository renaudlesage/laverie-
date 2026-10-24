-- 0009_laverie.sql — Sacs, lots, circuits standard et contaminé (jalon M6).
-- À exécuter après 0008_journal.sql.
--
-- Sacs : contenants réutilisables portant un code (QR de l'app, code-barres ou NFC). Un code
-- ne désigne jamais à la fois un sac et un vêtement. Chaque tournée = un lot « sac_collecte ».
-- Opérations sur les lots (operer_lots) : ouvrir_sac, expedier_sac, receptionner_sac,
-- ouvrir_lot, cloturer_lot, avorter_lot. Rejouables : une opération déjà faite répond « doublon ».
-- Événements des vêtements (ingerer_evenements) : collecte, reception, ajout_lot, retrait_lot,
-- controle, reparation, livraison. Le « traitement » (+1 passage) n'est produit que par la
-- clôture d'un lot. Un mélange de circuits est refusé et crée une alerte melange_circuits.

begin;

-- ---------------------------------------------------------------------------
-- Sacs
-- ---------------------------------------------------------------------------

create table public.sacs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  nom text not null check (btrim(nom) <> ''),
  circuit public.circuit not null default 'standard',
  technologie public.technologie_id,
  code text,
  site_id uuid,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, nom),
  foreign key (organisation_id, site_id) references public.sites (organisation_id, id),
  constraint sacs_code_complet check ((technologie is null) = (code is null)),
  constraint sacs_code_sans_espace check (code is null or code !~ '\s'),
  constraint sacs_code_hex check (technologie is null or technologie not in ('nfc', 'uhf') or code ~ '^[0-9A-F]+$')
);

create unique index sacs_code_unique on public.sacs (organisation_id, technologie, code) where actif and code is not null;
create index sacs_code_idx on public.sacs (organisation_id, code) where code is not null;

-- Un code ne désigne qu'un objet : sac ou vêtement.
create function public.verifier_code_sac() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.actif and new.code is not null and exists (
    select 1 from public.identifiants i
    where i.organisation_id = new.organisation_id and i.technologie = new.technologie and i.valeur = new.code and i.actif
  ) then
    raise exception 'Code % déjà porté par un vêtement', new.code using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

create trigger sacs_verifier_code before insert or update on public.sacs
  for each row execute function public.verifier_code_sac();

create function public.verifier_code_vetement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.actif and exists (
    select 1 from public.sacs s
    where s.organisation_id = new.organisation_id and s.technologie = new.technologie and s.code = new.valeur and s.actif
  ) then
    raise exception 'Code % déjà porté par un sac', new.valeur using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

create trigger identifiants_verifier_code_sac before insert or update on public.identifiants
  for each row execute function public.verifier_code_vetement();

revoke all on function public.verifier_code_sac(), public.verifier_code_vetement() from public, anon, authenticated;

alter table public.sacs enable row level security;
revoke all on public.sacs from anon, authenticated;
grant select, insert, update, delete on public.sacs to authenticated;
create policy sacs_lecture on public.sacs
  for select to authenticated using (prive.est_membre(organisation_id));
create policy sacs_gestion on public.sacs
  for all to authenticated
  using (prive.a_role(organisation_id, 'admin', 'gestionnaire'))
  with check (prive.a_role(organisation_id, 'admin', 'gestionnaire'));

-- Lots de collecte rattachés à un sac ; une seule tournée en cours par sac.
alter table public.lots
  add column sac_id uuid,
  add column cree_par uuid default auth.uid(),
  add foreign key (organisation_id, sac_id) references public.sacs (organisation_id, id),
  add constraint lots_sac_obligatoire check (type <> 'sac_collecte' or sac_id is not null);
create unique index lots_sac_en_cours on public.lots (sac_id) where statut in ('ouvert', 'ferme', 'expedie');

-- ---------------------------------------------------------------------------
-- Écriture interne d'un événement de statut (règles déjà vérifiées par l'appelant)
-- ---------------------------------------------------------------------------

create function prive.ecrire_statut(
  org uuid, v public.vetements, evenement uuid, genre public.type_evenement, quand timestamptz,
  site uuid, lot uuid, lecteur uuid, d jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  nouveau prive.etat_vetement;
begin
  nouveau := prive.appliquer(
    row(v.statut, v.contamine, v.site_id, v.porteur_id, v.lot_id, v.derniere_lecture_le, v.controle_renforce)::prive.etat_vetement,
    genre, site, lot, quand, d, v.nominatif);

  insert into public.evenements (id, organisation_id, vetement_id, type, survenu_le, site_id, lot_id, lecteur_id, auteur_id, source, donnees)
  values (coalesce(evenement, gen_random_uuid()), org, v.id, genre, quand, site, lot, lecteur, auth.uid(), 'app', d);

  update public.vetements set
    statut = nouveau.statut, contamine = nouveau.contamine, site_id = nouveau.site_id, porteur_id = nouveau.porteur_id,
    lot_id = nouveau.lot_id, derniere_lecture_le = nouveau.derniere_lecture_le, controle_renforce = nouveau.controle_renforce
  where id = v.id;

  if genre = 'reforme' or (genre = 'controle' and d ->> 'verdict' = 'reforme') then
    update public.identifiants set actif = false, retire_le = quand, motif_retrait = 'Réforme'
    where vetement_id = v.id and actif;
  elsif genre = 'traitement' then
    insert into public.compteurs (organisation_id, vetement_id, traitement_id, passages)
    values (org, v.id, (d ->> 'traitement_id')::uuid, 1)
    on conflict (vetement_id, traitement_id) do update set passages = public.compteurs.passages + 1;
    update public.identifiants set passages_depuis_pose = passages_depuis_pose + 1 where vetement_id = v.id and actif;
  end if;
end;
$$;

-- Circuits séparés (invariant 7) : code d'erreur dédié, pour créer l'alerte hors de la transaction annulée.
create function prive.exiger_circuit(v public.vetements, l public.lots) returns void
language plpgsql stable set search_path = '' as $$
begin
  if v.contamine <> (l.circuit = 'contamine') then
    raise exception 'Mélange de circuits : vêtement % dans un % du circuit %',
      case when v.contamine then 'contaminé' else 'standard' end,
      case l.type when 'sac_collecte' then 'sac' else 'lot' end, l.circuit
      using errcode = 'LC001';
  end if;
end;
$$;

-- Site de travail d'une laverie : la laverie externe n'agit que sur son propre site.
create function prive.exiger_site_laverie(org uuid, site uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.sites s where s.id = site and s.organisation_id = org and s.type in ('laverie_interne', 'laverie_externe')) then
    raise exception 'Site de laverie attendu' using errcode = 'check_violation';
  end if;
  if prive.site_externe(org) is not null and prive.site_externe(org) <> site then
    raise exception 'La laverie externe n''agit que sur son propre site' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ingestion des événements de statut : règles des jalons M5 et M6
-- ---------------------------------------------------------------------------

create or replace function prive.peut_emettre(org uuid, type public.type_evenement) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when type in ('attribution', 'restitution', 'perte', 'retrouve', 'reforme', 'annulation')
      then prive.a_role(org, 'admin', 'gestionnaire')
    when type = 'contamination'
      then prive.a_role(org, 'admin', 'gestionnaire', 'operateur_laverie', 'laverie_externe')
    when type in ('vu_en_inventaire', 'collecte')
      then prive.a_role(org, 'admin', 'gestionnaire', 'operateur_laverie')
    when type in ('reception', 'ajout_lot', 'retrait_lot', 'controle', 'reparation')
      then prive.a_role(org, 'admin', 'operateur_laverie', 'laverie_externe')
    when type = 'livraison'
      then prive.a_role(org, 'admin', 'gestionnaire', 'operateur_laverie', 'laverie_externe')
    else false -- traitement : produit par la clôture d'un lot uniquement
  end;
$$;

create or replace function prive.ingerer_statut(org uuid, ev jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  genre public.type_evenement := (ev ->> 'type')::public.type_evenement;
  v public.vetements;
  l public.lots;
  d jsonb := coalesce(ev -> 'donnees', '{}'::jsonb);
  quand timestamptz := coalesce((ev ->> 'survenu_le')::timestamptz, now());
  site uuid := (ev ->> 'site_id')::uuid;
  lot uuid := (ev ->> 'lot_id')::uuid;
  dernier_circuit public.circuit;
begin
  select * into v from public.vetements where id = (ev ->> 'vetement_id')::uuid and organisation_id = org for update;
  if v.id is null or not prive.vetement_visible(v.id) then
    raise exception 'Vêtement introuvable ou non accessible' using errcode = 'no_data_found';
  end if;

  -- Règles vérifiées à l'ingestion seulement (le rejeu les suppose acquises).
  case genre
    when 'attribution' then
      if not exists (select 1 from public.porteurs p where p.id = (d ->> 'porteur_id')::uuid and p.organisation_id = org and p.actif) then
        raise exception 'Porteur inconnu ou inactif' using errcode = 'check_violation';
      end if;
      if prive.seuil_atteint(v.id) and not v.controle_renforce then
        raise exception 'Seuil atteint : contrôle renforcé ou réforme nécessaire avant attribution' using errcode = 'check_violation';
      end if;

    when 'reforme' then
      if nullif(btrim(d ->> 'motif'), '') is null then
        raise exception 'Motif de réforme obligatoire' using errcode = 'check_violation';
      end if;

    when 'collecte' then
      select * into l from public.lots where id = lot and organisation_id = org;
      if l.id is null or l.type <> 'sac_collecte' or l.statut <> 'ouvert' then
        raise exception 'Sac de collecte ouvert attendu' using errcode = 'check_violation';
      end if;
      perform prive.exiger_circuit(v, l);
      site := null;

    when 'reception' then
      perform prive.exiger_site_laverie(org, site);
      select * into l from public.lots where id = v.lot_id;
      if l.id is null or l.statut <> 'expedie' then
        raise exception 'Réception : le sac de ce vêtement n''a pas été expédié' using errcode = 'check_violation';
      end if;
      lot := null;

    when 'ajout_lot' then
      select * into l from public.lots where id = lot and organisation_id = org;
      if l.id is null or l.type <> 'traitement' or l.statut <> 'ouvert' then
        raise exception 'Lot de traitement ouvert attendu' using errcode = 'check_violation';
      end if;
      if l.site_id is distinct from v.site_id then
        raise exception 'Le vêtement n''est pas réceptionné sur le site de ce lot' using errcode = 'check_violation';
      end if;
      perform prive.exiger_circuit(v, l);
      site := null;

    when 'retrait_lot' then
      select * into l from public.lots where id = v.lot_id;
      if l.id is null or l.statut <> 'ouvert' then
        raise exception 'Retrait impossible : le lot n''est plus ouvert' using errcode = 'check_violation';
      end if;
      lot := l.id;
      site := null;

    when 'controle' then
      if d ->> 'verdict' in ('a_reparer', 'reforme') and nullif(btrim(d ->> 'motif'), '') is null then
        raise exception 'Motif obligatoire pour un vêtement à réparer ou à réformer' using errcode = 'check_violation';
      end if;
      if d ->> 'verdict' = 'conforme' and (v.contamine or prive.seuil_atteint(v.id))
         and not coalesce((d ->> 'renforce')::boolean, false) then
        raise exception 'Contrôle renforcé obligatoire : vêtement %',
          case when v.contamine then 'contaminé' else 'à sa limite de passages ou d''âge' end
          using errcode = 'check_violation';
      end if;
      -- Le drapeau contaminé ne tombe qu'après un lot du circuit contaminé (décision stockée pour le rejeu).
      select l2.circuit into dernier_circuit
      from public.evenements e join public.lots l2 on l2.id = e.lot_id
      where e.vetement_id = v.id and e.type = 'traitement' and e.annule_par is null
      order by e.numero desc limit 1;
      d := d || jsonb_build_object('decontamine', v.contamine and dernier_circuit = 'contamine');
      site := null;
      lot := null;

    when 'livraison' then
      if site is null or not exists (select 1 from public.sites s where s.id = site and s.organisation_id = org) then
        raise exception 'Livraison : site de destination attendu' using errcode = 'check_violation';
      end if;
      if prive.seuil_atteint(v.id) and not v.controle_renforce then
        raise exception 'Seuil atteint : contrôle renforcé ou réforme nécessaire avant livraison' using errcode = 'check_violation';
      end if;
      lot := null;

    else
      null;
  end case;

  perform prive.ecrire_statut(org, v, (ev ->> 'id')::uuid, genre, quand, site, lot, (ev ->> 'lecteur_id')::uuid, d);
end;
$$;

-- Un mélange de circuits refusé laisse une alerte (écrite hors du sous-bloc annulé).
create or replace function public.ingerer_evenements(org uuid, evenements jsonb) returns jsonb
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
    exception
      when sqlstate 'LC001' then
        insert into public.alertes (organisation_id, vetement_id, lot_id, type, niveau, message)
        select org, v.id, l.id, 'melange_circuits', 'critique', sqlerrm
        from (select 1) x
        left join public.vetements v on v.id = (ev ->> 'vetement_id')::uuid and v.organisation_id = org
        left join public.lots l on l.id = (ev ->> 'lot_id')::uuid and l.organisation_id = org;
        resultat := resultat || jsonb_build_object('id', ev -> 'id', 'statut', 'rejete', 'motif', sqlerrm, 'code', sqlstate);
      when others then
        resultat := resultat || jsonb_build_object('id', ev -> 'id', 'statut', 'rejete', 'motif', sqlerrm, 'code', sqlstate);
    end;
  end loop;
  return resultat;
end;
$$;

-- Le rejeu désactive aussi les identifiants d'un vêtement réformé au contrôle.
create or replace function prive.recalculer(vetement uuid) returns boolean
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
      elsif ev.type = 'reforme' or (ev.type = 'controle' and ev.donnees ->> 'verdict' = 'reforme') then
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

  update public.compteurs c set passages = 0
  where c.vetement_id = vetement and not compteurs ? c.traitement_id::text;
  insert into public.compteurs (organisation_id, vetement_id, traitement_id, passages)
  select v.organisation_id, vetement, k::uuid, (x #>> '{}')::int from jsonb_each(compteurs) t(k, x)
  on conflict (vetement_id, traitement_id) do update set passages = excluded.passages;

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
  return avant is distinct from apres;
end;
$$;

-- ---------------------------------------------------------------------------
-- Opérations sur les lots
-- operations : [{ id, type, lot_id, ... }] ; réponse [{ id, statut: accepte | doublon | rejete, motif? }]
-- ---------------------------------------------------------------------------

create function prive.operer_lot(org uuid, op jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  genre text := op ->> 'type';
  lot uuid := (op ->> 'lot_id')::uuid;
  l public.lots;
  s public.sacs;
  v public.vetements;
  quand timestamptz := coalesce((op ->> 'survenu_le')::timestamptz, now());
  manquants integer;
begin
  select * into l from public.lots where id = lot and organisation_id = org for update;

  case genre
    when 'ouvrir_sac' then
      if l.id is not null then return 'doublon'; end if;
      if not prive.a_role(org, 'admin', 'gestionnaire', 'operateur_laverie') then
        raise exception 'Réservé aux gestionnaires et opérateurs' using errcode = 'insufficient_privilege';
      end if;
      select * into s from public.sacs where id = (op ->> 'sac_id')::uuid and organisation_id = org and actif;
      if s.id is null then
        raise exception 'Sac inconnu ou inactif' using errcode = 'check_violation';
      end if;
      if exists (select 1 from public.lots x where x.sac_id = s.id and x.statut in ('ouvert', 'ferme', 'expedie')) then
        raise exception 'Le sac « % » a déjà une tournée en cours', s.nom using errcode = 'check_violation';
      end if;
      insert into public.lots (id, organisation_id, type, circuit, site_id, sac_id, statut, ouvert_le)
      values (lot, org, 'sac_collecte', s.circuit, coalesce((op ->> 'site_id')::uuid, s.site_id), s.id, 'ouvert', quand);

    when 'expedier_sac' then
      if l.id is null or l.type <> 'sac_collecte' then
        raise exception 'Sac de collecte inconnu' using errcode = 'no_data_found';
      end if;
      if l.statut in ('expedie', 'receptionne') then return 'doublon'; end if;
      if not prive.a_role(org, 'admin', 'gestionnaire', 'operateur_laverie') then
        raise exception 'Réservé aux gestionnaires et opérateurs' using errcode = 'insufficient_privilege';
      end if;
      if not exists (select 1 from public.sites x where x.id = (op ->> 'site_destination_id')::uuid and x.organisation_id = org
                     and x.type in ('laverie_interne', 'laverie_externe')) then
        raise exception 'Expédition : laverie de destination attendue' using errcode = 'check_violation';
      end if;
      update public.lots set statut = 'expedie', site_destination_id = (op ->> 'site_destination_id')::uuid,
        quantite_attendue = (select count(*) from public.vetements x where x.lot_id = lot and x.statut = 'collecte')
      where id = lot;

    when 'receptionner_sac' then
      if l.id is null or l.type <> 'sac_collecte' then
        raise exception 'Sac de collecte inconnu' using errcode = 'no_data_found';
      end if;
      if l.statut = 'receptionne' then return 'doublon'; end if;
      if l.statut <> 'expedie' then
        raise exception 'Le sac n''a pas été expédié' using errcode = 'check_violation';
      end if;
      if not prive.a_role(org, 'admin', 'operateur_laverie', 'laverie_externe') then
        raise exception 'Réservé à la laverie' using errcode = 'insufficient_privilege';
      end if;
      perform prive.exiger_site_laverie(org, l.site_destination_id);
      update public.lots set statut = 'receptionne', cloture_le = quand where id = lot;
      -- Écarts : chaque attendu non lu reste « collecté » et ouvre une alerte.
      for v in select * from public.vetements x where x.lot_id = lot and x.statut = 'collecte' loop
        insert into public.alertes (organisation_id, vetement_id, lot_id, type, niveau, message)
        values (org, v.id, lot, 'ecart_reception', 'attention', 'Attendu dans le sac, non lu à la réception');
      end loop;
      if coalesce((op ->> 'en_trop')::int, 0) + coalesce((op ->> 'inconnus')::int, 0) > 0 then
        insert into public.alertes (organisation_id, lot_id, type, niveau, message)
        values (org, lot, 'ecart_reception', 'info',
          format('Réception : %s vêtement(s) en trop, %s code(s) inconnu(s)', coalesce((op ->> 'en_trop')::int, 0), coalesce((op ->> 'inconnus')::int, 0)));
      end if;

    when 'ouvrir_lot' then
      if l.id is not null then return 'doublon'; end if;
      if not prive.a_role(org, 'admin', 'operateur_laverie', 'laverie_externe') then
        raise exception 'Réservé à la laverie' using errcode = 'insufficient_privilege';
      end if;
      perform prive.exiger_site_laverie(org, (op ->> 'site_id')::uuid);
      if not exists (select 1 from public.traitements t where t.id = (op ->> 'traitement_id')::uuid and t.organisation_id = org and t.actif) then
        raise exception 'Traitement inconnu ou inactif' using errcode = 'check_violation';
      end if;
      insert into public.lots (id, organisation_id, type, circuit, site_id, traitement_id, programme, machine, statut, ouvert_le)
      values (lot, org, 'traitement', coalesce((op ->> 'circuit')::public.circuit, 'standard'), (op ->> 'site_id')::uuid,
              (op ->> 'traitement_id')::uuid, nullif(btrim(op ->> 'programme'), ''), nullif(btrim(op ->> 'machine'), ''), 'ouvert', quand);

    when 'cloturer_lot', 'avorter_lot' then
      if l.id is null or l.type <> 'traitement' then
        raise exception 'Lot de traitement inconnu' using errcode = 'no_data_found';
      end if;
      if l.statut in ('cloture', 'avorte') then return 'doublon'; end if;
      if not prive.a_role(org, 'admin', 'operateur_laverie', 'laverie_externe') then
        raise exception 'Réservé à la laverie' using errcode = 'insufficient_privilege';
      end if;
      perform prive.exiger_site_laverie(org, l.site_id);
      for v in select * from public.vetements x where x.lot_id = lot and x.statut = 'en_traitement' for update loop
        if genre = 'cloturer_lot' then
          -- Un passage compté par vêtement et par lot (index unique), sur le traitement du lot.
          perform prive.ecrire_statut(org, v, null, 'traitement', quand, null, lot, null,
            jsonb_build_object('traitement_id', l.traitement_id));
        else
          perform prive.ecrire_statut(org, v, null, 'retrait_lot', quand, null, lot, null,
            jsonb_build_object('motif', coalesce(nullif(btrim(op ->> 'motif'), ''), 'Lot avorté')));
        end if;
      end loop;
      update public.lots set statut = case genre when 'cloturer_lot' then 'cloture' else 'avorte' end::public.statut_lot,
        cloture_le = quand where id = lot;

    else
      raise exception 'Opération inconnue : %', genre using errcode = 'check_violation';
  end case;
  return 'accepte';
end;
$$;

create function public.operer_lots(org uuid, operations jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  op jsonb;
  statut text;
  resultat jsonb := '[]'::jsonb;
begin
  if not prive.est_membre(org) then
    raise exception 'Organisation non accessible' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(operations) <> 'array' or jsonb_array_length(operations) > 100 then
    raise exception 'Liste de 100 opérations au plus attendue' using errcode = 'program_limit_exceeded';
  end if;
  for op in select * from jsonb_array_elements(operations) loop
    begin
      statut := prive.operer_lot(org, op);
      resultat := resultat || jsonb_build_object('id', op -> 'id', 'statut', statut);
    exception when others then
      resultat := resultat || jsonb_build_object('id', op -> 'id', 'statut', 'rejete', 'motif', sqlerrm, 'code', sqlstate);
    end;
  end loop;
  return resultat;
end;
$$;

revoke all on function
  prive.ecrire_statut(uuid, public.vetements, uuid, public.type_evenement, timestamptz, uuid, uuid, uuid, jsonb),
  prive.exiger_circuit(public.vetements, public.lots), prive.exiger_site_laverie(uuid, uuid), prive.operer_lot(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.operer_lots(uuid, jsonb) from public, anon;
grant execute on function public.operer_lots(uuid, jsonb) to authenticated;

commit;
