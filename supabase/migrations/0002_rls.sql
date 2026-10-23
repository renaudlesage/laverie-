-- 0002_rls.sql — Row Level Security, fonctions d'aide et droits (invariants 2, 3, 6).
-- À exécuter après 0001_socle.sql.
--
-- Principes :
--   - RLS activée sur toutes les tables ; l'organisation de la ligne doit être celle du membre.
--   - Les rôles « voit tout » d'une organisation : admin, gestionnaire, operateur_laverie, auditeur.
--   - laverie_externe : seulement les vêtements dont le site courant est son site, ou qui sont
--     dans un lot partant de / destiné à son site ; jamais les noms des porteurs
--     (vue porteurs_anonymises).
--   - porteur : ses propres vêtements, via porteurs.user_id.
--   - Aucun droit d'écriture direct sur le journal ni sur les projections (statut, compteurs,
--     identifiants, lots) : ces écritures passeront par les RPC des jalons M4 à M6.
--
-- Supabase accorde par défaut tous les droits sur les nouvelles tables de public à anon et
-- authenticated : chaque migration qui crée une table doit révoquer puis accorder ses droits.

begin;

-- ---------------------------------------------------------------------------
-- Fonctions d'aide (schéma « prive », non exposé par l'API)
-- ---------------------------------------------------------------------------

create schema if not exists prive;
revoke all on schema prive from public;
grant usage on schema prive to authenticated;

create function prive.est_membre(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membres m
    where m.organisation_id = org and m.user_id = (select auth.uid()) and m.actif
  );
$$;

-- a_role(org, 'admin') ou a_role(org, 'admin', 'gestionnaire', …)
create function prive.a_role(org uuid, variadic roles public.role_membre[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membres m
    where m.organisation_id = org and m.user_id = (select auth.uid()) and m.actif
      and m.role = any (roles)
  );
$$;

create function prive.voit_tout(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select prive.a_role(org, 'admin', 'gestionnaire', 'operateur_laverie', 'auditeur');
$$;

-- Site de rattachement si l'utilisateur est laverie externe de cette organisation, sinon null.
create function prive.site_externe(org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.site_id from public.membres m
  where m.organisation_id = org and m.user_id = (select auth.uid()) and m.actif
    and m.role = 'laverie_externe';
$$;

-- Fiche porteur de l'utilisateur s'il est membre « porteur » de cette organisation, sinon null.
create function prive.porteur_courant(org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.porteurs p
  where p.organisation_id = org and p.user_id = (select auth.uid()) and p.actif
    and prive.a_role(org, 'porteur')
  limit 1;
$$;

create function prive.lot_visible_externe(org uuid, lot uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.lots l
    where l.id = lot and l.organisation_id = org
      and prive.site_externe(org) in (l.site_id, l.site_destination_id)
  );
$$;

-- Visibilité d'un vêtement à partir de ses colonnes (utilisée par la policy de vetements).
create function prive.vetement_visible_ligne(org uuid, site uuid, lot uuid, porteur uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select prive.voit_tout(org)
    or (prive.site_externe(org) is not null
        and (site = prive.site_externe(org) or prive.lot_visible_externe(org, lot)))
    or (porteur is not null and porteur = prive.porteur_courant(org));
$$;

create function prive.vetement_visible(vetement uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.vetements v
    where v.id = vetement
      and prive.vetement_visible_ligne(v.organisation_id, v.site_id, v.lot_id, v.porteur_id)
  );
$$;

revoke all on all functions in schema prive from public;
grant execute on all functions in schema prive to authenticated;

-- ---------------------------------------------------------------------------
-- Droits : tout retirer, puis accorder au plus juste
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

grant select, update (nom, reglages) on public.organisations to authenticated;
grant select, insert, update, delete on public.membres to authenticated;
grant select, insert, update, delete on public.sites to authenticated;
grant select, insert, update, delete on public.traitements to authenticated;
grant select, insert, update, delete on public.articles to authenticated;
grant select, insert, update, delete on public.articles_limites to authenticated;
grant select, insert, update, delete on public.porteurs to authenticated;
grant select, insert, update, delete on public.lecteurs to authenticated;
grant select, insert, update, delete on public.vetements_limites to authenticated;
-- Vêtements : seules les colonnes descriptives sont modifiables ; les projections jamais.
grant select, update (taille, numero_serie, mis_en_service_le, nominatif) on public.vetements to authenticated;
grant select on public.compteurs, public.identifiants, public.lots, public.evenements to authenticated;
grant select, insert on public.lectures_brutes to authenticated;
grant select, update (close_le, close_par) on public.alertes to authenticated;

-- Les fonctions de déclencheur ne s'appellent pas depuis l'API.
revoke all on function
  public.verifier_membre(), public.verifier_article_activable(), public.proteger_derniere_limite(),
  public.verifier_lot_circuit(), public.proteger_evenements()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.organisations enable row level security;
alter table public.membres enable row level security;
alter table public.sites enable row level security;
alter table public.traitements enable row level security;
alter table public.articles enable row level security;
alter table public.articles_limites enable row level security;
alter table public.porteurs enable row level security;
alter table public.lecteurs enable row level security;
alter table public.lots enable row level security;
alter table public.vetements enable row level security;
alter table public.vetements_limites enable row level security;
alter table public.compteurs enable row level security;
alter table public.identifiants enable row level security;
alter table public.evenements enable row level security;
alter table public.lectures_brutes enable row level security;
alter table public.alertes enable row level security;

-- Organisations : visibles par leurs membres, modifiables (nom, réglages) par l'admin.
-- La création d'une organisation se fait dans le SQL Editor (supabase/amorcage.sql).
create policy organisations_lecture on public.organisations
  for select to authenticated using (prive.est_membre(id));
create policy organisations_modification on public.organisations
  for update to authenticated using (prive.a_role(id, 'admin')) with check (prive.a_role(id, 'admin'));

-- Membres : chacun voit ses adhésions (sélecteur d'organisation) ; l'admin gère tout.
create policy membres_lecture on public.membres
  for select to authenticated
  using (user_id = (select auth.uid()) or prive.a_role(organisation_id, 'admin'));
create policy membres_ajout on public.membres
  for insert to authenticated with check (prive.a_role(organisation_id, 'admin'));
create policy membres_modification on public.membres
  for update to authenticated
  using (prive.a_role(organisation_id, 'admin')) with check (prive.a_role(organisation_id, 'admin'));
create policy membres_suppression on public.membres
  for delete to authenticated using (prive.a_role(organisation_id, 'admin'));

-- Référentiels lisibles par tout membre, gérés par l'admin.
create policy sites_lecture on public.sites
  for select to authenticated using (prive.est_membre(organisation_id));
create policy sites_gestion on public.sites
  for all to authenticated
  using (prive.a_role(organisation_id, 'admin')) with check (prive.a_role(organisation_id, 'admin'));

create policy traitements_lecture on public.traitements
  for select to authenticated using (prive.est_membre(organisation_id));
create policy traitements_gestion on public.traitements
  for all to authenticated
  using (prive.a_role(organisation_id, 'admin')) with check (prive.a_role(organisation_id, 'admin'));

create policy articles_lecture on public.articles
  for select to authenticated using (prive.est_membre(organisation_id));
create policy articles_gestion on public.articles
  for all to authenticated
  using (prive.a_role(organisation_id, 'admin')) with check (prive.a_role(organisation_id, 'admin'));

create policy articles_limites_lecture on public.articles_limites
  for select to authenticated using (prive.est_membre(organisation_id));
create policy articles_limites_gestion on public.articles_limites
  for all to authenticated
  using (prive.a_role(organisation_id, 'admin')) with check (prive.a_role(organisation_id, 'admin'));

-- Lecteurs : gérés par l'admin, visibles par l'admin et les rôles internes (clé d'API hachée).
create policy lecteurs_lecture on public.lecteurs
  for select to authenticated
  using (prive.voit_tout(organisation_id) or prive.site_externe(organisation_id) = site_id);
create policy lecteurs_gestion on public.lecteurs
  for all to authenticated
  using (prive.a_role(organisation_id, 'admin')) with check (prive.a_role(organisation_id, 'admin'));

-- Porteurs : table complète (avec noms) pour les rôles internes et pour le porteur lui-même.
-- La laverie externe n'y a aucun accès : elle passe par la vue porteurs_anonymises.
create policy porteurs_lecture on public.porteurs
  for select to authenticated
  using (prive.voit_tout(organisation_id) or user_id = (select auth.uid()));
create policy porteurs_gestion on public.porteurs
  for all to authenticated
  using (prive.a_role(organisation_id, 'admin', 'gestionnaire'))
  with check (prive.a_role(organisation_id, 'admin', 'gestionnaire'));

-- Lots : rôles internes ; laverie externe pour les lots partant de / destinés à son site.
create policy lots_lecture on public.lots
  for select to authenticated
  using (prive.voit_tout(organisation_id) or prive.lot_visible_externe(organisation_id, id));

-- Vêtements et tables qui en dépendent.
create policy vetements_lecture on public.vetements
  for select to authenticated
  using (prive.vetement_visible_ligne(organisation_id, site_id, lot_id, porteur_id));
create policy vetements_modification on public.vetements
  for update to authenticated
  using (prive.a_role(organisation_id, 'admin', 'gestionnaire'))
  with check (prive.a_role(organisation_id, 'admin', 'gestionnaire'));

create policy vetements_limites_lecture on public.vetements_limites
  for select to authenticated using (prive.vetement_visible(vetement_id));
create policy vetements_limites_gestion on public.vetements_limites
  for all to authenticated
  using (prive.a_role(organisation_id, 'admin')) with check (prive.a_role(organisation_id, 'admin'));

create policy compteurs_lecture on public.compteurs
  for select to authenticated using (prive.vetement_visible(vetement_id));

create policy identifiants_lecture on public.identifiants
  for select to authenticated using (prive.vetement_visible(vetement_id));

-- Journal : lecture seule. Laverie externe : seulement les événements survenus chez elle ou
-- liés à ses lots. Aucune policy INSERT / UPDATE / DELETE : l'écriture passera par
-- ingerer_evenements (M5), la modification et la suppression sont impossibles.
create policy evenements_lecture on public.evenements
  for select to authenticated
  using (
    prive.voit_tout(organisation_id)
    or (prive.site_externe(organisation_id) is not null
        and prive.vetement_visible(vetement_id)
        and (site_id = prive.site_externe(organisation_id)
             or prive.lot_visible_externe(organisation_id, lot_id)))
    or (prive.porteur_courant(organisation_id) is not null and prive.vetement_visible(vetement_id))
  );

-- Lectures brutes : tout membre écrit les siennes ; rôles internes lisent tout.
create policy lectures_brutes_ajout on public.lectures_brutes
  for insert to authenticated
  with check (prive.est_membre(organisation_id) and auteur_id = (select auth.uid()));
create policy lectures_brutes_lecture on public.lectures_brutes
  for select to authenticated
  using (prive.voit_tout(organisation_id) or auteur_id = (select auth.uid()));

-- Alertes : visibles si le vêtement ou le lot l'est ; clôturées par les rôles opérationnels.
create policy alertes_lecture on public.alertes
  for select to authenticated
  using (
    prive.voit_tout(organisation_id)
    or (vetement_id is not null and prive.vetement_visible(vetement_id))
    or (lot_id is not null and prive.lot_visible_externe(organisation_id, lot_id))
  );
create policy alertes_cloture on public.alertes
  for update to authenticated
  using (prive.a_role(organisation_id, 'admin', 'gestionnaire', 'operateur_laverie'))
  with check (
    prive.a_role(organisation_id, 'admin', 'gestionnaire', 'operateur_laverie')
    and close_par = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Vue pour la laverie externe : matricule et casier, jamais nom ni prénom
-- ---------------------------------------------------------------------------

-- Vue exécutée avec les droits de son propriétaire (pas de security_invoker) : le filtrage
-- est fait explicitement ici.
create view public.porteurs_anonymises as
  select p.id, p.organisation_id, p.matricule, p.casier, p.site_id, p.actif
  from public.porteurs p
  where prive.voit_tout(p.organisation_id)
     or p.user_id = (select auth.uid())
     or exists (
       select 1 from public.vetements v
       where v.porteur_id = p.id
         and prive.vetement_visible_ligne(v.organisation_id, v.site_id, v.lot_id, v.porteur_id)
     );

revoke all on public.porteurs_anonymises from anon, authenticated;
grant select on public.porteurs_anonymises to authenticated;

commit;
