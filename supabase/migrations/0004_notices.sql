-- 0004_notices.sql — Bucket privé « notices » pour les notices fabricant (PDF).
-- À exécuter après 0003_seeds.sql. Chemin des fichiers : <organisation_id>/<article_id>.pdf

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notices', 'notices', false, 20971520, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Premier dossier du chemin = organisation ; null si ce n'est pas un UUID.
create function prive.organisation_du_chemin(chemin text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return (storage.foldername(chemin))[1]::uuid;
exception when others then
  return null;
end;
$$;

revoke all on function prive.organisation_du_chemin(text) from public;
grant execute on function prive.organisation_du_chemin(text) to authenticated;

create policy notices_lecture on storage.objects
  for select to authenticated
  using (bucket_id = 'notices' and prive.est_membre(prive.organisation_du_chemin(name)));

create policy notices_ajout on storage.objects
  for insert to authenticated
  with check (bucket_id = 'notices' and prive.a_role(prive.organisation_du_chemin(name), 'admin'));

create policy notices_modification on storage.objects
  for update to authenticated
  using (bucket_id = 'notices' and prive.a_role(prive.organisation_du_chemin(name), 'admin'))
  with check (bucket_id = 'notices' and prive.a_role(prive.organisation_du_chemin(name), 'admin'));

create policy notices_suppression on storage.objects
  for delete to authenticated
  using (bucket_id = 'notices' and prive.a_role(prive.organisation_du_chemin(name), 'admin'));

commit;
