-- alertes.sql — Tests des alertes et du tableau de bord (jalon M8).
--
-- À coller tel quel dans le SQL Editor de Supabase, après les migrations 0001 à 0011.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste en base.
-- Succès : la dernière ligne affiche « Tous les tests des alertes sont passés ».

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

-- Envoi d'événements ou d'opérations ; échoue si l'un est refusé.
create function pg_temp.ev(vetement uuid, type text, donnees jsonb default '{}', site uuid default null, lot uuid default null,
                           quand timestamptz default now()) returns void language plpgsql as $$
declare
  r jsonb := public.ingerer_evenements('e0000000-0000-4000-8000-000000000000', jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid(), 'vetement_id', vetement, 'type', type, 'survenu_le', quand,
    'donnees', donnees, 'site_id', site, 'lot_id', lot))) -> 0;
begin
  if r ->> 'statut' <> 'accepte' then
    raise exception 'ÉCHEC : % refusé — %', type, r::text;
  end if;
end;
$$;

create function pg_temp.op(operation jsonb) returns void language plpgsql as $$
declare
  r jsonb := public.operer_lots('e0000000-0000-4000-8000-000000000000',
    jsonb_build_array(operation || jsonb_build_object('id', gen_random_uuid()))) -> 0;
begin
  if r ->> 'statut' <> 'accepte' then
    raise exception 'ÉCHEC : % refusé — %', operation ->> 'type', r::text;
  end if;
end;
$$;

-- Un aller-retour complet en laverie (opérateur) : +1 passage « lavage ».
create function pg_temp.passage(v uuid) returns void language plpgsql as $$
declare
  sac uuid := gen_random_uuid();
  lot uuid := gen_random_uuid();
begin
  perform pg_temp.op(jsonb_build_object('type', 'ouvrir_sac', 'lot_id', sac, 'sac_id', 'e8000000-0000-4000-8000-000000000001'));
  perform pg_temp.ev(v, 'collecte', '{}', null, sac);
  perform pg_temp.op(jsonb_build_object('type', 'expedier_sac', 'lot_id', sac, 'site_destination_id', 'e1000000-0000-4000-8000-000000000002'));
  perform pg_temp.ev(v, 'reception', '{}', 'e1000000-0000-4000-8000-000000000002');
  perform pg_temp.op(jsonb_build_object('type', 'receptionner_sac', 'lot_id', sac));
  perform pg_temp.op(jsonb_build_object('type', 'ouvrir_lot', 'lot_id', lot, 'site_id', 'e1000000-0000-4000-8000-000000000002',
    'traitement_id', (select id from public.traitements where organisation_id = 'e0000000-0000-4000-8000-000000000000' and code = 'lavage')));
  perform pg_temp.ev(v, 'ajout_lot', '{}', null, lot);
  perform pg_temp.op(jsonb_build_object('type', 'cloturer_lot', 'lot_id', lot));
  perform pg_temp.ev(v, 'controle', '{"verdict": "conforme", "renforce": true}');
  perform pg_temp.ev(v, 'livraison', '{}', 'e1000000-0000-4000-8000-000000000001');
end;
$$;

create function pg_temp.ouvertes(v uuid, t text) returns integer language sql as $$
  select count(*)::integer from public.alertes where vetement_id = v and type::text = t and close_le is null;
$$;

-- ---------------------------------------------------------------------------
-- Jeu de données : zone E
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('eeeeeeee-1000-4000-8000-000000000001', 'test-alertes-admin@exemple.invalid'),
  ('eeeeeeee-1000-4000-8000-000000000002', 'test-alertes-gestionnaire@exemple.invalid'),
  ('eeeeeeee-1000-4000-8000-000000000003', 'test-alertes-operateur@exemple.invalid'),
  ('eeeeeeee-1000-4000-8000-000000000004', 'test-alertes-externe@exemple.invalid');

insert into public.organisations (id, nom, reglages) values
  ('e0000000-0000-4000-8000-000000000000', 'Test alertes — Zone E', '{"garantie_tags": {"qr": 5}, "usure_tag_pct": 80}');

insert into public.sites (id, organisation_id, nom, type) values
  ('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000000', 'Poste E', 'poste'),
  ('e1000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000000', 'Laverie interne E', 'laverie_interne'),
  ('e1000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000000', 'Laverie externe E', 'laverie_externe');

insert into public.membres (organisation_id, user_id, role, site_id) values
  ('e0000000-0000-4000-8000-000000000000', 'eeeeeeee-1000-4000-8000-000000000001', 'admin', null),
  ('e0000000-0000-4000-8000-000000000000', 'eeeeeeee-1000-4000-8000-000000000002', 'gestionnaire', null),
  ('e0000000-0000-4000-8000-000000000000', 'eeeeeeee-1000-4000-8000-000000000003', 'operateur_laverie', null),
  ('e0000000-0000-4000-8000-000000000000', 'eeeeeeee-1000-4000-8000-000000000004', 'laverie_externe', 'e1000000-0000-4000-8000-000000000003');

-- Veste : limite lavage 5, alerte à 80 % ; durée de vie 12 mois.
insert into public.articles (id, organisation_id, designation, notice_chemin, duree_vie_mois) values
  ('e3000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000000', 'Veste E', 'n.pdf', 12);
insert into public.articles_limites (organisation_id, article_id, traitement_id, limite, seuil_alerte_pct)
select organisation_id, 'e3000000-0000-4000-8000-000000000001', id, 5, 80 from public.traitements
where organisation_id = 'e0000000-0000-4000-8000-000000000000' and code = 'lavage';
update public.articles set actif = true where id = 'e3000000-0000-4000-8000-000000000001';

insert into public.sacs (id, organisation_id, nom, circuit) values
  ('e8000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000000', 'Sac E', 'standard'),
  ('e8000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000000', 'Sac E2', 'standard');

-- Quatre vêtements enrôlés au poste ; le 2e est en service depuis deux ans.
do $$
declare
  i integer;
  r jsonb;
begin
  perform pg_temp.devenir('eeeeeeee-1000-4000-8000-000000000002');
  for i in 1..4 loop
    r := public.ingerer_evenements('e0000000-0000-4000-8000-000000000000', jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'vetement_id', ('e6000000-0000-4000-8000-00000000000' || i)::uuid, 'type', 'enrolement',
      'site_id', 'e1000000-0000-4000-8000-000000000001',
      'donnees', jsonb_build_object('article_id', 'e3000000-0000-4000-8000-000000000001',
        'mis_en_service_le', case when i = 2 then (current_date - 730)::text end,
        'identifiants', jsonb_build_array(jsonb_build_object('evenement_id', gen_random_uuid(), 'technologie', 'qr', 'valeur', 'VETE00000' || i))))));
    perform pg_temp.verifier(r -> 0 ->> 'statut' = 'accepte', 'enrôlement ' || i || ' : ' || r::text);
  end loop;
  reset role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Seuil préventif, seuil atteint, usure du tag, acquittement, réforme
-- ---------------------------------------------------------------------------

do $$
declare
  v uuid := 'e6000000-0000-4000-8000-000000000001';
  i integer;
begin
  perform pg_temp.devenir('eeeeeeee-1000-4000-8000-000000000003');
  for i in 1..3 loop perform pg_temp.passage(v); end loop;
  reset role;
  perform pg_temp.verifier(pg_temp.ouvertes(v, 'seuil_preventif') = 0 and pg_temp.ouvertes(v, 'usure_tag') = 0, '3 passages : aucune alerte');

  perform pg_temp.devenir('eeeeeeee-1000-4000-8000-000000000003');
  perform pg_temp.passage(v);
  reset role;
  perform pg_temp.verifier(pg_temp.ouvertes(v, 'seuil_preventif') = 1, '4 passages sur 5 : seuil préventif ouvert');
  perform pg_temp.verifier(
    (select niveau = 'attention' and message = 'Tag QR VETE000001 à remplacer : 4 passage(s) depuis la pose, garantie 5' from public.alertes where vetement_id = v and type = 'usure_tag' and close_le is null),
    '4 passages, garantie du tag 5 : usure du tag (attention)');

  perform pg_temp.devenir('eeeeeeee-1000-4000-8000-000000000003');
  perform pg_temp.passage(v);
  reset role;
  perform pg_temp.verifier(pg_temp.ouvertes(v, 'seuil_preventif') = 0, '5 passages : le seuil préventif se ferme');
  perform pg_temp.verifier(
    (select niveau = 'critique' from public.alertes where vetement_id = v and type = 'seuil_atteint' and close_le is null),
    '5 passages : seuil atteint (critique)');
  perform pg_temp.verifier(
    (select niveau = 'critique' and count(*) over () = 1 from public.alertes where vetement_id = v and type = 'usure_tag' and close_le is null),
    'usure du tag : même alerte, passée en critique');

  -- Tag remplacé : l'alerte d'usure se ferme.
  perform pg_temp.devenir('eeeeeeee-1000-4000-8000-000000000002');
  perform public.remplacer_tag('e0000000-0000-4000-8000-000000000000', jsonb_build_object(
    'identifiant_id', (select id from public.identifiants where vetement_id = v and actif),
    'motif', 'Usure', 'evenement_retrait_id', gen_random_uuid(), 'evenement_pose_id', gen_random_uuid(),
    'technologie', 'qr', 'valeur', 'VETE00NEUF'));
  reset role;
  perform pg_temp.verifier(pg_temp.ouvertes(v, 'usure_tag') = 0, 'tag remplacé : usure fermée');

  -- Acquittement : l'alerte ne se rouvre pas pour la même cause.
  perform pg_temp.devenir('eeeeeeee-1000-4000-8000-000000000003');
  update public.alertes set close_le = now(), close_par = 'eeeeeeee-1000-4000-8000-000000000003'
  where vetement_id = v and type = 'seuil_atteint' and close_le is null;
  reset role;
  perform prive.evaluer_toutes_alertes();
  perform pg_temp.verifier(pg_temp.ouvertes(v, 'seuil_atteint') = 0, 'seuil atteint acquitté : pas de réouverture');

  -- Livraison bloquée sans contrôle renforcé (règle M5), puis réforme : tout se ferme.
  perform pg_temp.devenir('eeeeeeee-1000-4000-8000-000000000002');
  perform pg_temp.ev(v, 'reforme', '{"motif": "Fin de vie"}');
  reset role;
  perform pg_temp.verifier(
    not exists (select 1 from public.alertes where vetement_id = v and close_le is null), 'réforme : plus aucune alerte ouverte');
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Âge maximal : ouverte à l'enrôlement, fermée si la durée de vie change
-- ---------------------------------------------------------------------------

do $$
declare
  v uuid := 'e6000000-0000-4000-8000-000000000002';
begin
  perform pg_temp.verifier(pg_temp.ouvertes(v, 'age_maximal') = 1, 'en service depuis 2 ans, durée de vie 12 mois : âge maximal');
  perform pg_temp.verifier(pg_temp.ouvertes('e6000000-0000-4000-8000-000000000003', 'age_maximal') = 0, 'sans date de mise en service : pas d''alerte d''âge');
  perform pg_temp.devenir('eeeeeeee-1000-4000-8000-000000000001');
  update public.articles set duree_vie_mois = 60 where id = 'e3000000-0000-4000-8000-000000000001';
  reset role;
  perform pg_temp.verifier(pg_temp.ouvertes(v, 'age_maximal') = 0, 'durée de vie portée à 60 mois : alerte fermée');
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Non revenu : collecté sans réception, puis en laverie trop longtemps
-- ---------------------------------------------------------------------------

do $$
declare
  v uuid := 'e6000000-0000-4000-8000-000000000003';
  sac uuid := 'e4000000-0000-4000-8000-000000000003';
begin
  perform pg_temp.devenir('eeeeeeee-1000-4000-8000-000000000003');
  perform pg_temp.op(jsonb_build_object('type', 'ouvrir_sac', 'lot_id', sac, 'sac_id', 'e8000000-0000-4000-8000-000000000001'));
  perform pg_temp.ev(v, 'collecte', '{}', null, sac, now() - interval '3 days');
  reset role;
  perform pg_temp.verifier(pg_temp.ouvertes(v, 'non_revenu') = 1, 'collecté il y a 3 jours (délai 2) : non revenu');

  perform pg_temp.devenir('eeeeeeee-1000-4000-8000-000000000003');
  perform pg_temp.op(jsonb_build_object('type', 'expedier_sac', 'lot_id', sac, 'site_destination_id', 'e1000000-0000-4000-8000-000000000002'));
  perform pg_temp.ev(v, 'reception', '{}', 'e1000000-0000-4000-8000-000000000002', null, now() - interval '8 days');
  reset role;
  perform pg_temp.verifier(
    (select count(*) = 1 from public.alertes where vetement_id = v and type = 'non_revenu' and close_le is null and cle like 'laverie:%'),
    'réceptionné il y a 8 jours (délai 7) : l''alerte de collecte se ferme, celle de laverie s''ouvre');

  -- Le délai se règle dans l'app : porté à 10 jours, l'alerte se ferme aussitôt.
  update public.organisations set reglages = reglages || '{"delai_laverie_jours": 10}' where id = 'e0000000-0000-4000-8000-000000000000';
  perform pg_temp.verifier(pg_temp.ouvertes(v, 'non_revenu') = 0, 'délai de laverie porté à 10 jours : alerte fermée');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Écart de réception et mélange de circuits : fermeture et acquittement
-- ---------------------------------------------------------------------------

do $$
declare
  v uuid := 'e6000000-0000-4000-8000-000000000004';
  sac uuid := 'e4000000-0000-4000-8000-000000000004';
  n integer;
begin
  perform pg_temp.devenir('eeeeeeee-1000-4000-8000-000000000003');
  perform pg_temp.op(jsonb_build_object('type', 'ouvrir_sac', 'lot_id', sac, 'sac_id', 'e8000000-0000-4000-8000-000000000002'));
  perform pg_temp.ev(v, 'collecte', '{}', null, sac);
  perform pg_temp.op(jsonb_build_object('type', 'expedier_sac', 'lot_id', sac, 'site_destination_id', 'e1000000-0000-4000-8000-000000000002'));
  perform pg_temp.op(jsonb_build_object('type', 'receptionner_sac', 'lot_id', sac));
  reset role;
  perform pg_temp.verifier(pg_temp.ouvertes(v, 'ecart_reception') = 1, 'non lu à la réception : écart ouvert');

  perform pg_temp.devenir('eeeeeeee-1000-4000-8000-000000000002');
  perform pg_temp.ev(v, 'perte', '{"motif": "Introuvable"}');
  reset role;
  perform pg_temp.verifier(pg_temp.ouvertes(v, 'ecart_reception') = 0, 'déclaré perdu : écart fermé');

  insert into public.alertes (organisation_id, vetement_id, type, niveau, message)
  values ('e0000000-0000-4000-8000-000000000000', v, 'melange_circuits', 'critique', 'Mélange de circuits (test)');

  -- La laverie externe ne ferme pas une alerte ; l'opérateur, oui.
  perform pg_temp.devenir('eeeeeeee-1000-4000-8000-000000000004');
  update public.alertes set close_le = now(), close_par = 'eeeeeeee-1000-4000-8000-000000000004'
  where vetement_id = v and type = 'melange_circuits';
  get diagnostics n = row_count;
  reset role;
  perform pg_temp.verifier(n = 0, 'laverie externe : pas d''acquittement');
  perform pg_temp.devenir('eeeeeeee-1000-4000-8000-000000000003');
  update public.alertes set close_le = now(), close_par = 'eeeeeeee-1000-4000-8000-000000000003'
  where vetement_id = v and type = 'melange_circuits';
  get diagnostics n = row_count;
  reset role;
  perform pg_temp.verifier(n = 1 and pg_temp.ouvertes(v, 'melange_circuits') = 0, 'opérateur : mélange de circuits acquitté');
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Tableau de bord et réglages
-- ---------------------------------------------------------------------------

do $$
declare
  t jsonb;
begin
  -- Pour le tableau de bord : le vêtement 2 redevient trop vieux.
  update public.articles set duree_vie_mois = 12 where id = 'e3000000-0000-4000-8000-000000000001';

  perform pg_temp.devenir('eeeeeeee-1000-4000-8000-000000000002');
  t := public.tableau_de_bord('e0000000-0000-4000-8000-000000000000');
  reset role;
  perform pg_temp.verifier((t -> 'statuts' ->> 'reforme')::int = 1 and (t -> 'statuts' ->> 'perdu')::int = 1, 'tableau de bord : statuts ' || t::text);
  perform pg_temp.verifier((t ->> 'fin_de_vie')::int = 1, 'tableau de bord : 1 vêtement en fin de vie ' || t::text);
  perform pg_temp.verifier((t -> 'alertes' ->> 'age_maximal')::int = 1, 'tableau de bord : alertes ouvertes par type');

  perform pg_temp.devenir('eeeeeeee-1000-4000-8000-000000000004');
  t := public.tableau_de_bord('e0000000-0000-4000-8000-000000000000');
  reset role;
  perform pg_temp.verifier(t -> 'statuts' = '{}'::jsonb and t -> 'alertes' = '{}'::jsonb,
    'laverie externe : rien de ce qui ne lui est pas confié ' || t::text);

  begin
    update public.organisations set reglages = reglages || '{"garantie_tags": {"qr": 0}}' where id = 'e0000000-0000-4000-8000-000000000000';
    raise exception 'ÉCHEC : garantie de tag nulle acceptée';
  exception when check_violation then
    null;
  end;
  begin
    update public.organisations set reglages = reglages || '{"garantie_tags": {"rfid": 200}}' where id = 'e0000000-0000-4000-8000-000000000000';
    raise exception 'ÉCHEC : technologie inconnue acceptée';
  exception when check_violation then
    null;
  end;
end;
$$;

rollback;

select 'Tous les tests des alertes sont passés' as resultat;
