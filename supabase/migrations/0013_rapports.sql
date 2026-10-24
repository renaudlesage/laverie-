-- 0013_rapports.sql — Rapports et résumé quotidien des alertes par e-mail.
-- À exécuter après 0012_porteurs.sql.
--
-- Rapports (droits de l'utilisateur, RLS comprise : la laverie externe ne voit que son activité) :
--   rapport_passages(org, debut, fin)          passages par article et traitement (parc et période)
--   rapport_fin_de_vie(org, horizon, seuil)    vêtements à renouveler (usure ou âge)
--   rapport_laverie(org, site, debut, fin)     activité d'une laverie : lots, passages, sacs reçus
--
-- Résumé des alertes par e-mail : réglage organisations.reglages.resume_alertes
--   { actif: booléen, roles: [rôles destinataires] } ; envoi par la fonction Edge resume-alertes,
--   une fois par jour et par organisation (journal resumes_envoyes).

begin;

-- ---------------------------------------------------------------------------
-- Réglage du résumé
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
    and (reglages -> 'resume_alertes' is null
         or (jsonb_typeof(reglages -> 'resume_alertes') = 'object'
             and jsonb_typeof(reglages -> 'resume_alertes' -> 'actif') = 'boolean'
             and jsonb_typeof(reglages -> 'resume_alertes' -> 'roles') = 'array'
             and not jsonb_path_exists(reglages -> 'resume_alertes' -> 'roles',
               '$[*] ? (!(@ like_regex "^(admin|gestionnaire|operateur_laverie|auditeur)$"))')))
  );

-- Résumés envoyés : un par organisation et par jour (service uniquement).
create table public.resumes_envoyes (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  jour date not null,
  destinataires integer not null,
  alertes integer not null,
  envoye_le timestamptz not null default now(),
  primary key (organisation_id, jour)
);
alter table public.resumes_envoyes enable row level security;
revoke all on public.resumes_envoyes from anon, authenticated;
create policy resumes_lecture on public.resumes_envoyes
  for select to authenticated using (prive.a_role(organisation_id, 'admin'));
grant select on public.resumes_envoyes to authenticated;

-- Adresses des destinataires du résumé (appelée par la fonction Edge, avec la clé de service).
create function public.destinataires_resume(org uuid) returns table (email text, role public.role_membre)
language sql stable security definer set search_path = '' as $$
  select u.email::text, m.role
  from public.membres m
  join public.organisations o on o.id = m.organisation_id
  join auth.users u on u.id = m.user_id
  where m.organisation_id = org and m.actif
    and coalesce((o.reglages -> 'resume_alertes' ->> 'actif')::boolean, false)
    and m.role::text in (select jsonb_array_elements_text(coalesce(o.reglages -> 'resume_alertes' -> 'roles', '["admin", "gestionnaire"]')))
    and u.email is not null;
$$;
revoke all on function public.destinataires_resume(uuid) from public, anon, authenticated;
grant execute on function public.destinataires_resume(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Rapports
-- ---------------------------------------------------------------------------

-- Passages par article et traitement : état du parc (compteurs) et passages de la période.
create function public.rapport_passages(org uuid, debut date, fin date) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'parc', coalesce((
      select jsonb_agg(x order by x.article, x.traitement) from (
        select a.designation as article, t.libelle as traitement,
               count(distinct v.id) as vetements, sum(c.passages)::integer as passages,
               round(avg(c.passages), 1) as moyenne, max(c.passages) as maximum, max(al.limite) as limite
        from public.compteurs c
        join public.vetements v on v.id = c.vetement_id
        join public.articles a on a.id = v.article_id
        join public.traitements t on t.id = c.traitement_id
        left join public.articles_limites al on al.article_id = v.article_id and al.traitement_id = c.traitement_id
        where v.organisation_id = org and v.statut not in ('reforme', 'perdu') and c.passages > 0
        group by a.designation, t.libelle
      ) x), '[]'::jsonb),
    'periode', coalesce((
      select jsonb_agg(x order by x.article, x.traitement) from (
        select a.designation as article, t.libelle as traitement,
               count(*)::integer as passages, count(distinct e.vetement_id)::integer as vetements
        from public.evenements e
        join public.vetements v on v.id = e.vetement_id
        join public.articles a on a.id = v.article_id
        join public.lots l on l.id = e.lot_id
        join public.traitements t on t.id = coalesce((e.donnees ->> 'traitement_id')::uuid, l.traitement_id)
        where e.organisation_id = org and e.type = 'traitement' and e.annule_par is null
          and e.survenu_le >= debut and e.survenu_le < fin + 1
        group by a.designation, t.libelle
      ) x), '[]'::jsonb)
  );
$$;

-- Vêtements à renouveler : usure (passages / limite) au-delà du seuil, ou fin de vie (âge) dans l'horizon.
create function public.rapport_fin_de_vie(org uuid, horizon_mois integer default 6, seuil_pct integer default 80)
returns table (
  vetement_id uuid, article text, taille text, code text, numero_serie text, statut public.statut_vetement,
  site text, porteur text, usure_pct integer, traitement text, mis_en_service_le date, fin_age date
)
language sql stable security invoker set search_path = '' as $$
  with usure as (
    select distinct on (c.vetement_id) c.vetement_id, t.libelle,
           (100 * c.passages / coalesce(vl.limite, al.limite))::integer as pct
    from public.compteurs c
    join public.vetements v on v.id = c.vetement_id
    join public.traitements t on t.id = c.traitement_id
    left join public.vetements_limites vl on vl.vetement_id = v.id and vl.traitement_id = c.traitement_id
    left join public.articles_limites al on al.article_id = v.article_id and al.traitement_id = c.traitement_id
    where v.organisation_id = org and coalesce(vl.limite, al.limite) is not null
    order by c.vetement_id, c.passages::numeric / coalesce(vl.limite, al.limite) desc
  )
  select v.id, a.designation, v.taille,
         (select i.valeur from public.identifiants i where i.vetement_id = v.id and i.actif order by i.pose_le limit 1),
         v.numero_serie, v.statut, s.nom, p.matricule, u.pct, u.libelle, v.mis_en_service_le,
         (v.mis_en_service_le + make_interval(months => a.duree_vie_mois))::date
  from public.vetements v
  join public.articles a on a.id = v.article_id
  left join usure u on u.vetement_id = v.id
  left join public.sites s on s.id = v.site_id
  left join public.porteurs_anonymises p on p.id = v.porteur_id
  where v.organisation_id = org and v.statut not in ('reforme', 'perdu')
    and (coalesce(u.pct, 0) >= seuil_pct
         or (a.duree_vie_mois is not null and v.mis_en_service_le is not null
             and v.mis_en_service_le + make_interval(months => a.duree_vie_mois) <= current_date + make_interval(months => horizon_mois)))
  order by greatest(coalesce(u.pct, 0), 0) desc, 12 nulls last;
$$;

-- Activité d'une laverie sur une période : lots clôturés et passages, sacs et vêtements reçus.
create function public.rapport_laverie(org uuid, site uuid, debut date, fin date) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'lots', coalesce((
      select jsonb_agg(x order by x.cloture_le) from (
        select l.id, l.cloture_le, t.libelle as traitement, l.circuit, l.programme, l.machine,
               (select count(*) from public.evenements e where e.lot_id = l.id and e.type = 'traitement' and e.annule_par is null)::integer as passages
        from public.lots l join public.traitements t on t.id = l.traitement_id
        where l.organisation_id = org and l.type = 'traitement' and l.site_id = site and l.statut = 'cloture'
          and l.cloture_le >= debut and l.cloture_le < fin + 1
      ) x), '[]'::jsonb),
    'avortes', (select count(*) from public.lots l where l.organisation_id = org and l.type = 'traitement' and l.site_id = site
                and l.statut = 'avorte' and l.cloture_le >= debut and l.cloture_le < fin + 1),
    'sacs_recus', (select count(*) from public.lots l where l.organisation_id = org and l.type = 'sac_collecte'
                   and l.site_destination_id = site and l.statut = 'receptionne' and l.cloture_le >= debut and l.cloture_le < fin + 1),
    'vetements_recus', (select count(*) from public.evenements e where e.organisation_id = org and e.type = 'reception'
                        and e.site_id = site and e.annule_par is null and e.survenu_le >= debut and e.survenu_le < fin + 1)
  );
$$;

revoke all on function public.rapport_passages(uuid, date, date), public.rapport_fin_de_vie(uuid, integer, integer),
  public.rapport_laverie(uuid, uuid, date, date) from public, anon;
grant execute on function public.rapport_passages(uuid, date, date), public.rapport_fin_de_vie(uuid, integer, integer),
  public.rapport_laverie(uuid, uuid, date, date) to authenticated;

commit;
