-- laverie.sql — Tests de la laverie : sacs, lots, circuits, contrôle, livraison (jalon M6).
--
-- À coller tel quel dans le SQL Editor de Supabase, après les migrations 0001 à 0009.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste en base.
-- Succès : la dernière ligne affiche « Tous les tests de la laverie sont passés ».

begin;

-- ---------------------------------------------------------------------------
-- Outils
-- ---------------------------------------------------------------------------

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

-- Un événement de vêtement, envoyé par la file ; renvoie la réponse.
create function pg_temp.ev(vetement uuid, type text, donnees jsonb default '{}', site uuid default null, lot uuid default null) returns jsonb
language sql as $$
  select public.ingerer_evenements('c0000000-0000-4000-8000-000000000000', jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid(), 'vetement_id', vetement, 'type', type, 'survenu_le', clock_timestamp(),
    'donnees', donnees, 'site_id', site, 'lot_id', lot))) -> 0;
$$;

-- Une opération sur un lot ; renvoie la réponse.
create function pg_temp.op(operation jsonb) returns jsonb language sql as $$
  select public.operer_lots('c0000000-0000-4000-8000-000000000000', jsonb_build_array(operation || jsonb_build_object('id', gen_random_uuid()))) -> 0;
$$;

create function pg_temp.ok(r jsonb, description text) returns void language plpgsql as $$
begin
  if r ->> 'statut' <> 'accepte' then
    raise exception 'ÉCHEC : % — %', description, r::text;
  end if;
end;
$$;

create function pg_temp.statut(vetement uuid) returns text language sql as $$
  select statut::text from public.vetements where id = vetement;
$$;

create function pg_temp.passages(vetement uuid, code text) returns integer language sql as $$
  select coalesce((select c.passages from public.compteurs c join public.traitements t on t.id = c.traitement_id
                   where c.vetement_id = $1 and t.code = $2), 0);
$$;

create function pg_temp.traitement(code text) returns uuid language sql as $$
  select id from public.traitements where organisation_id = 'c0000000-0000-4000-8000-000000000000' and traitements.code = traitement.code;
$$;

-- ---------------------------------------------------------------------------
-- Jeu de données : zone C, un poste, une laverie interne, une laverie externe
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('cccccccc-1000-4000-8000-000000000001', 'test-laverie-admin@exemple.invalid'),
  ('cccccccc-1000-4000-8000-000000000002', 'test-laverie-gestionnaire@exemple.invalid'),
  ('cccccccc-1000-4000-8000-000000000003', 'test-laverie-operateur@exemple.invalid'),
  ('cccccccc-1000-4000-8000-000000000004', 'test-laverie-externe@exemple.invalid');

insert into public.organisations (id, nom) values ('c0000000-0000-4000-8000-000000000000', 'Test laverie — Zone C');

insert into public.sites (id, organisation_id, nom, type) values
  ('c1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000000', 'Poste C', 'poste'),
  ('c1000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000000', 'Laverie interne C', 'laverie_interne'),
  ('c1000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000000', 'Laverie externe C', 'laverie_externe');

insert into public.membres (organisation_id, user_id, role, site_id) values
  ('c0000000-0000-4000-8000-000000000000', 'cccccccc-1000-4000-8000-000000000001', 'admin', null),
  ('c0000000-0000-4000-8000-000000000000', 'cccccccc-1000-4000-8000-000000000002', 'gestionnaire', null),
  ('c0000000-0000-4000-8000-000000000000', 'cccccccc-1000-4000-8000-000000000003', 'operateur_laverie', null),
  ('c0000000-0000-4000-8000-000000000000', 'cccccccc-1000-4000-8000-000000000004', 'laverie_externe', 'c1000000-0000-4000-8000-000000000003');

insert into public.articles (id, organisation_id, designation, notice_chemin) values
  ('c3000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000000', 'Veste C', 'n.pdf');
insert into public.articles_limites (organisation_id, article_id, traitement_id, limite)
select organisation_id, 'c3000000-0000-4000-8000-000000000001', id, 50 from public.traitements
where organisation_id = 'c0000000-0000-4000-8000-000000000000';
update public.articles set actif = true where id = 'c3000000-0000-4000-8000-000000000001';

insert into public.sacs (id, organisation_id, nom, circuit, technologie, code) values
  ('c8000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000000', 'Sac standard 1', 'standard', 'qr', 'SACSTD0001'),
  ('c8000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000000', 'Sac contaminé 1', 'contamine', 'qr', 'SACCON0001'),
  ('c8000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000000', 'Sac standard 2', 'standard', null, null);

-- Six vêtements enrôlés au poste par la file (gestionnaire).
do $$
declare
  i integer;
  r jsonb;
begin
  perform pg_temp.devenir('cccccccc-1000-4000-8000-000000000002');
  for i in 1..6 loop
    r := public.ingerer_evenements('c0000000-0000-4000-8000-000000000000', jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'vetement_id', ('c6000000-0000-4000-8000-00000000000' || i)::uuid, 'type', 'enrolement',
      'survenu_le', now(), 'site_id', 'c1000000-0000-4000-8000-000000000001',
      'donnees', jsonb_build_object('article_id', 'c3000000-0000-4000-8000-000000000001',
        'identifiants', jsonb_build_array(jsonb_build_object('evenement_id', gen_random_uuid(), 'technologie', 'qr', 'valeur', 'VETC00000' || i))))));
    perform pg_temp.ok(r -> 0, 'enrôlement du vêtement ' || i);
  end loop;
  reset role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Cycle complet standard : +1 exactement sur le compteur du traitement du lot
-- ---------------------------------------------------------------------------

do $$
declare
  v uuid := 'c6000000-0000-4000-8000-000000000001';
  r jsonb;
begin
  perform pg_temp.devenir('cccccccc-1000-4000-8000-000000000002');
  perform pg_temp.ok(pg_temp.op(jsonb_build_object('type', 'ouvrir_sac', 'lot_id', 'c4000000-0000-4000-8000-000000000001',
    'sac_id', 'c8000000-0000-4000-8000-000000000001', 'site_id', 'c1000000-0000-4000-8000-000000000001')), 'ouverture du sac standard');
  r := pg_temp.op(jsonb_build_object('type', 'ouvrir_sac', 'lot_id', 'c4000000-0000-4000-8000-000000000099', 'sac_id', 'c8000000-0000-4000-8000-000000000001'));
  perform pg_temp.verifier(r ->> 'statut' = 'rejete', 'un sac n''a qu''une tournée en cours');
  perform pg_temp.ok(pg_temp.ev(v, 'collecte', '{}', null, 'c4000000-0000-4000-8000-000000000001'), 'collecte');
  perform pg_temp.ok(pg_temp.op(jsonb_build_object('type', 'expedier_sac', 'lot_id', 'c4000000-0000-4000-8000-000000000001',
    'site_destination_id', 'c1000000-0000-4000-8000-000000000002')), 'expédition vers la laverie interne');
  perform pg_temp.verifier((select quantite_attendue = 1 and statut = 'expedie' from public.lots where id = 'c4000000-0000-4000-8000-000000000001'),
    'sac expédié : 1 vêtement attendu');
  reset role;

  perform pg_temp.devenir('cccccccc-1000-4000-8000-000000000003');
  perform pg_temp.ok(pg_temp.ev(v, 'reception', '{}', 'c1000000-0000-4000-8000-000000000002'), 'réception');
  perform pg_temp.ok(pg_temp.op(jsonb_build_object('type', 'receptionner_sac', 'lot_id', 'c4000000-0000-4000-8000-000000000001')), 'sac réceptionné');
  perform pg_temp.ok(pg_temp.op(jsonb_build_object('type', 'ouvrir_lot', 'lot_id', 'c4000000-0000-4000-8000-000000000010',
    'traitement_id', pg_temp.traitement('lavage'), 'circuit', 'standard', 'site_id', 'c1000000-0000-4000-8000-000000000002',
    'programme', '60 °C', 'machine', 'M1')), 'ouverture du lot de lavage');
  perform pg_temp.ok(pg_temp.ev(v, 'ajout_lot', '{}', null, 'c4000000-0000-4000-8000-000000000010'), 'ajout au lot');
  perform pg_temp.verifier(pg_temp.passages(v, 'lavage') = 0, 'aucun passage compté avant la clôture');
  perform pg_temp.ok(pg_temp.op(jsonb_build_object('type', 'cloturer_lot', 'lot_id', 'c4000000-0000-4000-8000-000000000010')), 'clôture du lot');
  r := pg_temp.op(jsonb_build_object('type', 'cloturer_lot', 'lot_id', 'c4000000-0000-4000-8000-000000000010'));
  perform pg_temp.verifier(r ->> 'statut' = 'doublon', 'seconde clôture : doublon');
  perform pg_temp.verifier(pg_temp.statut(v) = 'traite' and pg_temp.passages(v, 'lavage') = 1 and pg_temp.passages(v, 'sechage') = 0
    and (select passages_depuis_pose = 1 from public.identifiants where vetement_id = v and actif),
    'clôture : traité, lavage +1 exactement, séchage inchangé, tag +1');
  perform pg_temp.ok(pg_temp.ev(v, 'controle', '{"verdict": "conforme"}'), 'contrôle conforme');
  perform pg_temp.ok(pg_temp.ev(v, 'livraison', '{}', 'c1000000-0000-4000-8000-000000000001'), 'livraison au poste');
  perform pg_temp.verifier(pg_temp.statut(v) = 'en_stock' and pg_temp.passages(v, 'lavage') = 1
    and (select site_id = 'c1000000-0000-4000-8000-000000000001' from public.vetements where id = v),
    'cycle complet : en stock au poste, exactement 1 lavage');
  reset role;
  perform pg_temp.verifier(prive.recalculer(v) = false and pg_temp.passages(v, 'lavage') = 1, 'rejeu du cycle complet : identique');
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Circuits séparés
-- ---------------------------------------------------------------------------

do $$
declare
  v_contamine uuid := 'c6000000-0000-4000-8000-000000000002';
  v_standard uuid := 'c6000000-0000-4000-8000-000000000003';
  r jsonb;
begin
  perform pg_temp.devenir('cccccccc-1000-4000-8000-000000000002');
  perform pg_temp.ok(pg_temp.ev(v_contamine, 'contamination'), 'déclaration de contamination');
  perform pg_temp.ok(pg_temp.op(jsonb_build_object('type', 'ouvrir_sac', 'lot_id', 'c4000000-0000-4000-8000-000000000002',
    'sac_id', 'c8000000-0000-4000-8000-000000000003')), 'ouverture d''un second sac standard');
  perform pg_temp.ok(pg_temp.op(jsonb_build_object('type', 'ouvrir_sac', 'lot_id', 'c4000000-0000-4000-8000-000000000003',
    'sac_id', 'c8000000-0000-4000-8000-000000000002')), 'ouverture du sac contaminé');

  r := pg_temp.ev(v_contamine, 'collecte', '{}', null, 'c4000000-0000-4000-8000-000000000002');
  perform pg_temp.verifier(r ->> 'statut' = 'rejete' and r ->> 'code' = 'LC001', 'contaminé dans un sac standard : refusé');
  perform pg_temp.verifier(exists (select 1 from public.alertes where vetement_id = v_contamine and type = 'melange_circuits'),
    'mélange refusé : alerte melange_circuits créée');
  r := pg_temp.ev(v_standard, 'collecte', '{}', null, 'c4000000-0000-4000-8000-000000000003');
  perform pg_temp.verifier(r ->> 'statut' = 'rejete' and r ->> 'code' = 'LC001', 'standard dans un sac contaminé : refusé');

  perform pg_temp.ok(pg_temp.ev(v_contamine, 'collecte', '{}', null, 'c4000000-0000-4000-8000-000000000003'), 'contaminé dans le sac contaminé');
  perform pg_temp.ok(pg_temp.ev(v_standard, 'collecte', '{}', null, 'c4000000-0000-4000-8000-000000000002'), 'standard dans le sac standard');
  perform pg_temp.ok(pg_temp.op(jsonb_build_object('type', 'expedier_sac', 'lot_id', 'c4000000-0000-4000-8000-000000000002',
    'site_destination_id', 'c1000000-0000-4000-8000-000000000002')), 'expédition sac standard');
  perform pg_temp.ok(pg_temp.op(jsonb_build_object('type', 'expedier_sac', 'lot_id', 'c4000000-0000-4000-8000-000000000003',
    'site_destination_id', 'c1000000-0000-4000-8000-000000000002')), 'expédition sac contaminé');
  reset role;

  perform pg_temp.devenir('cccccccc-1000-4000-8000-000000000003');
  perform pg_temp.ok(pg_temp.ev(v_contamine, 'reception', '{}', 'c1000000-0000-4000-8000-000000000002'), 'réception du contaminé');
  perform pg_temp.ok(pg_temp.ev(v_standard, 'reception', '{}', 'c1000000-0000-4000-8000-000000000002'), 'réception du standard');

  r := pg_temp.op(jsonb_build_object('type', 'ouvrir_lot', 'lot_id', 'c4000000-0000-4000-8000-000000000020',
    'traitement_id', pg_temp.traitement('nettoyage_sec'), 'circuit', 'contamine', 'site_id', 'c1000000-0000-4000-8000-000000000002'));
  perform pg_temp.verifier(r ->> 'statut' = 'rejete', 'lot contaminé avec un traitement du seul circuit standard : refusé');
  perform pg_temp.ok(pg_temp.op(jsonb_build_object('type', 'ouvrir_lot', 'lot_id', 'c4000000-0000-4000-8000-000000000021',
    'traitement_id', pg_temp.traitement('decontamination'), 'circuit', 'contamine', 'site_id', 'c1000000-0000-4000-8000-000000000002')),
    'lot de décontamination');
  perform pg_temp.ok(pg_temp.op(jsonb_build_object('type', 'ouvrir_lot', 'lot_id', 'c4000000-0000-4000-8000-000000000022',
    'traitement_id', pg_temp.traitement('lavage'), 'circuit', 'standard', 'site_id', 'c1000000-0000-4000-8000-000000000002')),
    'lot de lavage standard');

  r := pg_temp.ev(v_contamine, 'ajout_lot', '{}', null, 'c4000000-0000-4000-8000-000000000022');
  perform pg_temp.verifier(r ->> 'statut' = 'rejete' and r ->> 'code' = 'LC001', 'contaminé dans un lot standard : refusé');
  r := pg_temp.ev(v_standard, 'ajout_lot', '{}', null, 'c4000000-0000-4000-8000-000000000021');
  perform pg_temp.verifier(r ->> 'statut' = 'rejete' and r ->> 'code' = 'LC001', 'standard dans un lot contaminé : refusé');

  perform pg_temp.ok(pg_temp.ev(v_contamine, 'ajout_lot', '{}', null, 'c4000000-0000-4000-8000-000000000021'), 'contaminé dans le lot contaminé');
  perform pg_temp.ok(pg_temp.op(jsonb_build_object('type', 'cloturer_lot', 'lot_id', 'c4000000-0000-4000-8000-000000000021')), 'clôture décontamination');
  perform pg_temp.verifier(pg_temp.passages(v_contamine, 'decontamination') = 1 and pg_temp.passages(v_contamine, 'lavage') = 0,
    'le passage est compté sur le traitement réellement appliqué (décontamination)');

  r := pg_temp.ev(v_contamine, 'controle', '{"verdict": "conforme"}');
  perform pg_temp.verifier(r ->> 'statut' = 'rejete' and r ->> 'motif' like 'Contrôle renforcé obligatoire%',
    'contaminé : conforme refusé sans contrôle renforcé');
  perform pg_temp.ok(pg_temp.ev(v_contamine, 'controle', '{"verdict": "conforme", "renforce": true}'), 'contrôle renforcé conforme');
  perform pg_temp.verifier((select statut = 'pret' and not contamine and controle_renforce from public.vetements where id = v_contamine),
    'après un lot contaminé et un contrôle renforcé : prêt, drapeau contaminé levé');
  reset role;
  perform pg_temp.verifier(prive.recalculer(v_contamine) = false, 'rejeu du circuit contaminé : identique');
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Lot avorté : aucun passage compté
-- ---------------------------------------------------------------------------

do $$
declare
  v uuid := 'c6000000-0000-4000-8000-000000000003';
begin
  perform pg_temp.devenir('cccccccc-1000-4000-8000-000000000003');
  perform pg_temp.ok(pg_temp.ev(v, 'ajout_lot', '{}', null, 'c4000000-0000-4000-8000-000000000022'), 'ajout au lot de lavage');
  perform pg_temp.ok(pg_temp.op(jsonb_build_object('type', 'avorter_lot', 'lot_id', 'c4000000-0000-4000-8000-000000000022', 'motif', 'Panne machine')),
    'lot avorté');
  perform pg_temp.verifier(pg_temp.statut(v) = 'en_laverie' and pg_temp.passages(v, 'lavage') = 0
    and (select statut = 'avorte' from public.lots where id = 'c4000000-0000-4000-8000-000000000022'),
    'lot avorté : vêtement revenu en laverie, aucun passage');
  reset role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Réception : manquants signalés ; contrôle à réparer et réparation
-- ---------------------------------------------------------------------------

do $$
declare
  r jsonb;
begin
  perform pg_temp.devenir('cccccccc-1000-4000-8000-000000000002');
  perform pg_temp.ok(pg_temp.op(jsonb_build_object('type', 'ouvrir_sac', 'lot_id', 'c4000000-0000-4000-8000-000000000004',
    'sac_id', 'c8000000-0000-4000-8000-000000000001')), 'nouvelle tournée du sac standard 1 (le précédent est réceptionné)');
  perform pg_temp.ok(pg_temp.ev('c6000000-0000-4000-8000-000000000004', 'collecte', '{}', null, 'c4000000-0000-4000-8000-000000000004'), 'collecte V4');
  perform pg_temp.ok(pg_temp.ev('c6000000-0000-4000-8000-000000000005', 'collecte', '{}', null, 'c4000000-0000-4000-8000-000000000004'), 'collecte V5');
  perform pg_temp.ok(pg_temp.op(jsonb_build_object('type', 'expedier_sac', 'lot_id', 'c4000000-0000-4000-8000-000000000004',
    'site_destination_id', 'c1000000-0000-4000-8000-000000000003')), 'expédition vers la laverie externe');
  reset role;

  -- La laverie externe ne réceptionne que sur son site, et n'ouvre pas de lot ailleurs.
  perform pg_temp.devenir('cccccccc-1000-4000-8000-000000000004');
  r := pg_temp.ev('c6000000-0000-4000-8000-000000000004', 'reception', '{}', 'c1000000-0000-4000-8000-000000000002');
  perform pg_temp.verifier(r ->> 'statut' = 'rejete', 'laverie externe : réception sur un autre site refusée');
  r := pg_temp.op(jsonb_build_object('type', 'ouvrir_lot', 'lot_id', 'c4000000-0000-4000-8000-000000000030',
    'traitement_id', pg_temp.traitement('lavage'), 'site_id', 'c1000000-0000-4000-8000-000000000002'));
  perform pg_temp.verifier(r ->> 'statut' = 'rejete', 'laverie externe : lot sur un autre site refusé');
  perform pg_temp.ok(pg_temp.ev('c6000000-0000-4000-8000-000000000004', 'reception', '{}', 'c1000000-0000-4000-8000-000000000003'),
    'laverie externe : réception de V4 sur son site');
  perform pg_temp.ok(pg_temp.op(jsonb_build_object('type', 'receptionner_sac', 'lot_id', 'c4000000-0000-4000-8000-000000000004', 'inconnus', 1)),
    'sac réceptionné avec un manquant');
  perform pg_temp.verifier(
    (select count(*) from public.alertes where type = 'ecart_reception' and vetement_id = 'c6000000-0000-4000-8000-000000000005') = 1
    and (select count(*) from public.alertes where type = 'ecart_reception' and lot_id = 'c4000000-0000-4000-8000-000000000004' and vetement_id is null) = 1
    and pg_temp.statut('c6000000-0000-4000-8000-000000000005') = 'collecte',
    'écart : V5 non lu signalé (reste collecté), code inconnu signalé sur le sac');

  -- Contrôle à réparer (motif obligatoire), puis réparation et retour au contrôle.
  perform pg_temp.ok(pg_temp.op(jsonb_build_object('type', 'ouvrir_lot', 'lot_id', 'c4000000-0000-4000-8000-000000000031',
    'traitement_id', pg_temp.traitement('lavage'), 'site_id', 'c1000000-0000-4000-8000-000000000003')), 'lot à la laverie externe');
  perform pg_temp.ok(pg_temp.ev('c6000000-0000-4000-8000-000000000004', 'ajout_lot', '{}', null, 'c4000000-0000-4000-8000-000000000031'), 'ajout');
  perform pg_temp.ok(pg_temp.op(jsonb_build_object('type', 'cloturer_lot', 'lot_id', 'c4000000-0000-4000-8000-000000000031')), 'clôture');
  r := pg_temp.ev('c6000000-0000-4000-8000-000000000004', 'controle', '{"verdict": "a_reparer"}');
  perform pg_temp.verifier(r ->> 'statut' = 'rejete', 'à réparer sans motif : refusé');
  perform pg_temp.ok(pg_temp.ev('c6000000-0000-4000-8000-000000000004', 'controle', '{"verdict": "a_reparer", "motif": "Couture"}'), 'à réparer');
  perform pg_temp.ok(pg_temp.ev('c6000000-0000-4000-8000-000000000004', 'reparation'), 'réparation');
  perform pg_temp.verifier(pg_temp.statut('c6000000-0000-4000-8000-000000000004') = 'traite', 'après réparation : retour au contrôle');
  perform pg_temp.ok(pg_temp.ev('c6000000-0000-4000-8000-000000000004', 'controle', '{"verdict": "reforme", "motif": "Irréparable"}'), 'à réformer');
  perform pg_temp.verifier(pg_temp.statut('c6000000-0000-4000-8000-000000000004') = 'reforme'
    and not exists (select 1 from public.identifiants where vetement_id = 'c6000000-0000-4000-8000-000000000004' and actif),
    'réformé au contrôle : identifiants désactivés');
  reset role;
  perform pg_temp.verifier(prive.recalculer('c6000000-0000-4000-8000-000000000004') = false, 'rejeu : identique après réforme au contrôle');
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Un code ne désigne qu'un objet ; droits
-- ---------------------------------------------------------------------------

do $$
declare
  r jsonb;
begin
  begin
    insert into public.sacs (organisation_id, nom, technologie, code) values ('c0000000-0000-4000-8000-000000000000', 'Sac doublon', 'qr', 'VETC000006');
    raise exception 'ÉCHEC : un sac a reçu le code d''un vêtement';
  exception when unique_violation then null;
  end;
  perform pg_temp.devenir('cccccccc-1000-4000-8000-000000000002');
  r := public.ingerer_evenements('c0000000-0000-4000-8000-000000000000', jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid(), 'vetement_id', 'c6000000-0000-4000-8000-000000000006', 'type', 'tag_pose',
    'donnees', jsonb_build_object('technologie', 'qr', 'valeur', 'SACSTD0001')))) -> 0;
  perform pg_temp.verifier(r ->> 'statut' = 'rejete', 'un vêtement ne reçoit pas le code d''un sac');
  -- Le gestionnaire ne fait pas les gestes de laverie.
  r := pg_temp.op(jsonb_build_object('type', 'ouvrir_lot', 'lot_id', gen_random_uuid(), 'traitement_id', pg_temp.traitement('lavage'),
    'site_id', 'c1000000-0000-4000-8000-000000000002'));
  perform pg_temp.verifier(r ->> 'statut' = 'rejete' and r ->> 'code' = '42501', 'gestionnaire : pas d''ouverture de lot de traitement');
  reset role;

  -- Tous les vêtements de la zone : la projection maintenue est celle du journal.
  perform pg_temp.verifier(
    (select bool_and(not prive.recalculer(v.id)) from public.vetements v where v.organisation_id = 'c0000000-0000-4000-8000-000000000000'),
    'rejeu de toute la zone : aucune correction');
end;
$$;

rollback;

select 'Tous les tests de la laverie sont passés' as resultat;
