-- rapports.sql — Rapports et résumé des alertes.
--
-- À coller tel quel dans le SQL Editor de Supabase, après les migrations 0001 à 0013.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste en base.
-- Succès : la dernière ligne affiche « Tous les tests des rapports sont passés ».

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

create function pg_temp.ok(r jsonb) returns void language plpgsql as $$
begin
  if exists (select 1 from jsonb_array_elements(r) x where x ->> 'statut' <> 'accepte') then
    raise exception 'ÉCHEC : refus — %', r::text;
  end if;
end;
$$;

insert into auth.users (id, email) values
  ('bbbbbbbb-1000-4000-8000-000000000001', 'test-rapports-admin@exemple.invalid'),
  ('bbbbbbbb-1000-4000-8000-000000000002', 'test-rapports-externe@exemple.invalid'),
  ('bbbbbbbb-1000-4000-8000-000000000003', 'test-rapports-operateur@exemple.invalid');
insert into public.organisations (id, nom) values ('b0000000-0000-4000-8000-0000000000bb', 'Test rapports — Zone R');
insert into public.sites (id, organisation_id, nom, type) values
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-0000000000bb', 'Poste R', 'poste'),
  ('b1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-0000000000bb', 'Laverie interne R', 'laverie_interne'),
  ('b1000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-0000000000bb', 'Lavex R', 'laverie_externe');
insert into public.membres (organisation_id, user_id, role, site_id) values
  ('b0000000-0000-4000-8000-0000000000bb', 'bbbbbbbb-1000-4000-8000-000000000001', 'admin', null),
  ('b0000000-0000-4000-8000-0000000000bb', 'bbbbbbbb-1000-4000-8000-000000000002', 'laverie_externe', 'b1000000-0000-4000-8000-000000000003'),
  ('b0000000-0000-4000-8000-0000000000bb', 'bbbbbbbb-1000-4000-8000-000000000003', 'operateur_laverie', null);
insert into public.articles (id, organisation_id, designation, notice_chemin, duree_vie_mois) values
  ('b3000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-0000000000bb', 'Veste R', 'n.pdf', 24);
insert into public.articles_limites (organisation_id, article_id, traitement_id, limite)
select organisation_id, 'b3000000-0000-4000-8000-000000000001', id, 2 from public.traitements
where organisation_id = 'b0000000-0000-4000-8000-0000000000bb' and code = 'lavage';
update public.articles set actif = true where id = 'b3000000-0000-4000-8000-000000000001';
insert into public.sacs (id, organisation_id, nom) values ('b8000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-0000000000bb', 'Sac R');

-- V1 : deux lavages chez Lavex R ; V2 : un lavage à la laverie interne ; V3 : en service depuis 23 mois.
do $$
declare
  org uuid := 'b0000000-0000-4000-8000-0000000000bb';
  lavage uuid := (select id from public.traitements where organisation_id = 'b0000000-0000-4000-8000-0000000000bb' and code = 'lavage');
  v uuid;
  laverie uuid;
  sac uuid;
  lot uuid;
  i integer;
begin
  perform pg_temp.devenir('bbbbbbbb-1000-4000-8000-000000000001');
  for i in 1..3 loop
    perform pg_temp.ok(public.ingerer_evenements(org, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(),
      'vetement_id', ('b6000000-0000-4000-8000-00000000000' || i)::uuid, 'type', 'enrolement', 'site_id', 'b1000000-0000-4000-8000-000000000001',
      'donnees', jsonb_build_object('article_id', 'b3000000-0000-4000-8000-000000000001',
        'mis_en_service_le', case when i = 3 then (current_date - interval '23 months')::date::text end)))));
  end loop;
  foreach v in array array['b6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000002']::uuid[] loop
    laverie := case when v = 'b6000000-0000-4000-8000-000000000001' then 'b1000000-0000-4000-8000-000000000003'::uuid else 'b1000000-0000-4000-8000-000000000002'::uuid end;
    sac := gen_random_uuid();
    lot := gen_random_uuid();
    perform pg_temp.ok(public.operer_lots(org, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'type', 'ouvrir_sac', 'lot_id', sac, 'sac_id', 'b8000000-0000-4000-8000-000000000001'))));
    perform pg_temp.ok(public.ingerer_evenements(org, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'vetement_id', v, 'type', 'collecte', 'lot_id', sac))));
    perform pg_temp.ok(public.operer_lots(org, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'type', 'expedier_sac', 'lot_id', sac, 'site_destination_id', laverie))));
    perform pg_temp.ok(public.ingerer_evenements(org, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'vetement_id', v, 'type', 'reception', 'site_id', laverie))));
    perform pg_temp.ok(public.operer_lots(org, jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'type', 'receptionner_sac', 'lot_id', sac),
      jsonb_build_object('id', gen_random_uuid(), 'type', 'ouvrir_lot', 'lot_id', lot, 'site_id', laverie, 'traitement_id', lavage))));
    perform pg_temp.ok(public.ingerer_evenements(org, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'vetement_id', v, 'type', 'ajout_lot', 'lot_id', lot))));
    perform pg_temp.ok(public.operer_lots(org, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'type', 'cloturer_lot', 'lot_id', lot))));
    perform pg_temp.ok(public.ingerer_evenements(org, jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'vetement_id', v, 'type', 'controle', 'donnees', '{"verdict": "conforme", "renforce": true}'::jsonb),
      jsonb_build_object('id', gen_random_uuid(), 'vetement_id', v, 'type', 'livraison', 'site_id', 'b1000000-0000-4000-8000-000000000001'))));
  end loop;
  reset role;
end;
$$;

do $$
declare
  org uuid := 'b0000000-0000-4000-8000-0000000000bb';
  r jsonb;
  n integer;
begin
  perform pg_temp.devenir('bbbbbbbb-1000-4000-8000-000000000001');
  r := public.rapport_passages(org, current_date - 1, current_date);
  perform pg_temp.verifier(r -> 'parc' -> 0 ->> 'passages' = '3' and r -> 'parc' -> 0 ->> 'vetements' = '2', 'parc : 3 passages sur 2 vêtements ' || r::text);
  perform pg_temp.verifier(r -> 'periode' -> 0 ->> 'passages' = '3', 'période : 3 passages');
  r := public.rapport_passages(org, current_date - 30, current_date - 2);
  perform pg_temp.verifier(r -> 'periode' = '[]'::jsonb, 'période sans activité : vide');

  perform pg_temp.verifier(
    (select array_agg(right(vetement_id::text, 1) || ':' || coalesce(usure_pct, 0) order by vetement_id) from public.rapport_fin_de_vie(org, 6, 80))
      = array['1:100', '3:0'],
    'fin de vie : V1 usé à 100 %, V3 au bout de sa durée de vie dans 1 mois ; V2 (50 %) exclu');
  perform pg_temp.verifier((select count(*) = 1 from public.rapport_fin_de_vie(org, 0, 50) where usure_pct = 50), 'seuil 50 % : V2 inclus');

  r := public.rapport_laverie(org, 'b1000000-0000-4000-8000-000000000003', current_date - 1, current_date);
  perform pg_temp.verifier(jsonb_array_length(r -> 'lots') = 2 and (r ->> 'sacs_recus')::int = 2 and (r ->> 'vetements_recus')::int = 2,
    'activité de Lavex R : 2 lots, 2 sacs, 2 réceptions ' || r::text);
  reset role;

  -- La laverie externe voit sa propre activité, pas celle de la laverie interne.
  perform pg_temp.devenir('bbbbbbbb-1000-4000-8000-000000000002');
  r := public.rapport_laverie(org, 'b1000000-0000-4000-8000-000000000003', current_date - 1, current_date);
  perform pg_temp.verifier(jsonb_array_length(r -> 'lots') = 2, 'laverie externe : sa propre activité');
  r := public.rapport_laverie(org, 'b1000000-0000-4000-8000-000000000002', current_date - 1, current_date);
  perform pg_temp.verifier(jsonb_array_length(r -> 'lots') = 0 and (r ->> 'vetements_recus')::int = 0, 'laverie externe : rien de la laverie interne');
  perform pg_temp.verifier(not exists (select 1 from public.rapport_fin_de_vie(org)), 'laverie externe : aucun vêtement non confié dans la fin de vie');

  -- Destinataires du résumé : réservé au service.
  begin
    perform public.destinataires_resume(org);
    raise exception 'ÉCHEC : destinataires lisibles par un utilisateur';
  exception when insufficient_privilege then
    null;
  end;
  reset role;

  -- Résumé : rôles destinataires.
  perform pg_temp.verifier(not exists (select 1 from public.destinataires_resume(org)), 'résumé inactif : aucun destinataire');
  update public.organisations set reglages = reglages || '{"resume_alertes": {"actif": true, "roles": ["admin", "operateur_laverie"]}}' where id = org;
  perform pg_temp.verifier(
    (select array_agg(email order by email) from public.destinataires_resume(org))
      = array['test-rapports-admin@exemple.invalid', 'test-rapports-operateur@exemple.invalid'],
    'résumé actif : admin et opérateur, pas la laverie externe');
  begin
    update public.organisations set reglages = reglages || '{"resume_alertes": {"actif": true, "roles": ["laverie_externe"]}}' where id = org;
    raise exception 'ÉCHEC : rôle destinataire non autorisé accepté';
  exception when check_violation then
    null;
  end;
end;
$$;

rollback;

select 'Tous les tests des rapports sont passés' as resultat;
