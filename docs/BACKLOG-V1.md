# Backlog V1 — ordre de travail pour Claude Code

Chaque jalon se termine par une démo utilisable et la liste des migrations à exécuter. Ne pas commencer un jalon avant que le précédent passe ses critères d'acceptation.

Règle transversale : **toute écriture métier passe par la file d'événements locale puis par `ingerer_evenements`** dès le jalon M5 — pas d'appel direct aux tables depuis les écrans.

---

## M0 — Socle du projet

- Projet Vite + React, PWA (`vite-plugin-pwa`), React Router, client Supabase.
- `.env.example`, `.gitignore`, `README` de démarrage (StackBlitz + Vercel).
- Authentification Supabase (e-mail + mot de passe ou lien magique), sélecteur d'organisation, gabarit d'écran mobile d'abord.
- Indicateur de connexion et de file en attente (vide pour l'instant).

**Accepté quand** : l'app se déploie sur Vercel, s'installe comme PWA sur Android, un utilisateur se connecte et choisit son organisation.

## M1 — Schéma et sécurité

- `0001_socle.sql` : enums, tables, index, contraintes (cf. `docs/CONCEPT.md` §7).
- `0002_rls.sql` : RLS sur toutes les tables ; fonctions d'aide `est_membre(org)`, `a_role(org, role)` ; aucune policy UPDATE/DELETE sur `evenements`.
- `0003_seeds.sql` : traitements par défaut (`lavage`, `sechage`, `nettoyage_sec`, `decontamination`) insérés à la création d'une organisation.
- `supabase/tests/rls.sql` : un membre d'une organisation ne lit rien d'une autre ; une laverie externe ne lit ni les noms des porteurs ni les vêtements non confiés ; personne ne peut modifier ou supprimer un événement.

**Accepté quand** : les migrations passent dans l'ordre dans le SQL Editor d'un projet vide et `rls.sql` ne lève aucune erreur.

## M2 — Référentiels (CRUD dans l'app)

- Sites, traitements, membres et rôles, porteurs, lecteurs.
- Articles : limites par traitement, seuil d'alerte, durée de vie, téléversement de la notice PDF (bucket privé `notices`) ; activation refusée sans limites ni notice.
- Import CSV des porteurs.

**Accepté quand** : un admin configure une zone complète (postes, laverie interne, laverie externe, 3 articles actifs) sans toucher au code ni au SQL.

## M3 — Couche d'identification

- Adaptateurs : caméra (`BarcodeDetector` puis repli `@zxing/browser`), émulation clavier, Web NFC (si `NDEFReader` existe).
- `normaliser()` et `resoudre()` avec tests Vitest (UID NFC avec deux-points, EPC, QR URL, code-barres avec espaces, casse).
- Composant de scan partagé : mode unitaire et mode rafale (dédoublonnage, compteurs lus / attendus / inconnus), retour sonore et vibration.
- Écriture de chaque lecture dans `lectures_brutes`.

**Accepté quand** : sur un téléphone Android, un QR, un code-barres via douchette Bluetooth en mode clavier et un tag NFC ouvrent chacun la bonne fiche ; un code inconnu propose l'enrôlement.

## M4 — Enrôlement, tags et reprise de l'existant

- Enrôlement d'un vêtement (article, taille, n° de série, nominatif ou non) avec un ou plusieurs identifiants.
- Génération et impression de planches d'étiquettes QR (code Crockford base32, URL `/v/<code>`).
- Pose, retrait et remplacement d'un tag avec motif ; historique conservé.
- Import CSV des vêtements et codes existants avec rapport (créés, doublons, formats non reconnus).

**Accepté quand** : un vêtement change de tag et garde tout son historique ; un import de 500 lignes produit un rapport exact.

## M5 — Journal, projections et fiche vêtement

- RPC `ingerer_evenements(jsonb)` : idempotente sur l'UUID client, valide les transitions de `docs/CONCEPT.md` §5, renvoie `accepte` / `doublon` / `rejete` + motif par événement.
- Triggers de projection (statut, contamine, site, porteur, lot, compteurs, `passages_depuis_pose`) et `recalculer_vetement(id)` qui rejoue le journal.
- Événement `annulation`.
- Fiche vêtement : statut, compteurs par traitement vs limites, identifiants, historique complet ; export CSV de la fiche de vie.
- Attribution, restitution, déclaration de contamination, perte, retrouvé, réforme.
- Tests SQL : rejouer deux fois le même lot d'événements ne change rien ; `recalculer_vetement` reproduit exactement la projection.

**Accepté quand** : aucune projection n'est modifiable autrement que par un événement, et les tests passent.

## M6 — Laverie (circuits standard et contaminé)

- Sacs de collecte (circuit standard ou contaminé), fermeture, expédition. Décision provisoire : un sac est un contenant réutilisable portant des identifiants comme un vêtement, chaque tournée est un lot `sac_collecte` rattaché au sac (`docs/CONCEPT.md` §2).
- Réception : rapprochement attendus / lus, tâches d'écart.
- Lots de traitement : ouverture (traitement, programme, machine), ajout et retrait, clôture avec comptage, clôture « avortée » sans comptage.
- Contrôle : conforme, à réparer, à réformer ; contrôle renforcé obligatoire pour les vêtements contaminés ou à leur limite.
- Préparation et livraison par poste ou par pompier.
- Refus de tout mélange de circuits.

**Accepté quand** : un scénario complet collecte → réception → lot → clôture → contrôle → livraison incrémente exactement de 1 le bon compteur, et un vêtement contaminé ne peut entrer dans aucun sac ni lot standard.

## M7 — Hors-ligne

- Service worker et cache de l'app.
- Index local (Dexie) du périmètre de l'utilisateur ; tirage incrémental.
- Application locale des règles bloquantes ; projection locale optimiste.
- Synchronisation ordonnée, reprise après coupure, écran « Conflits à résoudre ».

**Accepté quand** : en mode avion, un opérateur réceptionne un sac, constitue et clôture un lot, contrôle les pièces ; au retour du réseau tout se synchronise sans doublon ; un conflit volontaire (même vêtement clôturé dans deux lots sur deux appareils) est détecté et affiché.

## M8 — Alertes et tableau de bord

- Alertes : seuil préventif, seuil atteint, âge maximal, usure du tag, non revenu (tâche `pg_cron`), écart de réception, mélange de circuits.
- Tableau de bord par rôle : vêtements par statut, en fin de vie, en laverie depuis plus de N jours, alertes ouvertes.
- Realtime sur les écrans de laverie.

**Accepté quand** : chaque type d'alerte se déclenche et se clôt sur un jeu de données de test.

## M9 — Portail laverie externe

- Rôle `laverie_externe` rattaché à un site ; vues filtrées ; porteur par matricule ou casier uniquement.
- Prestataire multi-zones : bascule d'organisation.
- Tests d'étanchéité dédiés.

**Accepté quand** : un compte prestataire ne voit jamais un vêtement non confié ni un nom de pompier, y compris hors-ligne dans l'index local.

---

## Pilote

Zone pilote encore à choisir. Avant le pilote : inventaire des étiquettes et lecteurs existants, saisie des articles et de leurs limites, formation des magasiniers et de la laverie.
Critère de sortie de V1 : **aucun double comptage** sur la durée du pilote.
