-- logos.sql — Logo des clients (icône de l'application).
--
-- À coller tel quel dans le SQL Editor de Supabase, après les migrations 0001 à 0015.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste en base.
-- Succès : la dernière ligne affiche « Tous les tests des logos sont passés ».

begin;

create function pg_temp.devenir(utilisateur uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', utilisateur, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp.verifier(condition boolean, description text) returns void language plpgsql as $$
begin
  if condition is not true then
    raise exception 'ÉCHEC : %', description;
  end if;
end;
$$;

-- Refus attendu (droits ou RLS) d'une instruction.
create function pg_temp.interdit(instruction text, description text) returns void language plpgsql as $$
begin
  execute instruction;
  raise exception 'ÉCHEC : % (accepté)', description;
exception when insufficient_privilege then
  null;
end;
$$;

insert into auth.users (id, email) values
  ('dddddddd-3000-4000-8000-000000000001', 'test-logos-admin@exemple.invalid'),
  ('dddddddd-3000-4000-8000-000000000002', 'test-logos-gestionnaire@exemple.invalid'),
  ('dddddddd-3000-4000-8000-000000000003', 'test-logos-autre-zone@exemple.invalid'),
  ('dddddddd-3000-4000-8000-000000000004', 'test-logos-plateforme@exemple.invalid');
insert into public.organisations (id, nom) values
  ('d0000000-3000-4000-8000-0000000000aa', 'Test logos — Zone L'),
  ('d0000000-3000-4000-8000-0000000000bb', 'Test logos — Zone M');
insert into public.membres (organisation_id, user_id, role) values
  ('d0000000-3000-4000-8000-0000000000aa', 'dddddddd-3000-4000-8000-000000000001', 'admin'),
  ('d0000000-3000-4000-8000-0000000000aa', 'dddddddd-3000-4000-8000-000000000002', 'gestionnaire'),
  ('d0000000-3000-4000-8000-0000000000bb', 'dddddddd-3000-4000-8000-000000000003', 'admin');
insert into public.plateforme_admins (user_id) values ('dddddddd-3000-4000-8000-000000000004');

do $$
declare
  org uuid := 'd0000000-3000-4000-8000-0000000000aa';
  quand timestamptz;
begin
  perform pg_temp.verifier((select public from storage.buckets where id = 'logos'), 'bucket logos public');

  -- Administrateur de la zone : dépôt des fichiers et enregistrement.
  perform pg_temp.devenir('dddddddd-3000-4000-8000-000000000001');
  insert into storage.objects (bucket_id, name) values ('logos', org || '/icone-512.png');
  quand := public.definir_logo(org, true);
  perform pg_temp.verifier(quand is not null and (select logo_le = quand from public.organisations where id = org), 'admin : logo enregistré');
  reset role;

  -- Gestionnaire de la zone, administrateur d'une autre zone : refusés.
  perform pg_temp.devenir('dddddddd-3000-4000-8000-000000000002');
  perform pg_temp.verifier((select logo_le is not null from public.organisations where id = org), 'membre : voit la version du logo');
  perform pg_temp.interdit(format('select public.definir_logo(%L, false)', org), 'gestionnaire : retrait du logo');
  perform pg_temp.interdit(format($q$insert into storage.objects (bucket_id, name) values ('logos', %L)$q$, org || '/icone-192.png'),
    'gestionnaire : dépôt de fichier');
  reset role;
  perform pg_temp.devenir('dddddddd-3000-4000-8000-000000000003');
  perform pg_temp.interdit(format('select public.definir_logo(%L, true)', org), 'autre zone : enregistrement');
  perform pg_temp.interdit(format($q$insert into storage.objects (bucket_id, name) values ('logos', %L)$q$, org || '/icone-192.png'),
    'autre zone : dépôt de fichier');
  perform pg_temp.interdit($q$insert into storage.objects (bucket_id, name) values ('logos', 'pas-une-zone/icone-192.png')$q$,
    'chemin sans zone');
  reset role;

  -- Plateforme : dépôt et retrait pour n'importe quel client, version visible dans la liste.
  perform pg_temp.devenir('dddddddd-3000-4000-8000-000000000004');
  insert into storage.objects (bucket_id, name) values ('logos', 'd0000000-3000-4000-8000-0000000000bb/icone-512.png');
  perform public.definir_logo('d0000000-3000-4000-8000-0000000000bb', true);
  perform pg_temp.verifier((select logo_le is not null from public.plateforme_clients() where id = 'd0000000-3000-4000-8000-0000000000bb'),
    'plateforme : version du logo dans la liste des clients');
  perform pg_temp.verifier(public.definir_logo(org, false) is null, 'plateforme : retrait du logo');
  reset role;
  perform pg_temp.verifier((select logo_le is null from public.organisations where id = org), 'logo retiré');
end;
$$;

rollback;

select 'Tous les tests des logos sont passés' as resultat;
