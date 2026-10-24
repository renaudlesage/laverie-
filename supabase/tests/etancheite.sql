-- etancheite.sql — Étanchéité du portail laverie externe (jalon M9).
--
-- Un prestataire (laverie externe) travaille pour deux zones. Il ne doit jamais voir un vêtement
-- qui ne lui est pas confié, ni le nom d'un pompier ; il ne peut agir que sur ce qui lui est confié,
-- et chaque zone reste séparée de l'autre.
--
-- À coller tel quel dans le SQL Editor de Supabase, après les migrations 0001 à 0011.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste en base.
-- Succès : la dernière ligne affiche « Tous les tests d'étanchéité sont passés ».

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

create function pg_temp.ev(org uuid, vetement uuid, type text, donnees jsonb default '{}', site uuid default null, lot uuid default null)
returns jsonb language sql as $$
  select public.ingerer_evenements(org, jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid(), 'vetement_id', vetement, 'type', type, 'donnees', donnees, 'site_id', site, 'lot_id', lot))) -> 0;
$$;

create function pg_temp.op(org uuid, operation jsonb) returns jsonb language sql as $$
  select public.operer_lots(org, jsonb_build_array(operation || jsonb_build_object('id', gen_random_uuid()))) -> 0;
$$;

create function pg_temp.ok(r jsonb, description text) returns void language plpgsql as $$
begin
  if r ->> 'statut' <> 'accepte' then
    raise exception 'ÉCHEC : % — %', description, r::text;
  end if;
end;
$$;

create function pg_temp.refuse(r jsonb, description text) returns void language plpgsql as $$
begin
  if r ->> 'statut' <> 'rejete' then
    raise exception 'ÉCHEC : % aurait dû être refusé — %', description, r::text;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Jeu de données
--   Zone F : poste, laverie interne, laverie externe « Lavex F » ; porteur Jean Dupont.
--     V1 : en service chez Dupont (jamais confié)
--     V2 : à Dupont, collecté et expédié à Lavex F (confié)
--     V3 : collecté et expédié à la laverie interne (non confié)
--   Zone G : laverie externe « Lavex G » ; G1 réceptionné chez Lavex G.
--   Le prestataire est « laverie externe » dans F (Lavex F) et dans G (Lavex G).
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('ffffffff-1000-4000-8000-000000000001', 'test-etanche-gestionnaire-f@exemple.invalid'),
  ('ffffffff-1000-4000-8000-000000000002', 'test-etanche-operateur-f@exemple.invalid'),
  ('ffffffff-1000-4000-8000-000000000003', 'test-etanche-prestataire@exemple.invalid'),
  ('ffffffff-1000-4000-8000-000000000004', 'test-etanche-gestionnaire-g@exemple.invalid');

insert into public.organisations (id, nom) values
  ('f0000000-0000-4000-8000-00000000000f', 'Test étanchéité — Zone F'),
  ('f0000000-0000-4000-8000-00000000000a', 'Test étanchéité — Zone G');

insert into public.sites (id, organisation_id, nom, type) values
  ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000f', 'Poste F', 'poste'),
  ('f1000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-00000000000f', 'Laverie interne F', 'laverie_interne'),
  ('f1000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-00000000000f', 'Lavex F', 'laverie_externe'),
  ('f1000000-0000-4000-8000-000000000011', 'f0000000-0000-4000-8000-00000000000a', 'Poste G', 'poste'),
  ('f1000000-0000-4000-8000-000000000013', 'f0000000-0000-4000-8000-00000000000a', 'Lavex G', 'laverie_externe');

insert into public.membres (organisation_id, user_id, role, site_id) values
  ('f0000000-0000-4000-8000-00000000000f', 'ffffffff-1000-4000-8000-000000000001', 'gestionnaire', null),
  ('f0000000-0000-4000-8000-00000000000f', 'ffffffff-1000-4000-8000-000000000002', 'operateur_laverie', null),
  ('f0000000-0000-4000-8000-00000000000f', 'ffffffff-1000-4000-8000-000000000003', 'laverie_externe', 'f1000000-0000-4000-8000-000000000003'),
  ('f0000000-0000-4000-8000-00000000000a', 'ffffffff-1000-4000-8000-000000000004', 'gestionnaire', null),
  ('f0000000-0000-4000-8000-00000000000a', 'ffffffff-1000-4000-8000-000000000003', 'laverie_externe', 'f1000000-0000-4000-8000-000000000013');

insert into public.porteurs (id, organisation_id, matricule, nom, prenom, casier, site_id) values
  ('f5000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000f', 'F-042', 'Dupont', 'Jean', 'C12', 'f1000000-0000-4000-8000-000000000001');

insert into public.articles (id, organisation_id, designation, notice_chemin) values
  ('f3000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000f', 'Veste F', 'n.pdf'),
  ('f3000000-0000-4000-8000-000000000011', 'f0000000-0000-4000-8000-00000000000a', 'Veste G', 'n.pdf');
insert into public.articles_limites (organisation_id, article_id, traitement_id, limite)
select t.organisation_id, a.id, t.id, 50
from public.traitements t join public.articles a on a.organisation_id = t.organisation_id
where t.organisation_id in ('f0000000-0000-4000-8000-00000000000f', 'f0000000-0000-4000-8000-00000000000a') and t.code = 'lavage';
update public.articles set actif = true where id in ('f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000011');

insert into public.sacs (id, organisation_id, nom, circuit) values
  ('f8000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000f', 'Sac pour Lavex F', 'standard'),
  ('f8000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-00000000000f', 'Sac pour la laverie interne', 'standard'),
  ('f8000000-0000-4000-8000-000000000011', 'f0000000-0000-4000-8000-00000000000a', 'Sac G', 'standard');

insert into public.lecteurs (organisation_id, nom, type, site_id) values
  ('f0000000-0000-4000-8000-00000000000f', 'Douchette laverie interne', 'clavier', 'f1000000-0000-4000-8000-000000000002'),
  ('f0000000-0000-4000-8000-00000000000f', 'Douchette Lavex F', 'clavier', 'f1000000-0000-4000-8000-000000000003');

do $$
declare
  f uuid := 'f0000000-0000-4000-8000-00000000000f';
  g uuid := 'f0000000-0000-4000-8000-00000000000a';
  i integer;
begin
  -- Zone F : trois vêtements enrôlés au poste ; V1 et V2 attribués à Dupont.
  perform pg_temp.devenir('ffffffff-1000-4000-8000-000000000001');
  for i in 1..3 loop
    perform pg_temp.ok(pg_temp.ev(f, ('f6000000-0000-4000-8000-00000000000' || i)::uuid, 'enrolement',
      jsonb_build_object('article_id', 'f3000000-0000-4000-8000-000000000001', 'identifiants',
        jsonb_build_array(jsonb_build_object('evenement_id', gen_random_uuid(), 'technologie', 'qr', 'valeur', 'ETANCHEF0' || i))),
      'f1000000-0000-4000-8000-000000000001'), 'enrôlement F' || i);
  end loop;
  perform pg_temp.ok(pg_temp.ev(f, 'f6000000-0000-4000-8000-000000000001', 'attribution', '{"porteur_id": "f5000000-0000-4000-8000-000000000001"}'), 'attribution V1');
  perform pg_temp.ok(pg_temp.ev(f, 'f6000000-0000-4000-8000-000000000002', 'attribution', '{"porteur_id": "f5000000-0000-4000-8000-000000000001"}'), 'attribution V2');
  reset role;

  -- V2 part chez Lavex F, V3 à la laverie interne.
  perform pg_temp.devenir('ffffffff-1000-4000-8000-000000000002');
  perform pg_temp.ok(pg_temp.op(f, '{"type": "ouvrir_sac", "lot_id": "f4000000-0000-4000-8000-000000000001", "sac_id": "f8000000-0000-4000-8000-000000000001"}'), 'sac Lavex F');
  perform pg_temp.ok(pg_temp.ev(f, 'f6000000-0000-4000-8000-000000000002', 'collecte', '{}', null, 'f4000000-0000-4000-8000-000000000001'), 'collecte V2');
  perform pg_temp.ok(pg_temp.op(f, '{"type": "expedier_sac", "lot_id": "f4000000-0000-4000-8000-000000000001", "site_destination_id": "f1000000-0000-4000-8000-000000000003"}'), 'expédition Lavex F');
  perform pg_temp.ok(pg_temp.op(f, '{"type": "ouvrir_sac", "lot_id": "f4000000-0000-4000-8000-000000000002", "sac_id": "f8000000-0000-4000-8000-000000000002"}'), 'sac interne');
  perform pg_temp.ok(pg_temp.ev(f, 'f6000000-0000-4000-8000-000000000003', 'collecte', '{}', null, 'f4000000-0000-4000-8000-000000000002'), 'collecte V3');
  perform pg_temp.ok(pg_temp.op(f, '{"type": "expedier_sac", "lot_id": "f4000000-0000-4000-8000-000000000002", "site_destination_id": "f1000000-0000-4000-8000-000000000002"}'), 'expédition interne');
  insert into public.lectures_brutes (organisation_id, valeur) values (f, 'ETANCHEF01');
  reset role;

  -- Zone G : G1 envoyé à Lavex G.
  perform pg_temp.devenir('ffffffff-1000-4000-8000-000000000004');
  perform pg_temp.ok(pg_temp.ev(g, 'f6000000-0000-4000-8000-000000000011', 'enrolement',
    jsonb_build_object('article_id', 'f3000000-0000-4000-8000-000000000011', 'identifiants',
      jsonb_build_array(jsonb_build_object('evenement_id', gen_random_uuid(), 'technologie', 'qr', 'valeur', 'ETANCHEG01'))),
    'f1000000-0000-4000-8000-000000000011'), 'enrôlement G1');
  perform pg_temp.ok(pg_temp.op(g, '{"type": "ouvrir_sac", "lot_id": "f4000000-0000-4000-8000-000000000011", "sac_id": "f8000000-0000-4000-8000-000000000011"}'), 'sac G');
  perform pg_temp.ok(pg_temp.ev(g, 'f6000000-0000-4000-8000-000000000011', 'collecte', '{}', null, 'f4000000-0000-4000-8000-000000000011'), 'collecte G1');
  perform pg_temp.ok(pg_temp.op(g, '{"type": "expedier_sac", "lot_id": "f4000000-0000-4000-8000-000000000011", "site_destination_id": "f1000000-0000-4000-8000-000000000013"}'), 'expédition Lavex G');
  reset role;

  perform pg_temp.devenir('ffffffff-1000-4000-8000-000000000003');
  perform pg_temp.ok(pg_temp.ev(g, 'f6000000-0000-4000-8000-000000000011', 'reception', '{}', 'f1000000-0000-4000-8000-000000000013'), 'réception G1 chez Lavex G');
  reset role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Lecture : seulement ce qui est confié, jamais un nom
-- ---------------------------------------------------------------------------

do $$
declare
  f uuid := 'f0000000-0000-4000-8000-00000000000f';
  n integer;
begin
  perform pg_temp.devenir('ffffffff-1000-4000-8000-000000000003');

  perform pg_temp.verifier(
    (select array_agg(id order by id) = array['f6000000-0000-4000-8000-000000000002'::uuid] from public.vetements where organisation_id = f),
    'zone F : seul V2 (confié) est visible');
  perform pg_temp.verifier(
    (select array_agg(valeur) = array['ETANCHEF02'] from public.identifiants where organisation_id = f),
    'zone F : seuls les identifiants de V2 sont lisibles (pas de résolution d''un autre code)');
  perform pg_temp.verifier(
    not exists (select 1 from public.evenements where organisation_id = f and vetement_id <> 'f6000000-0000-4000-8000-000000000002'),
    'zone F : aucun événement d''un vêtement non confié');
  perform pg_temp.verifier(
    not exists (select 1 from public.evenements where organisation_id = f and type = 'attribution'),
    'zone F : l''attribution au poste (porteur) reste invisible');
  perform pg_temp.verifier(
    (select array_agg(id) = array['f4000000-0000-4000-8000-000000000001'::uuid] from public.lots where organisation_id = f),
    'zone F : seul le sac destiné à Lavex F est visible');
  perform pg_temp.verifier(not exists (select 1 from public.compteurs where organisation_id = f and vetement_id <> 'f6000000-0000-4000-8000-000000000002'),
    'zone F : compteurs des seuls vêtements confiés');
  perform pg_temp.verifier(not exists (select 1 from public.alertes where organisation_id = f and vetement_id <> 'f6000000-0000-4000-8000-000000000002'),
    'zone F : alertes des seuls vêtements confiés');
  perform pg_temp.verifier(not exists (select 1 from public.lectures_brutes where organisation_id = f),
    'zone F : lectures des autres invisibles');
  perform pg_temp.verifier((select array_agg(nom) = array['Douchette Lavex F'] from public.lecteurs where organisation_id = f),
    'zone F : seuls les lecteurs de son site');

  -- Aucun nom de pompier : ni la table des porteurs, ni la vue anonymisée, ni les membres.
  perform pg_temp.verifier(not exists (select 1 from public.porteurs), 'table porteurs (noms) inaccessible');
  perform pg_temp.verifier(
    (select array_agg(matricule || '/' || casier) = array['F-042/C12'] from public.porteurs_anonymises where organisation_id = f),
    'porteur du vêtement confié : matricule et casier seulement');
  perform pg_temp.verifier(
    not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'porteurs_anonymises'
                and column_name in ('nom', 'prenom', 'user_id')),
    'la vue anonymisée ne porte aucun nom');
  perform pg_temp.verifier(not exists (select 1 from public.membres_organisation(f)), 'liste des membres (e-mails) refusée');
  perform pg_temp.verifier((select count(*) = 2 from public.membres), 'membres : seulement ses propres adhésions');
  perform pg_temp.verifier(not exists (select 1 from public.invitations), 'invitations invisibles');

  -- Tableau de bord : le seul vêtement confié.
  perform pg_temp.verifier(
    public.tableau_de_bord(f) -> 'statuts' = '{"collecte": 1}'::jsonb, 'tableau de bord de la zone F : V2 seulement');
  reset role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Écriture : rien sur ce qui n'est pas confié
-- ---------------------------------------------------------------------------

do $$
declare
  f uuid := 'f0000000-0000-4000-8000-00000000000f';
  n integer;
begin
  perform pg_temp.devenir('ffffffff-1000-4000-8000-000000000003');
  perform pg_temp.refuse(pg_temp.ev(f, 'f6000000-0000-4000-8000-000000000003', 'reception', '{}', 'f1000000-0000-4000-8000-000000000003'),
    'réception d''un vêtement non confié');
  perform pg_temp.refuse(pg_temp.ev(f, 'f6000000-0000-4000-8000-000000000001', 'contamination'), 'contamination d''un vêtement non confié');
  perform pg_temp.refuse(pg_temp.op(f, '{"type": "receptionner_sac", "lot_id": "f4000000-0000-4000-8000-000000000002"}'),
    'réception du sac destiné à la laverie interne');
  perform pg_temp.refuse(pg_temp.op(f, jsonb_build_object('type', 'ouvrir_lot', 'lot_id', gen_random_uuid(), 'site_id', 'f1000000-0000-4000-8000-000000000002',
    'traitement_id', (select id from public.traitements where organisation_id = f and code = 'lavage'))), 'lot ouvert à la laverie interne');
  perform pg_temp.verifier(
    public.signaler_melanges(f, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'vetement_id', 'f6000000-0000-4000-8000-000000000001'))) -> 0 ->> 'statut' = 'rejete',
    'signalement sur un vêtement non confié');

  begin
    update public.vetements set statut = 'perdu' where organisation_id = f;
    get diagnostics n = row_count;
    perform pg_temp.verifier(n = 0, 'aucune modification directe des vêtements');
  exception when insufficient_privilege then
    null; -- refusé d'emblée : c'est attendu
  end;
  update public.porteurs set nom = 'X';
  get diagnostics n = row_count;
  perform pg_temp.verifier(n = 0, 'aucune modification des porteurs');
  begin
    insert into public.evenements (organisation_id, vetement_id, type) values (f, 'f6000000-0000-4000-8000-000000000002', 'perte');
    raise exception 'ÉCHEC : écriture directe dans le journal acceptée';
  exception when insufficient_privilege then
    null;
  end;
  reset role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Deux zones : chacune voit son prestataire, jamais l'autre
-- ---------------------------------------------------------------------------

do $$
declare
  f uuid := 'f0000000-0000-4000-8000-00000000000f';
  g uuid := 'f0000000-0000-4000-8000-00000000000a';
begin
  perform pg_temp.devenir('ffffffff-1000-4000-8000-000000000003');
  perform pg_temp.verifier(
    (select array_agg(id order by id) = array['f6000000-0000-4000-8000-000000000011'::uuid] from public.vetements where organisation_id = g),
    'zone G : seul G1 (confié à Lavex G)');
  perform pg_temp.verifier(
    public.tableau_de_bord(g) -> 'statuts' = '{"en_laverie": 1}'::jsonb, 'tableau de bord de la zone G : G1 seulement');
  -- Un vêtement de G passé avec l'organisation F : refusé (pas de mélange entre zones).
  perform pg_temp.refuse(pg_temp.ev(f, 'f6000000-0000-4000-8000-000000000011', 'contamination'), 'vêtement de la zone G écrit dans la zone F');
  reset role;

  -- Le gestionnaire de G ne voit rien de F.
  perform pg_temp.devenir('ffffffff-1000-4000-8000-000000000004');
  perform pg_temp.verifier(not exists (select 1 from public.vetements where organisation_id = f), 'gestionnaire G : rien de la zone F');
  perform pg_temp.verifier(not exists (select 1 from public.porteurs_anonymises where organisation_id = f), 'gestionnaire G : aucun porteur de F');
  reset role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Fin de prestation : livré au poste, le vêtement disparaît du périmètre
-- ---------------------------------------------------------------------------

do $$
declare
  f uuid := 'f0000000-0000-4000-8000-00000000000f';
  v uuid := 'f6000000-0000-4000-8000-000000000002';
begin
  perform pg_temp.devenir('ffffffff-1000-4000-8000-000000000003');
  perform pg_temp.ok(pg_temp.ev(f, v, 'reception', '{}', 'f1000000-0000-4000-8000-000000000003'), 'réception V2 chez Lavex F');
  perform pg_temp.ok(pg_temp.op(f, '{"type": "receptionner_sac", "lot_id": "f4000000-0000-4000-8000-000000000001"}'), 'sac réceptionné');
  perform pg_temp.ok(pg_temp.op(f, jsonb_build_object('type', 'ouvrir_lot', 'lot_id', 'f4000000-0000-4000-8000-000000000010',
    'site_id', 'f1000000-0000-4000-8000-000000000003', 'traitement_id', (select id from public.traitements where organisation_id = f and code = 'lavage'))),
    'lot chez Lavex F');
  perform pg_temp.ok(pg_temp.ev(f, v, 'ajout_lot', '{}', null, 'f4000000-0000-4000-8000-000000000010'), 'ajout au lot');
  perform pg_temp.ok(pg_temp.op(f, '{"type": "cloturer_lot", "lot_id": "f4000000-0000-4000-8000-000000000010"}'), 'clôture');
  perform pg_temp.ok(pg_temp.ev(f, v, 'controle', '{"verdict": "conforme"}'), 'contrôle');
  perform pg_temp.ok(pg_temp.ev(f, v, 'livraison', '{}', 'f1000000-0000-4000-8000-000000000001'), 'livraison au poste F');

  perform pg_temp.verifier(not exists (select 1 from public.vetements where organisation_id = f), 'livré : V2 n''est plus visible');
  perform pg_temp.verifier(not exists (select 1 from public.identifiants where organisation_id = f), 'livré : ses identifiants non plus');
  perform pg_temp.verifier(not exists (select 1 from public.porteurs_anonymises where organisation_id = f), 'livré : le matricule de son porteur non plus');
  perform pg_temp.verifier(public.tableau_de_bord(f) -> 'statuts' = '{}'::jsonb, 'livré : tableau de bord vide');
  reset role;

  perform pg_temp.verifier((select statut = 'en_service' from public.vetements where id = v), 'côté zone : V2 rendu à Dupont, en service');
end;
$$;

rollback;

select 'Tous les tests d''étanchéité sont passés' as resultat;
