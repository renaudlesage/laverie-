# CLAUDE.md — Briefing pour Claude Code

Ce fichier est lu automatiquement par Claude Code. Il dit **quoi construire, comment, et ce qui ne se négocie pas**.
Le détail fonctionnel est dans [`docs/CONCEPT.md`](docs/CONCEPT.md), l'ordre de travail dans [`docs/BACKLOG-V1.md`](docs/BACKLOG-V1.md).

---

## 1. Le produit en trois phrases

Application web de **traçabilité du linge professionnel** : chaque vêtement a une identité numérique, chaque passage en laverie est un événement horodaté, et le nombre de passages par type de traitement se déduit du journal.
Elle accepte **plusieurs technologies d'identification** (code-barres, QR, DataMatrix, NFC, plus tard RFID UHF) sur un même vêtement.
Produit **multi-clients** ; premier marché : les **zones de secours** belges (pompiers), avec laveries internes **et** externes.

Nom de travail du dépôt : `suivi-linge`. Interface en **français**.

## 2. Comment travailler avec Ren

- Ren travaille **uniquement dans le navigateur** (StackBlitz, GitHub web, Supabase SQL Editor, Vercel). Pas d'environnement local.
  - Les migrations SQL doivent pouvoir être **collées telles quelles** dans le SQL Editor de Supabase, dans l'ordre des fichiers.
  - Toute étape de build hors navigateur (APK de la future passerelle UHF) passe par **GitHub Actions**.
- Livrer du **code complet et fonctionnel**, pas des extraits à appliquer à la main.
- Quand une livraison ajoute ou modifie un fichier caché (`.env`, `.env.example`, `.gitignore`), **le rappeler explicitement** : sans « afficher les fichiers cachés », l'upload web les ignore silencieusement.
- **Toutes les données se saisissent dans l'app** (formulaires CRUD). Jamais de données métier injectées en éditant un fichier source (`referentiels.js` ou équivalent). Les listes de référence sont des *seeds* SQL modifiables ensuite dans l'interface.
- Travailler **jalon par jalon** (voir backlog). À la fin de chaque jalon : résumé de ce qui marche, ce qui reste, et les migrations à exécuter.
- En cas de doute sur une règle métier, **demander** plutôt que deviner : Ren est expert du terrain (urgence, pompiers).

## 3. Pile technique

| Couche | Choix |
| --- | --- |
| Front | React + Vite, PWA (`vite-plugin-pwa`), routing React Router |
| Données locales | IndexedDB via Dexie (index hors-ligne + file d'événements) |
| Backend | Supabase : Postgres, Auth, RLS, RPC SQL, Realtime, Storage, `pg_cron` |
| Hébergement | Vercel (déploiement depuis ce dépôt) |
| Lecture caméra | `BarcodeDetector` natif si disponible, sinon `@zxing/browser` |
| NFC | Web NFC (`NDEFReader`), Chrome Android uniquement, détecté à l'exécution |
| Douchettes / lecteurs USB | Émulation clavier (capture globale, voir §6) |
| Tests | Vitest pour le JS ; scripts SQL de test dans `supabase/tests/` |

Variables d'environnement (fichier `.env.example` à fournir) : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_URL_PUBLIQUE` (base des URL encodées dans les QR).

## 4. Invariants — ne jamais les casser

1. **Vêtement ≠ identifiant.** Un vêtement porte 0..n identifiants ; un identifiant se remplace sans perdre l'historique.
2. **Le journal `evenements` est la source de vérité**, en ajout seul (ni UPDATE ni DELETE, y compris pour l'admin). Une erreur se corrige par un événement `annulation`.
3. **Le statut, le site, le porteur et les compteurs d'un vêtement sont des projections** du journal. Aucun écran, aucune RPC ne les modifie directement. Une fonction `recalculer_vetement(id)` doit pouvoir reconstruire la projection en rejouant le journal.
4. **Un passage n'est compté qu'à la clôture d'un lot de traitement**, +1 sur le compteur du traitement du lot. Un vêtement ne compte jamais deux fois pour le même lot (index unique partiel). Un lot avorté ne compte rien.
5. **Idempotence** : chaque événement reçoit son UUID sur l'appareil ; réingérer le même UUID ne produit aucun effet.
6. **Isolation** : RLS sur `organisation_id` sur toutes les tables. La laverie externe ne voit que les vêtements qui lui sont confiés, et jamais le nom d'un porteur (matricule ou casier seulement).
7. **Circuits séparés** : un vêtement contaminé ne peut entrer ni dans un sac ni dans un lot standard, et inversement. Vérifié sur l'appareil (hors-ligne) **et** revérifié au serveur.
8. **Aucune donnée personnelle sur un support** (tag, QR, code-barres) : uniquement un identifiant opaque.
9. **Un article n'est activable qu'avec ses limites par traitement et sa notice fabricant jointe.**
10. **La laverie fonctionne hors-ligne dès la V1** : toutes les écritures passent par la file locale, même en ligne.
11. **Pas de RFID UHF en V1.** Le modèle l'accepte (technologie `uhf`), mais aucun développement de passerelle avant la V2.

## 5. Modèle de données (résumé)

Le détail des colonnes et la machine à états sont dans `docs/CONCEPT.md` §5 et §6. Tables :
`organisations`, `membres`, `sites`, `traitements`, `articles`, `articles_limites`, `vetements`, `vetements_limites`, `compteurs`, `identifiants`, `porteurs`, `lots`, `evenements`, `lectures_brutes`, `lecteurs`, `alertes`.

Conventions SQL :
- noms de tables et colonnes en **français, snake_case, sans accents** ;
- clés primaires `uuid` (`gen_random_uuid()`), horodatages `timestamptz` ;
- chaque table métier porte `organisation_id` et `cree_le` ;
- enums Postgres pour les ensembles fermés (rôles, statuts, technologies, types d'événements) ;
- une migration par sujet, numérotée : `supabase/migrations/0001_socle.sql`, `0002_rls.sql`, … chacune entre `begin;` et `commit;` ;
- références entre tables par clés étrangères composites `(organisation_id, id)` : une ligne ne pointe jamais vers une autre organisation ;
- fonctions d'aide des policies dans le schéma `prive` (non exposé par l'API), `security definer` avec `set search_path = ''` ;
- Supabase accorde tous les droits par défaut sur les nouvelles tables : toute migration qui crée une table active la RLS, révoque tout à `anon`/`authenticated` puis accorde au plus juste (voir `0002_rls.sql`) ;
- toute nouvelle règle d'accès s'accompagne d'un cas dans `supabase/tests/rls.sql` ; tester en local avec `supabase/tests/local/imitation_supabase.sql`.

## 6. Couche d'identification

Une seule abstraction côté front : un **adaptateur** produit `{ technologie, valeur_brute, lecteur_id, lu_le }`, puis `normaliser()` produit la valeur canonique, puis `resoudre()` trouve le vêtement.

- Technologies : `code_barres`, `qr`, `datamatrix`, `nfc`, `uhf`.
- Normalisation :
  - UID NFC et EPC UHF → hexadécimal **majuscule sans séparateur** (`04:a2:…` → `04A2…`) ;
  - QR au format `${VITE_URL_PUBLIQUE}/v/<code>` → on garde `<code>` ;
  - codes-barres et QR existants → valeur lue, espaces et caractères de contrôle retirés, **casse conservée** ;
  - codes générés par l'app → 10 caractères Crockford base32 en majuscules.
- Émulation clavier : rafale de caractères à intervalle < 50 ms terminée par Entrée ou Tab ⇒ une lecture. La technologie vient du profil du lecteur déclaré ; à défaut, résolution sur la seule valeur et choix demandé si plusieurs correspondances.
- Web NFC : n'afficher le bouton NFC que si `'NDEFReader' in window`. Utiliser `serialNumber`. À valider sur les tags réels de la zone pilote.
- Toute lecture est d'abord écrite dans `lectures_brutes` ; un identifiant inconnu ouvre l'enrôlement, il n'est jamais perdu.
- La route publique `/v/:code` n'affiche **rien** sans session authentifiée et autorisée.

## 7. Interface

- Deux modes de scan partagés par tous les écrans : **unitaire** (un scan ouvre la fiche et les actions possibles selon le statut) et **rafale** (liste dédupliquée en direct, compteurs lus / attendus / inconnus, validation groupée).
- Usage en laverie et en caserne : **grandes cibles tactiles**, fort contraste, utilisable avec des gants, retour sonore et vibration à chaque lecture.
- Cohérence visuelle : la direction visuelle d'**Eventware** fait référence dans la famille de produits de Ren. Demander les tokens de design avant le premier écran ; à défaut, rester sobre et neutre pour pouvoir les appliquer ensuite.
- Indicateur permanent de connexion et du nombre d'événements en attente de synchronisation.

## 8. À ne pas faire

- Modifier `vetements.statut` (ou toute projection) par un UPDATE direct.
- Supprimer ou éditer une ligne de `evenements`.
- Mettre un nom, un matricule ou une donnée de santé dans un QR ou un tag.
- Coder la passerelle UHF, les portiques ou l'app iPhone (V2+).
- Le suivi d'exposition lié à un numéro d'intervention : **option non validée** (données liées à la santé, avis prévention + DPO requis). Ne pas l'implémenter sans feu vert de Ren.
- Inventer des limites de lavage, des durées de vie ou des prix : ces valeurs se saisissent dans l'app.
