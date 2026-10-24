-- porteurs.sql — Départ d'un pompier et anonymisation.
--
-- À coller tel quel dans le SQL Editor de Supabase, après les migrations 0001 à 0012.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste en base.
-- Succès : la dernière ligne affiche « Tous les tests des porteurs sont passés ».

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

create function pg_temp.ev(vetement uuid, type text, donnees jsonb default '{}', site uuid default null) returns jsonb language sql as $$
  select public.ingerer_evenements('a0000000-0000-4000-8000-0000000000aa', jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid(), 'vetement_id', vetement, 'type', type, 'donnees', donnees, 'site_id', site))) -> 0;
$$;

insert into auth.users (id, email) values
  ('aaaaaaaa-1000-4000-8000-000000000001', 'test-porteurs-gestionnaire@exemple.invalid'),
  ('aaaaaaaa-1000-4000-8000-000000000002', 'test-porteurs-operateur@exemple.invalid'),
  ('aaaaaaaa-1000-4000-8000-000000000003', 'test-porteurs-pompier@exemple.invalid');
insert into public.organisations (id, nom) values ('a0000000-0000-4000-8000-0000000000aa', 'Test porteurs — Zone A');
insert into public.sites (id, organisation_id, nom, type) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000aa', 'Poste A', 'poste');
insert into public.membres (organisation_id, user_id, role) values
  ('a0000000-0000-4000-8000-0000000000aa', 'aaaaaaaa-1000-4000-8000-000000000001', 'gestionnaire'),
  ('a0000000-0000-4000-8000-0000000000aa', 'aaaaaaaa-1000-4000-8000-000000000002', 'operateur_laverie'),
  ('a0000000-0000-4000-8000-0000000000aa', 'aaaaaaaa-1000-4000-8000-000000000003', 'porteur');
insert into public.porteurs (id, organisation_id, matricule, nom, prenom, casier, site_id, user_id) values
  ('a5000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000aa', 'A-007', 'Durand', 'Paul', 'C7',
   'a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-1000-4000-8000-000000000003');
insert into public.articles (id, organisation_id, designation, notice_chemin) values
  ('a3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000aa', 'Veste A', 'n.pdf');
insert into public.articles_limites (organisation_id, article_id, traitement_id, limite)
select organisation_id, 'a3000000-0000-4000-8000-000000000001', id, 50 from public.traitements
where organisation_id = 'a0000000-0000-4000-8000-0000000000aa' and code = 'lavage';
update public.articles set actif = true where id = 'a3000000-0000-4000-8000-000000000001';

do $$
declare
  p uuid := 'a5000000-0000-4000-8000-000000000001';
  v1 uuid := 'a6000000-0000-4000-8000-000000000001'; -- nominatif
  v2 uuid := 'a6000000-0000-4000-8000-000000000002'; -- banalisé
  r jsonb;
  code text;
begin
  perform pg_temp.devenir('aaaaaaaa-1000-4000-8000-000000000001');
  for r in select * from jsonb_array_elements(jsonb_build_array(
    pg_temp.ev(v1, 'enrolement', jsonb_build_object('article_id', 'a3000000-0000-4000-8000-000000000001', 'nominatif', true), 'a1000000-0000-4000-8000-000000000001'),
    pg_temp.ev(v2, 'enrolement', jsonb_build_object('article_id', 'a3000000-0000-4000-8000-000000000001'), 'a1000000-0000-4000-8000-000000000001'),
    pg_temp.ev(v1, 'attribution', jsonb_build_object('porteur_id', p)),
    pg_temp.ev(v2, 'attribution', jsonb_build_object('porteur_id', p)))) loop
    perform pg_temp.verifier(r ->> 'statut' = 'accepte', 'préparation : ' || r::text);
  end loop;

  -- Restitution ordinaire : le nominatif reste lié à son porteur.
  perform pg_temp.verifier(pg_temp.ev(v1, 'restitution') ->> 'statut' = 'accepte', 'restitution du nominatif');
  perform pg_temp.verifier((select porteur_id = p and statut = 'en_stock' from public.vetements where id = v1), 'nominatif restitué : toujours lié');

  -- Anonymisation refusée tant que des vêtements sont liés.
  begin
    perform public.anonymiser_porteur('a0000000-0000-4000-8000-0000000000aa', p);
    raise exception 'ÉCHEC : anonymisation acceptée avec des vêtements liés';
  exception when check_violation then
    null;
  end;

  -- Départ : restitution libérée du nominatif, restitution du second.
  perform pg_temp.verifier(pg_temp.ev(v1, 'restitution', '{"liberer": true}') ->> 'statut' = 'accepte', 'nominatif déjà au stock : restitution libérée');
  perform pg_temp.verifier(pg_temp.ev(v1, 'restitution') ->> 'statut' = 'rejete', 'restitution ordinaire depuis le stock : refusée');
  perform pg_temp.verifier((select statut = 'en_service' from public.vetements where id = v2), 'V2 toujours en service');
  perform pg_temp.verifier(pg_temp.ev(v2, 'restitution') ->> 'statut' = 'accepte', 'restitution du banalisé');
  perform pg_temp.verifier((select bool_and(porteur_id is null) from public.vetements where id in (v1, v2)), 'plus aucun vêtement lié');
  reset role;

  -- L'opérateur laverie n'anonymise pas.
  perform pg_temp.devenir('aaaaaaaa-1000-4000-8000-000000000002');
  begin
    perform public.anonymiser_porteur('a0000000-0000-4000-8000-0000000000aa', p);
    raise exception 'ÉCHEC : anonymisation par un opérateur acceptée';
  exception when insufficient_privilege then
    null;
  end;
  reset role;

  perform pg_temp.devenir('aaaaaaaa-1000-4000-8000-000000000001');
  code := public.anonymiser_porteur('a0000000-0000-4000-8000-0000000000aa', p);
  -- Un nouvel attribut au porteur parti est refusé.
  r := pg_temp.ev(v2, 'attribution', jsonb_build_object('porteur_id', p));
  reset role;

  perform pg_temp.verifier(
    (select matricule = code and code like 'ANONYME-%' and nom is null and prenom is null and casier is null and user_id is null
            and not actif and anonymise_le is not null from public.porteurs where id = p),
    'porteur anonymisé : plus de nom, de casier ni de compte');
  perform pg_temp.verifier(r ->> 'statut' = 'rejete', 'attribution à un porteur parti refusée');
  perform pg_temp.verifier(
    (select count(*) = 1 from public.evenements where type = 'attribution' and donnees ->> 'porteur_id' = p::text and vetement_id = v1),
    'historique conservé : attributions de V1 toujours au journal');
  perform pg_temp.verifier(not exists (select 1 from public.evenements where donnees::text ilike '%Durand%'), 'aucun nom dans le journal');
  perform pg_temp.verifier((select bool_and(not prive.recalculer(id)) from public.vetements where id in (v1, v2)), 'rejeu : projection identique');
end;
$$;

rollback;

select 'Tous les tests des porteurs sont passés' as resultat;
