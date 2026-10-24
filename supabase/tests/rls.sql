-- rls.sql — Tests d'isolation et d'immuabilité du journal (jalon M1).
--
-- À coller tel quel dans le SQL Editor de Supabase, après les migrations 0001 à 0006.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste en base.
-- Succès : la dernière ligne affiche « Tous les tests RLS sont passés ».
-- Échec : l'exécution s'arrête sur une erreur « ÉCHEC : … » qui décrit le test.

begin;

-- ---------------------------------------------------------------------------
-- Outils de test
-- ---------------------------------------------------------------------------

-- Agir comme un utilisateur connecté (rôle authenticated + jeton JWT simulé).
create function pg_temp.devenir(utilisateur uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', utilisateur, 'role', 'authenticated')::text, true);
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

create function pg_temp.compter(requete text) returns bigint language plpgsql as $$
declare
  n bigint;
begin
  execute 'select count(*) from (' || requete || ') t' into n;
  return n;
end;
$$;

-- La requête doit lever une erreur ; renvoie le code SQLSTATE obtenu.
create function pg_temp.doit_echouer(requete text, description text) returns text language plpgsql as $$
begin
  execute requete;
  raise exception 'ÉCHEC : % (aucune erreur levée)', description using errcode = 'P0099';
exception
  when sqlstate 'P0099' then raise;
  when others then return sqlstate;
end;
$$;

-- ---------------------------------------------------------------------------
-- Jeu de données (en tant que propriétaire, RLS ignorée)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'test-rls-admin-a@exemple.invalid'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'test-rls-gestionnaire-a@exemple.invalid'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'test-rls-operateur-a@exemple.invalid'),
  ('aaaaaaaa-0000-4000-8000-000000000004', 'test-rls-externe-a@exemple.invalid'),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'test-rls-porteur-a@exemple.invalid'),
  ('aaaaaaaa-0000-4000-8000-000000000006', 'test-rls-auditeur-a@exemple.invalid'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'test-rls-admin-b@exemple.invalid'),
  ('cccccccc-0000-4000-8000-000000000001', 'test-rls-sans-organisation@exemple.invalid');

insert into public.organisations (id, nom) values
  ('a0000000-0000-4000-8000-000000000000', 'Test RLS — Zone A'),
  ('b0000000-0000-4000-8000-000000000000', 'Test RLS — Zone B');

insert into public.sites (id, organisation_id, nom, type) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000000', 'Poste A', 'poste'),
  ('a1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000000', 'Laverie interne A', 'laverie_interne'),
  ('a1000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000000', 'Laverie externe A1', 'laverie_externe'),
  ('a1000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000000', 'Laverie externe A2', 'laverie_externe'),
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000000', 'Poste B', 'poste');

insert into public.membres (organisation_id, user_id, role, site_id) values
  ('a0000000-0000-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000001', 'admin', null),
  ('a0000000-0000-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000002', 'gestionnaire', null),
  ('a0000000-0000-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000003', 'operateur_laverie', null),
  ('a0000000-0000-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000004', 'laverie_externe', 'a1000000-0000-4000-8000-000000000003'),
  ('a0000000-0000-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000005', 'porteur', null),
  ('a0000000-0000-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000006', 'auditeur', null),
  ('b0000000-0000-4000-8000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000001', 'admin', null);

insert into public.porteurs (id, organisation_id, matricule, nom, prenom, casier, site_id, user_id) values
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000000', 'A101', 'Dupont', 'Jean', 'C01', 'a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000005'),
  ('a2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000000', 'A102', 'Martin', 'Claire', 'C02', 'a1000000-0000-4000-8000-000000000001', null),
  ('a2000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000000', 'A103', 'Leroy', 'Paul', 'C03', 'a1000000-0000-4000-8000-000000000001', null),
  ('b2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000000', 'B201', 'Peeters', 'Anne', 'C01', 'b1000000-0000-4000-8000-000000000001', null);

insert into public.articles (id, organisation_id, designation) values
  ('a3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000000', 'Veste d''intervention'),
  ('b3000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000000', 'Veste d''intervention');

insert into public.articles_limites (organisation_id, article_id, traitement_id, limite)
select t.organisation_id, a.id, t.id, 50
from public.traitements t join public.articles a on a.organisation_id = t.organisation_id
where t.code = 'lavage' and a.id in ('a3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001');

update public.articles set notice_chemin = organisation_id || '/' || id || '.pdf', actif = true
where id in ('a3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001');

insert into public.lots (id, organisation_id, type, circuit, site_id, site_destination_id, traitement_id, statut) values
  -- Sac expédié du poste A vers la laverie externe A1
  ('a4000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000000', 'sac_collecte', 'standard',
   'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', null, 'expedie'),
  -- Lot de lavage à la laverie interne
  ('a4000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000000', 'traitement', 'standard',
   'a1000000-0000-4000-8000-000000000002', null,
   (select id from public.traitements where organisation_id = 'a0000000-0000-4000-8000-000000000000' and code = 'lavage'), 'ouvert');

insert into public.vetements (id, organisation_id, article_id, site_id, porteur_id, lot_id, statut) values
  -- v1 : porté par Dupont au poste A, non confié à la laverie externe
  ('a5000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000000', 'a3000000-0000-4000-8000-000000000001',
   'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', null, 'en_service'),
  -- v2 : à la laverie externe A1 (confié par son site)
  ('a5000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000000', 'a3000000-0000-4000-8000-000000000001',
   'a1000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000002', null, 'en_laverie'),
  -- v3 : dans le sac en route vers A1 (confié par le lot entrant)
  ('a5000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000000', 'a3000000-0000-4000-8000-000000000001',
   'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000001', 'collecte'),
  -- v4 : chez l'autre laverie externe A2
  ('a5000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000000', 'a3000000-0000-4000-8000-000000000001',
   'a1000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000003', null, 'en_laverie'),
  -- vB : zone B
  ('b5000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000000', 'b3000000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', null, 'en_stock');

insert into public.identifiants (organisation_id, vetement_id, technologie, valeur)
select organisation_id, id, 'qr', upper(right(replace(id::text, '-', ''), 10)) from public.vetements
where id in ('a5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000002',
             'a5000000-0000-4000-8000-000000000003', 'a5000000-0000-4000-8000-000000000004',
             'b5000000-0000-4000-8000-000000000001');

insert into public.compteurs (organisation_id, vetement_id, traitement_id, passages)
select v.organisation_id, v.id, t.id, 1
from public.vetements v join public.traitements t on t.organisation_id = v.organisation_id and t.code = 'lavage'
where v.id in ('a5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000002',
               'a5000000-0000-4000-8000-000000000003', 'a5000000-0000-4000-8000-000000000004',
               'b5000000-0000-4000-8000-000000000001');

insert into public.evenements (id, organisation_id, vetement_id, type, survenu_le, site_id, lot_id) values
  ('a6000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000000', 'a5000000-0000-4000-8000-000000000001',
   'enrolement', now(), 'a1000000-0000-4000-8000-000000000001', null),
  ('a6000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000000', 'a5000000-0000-4000-8000-000000000002',
   'reception', now(), 'a1000000-0000-4000-8000-000000000003', null),
  ('a6000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000000', 'a5000000-0000-4000-8000-000000000001',
   'traitement', now(), 'a1000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000002'),
  ('a6000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000000', 'a5000000-0000-4000-8000-000000000002',
   'enrolement', now(), 'a1000000-0000-4000-8000-000000000001', null),
  ('b6000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000000', 'b5000000-0000-4000-8000-000000000001',
   'enrolement', now(), 'b1000000-0000-4000-8000-000000000001', null);

insert into public.alertes (organisation_id, vetement_id, type, message) values
  ('a0000000-0000-4000-8000-000000000000', 'a5000000-0000-4000-8000-000000000001', 'seuil_preventif', 'Test'),
  ('a0000000-0000-4000-8000-000000000000', 'a5000000-0000-4000-8000-000000000002', 'seuil_preventif', 'Test'),
  ('b0000000-0000-4000-8000-000000000000', 'b5000000-0000-4000-8000-000000000001', 'seuil_preventif', 'Test');

insert into public.lectures_brutes (organisation_id, technologie, valeur, auteur_id) values
  ('a0000000-0000-4000-8000-000000000000', 'qr', 'INCONNU01', 'aaaaaaaa-0000-4000-8000-000000000003'),
  ('b0000000-0000-4000-8000-000000000000', 'qr', 'INCONNU02', 'bbbbbbbb-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- 1. Seeds : chaque organisation reçoit ses 4 traitements par défaut
-- ---------------------------------------------------------------------------

select pg_temp.verifier(
  (select count(*) from public.traitements where organisation_id = 'a0000000-0000-4000-8000-000000000000'
     and code in ('lavage', 'sechage', 'nettoyage_sec', 'decontamination')) = 4,
  'les 4 traitements par défaut sont créés avec l''organisation');

-- ---------------------------------------------------------------------------
-- 2. Isolation entre organisations : aucun membre ne lit rien d'une autre organisation
-- ---------------------------------------------------------------------------

do $$
declare
  utilisateurs uuid[] := array[
    'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002',
    'aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000004',
    'aaaaaaaa-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-000000000006'];
  tables text[] := array['membres', 'sites', 'traitements', 'articles', 'articles_limites', 'porteurs',
    'lecteurs', 'lots', 'vetements', 'vetements_limites', 'compteurs', 'identifiants', 'evenements',
    'lectures_brutes', 'alertes', 'porteurs_anonymises'];
  u uuid;
  t text;
begin
  -- Membres de A face aux données de B
  foreach u in array utilisateurs loop
    perform pg_temp.devenir(u);
    perform pg_temp.verifier(
      pg_temp.compter($q$select 1 from public.organisations where id = 'b0000000-0000-4000-8000-000000000000'$q$) = 0,
      format('utilisateur %s ne voit pas l''organisation B', u));
    foreach t in array tables loop
      perform pg_temp.verifier(
        pg_temp.compter(format($q$select 1 from public.%I where organisation_id = 'b0000000-0000-4000-8000-000000000000'$q$, t)) = 0,
        format('utilisateur %s ne lit rien de l''organisation B dans %s', u, t));
    end loop;
    reset role;
  end loop;

  -- Admin de B face aux données de A
  perform pg_temp.devenir('bbbbbbbb-0000-4000-8000-000000000001');
  foreach t in array tables loop
    perform pg_temp.verifier(
      pg_temp.compter(format($q$select 1 from public.%I where organisation_id = 'a0000000-0000-4000-8000-000000000000'$q$, t)) = 0,
      format('admin B ne lit rien de l''organisation A dans %s', t));
  end loop;
  perform pg_temp.verifier(pg_temp.compter('select 1 from public.vetements') = 1, 'admin B voit son seul vêtement');
  reset role;

  -- Utilisateur connecté sans organisation : ne voit rien du tout
  perform pg_temp.devenir('cccccccc-0000-4000-8000-000000000001');
  foreach t in array tables || array['organisations'] loop
    perform pg_temp.verifier(pg_temp.compter(format('select 1 from public.%I', t)) = 0,
      format('utilisateur sans organisation ne lit rien dans %s', t));
  end loop;
  reset role;
end;
$$;

-- Écriture dans une autre organisation refusée
do $$
begin
  perform pg_temp.devenir('aaaaaaaa-0000-4000-8000-000000000001');
  perform pg_temp.doit_echouer(
    $q$insert into public.sites (organisation_id, nom, type) values ('b0000000-0000-4000-8000-000000000000', 'Intrus', 'poste')$q$,
    'admin A ne peut pas créer de site dans l''organisation B');
  perform pg_temp.doit_echouer(
    $q$insert into public.membres (organisation_id, user_id, role) values ('b0000000-0000-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000001', 'admin')$q$,
    'admin A ne peut pas s''ajouter comme membre de l''organisation B');
  update public.organisations set nom = 'Piraté' where id = 'b0000000-0000-4000-8000-000000000000';
  reset role;
  perform pg_temp.verifier(
    (select nom from public.organisations where id = 'b0000000-0000-4000-8000-000000000000') = 'Test RLS — Zone B',
    'admin A ne peut pas renommer l''organisation B');
end;
$$;

-- Le rôle anon (non connecté) n'accède à aucune table
do $$
begin
  perform set_config('role', 'anon', true);
  perform pg_temp.doit_echouer('select 1 from public.vetements', 'anon ne lit pas les vêtements');
  perform pg_temp.doit_echouer('select 1 from public.porteurs', 'anon ne lit pas les porteurs');
  perform pg_temp.doit_echouer('select 1 from public.evenements', 'anon ne lit pas le journal');
  perform pg_temp.doit_echouer('select 1 from public.porteurs_anonymises', 'anon ne lit pas la vue porteurs_anonymises');
  reset role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Laverie externe : seulement les vêtements confiés, jamais le nom d'un porteur
-- ---------------------------------------------------------------------------

do $$
begin
  perform pg_temp.devenir('aaaaaaaa-0000-4000-8000-000000000004');

  perform pg_temp.verifier(
    (select array_agg(id order by id) from public.vetements) =
      array['a5000000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000003']::uuid[],
    'laverie externe : voit seulement v2 (sur son site) et v3 (dans un sac qui lui est destiné)');

  perform pg_temp.verifier(pg_temp.compter('select 1 from public.porteurs') = 0,
    'laverie externe : aucune ligne de la table porteurs (noms)');

  perform pg_temp.verifier(
    (select array_agg(matricule order by matricule) from public.porteurs_anonymises) = array['A102'],
    'laverie externe : porteurs_anonymises limité aux porteurs des vêtements confiés');

  perform pg_temp.doit_echouer('select nom from public.porteurs_anonymises',
    'porteurs_anonymises n''expose pas la colonne nom');
  perform pg_temp.doit_echouer('select prenom from public.porteurs_anonymises',
    'porteurs_anonymises n''expose pas la colonne prenom');

  perform pg_temp.verifier(
    (select count(*) from public.identifiants) = 2
      and (select count(*) from public.compteurs) = 2
      and (select count(*) from public.alertes) = 1,
    'laverie externe : identifiants, compteurs et alertes limités aux vêtements confiés');

  perform pg_temp.verifier(
    (select array_agg(id) from public.evenements) = array['a6000000-0000-4000-8000-000000000002']::uuid[],
    'laverie externe : seuls les événements survenus chez elle sur un vêtement confié');

  perform pg_temp.verifier(
    (select array_agg(id) from public.lots) = array['a4000000-0000-4000-8000-000000000001']::uuid[],
    'laverie externe : seul le sac qui lui est destiné, pas les lots de la laverie interne');

  perform pg_temp.verifier(pg_temp.compter('select 1 from public.lectures_brutes') = 0,
    'laverie externe : ne lit pas les lectures brutes des autres');

  perform pg_temp.verifier(pg_temp.compter('select 1 from public.sites') = 4,
    'laverie externe : voit les sites de la zone (référentiel)');

  reset role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Porteur : ses vêtements et sa propre fiche seulement
-- ---------------------------------------------------------------------------

do $$
begin
  perform pg_temp.devenir('aaaaaaaa-0000-4000-8000-000000000005');
  perform pg_temp.verifier(
    (select array_agg(id) from public.vetements) = array['a5000000-0000-4000-8000-000000000001']::uuid[],
    'porteur : ne voit que son vêtement');
  perform pg_temp.verifier(
    (select array_agg(matricule) from public.porteurs) = array['A101'],
    'porteur : ne voit que sa propre fiche porteur');
  perform pg_temp.verifier(pg_temp.compter('select 1 from public.membres') = 1,
    'porteur : ne voit que sa propre adhésion');
  reset role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Journal en ajout seul : personne ne modifie ni ne supprime un événement
-- ---------------------------------------------------------------------------

do $$
declare
  u uuid;
begin
  foreach u in array array[
    'aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'aaaaaaaa-0000-4000-8000-000000000002',
    'aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000004',
    'aaaaaaaa-0000-4000-8000-000000000006'] loop
    perform pg_temp.devenir(u);
    perform pg_temp.doit_echouer(
      $q$update public.evenements set survenu_le = now() - interval '1 day' where id = 'a6000000-0000-4000-8000-000000000002'$q$,
      format('utilisateur %s ne peut pas modifier un événement', u));
    perform pg_temp.doit_echouer(
      $q$delete from public.evenements where id = 'a6000000-0000-4000-8000-000000000002'$q$,
      format('utilisateur %s ne peut pas supprimer un événement', u));
    perform pg_temp.doit_echouer(
      $q$insert into public.evenements (organisation_id, vetement_id, type, survenu_le) values ('a0000000-0000-4000-8000-000000000000', 'a5000000-0000-4000-8000-000000000002', 'perte', now())$q$,
      format('utilisateur %s ne peut pas écrire directement dans le journal', u));
    reset role;
  end loop;
end;
$$;

-- Même le propriétaire de la base (ce qu'utilise le SQL Editor) est bloqué.
do $$
begin
  perform pg_temp.doit_echouer(
    $q$update public.evenements set type = 'perte' where id = 'a6000000-0000-4000-8000-000000000001'$q$,
    'le propriétaire ne peut pas modifier un événement');
  perform pg_temp.doit_echouer(
    $q$delete from public.evenements where id = 'a6000000-0000-4000-8000-000000000001'$q$,
    'le propriétaire ne peut pas supprimer un événement');
  perform pg_temp.doit_echouer('truncate public.evenements cascade',
    'le propriétaire ne peut pas vider le journal');
  perform pg_temp.doit_echouer(
    $q$update public.evenements set annule_par = 'a6000000-0000-4000-8000-000000000004' where id = 'a6000000-0000-4000-8000-000000000001'$q$,
    'annule_par ne peut référencer qu''un événement « annulation » du même vêtement');
end;
$$;

-- Seule exception : chaîner une annulation, une seule fois, sans rien changer d'autre.
insert into public.evenements (id, organisation_id, vetement_id, type, survenu_le, donnees) values
  ('a6000000-0000-4000-8000-000000000099', 'a0000000-0000-4000-8000-000000000000',
   'a5000000-0000-4000-8000-000000000001', 'annulation', now(),
   '{"evenement_id": "a6000000-0000-4000-8000-000000000003"}');
update public.evenements set annule_par = 'a6000000-0000-4000-8000-000000000099'
where id = 'a6000000-0000-4000-8000-000000000003';

do $$
begin
  perform pg_temp.doit_echouer(
    $q$update public.evenements set annule_par = null where id = 'a6000000-0000-4000-8000-000000000003'$q$,
    'une annulation ne peut pas être défaite en modifiant annule_par');
  perform pg_temp.doit_echouer(
    $q$update public.evenements set donnees = '{}' where id = 'a6000000-0000-4000-8000-000000000003'$q$,
    'un événement annulé reste non modifiable');
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Projections et règles de structure
-- ---------------------------------------------------------------------------

do $$
declare
  n integer;
begin
  -- Le gestionnaire modifie les colonnes descriptives, jamais les projections.
  perform pg_temp.devenir('aaaaaaaa-0000-4000-8000-000000000002');
  update public.vetements set taille = 'L' where id = 'a5000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  perform pg_temp.verifier(n = 1, 'gestionnaire : peut corriger la taille d''un vêtement');
  perform pg_temp.doit_echouer(
    $q$update public.vetements set statut = 'pret' where id = 'a5000000-0000-4000-8000-000000000001'$q$,
    'gestionnaire : ne peut pas modifier le statut (projection)');
  perform pg_temp.doit_echouer(
    $q$update public.vetements set contamine = false where id = 'a5000000-0000-4000-8000-000000000001'$q$,
    'gestionnaire : ne peut pas modifier le drapeau contaminé (projection)');
  perform pg_temp.doit_echouer(
    $q$update public.compteurs set passages = 0$q$,
    'gestionnaire : ne peut pas modifier un compteur');
  perform pg_temp.doit_echouer(
    $q$update public.identifiants set actif = false, retire_le = now()$q$,
    'gestionnaire : ne retire pas un tag hors événement');
  reset role;

  -- L'auditeur est en lecture seule.
  perform pg_temp.devenir('aaaaaaaa-0000-4000-8000-000000000006');
  update public.vetements set taille = 'XL' where id = 'a5000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  perform pg_temp.verifier(n = 0, 'auditeur : ne modifie aucun vêtement');
  insert into public.sites (organisation_id, nom, type) values ('a0000000-0000-4000-8000-000000000000', 'Essai', 'poste');
  reset role;
exception
  when insufficient_privilege then
    reset role; -- refus attendu pour l'insertion de l'auditeur
end;
$$;

select pg_temp.verifier(
  (select count(*) from public.sites where nom = 'Essai') = 0, 'auditeur : ne crée aucun site');

do $$
begin
  -- Invariant 4 : un vêtement ne compte qu'une fois par lot (événement non annulé).
  insert into public.evenements (organisation_id, vetement_id, type, survenu_le, lot_id) values
    ('a0000000-0000-4000-8000-000000000000', 'a5000000-0000-4000-8000-000000000002', 'traitement', now(),
     'a4000000-0000-4000-8000-000000000002');
  perform pg_temp.verifier(
    pg_temp.doit_echouer($q$insert into public.evenements (organisation_id, vetement_id, type, survenu_le, lot_id) values ('a0000000-0000-4000-8000-000000000000', 'a5000000-0000-4000-8000-000000000002', 'traitement', now(), 'a4000000-0000-4000-8000-000000000002')$q$,
      'deux traitements du même vêtement dans le même lot') = '23505',
    'deuxième traitement du même vêtement dans le même lot : violation d''unicité');

  -- Isolation structurelle : une ligne ne référence jamais une autre organisation.
  perform pg_temp.verifier(
    pg_temp.doit_echouer($q$insert into public.vetements (organisation_id, article_id) values ('a0000000-0000-4000-8000-000000000000', 'b3000000-0000-4000-8000-000000000001')$q$,
      'vêtement de A sur un article de B') = '23503',
    'clé étrangère composite : un vêtement de A ne peut pas utiliser un article de B');

  -- Invariant 9 : article non activable sans notice ni limites.
  perform pg_temp.doit_echouer(
    $q$insert into public.articles (organisation_id, designation, notice_chemin, actif) values ('a0000000-0000-4000-8000-000000000000', 'Sans limite', 'x.pdf', true)$q$,
    'article activé sans limites');
  perform pg_temp.doit_echouer(
    $q$update public.articles set notice_chemin = null where id = 'a3000000-0000-4000-8000-000000000001'$q$,
    'article actif dont on retire la notice');
  perform pg_temp.doit_echouer(
    $q$delete from public.articles_limites where article_id = 'a3000000-0000-4000-8000-000000000001'$q$,
    'dernière limite retirée d''un article actif');

  -- Invariant 7 : pas de traitement du circuit standard dans un lot contaminé.
  perform pg_temp.doit_echouer(
    $q$insert into public.lots (organisation_id, type, circuit, traitement_id) select organisation_id, 'traitement', 'contamine', id from public.traitements where organisation_id = 'a0000000-0000-4000-8000-000000000000' and code = 'nettoyage_sec'$q$,
    'lot contaminé avec un traitement réservé au circuit standard');
  perform pg_temp.doit_echouer(
    $q$insert into public.lots (organisation_id, type, circuit, traitement_id) select organisation_id, 'traitement', 'standard', id from public.traitements where organisation_id = 'a0000000-0000-4000-8000-000000000000' and code = 'decontamination'$q$,
    'lot standard avec un traitement réservé au circuit contaminé');

  -- Unicité des identifiants actifs.
  perform pg_temp.verifier(
    pg_temp.doit_echouer($q$insert into public.identifiants (organisation_id, vetement_id, technologie, valeur) select organisation_id, 'a5000000-0000-4000-8000-000000000002', technologie, valeur from public.identifiants where vetement_id = 'a5000000-0000-4000-8000-000000000001'$q$,
      'même identifiant actif sur deux vêtements') = '23505',
    'un identifiant actif est unique par organisation et technologie');

  -- Laverie externe rattachée à un site de type laverie_externe.
  perform pg_temp.doit_echouer(
    $q$insert into public.membres (organisation_id, user_id, role, site_id) values ('a0000000-0000-4000-8000-000000000000', 'cccccccc-0000-4000-8000-000000000001', 'laverie_externe', 'a1000000-0000-4000-8000-000000000001')$q$,
    'laverie externe rattachée à un poste');
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Membres et invitations (0005)
-- ---------------------------------------------------------------------------

do $$
declare
  resultat text;
begin
  -- Un non-admin ne peut ni inviter ni lister les membres avec leurs e-mails.
  perform pg_temp.devenir('aaaaaaaa-0000-4000-8000-000000000002');
  perform pg_temp.doit_echouer(
    $q$select public.inviter_membre('a0000000-0000-4000-8000-000000000000', 'x@exemple.invalid', 'admin')$q$,
    'gestionnaire : ne peut pas inviter de membre');
  perform pg_temp.verifier(
    pg_temp.compter($q$select * from public.membres_organisation('a0000000-0000-4000-8000-000000000000')$q$) = 0,
    'gestionnaire : membres_organisation ne renvoie rien');
  reset role;

  -- L'admin de B n'invite pas dans A.
  perform pg_temp.devenir('bbbbbbbb-0000-4000-8000-000000000001');
  perform pg_temp.doit_echouer(
    $q$select public.inviter_membre('a0000000-0000-4000-8000-000000000000', 'x@exemple.invalid', 'admin')$q$,
    'admin B : ne peut pas inviter dans l''organisation A');
  reset role;

  perform pg_temp.devenir('aaaaaaaa-0000-4000-8000-000000000001');
  -- Compte existant : adhésion immédiate.
  resultat := public.inviter_membre('a0000000-0000-4000-8000-000000000000',
    'TEST-RLS-SANS-ORGANISATION@exemple.invalid', 'auditeur');
  perform pg_temp.verifier(resultat = 'membre', 'admin : un compte existant devient membre immédiatement');
  perform pg_temp.verifier(
    pg_temp.compter($q$select 1 from public.membres_organisation('a0000000-0000-4000-8000-000000000000') where email = 'test-rls-sans-organisation@exemple.invalid' and role = 'auditeur'$q$) = 1,
    'admin : membres_organisation liste le nouveau membre avec son e-mail');
  -- Compte inexistant : invitation.
  resultat := public.inviter_membre('a0000000-0000-4000-8000-000000000000',
    'test-rls-nouveau@exemple.invalid', 'laverie_externe', 'a1000000-0000-4000-8000-000000000003');
  perform pg_temp.verifier(resultat = 'invitation', 'admin : un e-mail inconnu donne une invitation');
  perform pg_temp.doit_echouer(
    $q$select public.inviter_membre('a0000000-0000-4000-8000-000000000000', 'y@exemple.invalid', 'laverie_externe', 'a1000000-0000-4000-8000-000000000001')$q$,
    'invitation laverie externe sur un site qui n''est pas une laverie externe');
  -- Le dernier admin ne peut pas se retirer.
  perform pg_temp.doit_echouer(
    $q$update public.membres set role = 'gestionnaire' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'$q$,
    'le dernier admin ne peut pas perdre son rôle');
  perform pg_temp.doit_echouer(
    $q$delete from public.membres where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'$q$,
    'le dernier admin ne peut pas être supprimé');
  reset role;

  perform pg_temp.devenir('bbbbbbbb-0000-4000-8000-000000000001');
  perform pg_temp.verifier(pg_temp.compter('select 1 from public.invitations') = 0,
    'admin B : ne voit pas les invitations de A');
  reset role;
end;
$$;

-- Création du compte invité : l'invitation devient une adhésion.
insert into auth.users (id, email) values ('cccccccc-0000-4000-8000-000000000002', 'Test-RLS-Nouveau@exemple.invalid');

select pg_temp.verifier(
  exists (select 1 from public.membres where user_id = 'cccccccc-0000-4000-8000-000000000002'
          and role = 'laverie_externe' and site_id = 'a1000000-0000-4000-8000-000000000003')
  and not exists (select 1 from public.invitations where lower(email) = 'test-rls-nouveau@exemple.invalid'),
  'à la création du compte, l''invitation devient une adhésion');

-- ---------------------------------------------------------------------------
-- 8. Enrôlement, tags et import (0006)
-- ---------------------------------------------------------------------------

do $$
declare
  article uuid := 'a3000000-0000-4000-8000-000000000001';
  r jsonb;
  vetement uuid;
  ancien uuid;
begin
  -- Seuls admin et gestionnaire enrôlent.
  foreach vetement in array array['aaaaaaaa-0000-4000-8000-000000000003'::uuid, 'aaaaaaaa-0000-4000-8000-000000000004',
                                  'aaaaaaaa-0000-4000-8000-000000000006', 'bbbbbbbb-0000-4000-8000-000000000001'] loop
    perform pg_temp.devenir(vetement);
    perform pg_temp.doit_echouer(format(
      $q$select public.enroler_vetement('a0000000-0000-4000-8000-000000000000', '{"evenement_id": "%s", "article_id": "%s"}')$q$,
      gen_random_uuid(), article), format('utilisateur %s ne peut pas enrôler dans A', vetement));
    reset role;
  end loop;

  perform pg_temp.devenir('aaaaaaaa-0000-4000-8000-000000000002');

  -- Enrôlement avec deux identifiants : vêtement en stock, trois événements.
  r := public.enroler_vetement('a0000000-0000-4000-8000-000000000000', jsonb_build_object(
    'evenement_id', 'a7000000-0000-4000-8000-000000000001', 'vetement_id', 'a5000000-0000-4000-8000-000000000010',
    'article_id', article, 'taille', 'XL', 'site_id', 'a1000000-0000-4000-8000-000000000001',
    'identifiants', jsonb_build_array(
      jsonb_build_object('evenement_id', 'a7000000-0000-4000-8000-000000000002', 'technologie', 'qr', 'valeur', 'ZZZZZZZZ01'),
      jsonb_build_object('evenement_id', 'a7000000-0000-4000-8000-000000000003', 'technologie', 'nfc', 'valeur', '04AABBCC'))));
  perform pg_temp.verifier(r ->> 'statut' = 'accepte', 'gestionnaire : enrôlement accepté');
  perform pg_temp.verifier(
    (select statut from public.vetements where id = 'a5000000-0000-4000-8000-000000000010') = 'en_stock'
    and (select count(*) from public.evenements where vetement_id = 'a5000000-0000-4000-8000-000000000010') = 3
    and (select count(*) from public.identifiants where vetement_id = 'a5000000-0000-4000-8000-000000000010' and actif) = 2,
    'enrôlement : vêtement en stock, 3 événements, 2 identifiants actifs');

  -- Idempotence : même UUID d'événement, aucun effet.
  r := public.enroler_vetement('a0000000-0000-4000-8000-000000000000', jsonb_build_object(
    'evenement_id', 'a7000000-0000-4000-8000-000000000001', 'article_id', article));
  perform pg_temp.verifier(r ->> 'statut' = 'doublon' and (select count(*) from public.vetements where taille = 'XL') = 1,
    'réenvoi du même enrôlement : doublon sans effet');

  -- Identifiant déjà porté, article d'une autre organisation, UID NFC non hexadécimal : refusés.
  perform pg_temp.doit_echouer(format(
    $q$select public.enroler_vetement('a0000000-0000-4000-8000-000000000000', '{"evenement_id": "%s", "article_id": "%s", "identifiants": [{"evenement_id": "%s", "technologie": "qr", "valeur": "ZZZZZZZZ01"}]}')$q$,
    gen_random_uuid(), article, gen_random_uuid()), 'identifiant déjà porté par un autre vêtement');
  perform pg_temp.verifier((select count(*) from public.vetements where organisation_id = 'a0000000-0000-4000-8000-000000000000') = 5,
    'enrôlement refusé : aucun vêtement créé à moitié');
  perform pg_temp.doit_echouer(format(
    $q$select public.enroler_vetement('a0000000-0000-4000-8000-000000000000', '{"evenement_id": "%s", "article_id": "b3000000-0000-4000-8000-000000000001"}')$q$,
    gen_random_uuid()), 'article d''une autre organisation');
  perform pg_temp.doit_echouer(format(
    $q$select public.poser_tag('a0000000-0000-4000-8000-000000000000', '{"evenement_id": "%s", "vetement_id": "a5000000-0000-4000-8000-000000000010", "technologie": "nfc", "valeur": "04:aa"}')$q$,
    gen_random_uuid()), 'UID NFC non canonique');

  -- Remplacement : l'ancien tag est retiré avec son motif, le nouveau posé, l'historique reste.
  select id into ancien from public.identifiants where valeur = 'ZZZZZZZZ01';
  r := public.remplacer_tag('a0000000-0000-4000-8000-000000000000', jsonb_build_object(
    'evenement_retrait_id', 'a7000000-0000-4000-8000-000000000004', 'evenement_pose_id', 'a7000000-0000-4000-8000-000000000005',
    'identifiant_id', ancien, 'motif', 'Illisible', 'technologie', 'qr', 'valeur', 'ZZZZZZZZ02'));
  perform pg_temp.verifier(
    r ->> 'statut' = 'accepte'
    and (select not actif and motif_retrait = 'Illisible' from public.identifiants where id = ancien)
    and exists (select 1 from public.identifiants where valeur = 'ZZZZZZZZ02' and actif)
    and (select count(*) from public.evenements where vetement_id = 'a5000000-0000-4000-8000-000000000010') = 5,
    'remplacement de tag : ancien retiré avec motif, nouveau posé, 5 événements conservés');
  perform pg_temp.doit_echouer(format(
    $q$select public.retirer_tag('a0000000-0000-4000-8000-000000000000', '{"evenement_id": "%s", "identifiant_id": "%s", "motif": " "}')$q$,
    gen_random_uuid(), (select id from public.identifiants where valeur = 'ZZZZZZZZ02')), 'retrait sans motif');
  -- L'ancien code peut être réutilisé une fois retiré (index unique sur les seuls actifs).
  r := public.poser_tag('a0000000-0000-4000-8000-000000000000', jsonb_build_object(
    'evenement_id', 'a7000000-0000-4000-8000-000000000006', 'vetement_id', 'a5000000-0000-4000-8000-000000000003',
    'technologie', 'qr', 'valeur', 'ZZZZZZZZ01'));
  perform pg_temp.verifier(r ->> 'statut' = 'accepte', 'un code retiré peut être reposé ailleurs');

  -- Import : une ligne refusée n'empêche pas les autres ; réimport = doublons.
  r := public.importer_vetements('a0000000-0000-4000-8000-000000000000', jsonb_build_array(
    jsonb_build_object('ligne', 2, 'evenement_id', 'a7000000-0000-4000-8000-000000000011', 'article_id', article,
      'identifiants', jsonb_build_array(jsonb_build_object('evenement_id', 'a7000000-0000-4000-8000-000000000012', 'technologie', 'code_barres', 'valeur', 'EXIST001'))),
    jsonb_build_object('ligne', 3, 'evenement_id', 'a7000000-0000-4000-8000-000000000013', 'article_id', article,
      'identifiants', jsonb_build_array(jsonb_build_object('evenement_id', 'a7000000-0000-4000-8000-000000000014', 'technologie', 'qr', 'valeur', 'ZZZZZZZZ02'))),
    jsonb_build_object('ligne', 4, 'evenement_id', 'a7000000-0000-4000-8000-000000000015', 'article_id', article)));
  perform pg_temp.verifier(
    (select array_agg(x ->> 'statut' order by (x ->> 'ligne')::int) from jsonb_array_elements(r) x) = array['cree', 'rejete', 'cree']
    and (select count(*) from public.evenements where source = 'import') = 3,
    'import : lignes 2 et 4 créées, ligne 3 rejetée (code déjà porté), événements source import');
  r := public.importer_vetements('a0000000-0000-4000-8000-000000000000', jsonb_build_array(
    jsonb_build_object('ligne', 2, 'evenement_id', 'a7000000-0000-4000-8000-000000000011', 'article_id', article)));
  perform pg_temp.verifier(r -> 0 ->> 'statut' = 'doublon', 'réimport de la même ligne : doublon');
  reset role;

  -- La laverie externe ne voit pas le vêtement enrôlé au poste.
  perform pg_temp.devenir('aaaaaaaa-0000-4000-8000-000000000004');
  perform pg_temp.verifier(pg_temp.compter($q$select 1 from public.vetements where id = 'a5000000-0000-4000-8000-000000000010'$q$) = 0,
    'laverie externe : ne voit pas un vêtement enrôlé au poste');
  reset role;
end;
$$;

rollback;

select 'Tous les tests RLS sont passés' as resultat;
