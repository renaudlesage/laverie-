-- synchro.sql — Tests de la synchronisation hors ligne (jalon M7).
--
-- À coller tel quel dans le SQL Editor de Supabase, après les migrations 0001 à 0010.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste en base.
-- Succès : la dernière ligne affiche « Tous les tests de la synchronisation sont passés ».

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

create function pg_temp.passages(vetement uuid) returns integer language sql as $$
  select coalesce(sum(passages), 0)::integer from public.compteurs where vetement_id = vetement;
$$;

-- ---------------------------------------------------------------------------
-- Jeu de données : zone D, un poste, une laverie interne, une laverie externe
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('dddddddd-1000-4000-8000-000000000001', 'test-synchro-gestionnaire@exemple.invalid'),
  ('dddddddd-1000-4000-8000-000000000002', 'test-synchro-operateur@exemple.invalid'),
  ('dddddddd-1000-4000-8000-000000000003', 'test-synchro-externe@exemple.invalid');

insert into public.organisations (id, nom) values ('d0000000-0000-4000-8000-000000000000', 'Test synchro — Zone D');

insert into public.sites (id, organisation_id, nom, type) values
  ('d1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000000', 'Poste D', 'poste'),
  ('d1000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000000', 'Laverie interne D', 'laverie_interne'),
  ('d1000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000000', 'Laverie externe D', 'laverie_externe');

insert into public.membres (organisation_id, user_id, role, site_id) values
  ('d0000000-0000-4000-8000-000000000000', 'dddddddd-1000-4000-8000-000000000001', 'gestionnaire', null),
  ('d0000000-0000-4000-8000-000000000000', 'dddddddd-1000-4000-8000-000000000002', 'operateur_laverie', null),
  ('d0000000-0000-4000-8000-000000000000', 'dddddddd-1000-4000-8000-000000000003', 'laverie_externe', 'd1000000-0000-4000-8000-000000000003');

insert into public.articles (id, organisation_id, designation, notice_chemin) values
  ('d3000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000000', 'Veste D', 'n.pdf');
insert into public.articles_limites (organisation_id, article_id, traitement_id, limite)
select organisation_id, 'd3000000-0000-4000-8000-000000000001', id, 50 from public.traitements
where organisation_id = 'd0000000-0000-4000-8000-000000000000';
update public.articles set actif = true where id = 'd3000000-0000-4000-8000-000000000001';

insert into public.sacs (id, organisation_id, nom, circuit) values
  ('d8000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000000', 'Sac D', 'standard');

-- Un vêtement enrôlé au poste, collecté, expédié et réceptionné à la laverie interne.
do $$
declare
  org uuid := 'd0000000-0000-4000-8000-000000000000';
  v uuid := 'd6000000-0000-4000-8000-000000000001';
  sac uuid := 'd4000000-0000-4000-8000-000000000001';
  r jsonb;
begin
  perform pg_temp.devenir('dddddddd-1000-4000-8000-000000000001');
  r := public.ingerer_evenements(org, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'vetement_id', v, 'type', 'enrolement',
    'site_id', 'd1000000-0000-4000-8000-000000000001', 'donnees', jsonb_build_object('article_id', 'd3000000-0000-4000-8000-000000000001'))));
  r := r || public.operer_lots(org, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'type', 'ouvrir_sac', 'lot_id', sac,
    'sac_id', 'd8000000-0000-4000-8000-000000000001')));
  r := r || public.ingerer_evenements(org, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'vetement_id', v, 'type', 'collecte', 'lot_id', sac)));
  r := r || public.operer_lots(org, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'type', 'expedier_sac', 'lot_id', sac,
    'site_destination_id', 'd1000000-0000-4000-8000-000000000002')));
  reset role;
  perform pg_temp.verifier((select bool_and(x ->> 'statut' = 'accepte') from jsonb_array_elements(r) x), 'préparation : ' || r::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. modifie_le suit chaque écriture (tirage incrémental)
-- ---------------------------------------------------------------------------

update public.vetements set modifie_le = '2000-01-01' where id = 'd6000000-0000-4000-8000-000000000001';
update public.lots set modifie_le = '2000-01-01' where id = 'd4000000-0000-4000-8000-000000000001';

do $$
declare
  r jsonb;
begin
  perform pg_temp.verifier(
    (select modifie_le = '2000-01-01' from public.vetements where id = 'd6000000-0000-4000-8000-000000000001'),
    'modifie_le reste réglable par le propriétaire (préparation du test)');
  perform pg_temp.devenir('dddddddd-1000-4000-8000-000000000002');
  r := public.ingerer_evenements('d0000000-0000-4000-8000-000000000000', jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid(), 'vetement_id', 'd6000000-0000-4000-8000-000000000001', 'type', 'reception',
    'site_id', 'd1000000-0000-4000-8000-000000000002')));
  r := r || public.operer_lots('d0000000-0000-4000-8000-000000000000', jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid(), 'type', 'receptionner_sac', 'lot_id', 'd4000000-0000-4000-8000-000000000001')));
  perform pg_temp.verifier((select bool_and(x ->> 'statut' = 'accepte') from jsonb_array_elements(r) x), 'réception : ' || r::text);
  perform pg_temp.verifier(
    (select count(*) = 1 from public.vetements where organisation_id = 'd0000000-0000-4000-8000-000000000000' and modifie_le >= now()),
    'le vêtement réceptionné apparaît dans le tirage incrémental');
  perform pg_temp.verifier(
    (select count(*) = 1 from public.lots where organisation_id = 'd0000000-0000-4000-8000-000000000000' and modifie_le >= now()),
    'le sac réceptionné apparaît dans le tirage incrémental');
  reset role;

  -- Le tirage de la laverie externe ne voit pas ce vêtement (RLS).
  perform pg_temp.devenir('dddddddd-1000-4000-8000-000000000003');
  perform pg_temp.verifier(
    (select count(*) = 0 from public.vetements where organisation_id = 'd0000000-0000-4000-8000-000000000000' and modifie_le >= '2000-01-01'),
    'laverie externe : aucun vêtement non confié dans son tirage');
  reset role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Deux appareils hors ligne mettent le même vêtement dans deux lots, puis se synchronisent
-- ---------------------------------------------------------------------------

do $$
declare
  org uuid := 'd0000000-0000-4000-8000-000000000000';
  v uuid := 'd6000000-0000-4000-8000-000000000001';
  lavage uuid := (select id from public.traitements where organisation_id = 'd0000000-0000-4000-8000-000000000000' and code = 'lavage');
  appareil_a jsonb;
  appareil_b jsonb;
  ops_a jsonb;
  evs_a jsonb;
  r jsonb;
begin
  -- File de l'appareil A : ouvrir le lot A, y mettre le vêtement, clôturer.
  ops_a := jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'type', 'ouvrir_lot', 'lot_id', 'd4000000-0000-4000-8000-00000000000a',
      'traitement_id', lavage, 'site_id', 'd1000000-0000-4000-8000-000000000002'));
  evs_a := jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'vetement_id', v, 'type', 'ajout_lot',
    'lot_id', 'd4000000-0000-4000-8000-00000000000a'));
  appareil_a := jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'type', 'cloturer_lot', 'lot_id', 'd4000000-0000-4000-8000-00000000000a'));

  perform pg_temp.devenir('dddddddd-1000-4000-8000-000000000002');
  r := public.operer_lots(org, ops_a) || public.ingerer_evenements(org, evs_a) || public.operer_lots(org, appareil_a);
  perform pg_temp.verifier((select bool_and(x ->> 'statut' = 'accepte') from jsonb_array_elements(r) x), 'appareil A accepté : ' || r::text);
  perform pg_temp.verifier(pg_temp.passages(v) = 1, 'appareil A : un passage');

  -- File de l'appareil B, constituée hors ligne avant de connaître celle de A.
  r := public.operer_lots(org, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'type', 'ouvrir_lot',
    'lot_id', 'd4000000-0000-4000-8000-00000000000b', 'traitement_id', lavage, 'site_id', 'd1000000-0000-4000-8000-000000000002')));
  perform pg_temp.verifier(r -> 0 ->> 'statut' = 'accepte', 'appareil B : ouverture du lot B');
  appareil_b := public.ingerer_evenements(org, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'vetement_id', v,
    'type', 'ajout_lot', 'lot_id', 'd4000000-0000-4000-8000-00000000000b')));
  perform pg_temp.verifier(appareil_b -> 0 ->> 'statut' = 'rejete', 'appareil B : ajout au lot B refusé (conflit détecté)');
  r := public.operer_lots(org, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'type', 'cloturer_lot',
    'lot_id', 'd4000000-0000-4000-8000-00000000000b')));
  perform pg_temp.verifier(r -> 0 ->> 'statut' = 'accepte', 'appareil B : clôture du lot B (vide)');
  perform pg_temp.verifier(pg_temp.passages(v) = 1, 'aucun double comptage');
  perform pg_temp.verifier(
    (select count(*) = 0 from public.evenements where lot_id = 'd4000000-0000-4000-8000-00000000000b' and type = 'traitement'),
    'le lot B ne compte aucun passage');

  -- Reprise après coupure : l'appareil A renvoie toute sa file.
  r := public.operer_lots(org, ops_a) || public.ingerer_evenements(org, evs_a) || public.operer_lots(org, appareil_a);
  perform pg_temp.verifier((select bool_and(x ->> 'statut' = 'doublon') from jsonb_array_elements(r) x), 'renvoi : tout en doublon : ' || r::text);
  perform pg_temp.verifier(pg_temp.passages(v) = 1, 'renvoi : toujours un seul passage');
  reset role;

  perform pg_temp.verifier(not prive.recalculer(v), 'rejeu du journal : projection identique');
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Mélange de circuits refusé sur l'appareil : l'alerte est créée à l'envoi, une seule fois
-- ---------------------------------------------------------------------------

do $$
declare
  org uuid := 'd0000000-0000-4000-8000-000000000000';
  signalement jsonb := jsonb_build_array(jsonb_build_object('id', 'd9000000-0000-4000-8000-000000000001',
    'vetement_id', 'd6000000-0000-4000-8000-000000000001', 'lot_id', 'd4000000-0000-4000-8000-00000000000b',
    'message', 'Mélange de circuits : vêtement contaminé dans un lot du circuit standard'));
  r jsonb;
begin
  perform pg_temp.devenir('dddddddd-1000-4000-8000-000000000002');
  r := public.signaler_melanges(org, signalement) || public.signaler_melanges(org, signalement);
  perform pg_temp.verifier((select bool_and(x ->> 'statut' = 'accepte') from jsonb_array_elements(r) x), 'signalement accepté : ' || r::text);
  reset role;
  perform pg_temp.verifier(
    (select count(*) = 1 from public.alertes where organisation_id = org and type = 'melange_circuits'), 'une seule alerte, même renvoyée');

  -- La laverie externe ne signale pas un vêtement qui ne lui est pas confié.
  perform pg_temp.devenir('dddddddd-1000-4000-8000-000000000003');
  r := public.signaler_melanges(org, jsonb_build_array(signalement -> 0 || jsonb_build_object('id', gen_random_uuid())));
  perform pg_temp.verifier(r -> 0 ->> 'statut' = 'rejete', 'laverie externe : vêtement non confié refusé');
  reset role;
end;
$$;

rollback;

select 'Tous les tests de la synchronisation sont passés' as resultat;
