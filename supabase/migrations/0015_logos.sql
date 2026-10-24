-- 0015_logos.sql — Logo de chaque client, utilisé comme icône de l'application (PWA).
-- À exécuter après 0014_plateforme.sql.
--
-- Bucket public « logos » : <organisation_id>/icone-192.png, icone-512.png, maskable-512.png, apple-180.png,
-- préparés dans le navigateur à partir du fichier choisi. Un logo n'est pas une donnée personnelle ; il doit être
-- public pour que le téléphone puisse en faire l'icône de l'application installée.
-- organisations.logo_le : date du dernier logo (sert aussi de version pour les caches), null sans logo.
-- Le logo se dépose par l'administrateur de la zone ou par la plateforme.

begin;

alter table public.organisations add column logo_le timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152, array['image/png'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Administrateur de la zone (active) ou administrateur de la plateforme.
create function prive.gere_logo(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select org is not null and (prive.a_role(org, 'admin') or (prive.est_plateforme() and exists (select 1 from public.organisations o where o.id = org)));
$$;
revoke all on function prive.gere_logo(uuid) from public;
grant execute on function prive.gere_logo(uuid) to authenticated;

create policy logos_lecture on storage.objects
  for select to authenticated
  using (bucket_id = 'logos' and prive.gere_logo(prive.organisation_du_chemin(name)));
create policy logos_ajout on storage.objects
  for insert to authenticated
  with check (bucket_id = 'logos' and prive.gere_logo(prive.organisation_du_chemin(name)));
create policy logos_modification on storage.objects
  for update to authenticated
  using (bucket_id = 'logos' and prive.gere_logo(prive.organisation_du_chemin(name)))
  with check (bucket_id = 'logos' and prive.gere_logo(prive.organisation_du_chemin(name)));
create policy logos_suppression on storage.objects
  for delete to authenticated
  using (bucket_id = 'logos' and prive.gere_logo(prive.organisation_du_chemin(name)));

-- Enregistre la présence (ou le retrait) du logo, une fois les fichiers déposés.
create function public.definir_logo(org uuid, present boolean) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  quand timestamptz := case when present then now() end;
begin
  if not prive.gere_logo(org) then
    raise exception 'Réservé à l''administrateur de la zone ou à la plateforme' using errcode = 'insufficient_privilege';
  end if;
  update public.organisations set logo_le = quand where id = org;
  return quand;
end;
$$;
revoke all on function public.definir_logo(uuid, boolean) from public, anon;
grant execute on function public.definir_logo(uuid, boolean) to authenticated;

-- Liste des clients de la plateforme : avec la version du logo.
drop function public.plateforme_clients();
create function public.plateforme_clients()
returns table (
  id uuid, nom text, type public.type_organisation, cree_le timestamptz, suspendue_le timestamptz, motif_suspension text,
  support_autorise boolean, vetements bigint, utilisateurs bigint, invitations bigint, administrateurs text,
  passages_mois bigint, derniere_activite timestamptz, alertes_ouvertes bigint, logo_le timestamptz
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
    (select count(*) from public.alertes a where a.organisation_id = o.id and a.close_le is null),
    o.logo_le
  from public.organisations o
  order by o.nom;
end;
$$;
revoke all on function public.plateforme_clients() from public, anon;
grant execute on function public.plateforme_clients() to authenticated;

commit;
