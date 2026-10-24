-- journal.sql — Tests du journal, des projections et du recalcul (jalon M5).
--
-- À coller tel quel dans le SQL Editor de Supabase, après les migrations 0001 à 0009.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste en base.
-- Succès : la dernière ligne affiche « Tous les tests du journal sont passés ».
-- Échec : l'exécution s'arrête sur une erreur « ÉCHEC : … » qui décrit le test.

begin;

-- ---------------------------------------------------------------------------
-- Outils de test
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

-- Envoie des événements comme le ferait la file de l'app.
create function pg_temp.ingerer(evenements jsonb) returns jsonb language sql as $$
  select public.ingerer_evenements('e0000000-0000-4000-8000-000000000000', evenements);
$$;

-- Un événement : statut de la réponse ('accepte', 'doublon', 'rejete').
create function pg_temp.un(ev jsonb) returns jsonb language sql as $$
  select pg_temp.ingerer(jsonb_build_array(ev)) -> 0;
$$;

create function pg_temp.evt(id text, vetement text, type text, donnees jsonb default '{}', site text default null) returns jsonb
language sql as $$
  select jsonb_build_object('id', id, 'vetement_id', vetement, 'type', type, 'survenu_le', now(), 'donnees', donnees, 'site_id', site);
$$;

-- Projection complète d'un vêtement (statut, compteurs, identifiants) sous forme de texte comparable.
create function pg_temp.instantane(vetement uuid) returns text language sql as $$
  select (select row(v.statut, v.contamine, v.site_id, v.porteur_id, v.lot_id, v.derniere_lecture_le, v.controle_renforce)::text
          from public.vetements v where v.id = vetement)
    || coalesce((select string_agg(c.traitement_id || ':' || c.passages, ',' order by c.traitement_id) from public.compteurs c where c.vetement_id = vetement and c.passages > 0), '')
    || coalesce((select string_agg(i.id || ':' || i.actif || ':' || i.passages_depuis_pose || ':' || coalesce(i.retire_le::text, '') || ':' || coalesce(i.motif_retrait, ''), ',' order by i.id) from public.identifiants i where i.vetement_id = vetement), '');
$$;

-- ---------------------------------------------------------------------------
-- Jeu de données
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'test-journal-admin@exemple.invalid'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'test-journal-gestionnaire@exemple.invalid'),
  ('eeeeeeee-0000-4000-8000-000000000003', 'test-journal-operateur@exemple.invalid'),
  ('eeeeeeee-0000-4000-8000-000000000004', 'test-journal-externe@exemple.invalid'),
  ('eeeeeeee-0000-4000-8000-000000000005', 'test-journal-auditeur@exemple.invalid'),
  ('ffffffff-0000-4000-8000-000000000001', 'test-journal-admin-autre@exemple.invalid');

insert into public.organisations (id, nom) values
  ('e0000000-0000-4000-8000-000000000000', 'Test journal — Zone E'),
  ('f0000000-0000-4000-8000-000000000000', 'Test journal — Zone F');

insert into public.sites (id, organisation_id, nom, type) values
  ('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000000', 'Poste E', 'poste'),
  ('e1000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000000', 'Magasin E', 'magasin'),
  ('e1000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000000', 'Laverie externe E', 'laverie_externe'),
  ('e1000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000000', 'Laverie interne E', 'laverie_interne');

insert into public.membres (organisation_id, user_id, role, site_id) values
  ('e0000000-0000-4000-8000-000000000000', 'eeeeeeee-0000-4000-8000-000000000001', 'admin', null),
  ('e0000000-0000-4000-8000-000000000000', 'eeeeeeee-0000-4000-8000-000000000002', 'gestionnaire', null),
  ('e0000000-0000-4000-8000-000000000000', 'eeeeeeee-0000-4000-8000-000000000003', 'operateur_laverie', null),
  ('e0000000-0000-4000-8000-000000000000', 'eeeeeeee-0000-4000-8000-000000000004', 'laverie_externe', 'e1000000-0000-4000-8000-000000000003'),
  ('e0000000-0000-4000-8000-000000000000', 'eeeeeeee-0000-4000-8000-000000000005', 'auditeur', null),
  ('f0000000-0000-4000-8000-000000000000', 'ffffffff-0000-4000-8000-000000000001', 'admin', null);

insert into public.porteurs (id, organisation_id, matricule, nom, site_id) values
  ('e2000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000000', 'E1', 'Dubois', 'e1000000-0000-4000-8000-000000000001');

insert into public.articles (id, organisation_id, designation, notice_chemin) values
  ('e3000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000000', 'Veste test', 'n.pdf');
insert into public.articles_limites (organisation_id, article_id, traitement_id, limite)
select organisation_id, 'e3000000-0000-4000-8000-000000000001', id, 2 from public.traitements
where organisation_id = 'e0000000-0000-4000-8000-000000000000' and code = 'lavage';
update public.articles set actif = true where id = 'e3000000-0000-4000-8000-000000000001';

insert into public.lots (id, organisation_id, type, site_id, traitement_id) values
  ('e4000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000000', 'traitement', 'e1000000-0000-4000-8000-000000000004',
   (select id from public.traitements where organisation_id = 'e0000000-0000-4000-8000-000000000000' and code = 'lavage')),
  ('e4000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000000', 'traitement', 'e1000000-0000-4000-8000-000000000004',
   (select id from public.traitements where organisation_id = 'e0000000-0000-4000-8000-000000000000' and code = 'lavage'));

-- Enrôlements par la file d'événements (gestionnaire) : V1 nominatif avec deux tags, V2, V3.
do $$
declare
  r jsonb;
begin
  perform pg_temp.devenir('eeeeeeee-0000-4000-8000-000000000002');
  r := pg_temp.ingerer(jsonb_build_array(
    jsonb_build_object('id', 'e5000000-0000-4000-8000-000000000001', 'vetement_id', 'e6000000-0000-4000-8000-000000000001',
      'type', 'enrolement', 'survenu_le', now(), 'site_id', 'e1000000-0000-4000-8000-000000000001',
      'donnees', jsonb_build_object('article_id', 'e3000000-0000-4000-8000-000000000001', 'taille', 'L', 'nominatif', true,
        'identifiants', jsonb_build_array(
          jsonb_build_object('evenement_id', 'e5000000-0000-4000-8000-000000000002', 'technologie', 'qr', 'valeur', 'EEEEEEEE01'),
          jsonb_build_object('evenement_id', 'e5000000-0000-4000-8000-000000000003', 'technologie', 'nfc', 'valeur', '04EE01')))),
    jsonb_build_object('id', 'e5000000-0000-4000-8000-000000000004', 'vetement_id', 'e6000000-0000-4000-8000-000000000002',
      'type', 'enrolement', 'survenu_le', now(), 'site_id', 'e1000000-0000-4000-8000-000000000001',
      'donnees', jsonb_build_object('article_id', 'e3000000-0000-4000-8000-000000000001')),
    jsonb_build_object('id', 'e5000000-0000-4000-8000-000000000005', 'vetement_id', 'e6000000-0000-4000-8000-000000000003',
      'type', 'enrolement', 'survenu_le', now(), 'site_id', 'e1000000-0000-4000-8000-000000000003',
      'donnees', jsonb_build_object('article_id', 'e3000000-0000-4000-8000-000000000001'))));
  perform pg_temp.verifier((select bool_and(x ->> 'statut' = 'accepte') from jsonb_array_elements(r) x),
    'enrôlements par la file acceptés : ' || r::text);
  reset role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Transitions et refus
-- ---------------------------------------------------------------------------

do $$
declare
  r jsonb;
begin
  perform pg_temp.devenir('eeeeeeee-0000-4000-8000-000000000002');

  r := pg_temp.un(pg_temp.evt('e7000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 'restitution'));
  perform pg_temp.verifier(r ->> 'statut' = 'rejete' and r ->> 'code' = '23514' and r ->> 'motif' like 'Transition impossible%',
    'restitution d''un vêtement en stock : rejetée avec motif — ' || r::text);

  r := pg_temp.un(pg_temp.evt('e7000000-0000-4000-8000-000000000002', 'e6000000-0000-4000-8000-000000000001', 'attribution',
    '{"porteur_id": "e2000000-0000-4000-8000-000000000099"}'));
  perform pg_temp.verifier(r ->> 'statut' = 'rejete', 'attribution à un porteur inconnu : rejetée');

  r := pg_temp.un(pg_temp.evt('e7000000-0000-4000-8000-000000000003', 'e6000000-0000-4000-8000-000000000001', 'attribution',
    '{"porteur_id": "e2000000-0000-4000-8000-000000000001"}'));
  perform pg_temp.verifier(r ->> 'statut' = 'accepte'
    and (select statut = 'en_service' and porteur_id = 'e2000000-0000-4000-8000-000000000001' from public.vetements where id = 'e6000000-0000-4000-8000-000000000001'),
    'attribution : en service, porteur renseigné');

  -- Vêtement nominatif : la restitution garde le porteur attitré.
  r := pg_temp.un(pg_temp.evt('e7000000-0000-4000-8000-000000000004', 'e6000000-0000-4000-8000-000000000001', 'restitution', '{}',
    'e1000000-0000-4000-8000-000000000002'));
  perform pg_temp.verifier(r ->> 'statut' = 'accepte'
    and (select statut = 'en_stock' and porteur_id is not null and site_id = 'e1000000-0000-4000-8000-000000000002' from public.vetements where id = 'e6000000-0000-4000-8000-000000000001'),
    'restitution d''un nominatif : en stock au magasin, porteur conservé');

  r := pg_temp.un(pg_temp.evt('e7000000-0000-4000-8000-000000000005', 'e6000000-0000-4000-8000-000000000002', 'contamination'));
  perform pg_temp.verifier(r ->> 'statut' = 'accepte'
    and (select statut = 'a_decontaminer' and contamine from public.vetements where id = 'e6000000-0000-4000-8000-000000000002'),
    'contamination au poste : à décontaminer, drapeau contaminé');

  r := pg_temp.un(pg_temp.evt('e7000000-0000-4000-8000-000000000006', 'e6000000-0000-4000-8000-000000000002', 'perte'));
  r := pg_temp.un(pg_temp.evt('e7000000-0000-4000-8000-000000000007', 'e6000000-0000-4000-8000-000000000002', 'retrouve', '{}',
    'e1000000-0000-4000-8000-000000000001'));
  perform pg_temp.verifier(r ->> 'statut' = 'accepte'
    and (select statut = 'en_stock' and contamine from public.vetements where id = 'e6000000-0000-4000-8000-000000000002'),
    'perte puis retrouvé : en stock, toujours contaminé (seul un contrôle le lève)');

  r := pg_temp.un(pg_temp.evt('e7000000-0000-4000-8000-000000000008', 'e6000000-0000-4000-8000-000000000002', 'reforme', '{"motif": " "}'));
  perform pg_temp.verifier(r ->> 'statut' = 'rejete' and r ->> 'motif' like 'Motif de réforme%', 'réforme sans motif : rejetée');
  r := pg_temp.un(pg_temp.evt('e7000000-0000-4000-8000-000000000009', 'e6000000-0000-4000-8000-000000000001', 'reforme', '{"motif": "Déchirure"}'));
  perform pg_temp.verifier(r ->> 'statut' = 'accepte'
    and (select statut = 'reforme' and porteur_id is null from public.vetements where id = 'e6000000-0000-4000-8000-000000000001')
    and not exists (select 1 from public.identifiants where vetement_id = 'e6000000-0000-4000-8000-000000000001' and actif)
    and (select bool_and(motif_retrait = 'Réforme') from public.identifiants where vetement_id = 'e6000000-0000-4000-8000-000000000001'),
    'réforme : statut réformé, identifiants désactivés');
  r := pg_temp.un(pg_temp.evt('e7000000-0000-4000-8000-000000000010', 'e6000000-0000-4000-8000-000000000001', 'perte'));
  perform pg_temp.verifier(r ->> 'statut' = 'rejete', 'aucun événement de statut après la réforme');
  r := pg_temp.un(jsonb_build_object('id', 'e7000000-0000-4000-8000-000000000011', 'vetement_id', 'e6000000-0000-4000-8000-000000000001',
    'type', 'tag_pose', 'donnees', jsonb_build_object('technologie', 'qr', 'valeur', 'EEEEEEEE09')));
  perform pg_temp.verifier(r ->> 'statut' = 'rejete', 'aucun tag posé sur un vêtement réformé');

  -- Un passage ne s'émet jamais depuis l'app : seule la clôture d'un lot le produit.
  r := pg_temp.un(jsonb_build_object('id', 'e7000000-0000-4000-8000-000000000012', 'vetement_id', 'e6000000-0000-4000-8000-000000000002',
    'type', 'traitement', 'lot_id', 'e4000000-0000-4000-8000-000000000001'));
  perform pg_temp.verifier(r ->> 'statut' = 'rejete' and r ->> 'code' = '42501', 'traitement : jamais émis directement par l''app');
  reset role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Idempotence : rejouer deux fois le même lot d'événements ne change rien
-- ---------------------------------------------------------------------------

do $$
declare
  lot jsonb := jsonb_build_array(
    pg_temp.evt('e8000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000002', 'attribution', '{"porteur_id": "e2000000-0000-4000-8000-000000000001"}'),
    pg_temp.evt('e8000000-0000-4000-8000-000000000002', 'e6000000-0000-4000-8000-000000000002', 'restitution'),
    pg_temp.evt('e8000000-0000-4000-8000-000000000003', 'e6000000-0000-4000-8000-000000000002', 'vu_en_inventaire', '{}', 'e1000000-0000-4000-8000-000000000002'),
    pg_temp.evt('e8000000-0000-4000-8000-000000000004', 'e6000000-0000-4000-8000-000000000002', 'restitution'));
  premier jsonb;
  second jsonb;
  avant text;
  journal bigint;
begin
  perform pg_temp.devenir('eeeeeeee-0000-4000-8000-000000000002');
  premier := pg_temp.ingerer(lot);
  perform pg_temp.verifier(
    (select array_agg(x ->> 'statut') from jsonb_array_elements(premier) x) = array['accepte', 'accepte', 'accepte', 'rejete'],
    'premier envoi : 3 acceptés, la seconde restitution rejetée — ' || premier::text);
  avant := pg_temp.instantane('e6000000-0000-4000-8000-000000000002');
  journal := (select count(*) from public.evenements where vetement_id = 'e6000000-0000-4000-8000-000000000002');
  second := pg_temp.ingerer(lot);
  perform pg_temp.verifier(
    (select array_agg(x ->> 'statut') from jsonb_array_elements(second) x) = array['doublon', 'doublon', 'doublon', 'rejete'],
    'second envoi identique : doublons, aucune nouvelle écriture — ' || second::text);
  perform pg_temp.verifier(pg_temp.instantane('e6000000-0000-4000-8000-000000000002') = avant
    and (select count(*) from public.evenements where vetement_id = 'e6000000-0000-4000-8000-000000000002') = journal,
    'second envoi : projection et journal inchangés');
  reset role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Rejeu : recalculer_vetement reproduit exactement la projection
-- ---------------------------------------------------------------------------

-- Passages en laverie de V3, journalisés comme le fera le jalon M6 (en tant que propriétaire),
-- puis projection reconstruite par rejeu.
insert into public.evenements (id, organisation_id, vetement_id, type, survenu_le, site_id, lot_id, donnees)
select x.id::uuid, 'e0000000-0000-4000-8000-000000000000', 'e6000000-0000-4000-8000-000000000003', x.type::public.type_evenement,
  now() + (x.n || ' seconds')::interval, x.site::uuid, x.lot::uuid, x.donnees::jsonb
from (values
  (1, 'e9000000-0000-4000-8000-000000000001', 'collecte', null, null, '{}'),
  (2, 'e9000000-0000-4000-8000-000000000002', 'reception', 'e1000000-0000-4000-8000-000000000004', null, '{}'),
  (3, 'e9000000-0000-4000-8000-000000000003', 'ajout_lot', null, 'e4000000-0000-4000-8000-000000000001', '{}'),
  (4, 'e9000000-0000-4000-8000-000000000004', 'traitement', null, 'e4000000-0000-4000-8000-000000000001', '{}'),
  (5, 'e9000000-0000-4000-8000-000000000005', 'controle', null, null, '{"verdict": "conforme"}'),
  (6, 'e9000000-0000-4000-8000-000000000006', 'livraison', 'e1000000-0000-4000-8000-000000000001', null, '{}')
) as x(n, id, type, site, lot, donnees)
order by x.n;
select prive.recalculer('e6000000-0000-4000-8000-000000000003');

select pg_temp.verifier(
  (select statut = 'en_stock' and site_id = 'e1000000-0000-4000-8000-000000000001' from public.vetements where id = 'e6000000-0000-4000-8000-000000000003')
  and (select passages from public.compteurs c join public.traitements t on t.id = c.traitement_id
       where c.vetement_id = 'e6000000-0000-4000-8000-000000000003' and t.code = 'lavage') = 1,
  'rejeu d''un cycle complet : en stock au poste, 1 passage de lavage');

do $$
declare
  vetement uuid;
  avant text;
begin
  -- Aucune correction nécessaire : la projection maintenue est déjà celle du journal.
  foreach vetement in array array['e6000000-0000-4000-8000-000000000001'::uuid, 'e6000000-0000-4000-8000-000000000002', 'e6000000-0000-4000-8000-000000000003'] loop
    avant := pg_temp.instantane(vetement);
    perform pg_temp.verifier(prive.recalculer(vetement) = false and pg_temp.instantane(vetement) = avant,
      format('recalcul de %s : projection identique, rien à corriger', vetement));
  end loop;

  -- Projection corrompue (impossible depuis l'app) : le rejeu la rétablit à l'identique.
  avant := pg_temp.instantane('e6000000-0000-4000-8000-000000000003');
  update public.vetements set statut = 'pret', contamine = true, porteur_id = 'e2000000-0000-4000-8000-000000000001', derniere_lecture_le = now() - interval '1 year'
  where id = 'e6000000-0000-4000-8000-000000000003';
  update public.compteurs set passages = 99 where vetement_id = 'e6000000-0000-4000-8000-000000000003';
  perform pg_temp.verifier(prive.recalculer('e6000000-0000-4000-8000-000000000003') = true
    and pg_temp.instantane('e6000000-0000-4000-8000-000000000003') = avant,
    'projection corrompue : le rejeu la rétablit exactement');

  avant := pg_temp.instantane('e6000000-0000-4000-8000-000000000001');
  update public.identifiants set actif = true, retire_le = null, motif_retrait = null, passages_depuis_pose = 7
  where vetement_id = 'e6000000-0000-4000-8000-000000000001';
  update public.vetements set statut = 'en_service' where id = 'e6000000-0000-4000-8000-000000000001';
  perform pg_temp.verifier(prive.recalculer('e6000000-0000-4000-8000-000000000001') = true
    and pg_temp.instantane('e6000000-0000-4000-8000-000000000001') = avant,
    'identifiants corrompus : le rejeu rétablit retraits, motifs et passages depuis la pose');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Annulation
-- ---------------------------------------------------------------------------

do $$
declare
  r jsonb;
  avant text;
begin
  perform pg_temp.devenir('eeeeeeee-0000-4000-8000-000000000002');
  -- V2 : en stock au magasin après l'idempotence. Attribution puis restitution.
  avant := pg_temp.instantane('e6000000-0000-4000-8000-000000000002');
  r := pg_temp.ingerer(jsonb_build_array(
    pg_temp.evt('ea000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000002', 'attribution', '{"porteur_id": "e2000000-0000-4000-8000-000000000001"}')));

  r := pg_temp.un(pg_temp.evt('ea000000-0000-4000-8000-000000000002', 'e6000000-0000-4000-8000-000000000002', 'annulation',
    '{"evenement_id": "ea000000-0000-4000-8000-000000000001"}'));
  perform pg_temp.verifier(r ->> 'statut' = 'rejete' and r ->> 'motif' like 'Motif d''annulation%', 'annulation sans motif : rejetée');

  r := pg_temp.un(pg_temp.evt('ea000000-0000-4000-8000-000000000003', 'e6000000-0000-4000-8000-000000000002', 'annulation',
    '{"evenement_id": "e8000000-0000-4000-8000-000000000001", "motif": "Erreur"}'));
  perform pg_temp.verifier(r ->> 'statut' = 'rejete' and r ->> 'motif' like 'Seul le dernier%', 'annulation d''un événement ancien : rejetée');

  r := pg_temp.un(pg_temp.evt('ea000000-0000-4000-8000-000000000004', 'e6000000-0000-4000-8000-000000000002', 'annulation',
    '{"evenement_id": "e5000000-0000-4000-8000-000000000004", "motif": "Erreur"}'));
  perform pg_temp.verifier(r ->> 'statut' = 'rejete', 'l''enrôlement ne s''annule pas');

  r := pg_temp.un(pg_temp.evt('ea000000-0000-4000-8000-000000000005', 'e6000000-0000-4000-8000-000000000002', 'annulation',
    '{"evenement_id": "ea000000-0000-4000-8000-000000000001", "motif": "Mauvais vêtement scanné"}'));
  perform pg_temp.verifier(r ->> 'statut' = 'accepte'
    and pg_temp.instantane('e6000000-0000-4000-8000-000000000002') = avant
    and (select annule_par = 'ea000000-0000-4000-8000-000000000005' from public.evenements where id = 'ea000000-0000-4000-8000-000000000001'),
    'annulation de l''attribution : projection revenue à l''état précédent, trace conservée');

  r := pg_temp.un(pg_temp.evt('ea000000-0000-4000-8000-000000000006', 'e6000000-0000-4000-8000-000000000002', 'annulation',
    '{"evenement_id": "ea000000-0000-4000-8000-000000000001", "motif": "Encore"}'));
  perform pg_temp.verifier(r ->> 'statut' = 'rejete', 'un événement ne s''annule qu''une fois');
  reset role;

  -- Annuler un passage en laverie retire le passage du compteur ; le lot peut être reclôturé.
  perform pg_temp.devenir('eeeeeeee-0000-4000-8000-000000000001');
  r := pg_temp.un(pg_temp.evt('ea000000-0000-4000-8000-000000000007', 'e6000000-0000-4000-8000-000000000003', 'annulation',
    '{"evenement_id": "e9000000-0000-4000-8000-000000000006", "motif": "Livraison saisie trop tôt"}'));
  perform pg_temp.verifier(r ->> 'statut' = 'accepte'
    and (select statut = 'pret' from public.vetements where id = 'e6000000-0000-4000-8000-000000000003'),
    'annulation de la livraison : retour à « prêt »');
  reset role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Seuil atteint : attribution refusée sans contrôle renforcé
-- ---------------------------------------------------------------------------

-- V2 atteint sa limite de lavage (2) par deux passages journalisés.
insert into public.evenements (id, organisation_id, vetement_id, type, survenu_le, site_id, lot_id, donnees)
select x.id::uuid, 'e0000000-0000-4000-8000-000000000000', 'e6000000-0000-4000-8000-000000000002', x.type::public.type_evenement,
  now() + (x.n || ' minutes')::interval, x.site::uuid, x.lot::uuid, x.donnees::jsonb
from (values
  (1, 'eb000000-0000-4000-8000-000000000001', 'collecte', null, null, '{}'),
  (2, 'eb000000-0000-4000-8000-000000000002', 'reception', 'e1000000-0000-4000-8000-000000000004', null, '{}'),
  (3, 'eb000000-0000-4000-8000-000000000003', 'ajout_lot', null, 'e4000000-0000-4000-8000-000000000001', '{}'),
  (4, 'eb000000-0000-4000-8000-000000000004', 'traitement', null, 'e4000000-0000-4000-8000-000000000001', '{}'),
  (5, 'eb000000-0000-4000-8000-000000000005', 'controle', null, null, '{"verdict": "conforme"}'),
  (6, 'eb000000-0000-4000-8000-000000000006', 'livraison', 'e1000000-0000-4000-8000-000000000001', null, '{}'),
  (7, 'eb000000-0000-4000-8000-000000000010', 'collecte', null, null, '{}'),
  (8, 'eb000000-0000-4000-8000-000000000011', 'reception', 'e1000000-0000-4000-8000-000000000004', null, '{}'),
  (9, 'eb000000-0000-4000-8000-000000000012', 'ajout_lot', null, 'e4000000-0000-4000-8000-000000000002', '{}')
) as x(n, id, type, site, lot, donnees)
order by x.n;
select prive.recalculer('e6000000-0000-4000-8000-000000000002');

-- Le même vêtement ne compte qu'une fois par lot (index unique) : un second traitement du lot 1 est refusé.
do $$
begin
  begin
    insert into public.evenements (id, organisation_id, vetement_id, type, survenu_le, lot_id)
    values ('eb000000-0000-4000-8000-000000000099', 'e0000000-0000-4000-8000-000000000000', 'e6000000-0000-4000-8000-000000000002',
            'traitement', now(), 'e4000000-0000-4000-8000-000000000001');
    raise exception 'ÉCHEC : second traitement du même vêtement dans le même lot accepté';
  exception when unique_violation then
    null;
  end;
end;
$$;

insert into public.evenements (id, organisation_id, vetement_id, type, survenu_le, lot_id, donnees)
select x.id::uuid, 'e0000000-0000-4000-8000-000000000000', 'e6000000-0000-4000-8000-000000000002', x.type::public.type_evenement,
  now() + (x.n || ' minutes')::interval, x.lot::uuid, x.donnees::jsonb
from (values
  (10, 'eb000000-0000-4000-8000-000000000007', 'traitement', 'e4000000-0000-4000-8000-000000000002', '{}'),
  (11, 'eb000000-0000-4000-8000-000000000008', 'controle', null, '{"verdict": "conforme"}'),
  (12, 'eb000000-0000-4000-8000-000000000009', 'livraison', null, '{}')
) as x(n, id, type, lot, donnees)
order by x.n;
select prive.recalculer('e6000000-0000-4000-8000-000000000002');

do $$
declare
  r jsonb;
begin
  perform pg_temp.verifier(prive.seuil_atteint('e6000000-0000-4000-8000-000000000002'), 'deux lavages pour une limite de 2 : seuil atteint');
  perform pg_temp.devenir('eeeeeeee-0000-4000-8000-000000000002');
  r := pg_temp.un(pg_temp.evt('ec000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000002', 'attribution',
    '{"porteur_id": "e2000000-0000-4000-8000-000000000001"}'));
  perform pg_temp.verifier(r ->> 'statut' = 'rejete' and r ->> 'motif' like 'Seuil atteint%', 'seuil atteint : attribution refusée — ' || r::text);
  reset role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Droits et isolation
-- ---------------------------------------------------------------------------

do $$
declare
  r jsonb;
begin
  -- Opérateur laverie : pas d'attribution ; auditeur : rien.
  perform pg_temp.devenir('eeeeeeee-0000-4000-8000-000000000003');
  r := pg_temp.un(pg_temp.evt('ed000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000002', 'attribution',
    '{"porteur_id": "e2000000-0000-4000-8000-000000000001"}'));
  perform pg_temp.verifier(r ->> 'statut' = 'rejete' and r ->> 'code' = '42501', 'opérateur : attribution refusée');
  reset role;
  perform pg_temp.devenir('eeeeeeee-0000-4000-8000-000000000005');
  r := pg_temp.un(pg_temp.evt('ed000000-0000-4000-8000-000000000002', 'e6000000-0000-4000-8000-000000000002', 'vu_en_inventaire'));
  perform pg_temp.verifier(r ->> 'statut' = 'rejete' and r ->> 'code' = '42501', 'auditeur : aucun événement');
  reset role;

  -- Laverie externe : contamination d'un vêtement confié (V3 n'est plus chez elle ; V créé chez elle)
  perform pg_temp.devenir('eeeeeeee-0000-4000-8000-000000000004');
  r := pg_temp.un(pg_temp.evt('ed000000-0000-4000-8000-000000000003', 'e6000000-0000-4000-8000-000000000002', 'contamination'));
  perform pg_temp.verifier(r ->> 'statut' = 'rejete' and r ->> 'motif' like 'Vêtement introuvable%',
    'laverie externe : vêtement non confié introuvable');
  reset role;

  -- Organisation F : ne peut rien envoyer pour E.
  perform pg_temp.devenir('ffffffff-0000-4000-8000-000000000001');
  begin
    perform public.ingerer_evenements('e0000000-0000-4000-8000-000000000000', '[]');
    raise exception 'ÉCHEC : un admin de F a pu envoyer des événements à E';
  exception when insufficient_privilege then
    null;
  end;
  r := public.ingerer_evenements('f0000000-0000-4000-8000-000000000000', jsonb_build_array(
    pg_temp.evt('ed000000-0000-4000-8000-000000000004', 'e6000000-0000-4000-8000-000000000002', 'perte')));
  perform pg_temp.verifier(r -> 0 ->> 'statut' = 'rejete', 'admin de F : vêtement de E introuvable sous F');
  reset role;

  -- Projection et journal restent fermés à l'écriture directe.
  perform pg_temp.devenir('eeeeeeee-0000-4000-8000-000000000001');
  begin
    update public.vetements set statut = 'pret' where id = 'e6000000-0000-4000-8000-000000000002';
    raise exception 'ÉCHEC : statut modifié directement';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.recalculer_vetement('e6000000-0000-4000-8000-000000000002');
  exception when others then
    raise exception 'ÉCHEC : l''admin ne peut pas lancer le recalcul (%)', sqlerrm;
  end;
  reset role;
end;
$$;

rollback;

select 'Tous les tests du journal sont passés' as resultat;
