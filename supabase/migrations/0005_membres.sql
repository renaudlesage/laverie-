-- 0005_membres.sql — Gestion des membres depuis l'app (jalon M2).
-- À exécuter après 0004_notices.sql.
--
-- L'admin ajoute un membre par son e-mail :
--   - si le compte existe déjà, il devient membre immédiatement ;
--   - sinon une invitation est enregistrée et convertie en adhésion à la création du compte
--     (première connexion par lien e-mail).
-- Une organisation garde toujours au moins un administrateur actif.

begin;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+$'),
  role public.role_membre not null,
  site_id uuid,
  cree_par uuid default auth.uid(),
  cree_le timestamptz not null default now(),
  foreign key (organisation_id, site_id) references public.sites (organisation_id, id),
  constraint invitations_laverie_externe_site check (role <> 'laverie_externe' or site_id is not null)
);

create unique index invitations_email_unique on public.invitations (organisation_id, lower(email));
create index invitations_email_idx on public.invitations (lower(email));

create trigger invitations_verifier before insert or update on public.invitations
  for each row execute function public.verifier_membre();

alter table public.invitations enable row level security;
revoke all on public.invitations from anon, authenticated;
grant select, delete on public.invitations to authenticated;

create policy invitations_lecture on public.invitations
  for select to authenticated using (prive.a_role(organisation_id, 'admin'));
create policy invitations_suppression on public.invitations
  for delete to authenticated using (prive.a_role(organisation_id, 'admin'));

-- ---------------------------------------------------------------------------
-- Ajouter un membre ou l'inviter
-- ---------------------------------------------------------------------------

create function public.inviter_membre(
  org uuid, email_membre text, role_membre public.role_membre, site uuid default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  utilisateur uuid;
  adresse text := lower(btrim(email_membre));
begin
  if not prive.a_role(org, 'admin') then
    raise exception 'Réservé aux administrateurs de l''organisation' using errcode = 'insufficient_privilege';
  end if;
  if role_membre <> 'laverie_externe' then
    site := null;
  end if;

  select u.id into utilisateur from auth.users u where lower(u.email) = adresse;

  if utilisateur is not null then
    insert into public.membres (organisation_id, user_id, role, site_id, actif)
    values (org, utilisateur, role_membre, site, true)
    on conflict (organisation_id, user_id)
      do update set role = excluded.role, site_id = excluded.site_id, actif = true;
    delete from public.invitations i where i.organisation_id = org and lower(i.email) = adresse;
    return 'membre';
  end if;

  insert into public.invitations (organisation_id, email, role, site_id)
  values (org, adresse, role_membre, site)
  on conflict (organisation_id, lower(email))
    do update set role = excluded.role, site_id = excluded.site_id;
  return 'invitation';
end;
$$;

-- Liste des membres avec leur e-mail (auth.users n'est pas lisible depuis l'API).
create function public.membres_organisation(org uuid)
returns table (id uuid, user_id uuid, email text, role public.role_membre, site_id uuid, actif boolean, cree_le timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.user_id, u.email::text, m.role, m.site_id, m.actif, m.cree_le
  from public.membres m
  join auth.users u on u.id = m.user_id
  where m.organisation_id = org and prive.a_role(org, 'admin')
  order by u.email;
$$;

revoke all on function public.inviter_membre(uuid, text, public.role_membre, uuid) from public, anon;
revoke all on function public.membres_organisation(uuid) from public, anon;
grant execute on function public.inviter_membre(uuid, text, public.role_membre, uuid) to authenticated;
grant execute on function public.membres_organisation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Conversion des invitations à la création d'un compte
-- ---------------------------------------------------------------------------

create function public.accepter_invitations() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  invitation record;
begin
  for invitation in
    select * from public.invitations i where lower(i.email) = lower(new.email)
  loop
    -- Une invitation invalide ne doit jamais empêcher la création du compte.
    begin
      insert into public.membres (organisation_id, user_id, role, site_id)
      values (invitation.organisation_id, new.id, invitation.role, invitation.site_id)
      on conflict (organisation_id, user_id) do nothing;
      delete from public.invitations where id = invitation.id;
    exception when others then
      raise warning 'Invitation % non convertie : %', invitation.id, sqlerrm;
    end;
  end loop;
  return new;
end;
$$;

create trigger suivi_linge_accepter_invitations after insert on auth.users
  for each row execute function public.accepter_invitations();

revoke all on function public.accepter_invitations() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Toujours au moins un administrateur actif
-- ---------------------------------------------------------------------------

create function public.proteger_dernier_admin() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.role = 'admin' and old.actif
     and (tg_op = 'DELETE' or new.role <> 'admin' or not new.actif)
     and exists (select 1 from public.organisations o where o.id = old.organisation_id)
     and not exists (
       select 1 from public.membres m
       where m.organisation_id = old.organisation_id and m.id <> old.id
         and m.role = 'admin' and m.actif
     ) then
    raise exception 'L''organisation doit garder au moins un administrateur actif'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger membres_proteger_dernier_admin before update or delete on public.membres
  for each row execute function public.proteger_dernier_admin();

revoke all on function public.proteger_dernier_admin() from public, anon, authenticated;

commit;
