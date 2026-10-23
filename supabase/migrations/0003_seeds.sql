-- 0003_seeds.sql — Traitements par défaut, insérés à la création de chaque organisation.
-- À exécuter après 0002_rls.sql. Ce sont des valeurs de départ, modifiables ensuite dans l'app
-- (libellé, circuit, activation, ajout d'autres traitements).

begin;

create function public.semer_traitements(org uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.traitements (organisation_id, code, libelle, circuit)
  values
    (org, 'lavage', 'Lavage', 'les_deux'),
    (org, 'sechage', 'Séchage', 'les_deux'),
    (org, 'nettoyage_sec', 'Nettoyage à sec', 'standard'),
    (org, 'decontamination', 'Décontamination', 'contamine')
  on conflict (organisation_id, code) do nothing;
$$;

create function public.semer_organisation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.semer_traitements(new.id);
  return new;
end;
$$;

create trigger organisations_semer after insert on public.organisations
  for each row execute function public.semer_organisation();

revoke all on function public.semer_traitements(uuid), public.semer_organisation()
  from public, anon, authenticated;

-- Organisations déjà créées avant cette migration.
select public.semer_traitements(id) from public.organisations;

commit;
