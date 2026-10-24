-- 0006_enrolement.sql — Enrôlement, pose / retrait / remplacement de tags, import de l'existant (jalon M4).
-- À exécuter après 0005_membres.sql.
--
-- Toute écriture passe par une fonction qui ajoute l'événement au journal ET applique son effet
-- dans la même transaction (invariants 2 et 3). Chaque événement porte un UUID produit par
-- l'appareil : renvoyer le même UUID ne produit aucun effet (invariant 5).
-- Contenu des événements (relu par recalculer_vetement au jalon M5) :
--   enrolement : donnees { article_id, taille, numero_serie, nominatif }, site_id
--   tag_pose   : donnees { identifiant_id, technologie, valeur }
--   tag_retire : donnees { identifiant_id, technologie, valeur, motif }

begin;

-- Valeurs canoniques (CLAUDE.md §6) : jamais d'espace ; NFC et UHF en hexadécimal majuscule.
alter table public.identifiants
  add constraint identifiants_valeur_sans_espace check (valeur !~ '\s'),
  add constraint identifiants_hex check (technologie not in ('nfc', 'uhf') or valeur ~ '^[0-9A-F]+$');

-- ---------------------------------------------------------------------------
-- Fonctions internes
-- ---------------------------------------------------------------------------

create function prive.exiger_enrolement(org uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prive.a_role(org, 'admin', 'gestionnaire') then
    raise exception 'Réservé aux administrateurs et gestionnaires' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- Pose un identifiant sur un vêtement et journalise tag_pose.
create function prive.poser_identifiant(
  org uuid, vetement uuid, evenement uuid, techno public.technologie_id, val text,
  quand timestamptz, lecteur uuid, src public.source_evenement
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  identifiant uuid;
  statut_actuel public.statut_vetement;
begin
  select v.statut into statut_actuel from public.vetements v where v.id = vetement and v.organisation_id = org;
  if statut_actuel is null then
    raise exception 'Vêtement introuvable' using errcode = 'no_data_found';
  end if;
  if statut_actuel = 'reforme' then
    raise exception 'Vêtement réformé : aucun tag ne peut y être posé' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.identifiants i
    where i.organisation_id = org and i.technologie = techno and i.valeur = val and i.actif
  ) then
    raise exception 'Identifiant % déjà porté par un vêtement', val using errcode = 'unique_violation';
  end if;

  insert into public.identifiants (organisation_id, vetement_id, technologie, valeur, pose_le)
  values (org, vetement, techno, val, quand)
  returning id into identifiant;

  insert into public.evenements (id, organisation_id, vetement_id, type, survenu_le, lecteur_id, auteur_id, source, donnees)
  values (evenement, org, vetement, 'tag_pose', quand, lecteur, auth.uid(), src,
          jsonb_build_object('identifiant_id', identifiant, 'technologie', techno, 'valeur', val));
  return identifiant;
end;
$$;

-- Retire un identifiant actif (motif obligatoire) et journalise tag_retire.
create function prive.retirer_identifiant(
  org uuid, identifiant uuid, evenement uuid, motif text, quand timestamptz, src public.source_evenement
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  i public.identifiants;
begin
  if motif is null or btrim(motif) = '' then
    raise exception 'Motif de retrait obligatoire' using errcode = 'check_violation';
  end if;
  select * into i from public.identifiants x where x.id = identifiant and x.organisation_id = org;
  if i.id is null then
    raise exception 'Identifiant introuvable' using errcode = 'no_data_found';
  end if;
  if not i.actif then
    raise exception 'Identifiant déjà retiré' using errcode = 'check_violation';
  end if;

  update public.identifiants
  set actif = false, retire_le = quand, motif_retrait = btrim(motif)
  where id = identifiant;

  insert into public.evenements (id, organisation_id, vetement_id, type, survenu_le, auteur_id, source, donnees)
  values (evenement, org, i.vetement_id, 'tag_retire', quand, auth.uid(), src,
          jsonb_build_object('identifiant_id', i.id, 'technologie', i.technologie, 'valeur', i.valeur, 'motif', btrim(motif)));
  return i.vetement_id;
end;
$$;

-- Crée le vêtement, journalise enrolement puis pose ses identifiants.
-- p : { evenement_id, vetement_id, article_id, taille, numero_serie, nominatif, site_id,
--       survenu_le, lecteur_id, identifiants: [{ evenement_id, technologie, valeur }] }
create function prive.enroler(org uuid, p jsonb, src public.source_evenement) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  vetement uuid := coalesce((p ->> 'vetement_id')::uuid, gen_random_uuid());
  quand timestamptz := coalesce((p ->> 'survenu_le')::timestamptz, now());
  article uuid := (p ->> 'article_id')::uuid;
  ident jsonb;
begin
  if not exists (select 1 from public.articles a where a.id = article and a.organisation_id = org and a.actif) then
    raise exception 'Article inconnu ou inactif : seul un article actif peut être enrôlé' using errcode = 'check_violation';
  end if;

  insert into public.vetements (id, organisation_id, article_id, taille, numero_serie, nominatif, site_id, mis_en_service_le)
  values (vetement, org, article, nullif(btrim(p ->> 'taille'), ''), nullif(btrim(p ->> 'numero_serie'), ''),
          coalesce((p ->> 'nominatif')::boolean, false), (p ->> 'site_id')::uuid,
          nullif(p ->> 'mis_en_service_le', '')::date);

  insert into public.evenements (id, organisation_id, vetement_id, type, survenu_le, site_id, lecteur_id, auteur_id, source, donnees)
  values ((p ->> 'evenement_id')::uuid, org, vetement, 'enrolement', quand, (p ->> 'site_id')::uuid,
          (p ->> 'lecteur_id')::uuid, auth.uid(), src,
          jsonb_build_object('article_id', article, 'taille', nullif(btrim(p ->> 'taille'), ''),
                             'numero_serie', nullif(btrim(p ->> 'numero_serie'), ''),
                             'nominatif', coalesce((p ->> 'nominatif')::boolean, false)));

  for ident in select * from jsonb_array_elements(coalesce(p -> 'identifiants', '[]'::jsonb)) loop
    perform prive.poser_identifiant(org, vetement, (ident ->> 'evenement_id')::uuid,
      (ident ->> 'technologie')::public.technologie_id, ident ->> 'valeur', quand, (p ->> 'lecteur_id')::uuid, src);
  end loop;
  return vetement;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fonctions appelées par l'app
-- Réponse : { statut: 'accepte' | 'doublon', vetement_id }. Une erreur métier lève une exception.
-- ---------------------------------------------------------------------------

create function public.enroler_vetement(org uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  existant uuid;
begin
  perform prive.exiger_enrolement(org);
  select e.vetement_id into existant from public.evenements e where e.id = (p ->> 'evenement_id')::uuid;
  if existant is not null then
    return jsonb_build_object('statut', 'doublon', 'vetement_id', existant);
  end if;
  return jsonb_build_object('statut', 'accepte', 'vetement_id', prive.enroler(org, p, 'app'));
end;
$$;

-- p : { evenement_id, vetement_id, technologie, valeur, survenu_le, lecteur_id }
create function public.poser_tag(org uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  existant uuid;
begin
  perform prive.exiger_enrolement(org);
  select e.vetement_id into existant from public.evenements e where e.id = (p ->> 'evenement_id')::uuid;
  if existant is not null then
    return jsonb_build_object('statut', 'doublon', 'vetement_id', existant);
  end if;
  perform prive.poser_identifiant(org, (p ->> 'vetement_id')::uuid, (p ->> 'evenement_id')::uuid,
    (p ->> 'technologie')::public.technologie_id, p ->> 'valeur',
    coalesce((p ->> 'survenu_le')::timestamptz, now()), (p ->> 'lecteur_id')::uuid, 'app');
  return jsonb_build_object('statut', 'accepte', 'vetement_id', (p ->> 'vetement_id')::uuid);
end;
$$;

-- p : { evenement_id, identifiant_id, motif, survenu_le }
create function public.retirer_tag(org uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  existant uuid;
begin
  perform prive.exiger_enrolement(org);
  select e.vetement_id into existant from public.evenements e where e.id = (p ->> 'evenement_id')::uuid;
  if existant is not null then
    return jsonb_build_object('statut', 'doublon', 'vetement_id', existant);
  end if;
  return jsonb_build_object('statut', 'accepte', 'vetement_id',
    prive.retirer_identifiant(org, (p ->> 'identifiant_id')::uuid, (p ->> 'evenement_id')::uuid, p ->> 'motif',
      coalesce((p ->> 'survenu_le')::timestamptz, now()), 'app'));
end;
$$;

-- Remplacement atomique : retrait de l'ancien tag puis pose du nouveau, deux événements.
-- p : { evenement_retrait_id, evenement_pose_id, identifiant_id, motif, technologie, valeur, survenu_le, lecteur_id }
create function public.remplacer_tag(org uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  vetement uuid;
  quand timestamptz := coalesce((p ->> 'survenu_le')::timestamptz, now());
begin
  perform prive.exiger_enrolement(org);
  select e.vetement_id into vetement from public.evenements e where e.id = (p ->> 'evenement_pose_id')::uuid;
  if vetement is not null then
    return jsonb_build_object('statut', 'doublon', 'vetement_id', vetement);
  end if;
  vetement := prive.retirer_identifiant(org, (p ->> 'identifiant_id')::uuid, (p ->> 'evenement_retrait_id')::uuid,
    p ->> 'motif', quand, 'app');
  perform prive.poser_identifiant(org, vetement, (p ->> 'evenement_pose_id')::uuid,
    (p ->> 'technologie')::public.technologie_id, p ->> 'valeur', quand, (p ->> 'lecteur_id')::uuid, 'app');
  return jsonb_build_object('statut', 'accepte', 'vetement_id', vetement);
end;
$$;

-- Import de l'existant : chaque ligne est enrôlée indépendamment (une ligne refusée
-- n'annule pas les autres). lignes : [{ ligne, ...p d'enroler_vetement }]
-- Réponse : [{ ligne, statut: 'cree' | 'doublon' | 'rejete', motif?, vetement_id? }]
create function public.importer_vetements(org uuid, lignes jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  l jsonb;
  existant uuid;
  resultat jsonb := '[]'::jsonb;
begin
  perform prive.exiger_enrolement(org);
  if jsonb_array_length(lignes) > 1000 then
    raise exception 'Import limité à 1000 lignes par envoi' using errcode = 'program_limit_exceeded';
  end if;
  for l in select * from jsonb_array_elements(lignes) loop
    select e.vetement_id into existant from public.evenements e where e.id = (l ->> 'evenement_id')::uuid;
    if existant is not null then
      resultat := resultat || jsonb_build_object('ligne', l -> 'ligne', 'statut', 'doublon', 'vetement_id', existant);
      continue;
    end if;
    begin
      resultat := resultat || jsonb_build_object('ligne', l -> 'ligne', 'statut', 'cree',
        'vetement_id', prive.enroler(org, l, 'import'));
    exception when others then
      resultat := resultat || jsonb_build_object('ligne', l -> 'ligne', 'statut', 'rejete', 'motif', sqlerrm);
    end;
  end loop;
  return resultat;
end;
$$;

revoke all on function
  prive.exiger_enrolement(uuid),
  prive.poser_identifiant(uuid, uuid, uuid, public.technologie_id, text, timestamptz, uuid, public.source_evenement),
  prive.retirer_identifiant(uuid, uuid, uuid, text, timestamptz, public.source_evenement),
  prive.enroler(uuid, jsonb, public.source_evenement)
  from public, anon, authenticated;

revoke all on function
  public.enroler_vetement(uuid, jsonb), public.poser_tag(uuid, jsonb), public.retirer_tag(uuid, jsonb),
  public.remplacer_tag(uuid, jsonb), public.importer_vetements(uuid, jsonb)
  from public, anon;
grant execute on function
  public.enroler_vetement(uuid, jsonb), public.poser_tag(uuid, jsonb), public.retirer_tag(uuid, jsonb),
  public.remplacer_tag(uuid, jsonb), public.importer_vetements(uuid, jsonb)
  to authenticated;

commit;
