# suivi-linge

Traçabilité du linge professionnel et de ses passages en laverie, multi-technologie (code-barres, QR, DataMatrix, NFC, puis RFID UHF). Premier marché : les zones de secours.

> Statut : **conception terminée, développement V1 à démarrer.** Aucun code applicatif pour l'instant.

## Documents

| Fichier | Contenu |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | Briefing pour Claude Code : pile, invariants, conventions, ce qu'il ne faut pas faire |
| [`docs/CONCEPT.md`](docs/CONCEPT.md) | Concept fonctionnel : décisions, acteurs, cycle de vie, identification, modèle de données, flux, règles, architecture |
| [`docs/BACKLOG-V1.md`](docs/BACKLOG-V1.md) | Jalons M0 → M9 avec critères d'acceptation |

## Pile prévue

React + Vite (PWA) · Supabase (Postgres, Auth, RLS, Realtime, Storage) · Vercel.

## Démarrer avec Claude Code

1. Ouvrir ce dépôt dans Claude Code.
2. Demander : « Lis CLAUDE.md et docs/, puis réalise le jalon M0 du backlog. »
3. Avancer jalon par jalon ; exécuter les migrations SQL fournies dans le SQL Editor de Supabase, dans l'ordre.
