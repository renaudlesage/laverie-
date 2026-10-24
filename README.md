# suivi-linge

Traçabilité du linge professionnel et de ses passages en laverie, multi-technologie (code-barres, QR, DataMatrix, NFC, puis RFID UHF). Premier marché : les zones de secours.

> Statut : **jalons M0 à M3 livrés** (socle PWA et connexion ; schéma, RLS et tests ; référentiels ; lecture QR, code-barres, NFC et douchettes). Prochaine étape : M4, enrôlement et étiquettes.

## Documents

| Fichier | Contenu |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | Briefing pour Claude Code : pile, invariants, conventions, ce qu'il ne faut pas faire |
| [`docs/CONCEPT.md`](docs/CONCEPT.md) | Concept fonctionnel : décisions, acteurs, cycle de vie, identification, modèle de données, flux, règles, architecture |
| [`docs/BACKLOG-V1.md`](docs/BACKLOG-V1.md) | Jalons M0 → M9 avec critères d'acceptation |

## Pile prévue

React + Vite (PWA) · Supabase (Postgres, Auth, RLS, Realtime, Storage) · Vercel.

## Démarrage

### Variables d'environnement

Copier `.env.example` en `.env` (fichier caché : activer « afficher les fichiers cachés » pour le voir) et renseigner :

| Variable | Où la trouver |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → clé `anon` / publishable |
| `VITE_URL_PUBLIQUE` | URL de l'app déployée (ex. `https://suivi-linge.vercel.app`), base des QR |

Sans ces variables, l'app affiche un écran « Configuration incomplète » au lieu de planter.

### StackBlitz

Ouvrir `https://stackblitz.com/github/<compte>/<depot>`, créer le fichier `.env`, puis `npm install` et `npm run dev` (lancés automatiquement en général).

### Vercel

1. *Add New → Project*, importer ce dépôt GitHub (préréglage **Vite** détecté).
2. *Settings → Environment Variables* : ajouter les trois variables ci-dessus, puis redéployer.
3. Dans Supabase, *Authentication → URL Configuration* : mettre l'URL Vercel en **Site URL** et l'ajouter aux **Redirect URLs** (nécessaire pour le lien magique).

`vercel.json` renvoie toutes les routes (`/connexion`, `/v/<code>`…) vers l'app.

### Base de données

Dans Supabase → *SQL Editor* → *New query*, coller puis exécuter **un fichier à la fois, dans l'ordre** :

| Ordre | Fichier | Contenu |
| --- | --- | --- |
| 1 | `supabase/migrations/0001_socle.sql` | Enums, tables, index, contraintes, journal en ajout seul |
| 2 | `supabase/migrations/0002_rls.sql` | RLS, fonctions d'aide (`prive.est_membre`, `prive.a_role`…), droits, vue `porteurs_anonymises` |
| 3 | `supabase/migrations/0003_seeds.sql` | Traitements par défaut créés avec chaque organisation |
| 4 | `supabase/migrations/0004_notices.sql` | Bucket privé `notices` et ses règles d'accès |
| 5 | `supabase/migrations/0005_membres.sql` | Invitations, ajout de membres par e-mail, protection du dernier admin |

Puis vérifier avec `supabase/tests/rls.sql` : la dernière ligne doit afficher « Tous les tests RLS sont passés ». Le test travaille dans une transaction annulée, il ne laisse aucune donnée.

### Comptes et première organisation

La création de compte n'est pas ouverte au public.

1. Créer l'utilisateur dans *Authentication → Users → Add user* (cocher *Auto Confirm User*).
2. Ouvrir `supabase/amorcage.sql`, remplacer le nom de l'organisation et l'e-mail, l'exécuter dans le SQL Editor : l'organisation est créée avec ses traitements par défaut et l'utilisateur en devient l'administrateur.

Ensuite, tout se fait dans l'app : *Paramètres → Membres → Ajouter*. Si la personne a déjà un compte, elle devient membre tout de suite ; sinon une invitation l'attend et devient une adhésion à sa première connexion par **« Lien par e-mail »** sur l'écran de connexion.

Pour que ce lien fonctionne, laisser activé *Authentication → Sign In / Providers → Allow new users to sign up*. Un compte créé sans invitation ne voit aucune donnée (il n'appartient à aucune organisation).

### Configurer une zone (jalon M2)

*Paramètres* (admin) : créer les **sites** (postes, laverie interne, laverie externe), vérifier les **traitements**, créer les **articles** — limites par traitement, notice PDF, puis *Activer l'article* —, saisir ou **importer les porteurs** (CSV : `matricule;nom;prenom;casier;site`), déclarer les **lecteurs** et ajouter les **membres**.

### Scanner (jalon M3)

Onglet **Scanner** : mode **unitaire** (un scan ouvre la fiche) ou **rafale** (liste sans doublon, compteurs lus / attendus / inconnus). Chaque lecture est tracée dans `lectures_brutes`, même inconnue.

- **Caméra** : QR, DataMatrix et codes-barres (Code 128, EAN…). Lecteur natif du navigateur si disponible, sinon décodeur intégré.
- **Douchette** (Bluetooth ou USB) : à configurer en mode **clavier (HID)**, avec **Entrée** en suffixe, et sur la **même disposition de clavier que le téléphone** (AZERTY belge le plus souvent) — sinon les chiffres arrivent en symboles. Déclarer la douchette dans *Paramètres → Lecteurs* avec la technologie qu'elle lit, puis la choisir sous « Lecteur de cet appareil » sur l'écran de scan.
- **NFC** : Chrome sur Android uniquement (bouton absent ailleurs). Lit l'UID du tag.
- **Appareil photo du téléphone** : un QR de l'app (`https://<app>/v/<code>`) ouvre directement la fiche, après connexion.
- Code inconnu : l'enrôlement est proposé aux admins et gestionnaires (formulaire au jalon M4).

### Tests

`npm test` lance les tests Vitest (normalisation des identifiants, détection des douchettes, résolution, lecture CSV, import, messages d'erreur).

### Installer sur Android

Ouvrir l'URL Vercel dans Chrome → menu ⋮ → *Installer l'application*.

## Structure

```
src/
  lib/supabase.js            client Supabase
  auth/                      session, connexion mot de passe / lien magique
  organisation/              adhésions et organisation courante
  connexion/                 état réseau, file d'attente (vide jusqu'à M7)
  composants/                gabarit, indicateur de connexion, protections de routes
  pages/                     connexion, choix d'organisation, accueil, paramètres, /v/:code
  referentiels/              écrans sites, traitements, articles, porteurs (+ import CSV), lecteurs, membres
  identification/            adaptateurs caméra, NFC, douchette ; normaliser(), resoudre() ; scan unitaire et rafale
  vetements/                 fiche vêtement, entrée de l'enrôlement
public/                      icônes PWA
supabase/
  migrations/                à exécuter dans l'ordre dans le SQL Editor
  tests/rls.sql              tests d'isolation et d'immuabilité du journal
  tests/local/               outillage pour un Postgres local (ne pas exécuter dans Supabase)
  amorcage.sql               créer une organisation et son premier admin
```

## Avancer avec Claude Code

1. Ouvrir ce dépôt dans Claude Code.
2. Demander : « Lis CLAUDE.md et docs/, puis réalise le jalon suivant du backlog. »
3. Avancer jalon par jalon ; exécuter les migrations SQL fournies dans le SQL Editor de Supabase, dans l'ordre.
