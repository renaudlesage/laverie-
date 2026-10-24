-- 0010_synchro.sql — Tirage incrémental pour l'index local hors-ligne (jalon M7).
-- À exécuter après 0009_laverie.sql.
--
-- L'appareil garde un index local (IndexedDB) du périmètre visible de l'utilisateur. Il le met
-- à jour en ne tirant que les lignes modifiées depuis sa dernière synchronisation, d'après la
-- colonne modifie_le, tenue à jour par déclencheur. La lecture passe par l'API ordinaire : la RLS
-- borne l'index local à ce que l'utilisateur a le droit de voir.

begin;

-- Horodatage de toute modification, sauf si l'écriture le fixe elle-même (propriétaire seulement :
-- ces tables ne sont modifiables que par les fonctions de la base).
create function prive.toucher() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.modifie_le is not distinct from old.modifie_le then
    new.modifie_le := now();
  end if;
  return new;
end;
$$;

alter table public.vetements add column modifie_le timestamptz not null default now();
alter table public.identifiants add column modifie_le timestamptz not null default now();
alter table public.compteurs add column modifie_le timestamptz not null default now();
alter table public.lots add column modifie_le timestamptz not null default now();

create trigger vetements_toucher before update on public.vetements
  for each row execute function prive.toucher();
create trigger identifiants_toucher before update on public.identifiants
  for each row execute function prive.toucher();
create trigger compteurs_toucher before update on public.compteurs
  for each row execute function prive.toucher();
create trigger lots_toucher before update on public.lots
  for each row execute function prive.toucher();

create index vetements_modifie_idx on public.vetements (organisation_id, modifie_le);
create index identifiants_modifie_idx on public.identifiants (organisation_id, modifie_le);
create index compteurs_modifie_idx on public.compteurs (organisation_id, modifie_le);
create index lots_modifie_idx on public.lots (organisation_id, modifie_le);

revoke all on function prive.toucher() from public, anon, authenticated;

-- Mélange de circuits refusé sur l'appareil (hors ligne compris) : l'écriture refusée ne part pas,
-- mais l'alerte melange_circuits est créée à l'envoi, comme pour un refus de la base.
-- signalements : [{ id, vetement_id, lot_id, message, survenu_le }] ; rejouable (id de l'alerte).
create function public.signaler_melanges(org uuid, signalements jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s jsonb;
  resultat jsonb := '[]'::jsonb;
begin
  if not prive.est_membre(org) then
    raise exception 'Organisation non accessible' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(signalements) <> 'array' or jsonb_array_length(signalements) > 500 then
    raise exception 'Liste de 500 signalements au plus attendue' using errcode = 'program_limit_exceeded';
  end if;
  for s in select * from jsonb_array_elements(signalements) loop
    begin
      if not exists (select 1 from public.vetements v where v.id = (s ->> 'vetement_id')::uuid and v.organisation_id = org)
         or not prive.vetement_visible((s ->> 'vetement_id')::uuid) then
        raise exception 'Vêtement introuvable ou non accessible' using errcode = 'no_data_found';
      end if;
      insert into public.alertes (id, organisation_id, vetement_id, lot_id, type, niveau, message, ouverte_le)
      select (s ->> 'id')::uuid, org, (s ->> 'vetement_id')::uuid, l.id, 'melange_circuits', 'critique',
             left(coalesce(nullif(btrim(s ->> 'message'), ''), 'Mélange de circuits'), 300) || ' (refusé sur l''appareil)',
             coalesce((s ->> 'survenu_le')::timestamptz, now())
      from (select 1) x
      left join public.lots l on l.id = (s ->> 'lot_id')::uuid and l.organisation_id = org
      on conflict (id) do nothing;
      resultat := resultat || jsonb_build_object('id', s -> 'id', 'statut', 'accepte');
    exception when others then
      resultat := resultat || jsonb_build_object('id', s -> 'id', 'statut', 'rejete', 'motif', sqlerrm, 'code', sqlstate);
    end;
  end loop;
  return resultat;
end;
$$;

revoke all on function public.signaler_melanges(uuid, jsonb) from public, anon;
grant execute on function public.signaler_melanges(uuid, jsonb) to authenticated;

commit;
