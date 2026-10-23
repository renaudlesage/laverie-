-- 0001_socle.sql — Enums, tables, index et contraintes (docs/CONCEPT.md §5 et §7).
-- À coller tel quel dans le SQL Editor de Supabase, sur un projet vide, avant 0002.
--
-- Isolation : chaque table métier porte organisation_id ; les références entre tables passent
-- par des clés étrangères composites (organisation_id, id) pour qu'une ligne ne puisse jamais
-- pointer vers une autre organisation.

begin;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.type_organisation as enum ('zone_secours', 'autre');

create type public.role_membre as enum (
  'admin', 'gestionnaire', 'porteur', 'operateur_laverie', 'laverie_externe', 'auditeur'
);

create type public.type_site as enum ('poste', 'magasin', 'laverie_interne', 'laverie_externe');

create type public.circuit_traitement as enum ('standard', 'contamine', 'les_deux');

create type public.circuit as enum ('standard', 'contamine');

create type public.statut_vetement as enum (
  'en_stock', 'en_service', 'a_decontaminer', 'collecte', 'en_laverie', 'en_traitement',
  'traite', 'a_reparer', 'pret', 'reforme', 'perdu'
);

create type public.technologie_id as enum ('code_barres', 'qr', 'datamatrix', 'nfc', 'uhf');

create type public.type_lot as enum ('sac_collecte', 'traitement', 'livraison');

create type public.statut_lot as enum ('ouvert', 'ferme', 'expedie', 'receptionne', 'cloture', 'avorte');

create type public.type_evenement as enum (
  'enrolement', 'tag_pose', 'tag_retire', 'attribution', 'restitution', 'contamination',
  'collecte', 'reception', 'ajout_lot', 'retrait_lot', 'traitement', 'controle', 'reparation',
  'livraison', 'vu_en_inventaire', 'perte', 'retrouve', 'reforme', 'annulation'
);

create type public.source_evenement as enum ('app', 'import', 'passerelle');

create type public.type_lecteur as enum ('camera', 'clavier', 'nfc_web', 'passerelle_uhf', 'portique');

create type public.mode_lecteur as enum ('unitaire', 'masse');

create type public.type_alerte as enum (
  'seuil_preventif', 'seuil_atteint', 'age_maximal', 'usure_tag', 'non_revenu',
  'ecart_reception', 'melange_circuits'
);

create type public.niveau_alerte as enum ('info', 'attention', 'critique');

-- ---------------------------------------------------------------------------
-- Organisations, sites, membres
-- ---------------------------------------------------------------------------

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (btrim(nom) <> ''),
  type public.type_organisation not null default 'zone_secours',
  reglages jsonb not null default '{}'::jsonb,
  cree_le timestamptz not null default now()
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  nom text not null check (btrim(nom) <> ''),
  type public.type_site not null,
  adresse text,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, nom)
);

create table public.membres (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.role_membre not null,
  site_id uuid,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  unique (organisation_id, user_id),
  foreign key (organisation_id, site_id) references public.sites (organisation_id, id),
  constraint membres_laverie_externe_site check (role <> 'laverie_externe' or site_id is not null)
);

create index membres_user_id_idx on public.membres (user_id) where actif;

-- Un membre « laverie_externe » est rattaché à un site de type laverie_externe.
create function public.verifier_membre() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.role = 'laverie_externe' and not exists (
    select 1 from public.sites s where s.id = new.site_id and s.type = 'laverie_externe'
  ) then
    raise exception 'Un membre laverie_externe doit être rattaché à un site de type laverie_externe'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger membres_verifier before insert or update on public.membres
  for each row execute function public.verifier_membre();

-- ---------------------------------------------------------------------------
-- Référentiels : traitements, articles, limites, porteurs, lecteurs
-- ---------------------------------------------------------------------------

create table public.traitements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  libelle text not null check (btrim(libelle) <> ''),
  circuit public.circuit_traitement not null default 'standard',
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, code)
);

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  designation text not null check (btrim(designation) <> ''),
  fabricant text,
  reference text,
  norme text,
  duree_vie_mois integer check (duree_vie_mois > 0),
  notice_chemin text,
  actif boolean not null default false,
  cree_le timestamptz not null default now(),
  unique (organisation_id, id)
);

create table public.articles_limites (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  article_id uuid not null,
  traitement_id uuid not null,
  limite integer not null check (limite > 0),
  seuil_alerte_pct integer not null default 80 check (seuil_alerte_pct between 1 and 100),
  cree_le timestamptz not null default now(),
  unique (article_id, traitement_id),
  foreign key (organisation_id, article_id) references public.articles (organisation_id, id) on delete cascade,
  foreign key (organisation_id, traitement_id) references public.traitements (organisation_id, id)
);

-- Invariant 9 : un article n'est actif qu'avec au moins une limite par traitement et sa notice.
create function public.verifier_article_activable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.actif then
    if new.notice_chemin is null or btrim(new.notice_chemin) = '' then
      raise exception 'Article non activable : notice fabricant manquante'
        using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.articles_limites l where l.article_id = new.id) then
      raise exception 'Article non activable : aucune limite par traitement'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger articles_verifier_activation before insert or update on public.articles
  for each row execute function public.verifier_article_activable();

-- Retirer la dernière limite d'un article actif est refusé.
create function public.proteger_derniere_limite() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.articles a where a.id = old.article_id and a.actif)
     and not exists (
       select 1 from public.articles_limites l where l.article_id = old.article_id and l.id <> old.id
     ) then
    raise exception 'Impossible de retirer la dernière limite d''un article actif : désactivez-le d''abord'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

create trigger articles_limites_proteger before delete on public.articles_limites
  for each row execute function public.proteger_derniere_limite();

create table public.porteurs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  matricule text not null check (btrim(matricule) <> ''),
  nom text,
  prenom text,
  casier text,
  site_id uuid,
  user_id uuid references auth.users (id) on delete set null,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, matricule),
  foreign key (organisation_id, site_id) references public.sites (organisation_id, id)
);

create index porteurs_user_id_idx on public.porteurs (user_id) where user_id is not null;

create table public.lecteurs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  nom text not null check (btrim(nom) <> ''),
  type public.type_lecteur not null,
  technologie_defaut public.technologie_id,
  site_id uuid,
  mode public.mode_lecteur not null default 'unitaire',
  cle_api_hash text,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  unique (organisation_id, id),
  foreign key (organisation_id, site_id) references public.sites (organisation_id, id)
);

-- ---------------------------------------------------------------------------
-- Lots : sacs de collecte, lots de traitement, livraisons
-- ---------------------------------------------------------------------------

create table public.lots (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  type public.type_lot not null,
  circuit public.circuit not null default 'standard',
  site_id uuid,
  site_destination_id uuid,
  traitement_id uuid,
  programme text,
  machine text,
  statut public.statut_lot not null default 'ouvert',
  ouvert_le timestamptz not null default now(),
  cloture_le timestamptz,
  quantite_attendue integer check (quantite_attendue >= 0),
  cree_le timestamptz not null default now(),
  unique (organisation_id, id),
  foreign key (organisation_id, site_id) references public.sites (organisation_id, id),
  foreign key (organisation_id, site_destination_id) references public.sites (organisation_id, id),
  foreign key (organisation_id, traitement_id) references public.traitements (organisation_id, id),
  constraint lots_traitement_obligatoire check (type <> 'traitement' or traitement_id is not null)
);

create index lots_site_idx on public.lots (organisation_id, site_id);
create index lots_site_destination_idx on public.lots (organisation_id, site_destination_id);

-- Invariant 7 : un lot de traitement n'utilise qu'un traitement compatible avec son circuit.
create function public.verifier_lot_circuit() returns trigger
language plpgsql set search_path = '' as $$
declare
  circuit_du_traitement public.circuit_traitement;
begin
  if new.traitement_id is not null then
    select t.circuit into circuit_du_traitement from public.traitements t where t.id = new.traitement_id;
    if circuit_du_traitement <> 'les_deux' and circuit_du_traitement::text <> new.circuit::text then
      raise exception 'Traitement incompatible avec le circuit % du lot', new.circuit
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger lots_verifier_circuit before insert or update on public.lots
  for each row execute function public.verifier_lot_circuit();

-- ---------------------------------------------------------------------------
-- Vêtements et projections
-- ---------------------------------------------------------------------------

create table public.vetements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  article_id uuid not null,
  taille text,
  numero_serie text,
  mis_en_service_le date,
  nominatif boolean not null default false,
  -- Projections du journal (invariant 3) : jamais modifiées directement.
  statut public.statut_vetement not null default 'en_stock',
  contamine boolean not null default false,
  site_id uuid,
  porteur_id uuid,
  lot_id uuid,
  derniere_lecture_le timestamptz,
  controle_renforce boolean not null default false,
  cree_le timestamptz not null default now(),
  unique (organisation_id, id),
  foreign key (organisation_id, article_id) references public.articles (organisation_id, id),
  foreign key (organisation_id, site_id) references public.sites (organisation_id, id),
  foreign key (organisation_id, porteur_id) references public.porteurs (organisation_id, id),
  foreign key (organisation_id, lot_id) references public.lots (organisation_id, id)
);

create index vetements_site_idx on public.vetements (organisation_id, site_id);
create index vetements_statut_idx on public.vetements (organisation_id, statut);
create index vetements_porteur_idx on public.vetements (porteur_id) where porteur_id is not null;
create index vetements_lot_idx on public.vetements (lot_id) where lot_id is not null;

create table public.vetements_limites (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  vetement_id uuid not null,
  traitement_id uuid not null,
  limite integer not null check (limite > 0),
  cree_le timestamptz not null default now(),
  unique (vetement_id, traitement_id),
  foreign key (organisation_id, vetement_id) references public.vetements (organisation_id, id) on delete cascade,
  foreign key (organisation_id, traitement_id) references public.traitements (organisation_id, id)
);

create table public.compteurs (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  vetement_id uuid not null,
  traitement_id uuid not null,
  passages integer not null default 0 check (passages >= 0),
  cree_le timestamptz not null default now(),
  primary key (vetement_id, traitement_id),
  foreign key (organisation_id, vetement_id) references public.vetements (organisation_id, id) on delete cascade,
  foreign key (organisation_id, traitement_id) references public.traitements (organisation_id, id)
);

-- ---------------------------------------------------------------------------
-- Identifiants (invariant 1 : vêtement ≠ identifiant)
-- ---------------------------------------------------------------------------

create table public.identifiants (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  vetement_id uuid not null,
  technologie public.technologie_id not null,
  valeur text not null check (valeur <> ''),
  actif boolean not null default true,
  pose_le timestamptz not null default now(),
  retire_le timestamptz,
  motif_retrait text,
  passages_depuis_pose integer not null default 0 check (passages_depuis_pose >= 0),
  cree_le timestamptz not null default now(),
  foreign key (organisation_id, vetement_id) references public.vetements (organisation_id, id) on delete cascade,
  constraint identifiants_retrait_coherent check (actif = (retire_le is null))
);

create unique index identifiants_actifs_uniques
  on public.identifiants (organisation_id, technologie, valeur) where actif;
create index identifiants_valeur_idx on public.identifiants (organisation_id, valeur);
create index identifiants_vetement_idx on public.identifiants (vetement_id);

-- ---------------------------------------------------------------------------
-- Journal des événements : source de vérité, en ajout seul (invariant 2)
-- ---------------------------------------------------------------------------

create table public.evenements (
  id uuid primary key default gen_random_uuid(), -- UUID produit sur l'appareil (invariant 5)
  organisation_id uuid not null references public.organisations (id),
  vetement_id uuid not null,
  type public.type_evenement not null,
  survenu_le timestamptz not null,               -- horloge de l'appareil
  recu_le timestamptz not null default now(),    -- horloge du serveur
  site_id uuid,
  lot_id uuid,
  lecteur_id uuid,
  auteur_id uuid,                                -- auth.users, sans clé étrangère : le journal survit au compte
  source public.source_evenement not null default 'app',
  donnees jsonb not null default '{}'::jsonb,
  annule_par uuid,
  unique (organisation_id, id),
  foreign key (organisation_id, vetement_id) references public.vetements (organisation_id, id),
  foreign key (organisation_id, site_id) references public.sites (organisation_id, id),
  foreign key (organisation_id, lot_id) references public.lots (organisation_id, id),
  foreign key (organisation_id, lecteur_id) references public.lecteurs (organisation_id, id),
  foreign key (organisation_id, annule_par) references public.evenements (organisation_id, id),
  constraint evenements_traitement_avec_lot check (type <> 'traitement' or lot_id is not null)
);

-- Invariant 4 : un vêtement ne compte jamais deux fois pour le même lot.
create unique index evenements_traitement_unique
  on public.evenements (vetement_id, lot_id) where type = 'traitement' and annule_par is null;

create index evenements_vetement_idx on public.evenements (vetement_id, survenu_le);
create index evenements_lot_idx on public.evenements (lot_id) where lot_id is not null;
create index evenements_recu_idx on public.evenements (organisation_id, recu_le);

-- Aucune modification ni suppression, pour personne (admin et propriétaire compris).
-- Seule exception : renseigner une fois annule_par avec l'id de l'événement « annulation »
-- du même vêtement, sans toucher à aucune autre colonne.
create function public.proteger_evenements() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE'
     and old.annule_par is null
     and new.annule_par is not null
     and (to_jsonb(new) - 'annule_par') = (to_jsonb(old) - 'annule_par')
     and exists (
       select 1 from public.evenements a
       where a.id = new.annule_par and a.type = 'annulation' and a.vetement_id = old.vetement_id
     ) then
    return new;
  end if;
  raise exception 'Journal des événements en ajout seul : % interdit. Corriger par un événement « annulation ».', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger evenements_ajout_seul before update or delete on public.evenements
  for each row execute function public.proteger_evenements();
create trigger evenements_pas_de_truncate before truncate on public.evenements
  for each statement execute function public.proteger_evenements();

-- ---------------------------------------------------------------------------
-- Lectures brutes et alertes
-- ---------------------------------------------------------------------------

create table public.lectures_brutes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  lecteur_id uuid,
  technologie public.technologie_id,
  valeur text not null,
  lu_le timestamptz not null default now(),
  vetement_id uuid,
  contexte jsonb not null default '{}'::jsonb,
  auteur_id uuid default auth.uid(),
  cree_le timestamptz not null default now(),
  foreign key (organisation_id, lecteur_id) references public.lecteurs (organisation_id, id),
  foreign key (organisation_id, vetement_id) references public.vetements (organisation_id, id)
);

create index lectures_brutes_lu_idx on public.lectures_brutes (organisation_id, lu_le);
create index lectures_brutes_non_resolues_idx
  on public.lectures_brutes (organisation_id, valeur) where vetement_id is null;

create table public.alertes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  vetement_id uuid,
  lot_id uuid,
  type public.type_alerte not null,
  niveau public.niveau_alerte not null default 'attention',
  message text not null,
  ouverte_le timestamptz not null default now(),
  close_le timestamptz,
  close_par uuid,
  cree_le timestamptz not null default now(),
  foreign key (organisation_id, vetement_id) references public.vetements (organisation_id, id) on delete cascade,
  foreign key (organisation_id, lot_id) references public.lots (organisation_id, id) on delete cascade
);

create index alertes_ouvertes_idx on public.alertes (organisation_id, ouverte_le) where close_le is null;

commit;
