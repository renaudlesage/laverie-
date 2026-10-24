-- 0011_alertes.sql — Alertes automatiques et tableau de bord (jalon M8).
-- À exécuter après 0010_synchro.sql.
--
-- Alertes tenues à jour par la base, pour chaque vêtement :
--   seuil_preventif : passages ≥ seuil d'alerte (articles_limites.seuil_alerte_pct) de la limite
--   seuil_atteint   : passages ≥ limite
--   age_maximal     : mise en service + durée de vie de l'article dépassée
--   usure_tag       : passages depuis la pose ≥ seuil d'usure de la garantie du tag (réglages)
--   non_revenu      : collecté sans réception, ou en laverie, depuis plus que le délai (réglages)
--   ecart_reception : fermée d'elle-même quand le vêtement manquant réapparaît (perdu, retrouvé…)
-- Une alerte s'ouvre quand sa condition apparaît et se ferme d'elle-même quand elle disparaît
-- (réforme, tag remplacé, retour du vêtement…). Acquittée à la main, elle ne se rouvre pas pour
-- la même cause (même clé : traitement et limite, tag, passage en laverie…).
--
-- Réglages de l'organisation ajoutés (organisations.reglages) :
--   garantie_tags        : { technologie: passages garantis } — sans valeur, pas d'alerte d'usure
--   usure_tag_pct        : seuil d'alerte d'usure, en % de la garantie (défaut 80)
--   delai_collecte_jours : délai avant « non revenu » d'un vêtement collecté (défaut 2)
--   delai_laverie_jours  : délai avant « non revenu » d'un vêtement en laverie (défaut 7)
-- Une tâche pg_cron réévalue chaque heure les alertes qui dépendent du temps.

begin;

-- ---------------------------------------------------------------------------
-- Réglages
-- ---------------------------------------------------------------------------

alter table public.organisations drop constraint organisations_reglages_valides;
alter table public.organisations
  add constraint organisations_reglages_valides check (
    jsonb_typeof(reglages) = 'object'
    and coalesce(reglages ->> 'activation_limites', 'au_moins_une') in ('au_moins_une', 'tous_traitements')
    and (reglages -> 'anti_doublon_ms' is null
         or (jsonb_typeof(reglages -> 'anti_doublon_ms') = 'number'
             and (reglages ->> 'anti_doublon_ms')::numeric between 500 and 60000))
    and (reglages -> 'garantie_tags' is null
         or (jsonb_typeof(reglages -> 'garantie_tags') = 'object'
             and not jsonb_path_exists(reglages -> 'garantie_tags',
               '$.keyvalue() ? (!(@.key like_regex "^(code_barres|qr|datamatrix|nfc|uhf)$") || @.value.type() != "number" || @.value < 1)')))
    and (reglages -> 'usure_tag_pct' is null
         or (jsonb_typeof(reglages -> 'usure_tag_pct') = 'number' and (reglages ->> 'usure_tag_pct')::numeric between 1 and 100))
    and (reglages -> 'delai_collecte_jours' is null
         or (jsonb_typeof(reglages -> 'delai_collecte_jours') = 'number' and (reglages ->> 'delai_collecte_jours')::numeric between 1 and 365))
    and (reglages -> 'delai_laverie_jours' is null
         or (jsonb_typeof(reglages -> 'delai_laverie_jours') = 'number' and (reglages ->> 'delai_laverie_jours')::numeric between 1 and 365))
  );

-- ---------------------------------------------------------------------------
-- Alertes : clé de la cause, une seule alerte ouverte par cause
-- ---------------------------------------------------------------------------

alter table public.alertes add column cle text not null default '';

create unique index alertes_ouverte_unique on public.alertes (vetement_id, type, cle)
  where close_le is null and type in ('seuil_preventif', 'seuil_atteint', 'age_maximal', 'usure_tag', 'non_revenu');
create index alertes_vetement_idx on public.alertes (vetement_id);

create function prive.evaluer_alertes(vetement uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.vetements;
  reglages jsonb;
  voulues jsonb := '[]'::jsonb; -- [{ type, cle, niveau, message }]
  a record;
  x jsonb;
  garantie integer;
  e public.evenements;
  duree integer;
begin
  select * into v from public.vetements where id = vetement;
  if v.id is null then
    return;
  end if;
  select o.reglages into reglages from public.organisations o where o.id = v.organisation_id;

  if v.statut not in ('reforme', 'perdu') then
    -- Seuils de passages, par traitement (limite du vêtement, sinon de l'article).
    for a in
      select c.traitement_id, c.passages, t.libelle, coalesce(vl.limite, al.limite) as limite, coalesce(al.seuil_alerte_pct, 80) as pct
      from public.compteurs c
      join public.traitements t on t.id = c.traitement_id
      left join public.vetements_limites vl on vl.vetement_id = v.id and vl.traitement_id = c.traitement_id
      left join public.articles_limites al on al.article_id = v.article_id and al.traitement_id = c.traitement_id
      where c.vetement_id = v.id and coalesce(vl.limite, al.limite) is not null
    loop
      if a.passages >= a.limite then
        voulues := voulues || jsonb_build_object('type', 'seuil_atteint', 'cle', a.traitement_id || ':' || a.limite, 'niveau', 'critique',
          'message', format('%s : %s / %s passages, limite atteinte', a.libelle, a.passages, a.limite));
      elsif a.passages >= ceil(a.limite * a.pct / 100.0) then
        voulues := voulues || jsonb_build_object('type', 'seuil_preventif', 'cle', a.traitement_id || ':' || a.limite, 'niveau', 'attention',
          'message', format('%s : %s / %s passages (seuil d''alerte %s %%)', a.libelle, a.passages, a.limite, a.pct));
      end if;
    end loop;

    -- Âge maximal.
    select ar.duree_vie_mois into duree from public.articles ar where ar.id = v.article_id;
    if duree is not null and v.mis_en_service_le is not null
       and v.mis_en_service_le + make_interval(months => duree) < current_date then
      voulues := voulues || jsonb_build_object('type', 'age_maximal', 'cle', v.mis_en_service_le || ':' || duree, 'niveau', 'critique',
        'message', format('Âge maximal dépassé : en service depuis le %s, durée de vie %s mois',
          to_char(v.mis_en_service_le, 'DD/MM/YYYY'), duree));
    end if;

    -- Usure des tags : garantie saisie par technologie dans les réglages.
    for a in select i.id, i.technologie, i.valeur, i.passages_depuis_pose from public.identifiants i where i.vetement_id = v.id and i.actif loop
      garantie := (reglages -> 'garantie_tags' ->> a.technologie::text)::integer;
      if garantie is not null
         and a.passages_depuis_pose >= ceil(garantie * coalesce((reglages ->> 'usure_tag_pct')::numeric, 80) / 100.0) then
        voulues := voulues || jsonb_build_object('type', 'usure_tag', 'cle', a.id::text,
          'niveau', case when a.passages_depuis_pose >= garantie then 'critique' else 'attention' end,
          'message', format('Tag %s %s à remplacer : %s passage(s) depuis la pose, garantie %s',
            case a.technologie when 'code_barres' then 'code-barres' when 'qr' then 'QR' when 'datamatrix' then 'DataMatrix'
              when 'nfc' then 'NFC' else 'UHF' end,
            a.valeur, a.passages_depuis_pose, garantie));
      end if;
    end loop;

    -- Non revenu : collecté sans réception, ou en laverie depuis trop longtemps.
    if v.statut = 'collecte' then
      select * into e from public.evenements ev
      where ev.vetement_id = v.id and ev.type = 'collecte' and ev.annule_par is null order by ev.numero desc limit 1;
      if e.id is not null and e.survenu_le < now() - make_interval(days => coalesce((reglages ->> 'delai_collecte_jours')::integer, 2)) then
        voulues := voulues || jsonb_build_object('type', 'non_revenu', 'cle', 'collecte:' || e.id, 'niveau', 'attention',
          'message', format('Collecté le %s, pas encore réceptionné en laverie', to_char(e.survenu_le at time zone 'Europe/Brussels', 'DD/MM/YYYY HH24:MI')));
      end if;
    elsif v.statut in ('en_laverie', 'en_traitement', 'traite', 'a_reparer', 'pret') then
      select * into e from public.evenements ev
      where ev.vetement_id = v.id and ev.type = 'reception' and ev.annule_par is null order by ev.numero desc limit 1;
      if e.id is not null and e.survenu_le < now() - make_interval(days => coalesce((reglages ->> 'delai_laverie_jours')::integer, 7)) then
        voulues := voulues || jsonb_build_object('type', 'non_revenu', 'cle', 'laverie:' || e.id, 'niveau', 'attention',
          'message', format('En laverie depuis le %s', to_char(e.survenu_le at time zone 'Europe/Brussels', 'DD/MM/YYYY')));
      end if;
    end if;
  end if;

  -- Fermeture des alertes dont la cause a disparu.
  update public.alertes al set close_le = now()
  where al.vetement_id = v.id and al.close_le is null
    and al.type in ('seuil_preventif', 'seuil_atteint', 'age_maximal', 'usure_tag', 'non_revenu')
    and not exists (select 1 from jsonb_array_elements(voulues) w where w ->> 'type' = al.type::text and w ->> 'cle' = al.cle);
  -- Écart de réception : le vêtement manquant a changé de statut ou de sac.
  update public.alertes al set close_le = now()
  where al.vetement_id = v.id and al.close_le is null and al.type = 'ecart_reception'
    and (v.statut <> 'collecte' or v.lot_id is distinct from al.lot_id);

  -- Ouverture (ou mise à jour du message) ; pas de réouverture d'une alerte acquittée.
  for x in select * from jsonb_array_elements(voulues) loop
    update public.alertes al set message = x ->> 'message', niveau = (x ->> 'niveau')::public.niveau_alerte
    where al.vetement_id = v.id and al.close_le is null and al.type = (x ->> 'type')::public.type_alerte and al.cle = x ->> 'cle'
      and (al.message <> x ->> 'message' or al.niveau <> (x ->> 'niveau')::public.niveau_alerte);
    if not exists (
      select 1 from public.alertes al
      where al.vetement_id = v.id and al.type = (x ->> 'type')::public.type_alerte and al.cle = x ->> 'cle'
        and (al.close_le is null or al.close_par is not null)
    ) then
      insert into public.alertes (organisation_id, vetement_id, type, niveau, message, cle)
      values (v.organisation_id, v.id, (x ->> 'type')::public.type_alerte, (x ->> 'niveau')::public.niveau_alerte, x ->> 'message', x ->> 'cle');
    end if;
  end loop;
end;
$$;

-- Réévaluation de tous les vêtements en circulation (alertes liées au temps), d'une organisation
-- ou de toutes.
create function prive.evaluer_toutes_alertes(org uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v uuid;
  n integer := 0;
begin
  for v in select id from public.vetements where statut not in ('reforme', 'perdu') and (org is null or organisation_id = org) loop
    perform prive.evaluer_alertes(v);
    n := n + 1;
  end loop;
  -- Vêtements sortis du circuit depuis : leurs alertes automatiques se ferment.
  for v in
    select distinct al.vetement_id from public.alertes al join public.vetements x on x.id = al.vetement_id
    where al.close_le is null and x.statut in ('reforme', 'perdu') and (org is null or x.organisation_id = org)
  loop
    perform prive.evaluer_alertes(v);
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Déclencheurs : toute écriture qui change une condition réévalue le vêtement
-- ---------------------------------------------------------------------------

create function prive.alertes_vetement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform prive.evaluer_alertes(new.id);
  return null;
end;
$$;

create function prive.alertes_ligne_vetement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform prive.evaluer_alertes(case when tg_op = 'DELETE' then old.vetement_id else new.vetement_id end);
  return null;
end;
$$;

-- Limites ou durée de vie d'un article modifiées : tous ses vêtements.
create function prive.evaluer_alertes_article(article uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v uuid;
begin
  for v in select id from public.vetements where article_id = article and statut not in ('reforme', 'perdu') loop
    perform prive.evaluer_alertes(v);
  end loop;
end;
$$;

create function prive.alertes_article() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform prive.evaluer_alertes_article(new.id);
  return null;
end;
$$;

create function prive.alertes_limite_article() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform prive.evaluer_alertes_article(old.article_id);
  else
    perform prive.evaluer_alertes_article(new.article_id);
  end if;
  return null;
end;
$$;

-- Réglages d'alerte modifiés : toute l'organisation, tout de suite.
create function prive.alertes_reglages() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.reglages is distinct from old.reglages then
    perform prive.evaluer_toutes_alertes(new.id);
  end if;
  return null;
end;
$$;

create trigger organisations_alertes after update of reglages on public.organisations
  for each row execute function prive.alertes_reglages();
create trigger vetements_alertes after insert or update of statut, lot_id, mis_en_service_le, article_id on public.vetements
  for each row execute function prive.alertes_vetement();
create trigger compteurs_alertes after insert or update on public.compteurs
  for each row execute function prive.alertes_ligne_vetement();
create trigger identifiants_alertes after insert or update on public.identifiants
  for each row execute function prive.alertes_ligne_vetement();
create trigger vetements_limites_alertes after insert or update or delete on public.vetements_limites
  for each row execute function prive.alertes_ligne_vetement();
create trigger articles_limites_alertes after insert or update or delete on public.articles_limites
  for each row execute function prive.alertes_limite_article();
create trigger articles_alertes after update of duree_vie_mois on public.articles
  for each row execute function prive.alertes_article();

revoke all on function prive.evaluer_alertes(uuid), prive.evaluer_toutes_alertes(uuid), prive.evaluer_alertes_article(uuid),
  prive.alertes_vetement(), prive.alertes_ligne_vetement(), prive.alertes_article(), prive.alertes_limite_article(),
  prive.alertes_reglages()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tableau de bord : chiffres du périmètre visible (la RLS s'applique, laverie externe comprise)
-- ---------------------------------------------------------------------------

create function public.tableau_de_bord(org uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'statuts', coalesce((select jsonb_object_agg(statut, n) from (
      select v.statut, count(*) as n from public.vetements v where v.organisation_id = org group by v.statut) s), '{}'::jsonb),
    'alertes', coalesce((select jsonb_object_agg(type, n) from (
      select a.type, count(*) as n from public.alertes a where a.organisation_id = org and a.close_le is null group by a.type) t), '{}'::jsonb),
    'fin_de_vie', (select count(distinct a.vetement_id) from public.alertes a
      where a.organisation_id = org and a.close_le is null and a.type in ('seuil_atteint', 'age_maximal')),
    'fin_de_vie_proche', (select count(distinct a.vetement_id) from public.alertes a
      where a.organisation_id = org and a.close_le is null and a.type = 'seuil_preventif'),
    'en_laverie_trop_longtemps', (select count(distinct a.vetement_id) from public.alertes a
      where a.organisation_id = org and a.close_le is null and a.type = 'non_revenu' and a.cle like 'laverie:%'),
    'collectes_non_revenus', (select count(distinct a.vetement_id) from public.alertes a
      where a.organisation_id = org and a.close_le is null and a.type = 'non_revenu' and a.cle like 'collecte:%'),
    'delai_laverie_jours', coalesce((select (o.reglages ->> 'delai_laverie_jours')::integer from public.organisations o where o.id = org), 7),
    'delai_collecte_jours', coalesce((select (o.reglages ->> 'delai_collecte_jours')::integer from public.organisations o where o.id = org), 2)
  );
$$;

revoke all on function public.tableau_de_bord(uuid) from public, anon;
grant execute on function public.tableau_de_bord(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Tâche horaire (pg_cron) et diffusion en direct (Realtime), si disponibles
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('suivi-linge-alertes', '17 * * * *', 'select prive.evaluer_toutes_alertes()');
  else
    raise notice 'pg_cron indisponible : alertes liées au temps évaluées seulement à chaque écriture';
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vetements') then
      alter publication supabase_realtime add table public.vetements;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lots') then
      alter publication supabase_realtime add table public.lots;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'alertes') then
      alter publication supabase_realtime add table public.alertes;
    end if;
  end if;
end;
$$;

-- Première évaluation des vêtements existants.
select prive.evaluer_toutes_alertes();

commit;
