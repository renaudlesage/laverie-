# suivi-linge

Traçabilité du linge professionnel et de ses passages en laverie, multi-technologie (code-barres, QR, DataMatrix, NFC, puis RFID UHF). Premier marché : les zones de secours.

> Statut : **jalon M0 livré** (socle PWA, connexion, choix d'organisation). Prochaine étape : M1, schéma et sécurité.

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

### Comptes

La création de compte n'est pas ouverte au public : créer les utilisateurs dans Supabase (*Authentication → Users → Add user*). Le choix d'organisation lit la table `membres`, créée au jalon M1 ; avant cela, l'écran l'indique.

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
  pages/                     connexion, choix d'organisation, accueil, /v/:code
public/                      icônes PWA
```

## Avancer avec Claude Code

1. Ouvrir ce dépôt dans Claude Code.
2. Demander : « Lis CLAUDE.md et docs/, puis réalise le jalon M0 du backlog. »
3. Avancer jalon par jalon ; exécuter les migrations SQL fournies dans le SQL Editor de Supabase, dans l'ordre.
