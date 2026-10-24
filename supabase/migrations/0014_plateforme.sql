-- 0014_plateforme.sql — Espace « Plateforme » : gestion des clients (organisations).
-- À exécuter après 0013_rapports.sql, puis supabase/outils/premier_admin_plateforme.sql une fois.
--
-- Super-administrateurs de la plateforme (table plateforme_admins, gérée dans l'app) :
--   - créer un client et inviter son premier administrateur ;
--   - suspendre / réactiver un client : une zone suspendue n'est plus accessible à ses membres,
--     ses données restent intactes ;
--   - suivre l'activité de chaque client (vêtements, utilisateurs, passages, alertes) ;
--   - accès support EN LECTURE SEULE à une zone, seulement si son administrateur l'a autorisé,
--     pour 2 heures, motif obligatoire, chaque accès tracé et visible de l'administrateur de la zone.
--     Le support ne voit jamais le nom des pompiers (matricule et casier seulement).

begin;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.plateforme_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  actif boolean not null default true,
  ajoute_par uuid,
  ajoute_le timestamptz not null default now(),
  retire_le timestamptz
);

alter table public.organisations
  add column suspendue_le timestamptz,
  add column motif_suspension text,
  add column support_autorise boolean not null default false;
-- L'administrateur de la zone accorde ou retire l'accès support ; la suspension n'est pas modifiable.
grant update (support_autorise) on public.organisations to authenticated;

create table public.acces_support (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null,
  email text not null,
  motif text not null check (btrim(motif) <> ''),
  debut timestamptz not null default now(),
  fin timestamptz not null
);
create index acces_support_actif_idx on public.acces_support (user_id, organisation_id, fin);

-- ---------------------------------------------------------------------------
-- Fonctions d'aide : plateforme, zone active, accès support en cours
-- ---------------------------------------------------------------------------

create function prive.est_plateforme() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.plateforme_admins p where p.user_id = (select auth.uid()) and p.actif);
$$;

create function prive.zone_active(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organisations o where o.id = org and o.suspendue_le is null);
$$;

create function prive.en_support(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.acces_support a
    join public.organisations o on o.id = a.organisation_id
    where a.organisation_id = org and a.user_id = (select auth.uid()) and a.fin > now()
      and o.support_autorise and prive.est_plateforme()
  );
$$;

-- Membre d'une zone active, ou support en cours (lecture seule : aucun rôle, donc aucune écriture).
create or replace function prive.est_membre(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (exists (
      select 1 from public.membres m
      where m.organisation_id = org and m.user_id = (select auth.uid()) and m.actif
    ) and prive.zone_active(org))
    or prive.en_support(org);
$$;

create or replace function prive.a_role(org uuid, variadic roles public.role_membre[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membres m
    where m.organisation_id = org and m.user_id = (select auth.uid()) and m.actif
      and m.role = any (roles)
  ) and prive.zone_active(org);
$$;

create or replace function prive.voit_tout(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select prive.a_role(org, 'admin', 'gestionnaire', 'operateur_laverie', 'auditeur') or prive.en_support(org);
$$;

create or replace function prive.site_externe(org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.site_id from public.membres m
  where m.organisation_id = org and m.user_id = (select auth.uid()) and m.actif
    and m.role = 'laverie_externe' and prive.zone_active(org);
$$;

-- Le support ne lit pas les noms : la table complète des porteurs reste aux rôles internes.
alter policy porteurs_lecture on public.porteurs
  using (prive.a_role(organisation_id, 'admin', 'gestionnaire', 'operateur_laverie', 'auditeur') or user_id = (select auth.uid()));
-- Les lectures brutes s'écrivent par un membre de la zone, jamais par le support.
alter policy lectures_brutes_ajout on public.lectures_brutes
  with check (
    prive.a_role(organisation_id, 'admin', 'gestionnaire', 'operateur_laverie', 'laverie_externe', 'auditeur', 'porteur')
    and auteur_id = (select auth.uid())
  );

-- Suspension : seule la plateforme (ou le propriétaire de la base) la change.
create function public.proteger_suspension() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.suspendue_le is distinct from old.suspendue_le or new.motif_suspension is distinct from old.motif_suspension)
     and auth.uid() is not null and not prive.est_plateforme() then
    raise exception 'Seule la plateforme suspend ou réactive une zone' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger organisations_proteger_suspension before update on public.organisations
  for each row execute function public.proteger_suspension();

-- ---------------------------------------------------------------------------
-- Droits sur les nouvelles tables
-- ---------------------------------------------------------------------------

alter table public.plateforme_admins enable row level security;
revoke all on public.plateforme_admins from anon, authenticated;

alter table public.acces_support enable row level security;
revoke all on public.acces_support from anon, authenticated;
grant select on public.acces_support to authenticated;
-- Transparence : l'administrateur de la zone voit qui est entré, quand et pourquoi.
create policy acces_support_lecture on public.acces_support
  for select to authenticated using (prive.a_role(organisation_id, 'admin') or prive.est_plateforme());

-- ---------------------------------------------------------------------------
-- RPC de la plateforme (toutes réservées aux super-administrateurs)
-- ---------------------------------------------------------------------------

create function prive.exiger_plateforme() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prive.est_plateforme() then
    raise exception 'Réservé aux administrateurs de la plateforme' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create function public.est_admin_plateforme() returns boolean
language sql stable security definer set search_path = '' as $$
  select prive.est_plateforme();
$$;

create function public.plateforme_clients()
returns table (
  id uuid, nom text, type public.type_organisation, cree_le timestamptz, suspendue_le timestamptz, motif_suspension text,
  support_autorise boolean, vetements bigint, utilisateurs bigint, invitations bigint, administrateurs text,
  passages_mois bigint, derniere_activite timestamptz, alertes_ouvertes bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform prive.exiger_plateforme();
  return query
  select o.id, o.nom, o.type, o.cree_le, o.suspendue_le, o.motif_suspension, o.support_autorise,
    (select count(*) from public.vetements v where v.organisation_id = o.id and v.statut not in ('reforme', 'perdu')),
    (select count(*) from public.membres m where m.organisation_id = o.id and m.actif),
    (select count(*) from public.invitations i where i.organisation_id = o.id),
    (select string_agg(u.email::text, ', ' order by u.email) from public.membres m join auth.users u on u.id = m.user_id
      where m.organisation_id = o.id and m.actif and m.role = 'admin'),
    (select count(*) from public.evenements e where e.organisation_id = o.id and e.type = 'traitement' and e.annule_par is null
      and e.survenu_le >= date_trunc('month', now())),
    (select max(e.recu_le) from public.evenements e where e.organisation_id = o.id),
    (select count(*) from public.alertes a where a.organisation_id = o.id and a.close_le is null)
  from public.organisations o
  order by o.nom;
end;
$$;

-- Nouveau client : organisation (traitements par défaut semés), premier administrateur ou invitation.
create function public.creer_client(nom_client text, type_client public.type_organisation, email_admin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
  utilisateur uuid;
  adresse text := lower(btrim(email_admin));
begin
  perform prive.exiger_plateforme();
  if btrim(coalesce(nom_client, '')) = '' then
    raise exception 'Nom du client obligatoire' using errcode = 'check_violation';
  end if;
  if adresse !~ '^[^@\s]+@[^@\s]+$' then
    raise exception 'Adresse e-mail de l''administrateur invalide' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.organisations o where lower(o.nom) = lower(btrim(nom_client))) then
    raise exception 'Un client porte déjà ce nom' using errcode = 'unique_violation';
  end if;
  insert into public.organisations (nom, type) values (btrim(nom_client), coalesce(type_client, 'zone_secours')) returning id into org;
  select u.id into utilisateur from auth.users u where lower(u.email) = adresse;
  if utilisateur is not null then
    insert into public.membres (organisation_id, user_id, role) values (org, utilisateur, 'admin');
    return jsonb_build_object('organisation_id', org, 'admin', 'membre');
  end if;
  insert into public.invitations (organisation_id, email, role) values (org, adresse, 'admin');
  return jsonb_build_object('organisation_id', org, 'admin', 'invitation');
end;
$$;

-- Administrateur supplémentaire pour un client (aide au démarrage, remplacement d'un admin parti).
create function public.plateforme_inviter_admin(org uuid, email_admin text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  utilisateur uuid;
  adresse text := lower(btrim(email_admin));
begin
  perform prive.exiger_plateforme();
  if not exists (select 1 from public.organisations o where o.id = org) then
    raise exception 'Client introuvable' using errcode = 'no_data_found';
  end if;
  select u.id into utilisateur from auth.users u where lower(u.email) = adresse;
  if utilisateur is not null then
    insert into public.membres (organisation_id, user_id, role) values (org, utilisateur, 'admin')
    on conflict (organisation_id, user_id) do update set role = 'admin', site_id = null, actif = true;
    return 'membre';
  end if;
  insert into public.invitations (organisation_id, email, role) values (org, adresse, 'admin')
  on conflict (organisation_id, lower(email)) do update set role = 'admin', site_id = null;
  return 'invitation';
end;
$$;

create function public.suspendre_client(org uuid, motif text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform prive.exiger_plateforme();
  if btrim(coalesce(motif, '')) = '' then
    raise exception 'Motif de suspension obligatoire' using errcode = 'check_violation';
  end if;
  update public.organisations set suspendue_le = now(), motif_suspension = btrim(motif) where id = org and suspendue_le is null;
end;
$$;

create function public.reactiver_client(org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform prive.exiger_plateforme();
  update public.organisations set suspendue_le = null, motif_suspension = null where id = org;
end;
$$;

-- Super-administrateurs : liste, ajout (compte existant), retrait (jamais le dernier).
create function public.plateforme_admins_liste() returns table (user_id uuid, email text, ajoute_le timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform prive.exiger_plateforme();
  return query select p.user_id, u.email::text, p.ajoute_le from public.plateforme_admins p join auth.users u on u.id = p.user_id
    where p.actif order by u.email;
end;
$$;

create function public.ajouter_admin_plateforme(email_admin text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  utilisateur uuid;
begin
  perform prive.exiger_plateforme();
  select u.id into utilisateur from auth.users u where lower(u.email) = lower(btrim(email_admin));
  if utilisateur is null then
    raise exception 'Aucun compte avec cet e-mail : la personne doit d''abord se connecter une fois à l''app' using errcode = 'no_data_found';
  end if;
  insert into public.plateforme_admins (user_id, ajoute_par) values (utilisateur, auth.uid())
  on conflict (user_id) do update set actif = true, ajoute_par = excluded.ajoute_par, ajoute_le = now(), retire_le = null;
end;
$$;

create function public.retirer_admin_plateforme(utilisateur uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform prive.exiger_plateforme();
  if (select count(*) from public.plateforme_admins p where p.actif and p.user_id <> utilisateur) = 0 then
    raise exception 'Il faut garder au moins un administrateur de la plateforme' using errcode = 'check_violation';
  end if;
  update public.plateforme_admins set actif = false, retire_le = now() where user_id = utilisateur;
end;
$$;

-- Accès support : lecture seule, 2 heures, motif obligatoire, autorisé par l'administrateur de la zone.
create function public.ouvrir_support(org uuid, motif text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  jusqu_a timestamptz := now() + interval '2 hours';
begin
  perform prive.exiger_plateforme();
  if btrim(coalesce(motif, '')) = '' then
    raise exception 'Motif de l''accès support obligatoire' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.organisations o where o.id = org and o.support_autorise) then
    raise exception 'L''administrateur de cette zone n''a pas autorisé l''accès support' using errcode = 'insufficient_privilege';
  end if;
  update public.acces_support set fin = now() where user_id = auth.uid() and organisation_id = org and fin > now();
  insert into public.acces_support (organisation_id, user_id, email, motif, fin)
  select org, auth.uid(), u.email, btrim(motif), jusqu_a from auth.users u where u.id = auth.uid();
  return jusqu_a;
end;
$$;

create function public.fermer_support(org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.acces_support set fin = now() where user_id = auth.uid() and organisation_id = org and fin > now();
end;
$$;

-- Zones où l'utilisateur est en support en ce moment (pour l'app : « adhésion » de lecture seule).
create function public.mes_acces_support() returns table (organisation_id uuid, nom text, type public.type_organisation, reglages jsonb, fin timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.id, o.nom, o.type, o.reglages, max(a.fin)
  from public.acces_support a join public.organisations o on o.id = a.organisation_id
  where a.user_id = (select auth.uid()) and a.fin > now() and o.support_autorise and prive.est_plateforme()
  group by o.id, o.nom, o.type, o.reglages;
$$;

revoke all on function prive.est_plateforme(), prive.zone_active(uuid), prive.en_support(uuid), prive.exiger_plateforme(),
  public.proteger_suspension() from public, anon;
-- Appelées par les policies et le déclencheur, avec les droits de l'utilisateur.
grant execute on function prive.est_plateforme(), prive.zone_active(uuid), prive.en_support(uuid), prive.exiger_plateforme()
  to authenticated;
revoke all on function public.est_admin_plateforme(), public.plateforme_clients(), public.creer_client(text, public.type_organisation, text),
  public.plateforme_inviter_admin(uuid, text), public.suspendre_client(uuid, text), public.reactiver_client(uuid),
  public.plateforme_admins_liste(), public.ajouter_admin_plateforme(text), public.retirer_admin_plateforme(uuid),
  public.ouvrir_support(uuid, text), public.fermer_support(uuid), public.mes_acces_support() from public, anon;
grant execute on function public.est_admin_plateforme(), public.plateforme_clients(), public.creer_client(text, public.type_organisation, text),
  public.plateforme_inviter_admin(uuid, text), public.suspendre_client(uuid, text), public.reactiver_client(uuid),
  public.plateforme_admins_liste(), public.ajouter_admin_plateforme(text), public.retirer_admin_plateforme(uuid),
  public.ouvrir_support(uuid, text), public.fermer_support(uuid), public.mes_acces_support() to authenticated;

commit;
