-- plateforme.sql — Espace Plateforme : clients, suspension, accès support, super-administrateurs.
--
-- À coller tel quel dans le SQL Editor de Supabase, après les migrations 0001 à 0014.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste en base.
-- Succès : la dernière ligne affiche « Tous les tests de la plateforme sont passés ».

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

-- Refus attendu (droits) d'une instruction.
create function pg_temp.interdit(instruction text, description text) returns void language plpgsql as $$
begin
  execute instruction;
  raise exception 'ÉCHEC : % (accepté)', description;
exception when insufficient_privilege then
  null;
end;
$$;

insert into auth.users (id, email) values
  ('cccccccc-2000-4000-8000-000000000001', 'test-plateforme-super@exemple.invalid'),
  ('cccccccc-2000-4000-8000-000000000002', 'test-plateforme-admin-zone@exemple.invalid'),
  ('cccccccc-2000-4000-8000-000000000003', 'test-plateforme-externe@exemple.invalid'),
  ('cccccccc-2000-4000-8000-000000000004', 'test-plateforme-intrus@exemple.invalid');
insert into public.plateforme_admins (user_id) values ('cccccccc-2000-4000-8000-000000000001');
-- Les vrais super-administrateurs sont mis de côté le temps du test (annulé à la fin).
update public.plateforme_admins set actif = false where user_id <> 'cccccccc-2000-4000-8000-000000000001';

do $$
declare
  r jsonb;
  org uuid;
  externe uuid := gen_random_uuid();
  n integer;
begin
  -- Un utilisateur ordinaire n'a pas accès à la plateforme.
  perform pg_temp.devenir('cccccccc-2000-4000-8000-000000000004');
  perform pg_temp.interdit('select * from public.plateforme_clients()', 'liste des clients par un intrus');
  perform pg_temp.interdit($q$select public.creer_client('Zone pirate', 'zone_secours', 'x@exemple.invalid')$q$, 'création de client par un intrus');
  perform pg_temp.verifier(not public.est_admin_plateforme(), 'intrus : pas administrateur de la plateforme');
  reset role;

  -- Création d'un client : compte existant → membre admin ; sinon invitation.
  perform pg_temp.devenir('cccccccc-2000-4000-8000-000000000001');
  perform pg_temp.verifier(public.est_admin_plateforme(), 'super-administrateur reconnu');
  r := public.creer_client('Test plateforme — Zone P', 'zone_secours', 'TEST-plateforme-admin-zone@exemple.invalid');
  org := (r ->> 'organisation_id')::uuid;
  perform pg_temp.verifier(r ->> 'admin' = 'membre', 'premier admin existant : membre aussitôt');
  r := public.creer_client('Test plateforme — Zone Q', 'autre', 'nouveau-venu@exemple.invalid');
  perform pg_temp.verifier(r ->> 'admin' = 'invitation', 'premier admin inconnu : invitation');
  begin
    perform public.creer_client('test plateforme — zone p', 'zone_secours', 'a@exemple.invalid');
    raise exception 'ÉCHEC : doublon de nom accepté';
  exception when unique_violation then
    null;
  end;
  perform pg_temp.verifier(not exists (select 1 from public.traitements t where t.organisation_id = org), 'sans accès support : aucune donnée de zone lisible');
  reset role;
  perform pg_temp.verifier((select count(*) = 4 from public.traitements t where t.organisation_id = org), 'traitements par défaut semés');

  -- Données de la zone P : un site de laverie externe, un membre externe, un porteur nommé, un vêtement.
  insert into public.sites (id, organisation_id, nom, type) values (externe, org, 'Lavex P', 'laverie_externe');
  insert into public.membres (organisation_id, user_id, role, site_id) values (org, 'cccccccc-2000-4000-8000-000000000003', 'laverie_externe', externe);
  insert into public.porteurs (organisation_id, matricule, nom, prenom) values (org, 'P-001', 'Secret', 'Nom');
  insert into public.articles (id, organisation_id, designation, notice_chemin) values ('c3000000-2000-4000-8000-000000000001', org, 'Veste P', 'n.pdf');
  insert into public.articles_limites (organisation_id, article_id, traitement_id, limite)
    select org, 'c3000000-2000-4000-8000-000000000001', id, 10 from public.traitements where organisation_id = org and code = 'lavage';
  update public.articles set actif = true where id = 'c3000000-2000-4000-8000-000000000001';
  perform pg_temp.devenir('cccccccc-2000-4000-8000-000000000002');
  r := public.ingerer_evenements(org, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'vetement_id', 'c6000000-2000-4000-8000-000000000001',
    'type', 'enrolement', 'site_id', externe, 'donnees', jsonb_build_object('article_id', 'c3000000-2000-4000-8000-000000000001'))));
  perform pg_temp.verifier(r -> 0 ->> 'statut' = 'accepte', 'admin de zone : enrôlement ' || r::text);
  reset role;

  -- Suspension : plus aucun accès pour les membres, données intactes.
  perform pg_temp.devenir('cccccccc-2000-4000-8000-000000000001');
  perform public.suspendre_client(org, 'Contrat en attente (test)');
  reset role;
  perform pg_temp.devenir('cccccccc-2000-4000-8000-000000000002');
  perform pg_temp.verifier(not exists (select 1 from public.organisations where id = org), 'zone suspendue : invisible pour son admin');
  perform pg_temp.verifier(not exists (select 1 from public.vetements where organisation_id = org), 'zone suspendue : vêtements invisibles');
  perform pg_temp.interdit(format($q$select public.ingerer_evenements(%L, '[]')$q$, org), 'écriture dans une zone suspendue');
  perform pg_temp.interdit(format('update public.organisations set suspendue_le = null where id = %L', org), 'l''admin de zone ne se réactive pas lui-même');
  reset role;
  perform pg_temp.devenir('cccccccc-2000-4000-8000-000000000003');
  perform pg_temp.verifier(not exists (select 1 from public.vetements where organisation_id = org), 'zone suspendue : la laverie externe non plus');
  reset role;
  perform pg_temp.verifier((select count(*) = 1 from public.vetements where organisation_id = org), 'données intactes pendant la suspension');

  perform pg_temp.devenir('cccccccc-2000-4000-8000-000000000001');
  perform pg_temp.verifier((select suspendue_le is not null and motif_suspension = 'Contrat en attente (test)' from public.plateforme_clients() where id = org),
    'la plateforme voit la suspension et son motif');
  perform public.reactiver_client(org);
  reset role;
  perform pg_temp.devenir('cccccccc-2000-4000-8000-000000000002');
  perform pg_temp.verifier((select count(*) = 1 from public.vetements where organisation_id = org), 'réactivée : accès rétabli');
  reset role;

  -- Accès support : refusé sans autorisation de la zone.
  perform pg_temp.devenir('cccccccc-2000-4000-8000-000000000001');
  perform pg_temp.interdit(format($q$select public.ouvrir_support(%L, 'Aide au paramétrage')$q$, org), 'support sans autorisation');
  reset role;
  perform pg_temp.devenir('cccccccc-2000-4000-8000-000000000002');
  update public.organisations set support_autorise = true where id = org;
  reset role;

  -- Support ouvert : lecture seule, sans les noms, tracé.
  perform pg_temp.devenir('cccccccc-2000-4000-8000-000000000001');
  perform public.ouvrir_support(org, 'Aide au paramétrage (test)');
  perform pg_temp.verifier((select count(*) = 1 from public.mes_acces_support() where organisation_id = org), 'support : zone disponible dans l''app');
  perform pg_temp.verifier((select count(*) = 1 from public.vetements where organisation_id = org), 'support : vêtements lisibles');
  perform pg_temp.verifier(not exists (select 1 from public.porteurs where organisation_id = org), 'support : aucun nom de pompier');
  perform pg_temp.verifier((select matricule = 'P-001' from public.porteurs_anonymises where organisation_id = org), 'support : matricule seulement');
  r := public.ingerer_evenements(org, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'vetement_id', 'c6000000-2000-4000-8000-000000000001',
    'type', 'perte', 'donnees', '{"motif": "test"}'::jsonb)));
  perform pg_temp.verifier(r -> 0 ->> 'statut' = 'rejete', 'support : aucune écriture au journal');
  perform pg_temp.interdit(format($q$insert into public.lectures_brutes (organisation_id, valeur) values (%L, 'X')$q$, org), 'support : pas de lecture brute');
  update public.articles set designation = 'Modifié' where organisation_id = org;
  get diagnostics n = row_count;
  perform pg_temp.verifier(n = 0, 'support : aucune modification des référentiels');
  reset role;

  perform pg_temp.devenir('cccccccc-2000-4000-8000-000000000002');
  perform pg_temp.verifier((select motif = 'Aide au paramétrage (test)' and email = 'test-plateforme-super@exemple.invalid' from public.acces_support where organisation_id = org),
    'admin de zone : voit qui est entré et pourquoi');
  -- Retrait de l'autorisation : fin immédiate de l'accès.
  update public.organisations set support_autorise = false where id = org;
  reset role;
  perform pg_temp.devenir('cccccccc-2000-4000-8000-000000000001');
  perform pg_temp.verifier(not exists (select 1 from public.vetements where organisation_id = org), 'autorisation retirée : plus d''accès');
  reset role;

  -- Expiration au bout de la durée.
  update public.organisations set support_autorise = true where id = org;
  update public.acces_support set fin = now() - interval '1 minute' where organisation_id = org;
  perform pg_temp.devenir('cccccccc-2000-4000-8000-000000000001');
  perform pg_temp.verifier(not exists (select 1 from public.vetements where organisation_id = org), 'accès expiré : plus d''accès');

  -- Super-administrateurs : ajout d'un compte existant, jamais moins d'un.
  begin
    perform public.ajouter_admin_plateforme('inconnu@exemple.invalid');
    raise exception 'ÉCHEC : compte inconnu accepté';
  exception when no_data_found then
    null;
  end;
  begin
    perform public.retirer_admin_plateforme('cccccccc-2000-4000-8000-000000000001');
    raise exception 'ÉCHEC : dernier super-administrateur retiré';
  exception when check_violation then
    null;
  end;
  perform public.ajouter_admin_plateforme('test-plateforme-intrus@exemple.invalid');
  perform pg_temp.verifier((select count(*) = 2 from public.plateforme_admins_liste()), 'deux super-administrateurs');
  perform public.retirer_admin_plateforme('cccccccc-2000-4000-8000-000000000004');
  reset role;
  perform pg_temp.devenir('cccccccc-2000-4000-8000-000000000004');
  perform pg_temp.verifier(not public.est_admin_plateforme(), 'retiré : plus administrateur de la plateforme');
  reset role;
end;
$$;

rollback;

select 'Tous les tests de la plateforme sont passés' as resultat;
