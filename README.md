# suivi-linge

Traçabilité du linge professionnel et de ses passages en laverie, multi-technologie (code-barres, QR, DataMatrix, NFC, puis RFID UHF). Premier marché : les zones de secours.

> Statut : **jalons M0 à M9 livrés — V1 complète** (socle PWA et connexion ; schéma, RLS et tests ; référentiels ; lecture QR, code-barres, NFC et douchettes ; enrôlement, étiquettes et import ; journal, projections, actions et fiche de vie ; laverie, circuits standard et contaminé ; fonctionnement hors ligne ; alertes et tableau de bord ; portail laverie externe). Prochaine étape : pilote sur une zone.

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
| 6 | `supabase/migrations/0006_enrolement.sql` | Enrôlement, pose / retrait / remplacement de tags, import de l'existant (chaque écriture journalisée) |
| 7 | `supabase/migrations/0007_reglages.sql` | Réglages de la zone : règle d'activation des articles, fenêtre anti-doublon |
| 8 | `supabase/migrations/0008_journal.sql` | Machine à états, `ingerer_evenements`, annulation, `recalculer_vetement` (rejeu du journal) |
| 9 | `supabase/migrations/0009_laverie.sql` | Sacs, collecte, réception, lots de traitement (comptage à la clôture), contrôle, livraison, `operer_lots` |
| 10 | `supabase/migrations/0010_synchro.sql` | Horodatage `modifie_le` pour le tirage incrémental, `signaler_melanges` (alertes des refus faits sur l'appareil) |
| 11 | `supabase/migrations/0011_alertes.sql` | Alertes automatiques (seuils, âge, usure des tags, non revenu), tâche horaire `pg_cron`, `tableau_de_bord`, diffusion en direct |
| 12 | `supabase/migrations/0012_porteurs.sql` | Restitution « libérée » (départ d'un porteur), `anonymiser_porteur` |

Puis vérifier avec `supabase/tests/rls.sql` (« Tous les tests RLS sont passés »), `supabase/tests/journal.sql` (« Tous les tests du journal sont passés »), `supabase/tests/laverie.sql` (« Tous les tests de la laverie sont passés ») `supabase/tests/synchro.sql` (« Tous les tests de la synchronisation sont passés »), `supabase/tests/alertes.sql` (« Tous les tests des alertes sont passés »), `supabase/tests/etancheite.sql` (« Tous les tests d'étanchéité sont passés ») et `supabase/tests/porteurs.sql` (« Tous les tests des porteurs sont passés »). Les tests travaillent dans une transaction annulée, ils ne laissent aucune donnée.

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

### Réglages de la zone

*Paramètres → Organisation* (admin) : nom de la zone, règle d'activation des articles (au moins une limite, ou une limite pour chaque traitement actif) et fenêtre anti-doublon des lectures. Les choix provisoires faits en attendant le terrain sont listés dans `docs/CONCEPT.md` §2.

### Enrôlement et étiquettes (jalon M4)

- **Étiquettes QR** (*Accueil → Imprimer des étiquettes QR*) : modèles A4 (14 à 65 étiquettes) et rouleaux (25 × 25 à 100 × 50 mm), ou **format personnalisé** saisi en mm (page, grille, étiquette, marges, écarts) et retenu sur l'appareil. Le contenu s'adapte (QR à côté ou au-dessus du code, code masqué si la place manque) ; un QR de moins de 12 mm est signalé, de moins de 8 mm refusé. *Réglage fin de l'imprimante* pour corriger un décalage. Chaque étiquette ne porte qu'un code opaque de 10 caractères et l'adresse `/v/<code>`. Imprimer à l'échelle 100 %. « Emplacements déjà utilisés » permet de reprendre une planche entamée.
- **Enrôler** : article actif, taille, n° de série, site, nominatif, puis un ou plusieurs identifiants — étiquette QR scannée, code-barres ou tag NFC existant, ou QR généré à imprimer ensuite. Un code inconnu scanné ouvre directement l'enrôlement.
- **Changer de tag** (fiche vêtement) : *Remplacer* ou *Retirer*, motif obligatoire. L'ancien tag reste dans l'historique ; les compteurs ne bougent pas.
- **Importer l'existant** (*Accueil → Importer l'existant*) : CSV avec `article` (désignation ou référence d'un article actif), `taille`, `n° de série`, `nominatif` (oui/non), `site`, `mise en service` (JJ/MM/AAAA) et les codes déjà posés `code_barres`, `qr`, `datamatrix`, `nfc`. Rapport avant import : à créer, doublons (en base ou dans le fichier), formats non reconnus, lignes invalides. Un import interrompu se relance sans créer de doublon.

### Journal et actions (jalon M5)

- Fiche vêtement → **Actions**, selon le statut : attribuer (à un pompier), restituer, déclarer contaminé, déclarer perdu, retrouvé, réformer (motif obligatoire). Contamination aussi possible par la laverie.
- Chaque action est un **événement** du journal, envoyé avec un identifiant produit sur l'appareil (aucun doublon si l'envoi est répété). Statut, site, porteur et compteurs en sont **déduits** : aucun écran ne les modifie directement.
- **Corriger une erreur** : *Annuler* sur le dernier événement de l'historique, avec un motif. Pour remonter plus loin, annuler à rebours. L'événement annulé reste visible, barré.
- **Attribution refusée** si une limite de passages ou l'âge maximal est atteint, sauf contrôle renforcé (jalon M6) ou réforme.
- **Exporter la fiche de vie (CSV)** : identité, passages, identifiants et historique complet, prêt pour Excel.

### Laverie (jalon M6)

Onglet **Laverie** (admin, gestionnaire, opérateur laverie, laverie externe) :

- **Sacs** (*Paramètres → Sacs*) : chaque sac a un nom, un circuit (standard ou contaminé) et un code (QR généré ou code existant), imprimable depuis l'écran. Un code désigne un seul objet : jamais à la fois un sac et un vêtement.
- **Collecte** (au poste) : scanner ou choisir le sac, *Ouvrir une tournée*, scanner les vêtements en rafale, *Mettre dans le sac*, puis *Fermer et expédier* vers une laverie.
- **Réception** : choisir la laverie de travail (retenue sur l'appareil ; imposée pour une laverie externe), scanner le sac reçu puis ses vêtements. Les manquants, les vêtements en trop et les codes inconnus deviennent des **alertes**.
- **Lots de traitement** : *Nouveau lot* (circuit, traitement compatible, programme, machine), ajout par scan, puis **Clôturer** — chaque vêtement gagne **un** passage sur le traitement du lot — ou **Avorter** (rien n'est compté).
- **Contrôle** : conforme, à réparer (puis *Réparé*), à réformer, motif obligatoire hors conformité. Le **contrôle renforcé** est exigé pour un vêtement contaminé ou ayant atteint une limite.
- **Livraison** : prêts à livrer regroupés par poste du pompier attitré (un clic par poste), ou livraison par scan vers un poste choisi.
- **Circuits séparés** : un vêtement contaminé est refusé dans un sac ou un lot standard, et inversement ; le refus crée une alerte *mélange de circuits*.

### Hors ligne (jalon M7)

- **L'app démarre sans réseau** une fois ouverte au moins une fois en ligne sur l'appareil (application en cache, dernières adhésions connues).
- **Index local** (IndexedDB) pour les rôles admin, gestionnaire, opérateur laverie et laverie externe : vêtements visibles, identifiants, compteurs, lots en cours et récents, sites, traitements, sacs, articles et limites, porteurs par **matricule et casier seulement**. Complet au premier démarrage puis une fois par jour, **incrémental** toutes les 30 secondes en ligne.
- **Toutes les écritures passent par la file de l'appareil**, même en ligne : règles bloquantes vérifiées sur place (transitions, circuits, contrôle renforcé, seuils), projection locale mise à jour tout de suite, puis envoi **dans l'ordre**. En ligne, l'écran attend quelques secondes la réponse de la base et l'affiche ; hors ligne, l'action reste « en attente » et part au retour du réseau, sans doublon (identifiant produit sur l'appareil).
- **Indicateur** sous l'en-tête : en ligne / hors ligne, nombre d'actions en attente, conflits. Un clic ouvre **Synchronisation** : état, « Synchroniser maintenant », et **Conflits à résoudre** — actions refusées par la base après coup (ex. même vêtement mis dans deux lots sur deux appareils : il n'est compté qu'une fois, le second ajout devient un conflit). *Réessayer* ou *Classer*.
- **Fiche vêtement hors ligne** : résumé tiré de l'index (statut, passages, identifiants) ; historique et gestion des tags au retour du réseau. Annulation, enrôlement et tags demandent une connexion.
- **Déconnexion** : l'index et la file de l'appareil sont effacés (appareil partagé) ; s'il reste des actions non envoyées, l'app le signale avant.

### Alertes et tableau de bord (jalon M8)

- **Accueil = tableau de bord** du périmètre de chacun (la laverie externe ne voit que ce qui lui est confié) : à surveiller (fin de vie, fin de vie proche, en laverie depuis trop longtemps, collectés non revenus), alertes ouvertes par type, vêtements par statut. Chaque chiffre mène à la liste. Mis à jour en direct.
- **Alertes automatiques**, ouvertes et fermées par la base :
  - *Fin de vie proche* : passages ≥ seuil d'alerte de la limite (par article et traitement, 80 % par défaut) ;
  - *Limite de passages atteinte* et *Âge maximal dépassé* (durée de vie de l'article) ;
  - *Tag à remplacer* : passages depuis la pose ≥ seuil d'usure de la **garantie du tag**, à saisir par technologie ;
  - *Non revenu* : collecté sans réception, ou en laverie, au-delà du délai réglé ;
  - *Écart de réception* et *Mélange de circuits* (jalon M6).
- Une alerte se **ferme d'elle-même** quand sa cause disparaît (réforme, tag remplacé, retour du vêtement, réglage modifié). **Acquitter** (admin, gestionnaire, opérateur laverie) la ferme sans qu'elle se rouvre pour la même cause.
- **Réglages** (*Paramètres → Organisation*) : garantie des tags par technologie, seuil d'usure, délais « non revenu ». Les alertes liées au temps sont réévaluées chaque heure (`pg_cron`).
- **En direct** : les écrans de laverie et le tableau de bord se mettent à jour quand un autre appareil travaille (Supabase Realtime).

### Portail laverie externe (jalon M9)

- **Ajouter un prestataire** : *Paramètres → Sites* (site de type « Laverie externe »), puis *Paramètres → Membres → Ajouter* avec le rôle **Laverie externe** et ce site.
- Le prestataire ne voit **que les vêtements qui lui sont confiés** : en route vers son site (sac expédié) ou chez lui. Une fois livré au poste, le vêtement disparaît de son périmètre — et de **l'index de son appareil** à la synchronisation suivante, y compris pour la résolution hors ligne.
- **Jamais un nom de pompier** : matricule et casier seulement, à l'écran comme dans la base locale de l'appareil.
- Écrans : tableau de bord de son périmètre, scanner, réception, lots, contrôle, livraison ; site de travail imposé. Pas de collecte, d'enrôlement ni de réglages.
- **Prestataire multi-zones** : un même compte peut être « Laverie externe » dans plusieurs zones (chaque zone l'ajoute avec son propre site). Écran de choix de la zone (rôle, site, actions en attente par zone), bouton **Changer** dans l'en-tête ; les actions en attente partent pour chaque zone, quelle que soit la zone affichée.

### Vêtements, porteurs, inventaire

- **Rechercher un vêtement** (*Accueil*) : par code (tag), n° de série ou taille, article, statut, site, matricule du porteur, contaminés. Les filtres restent dans l'adresse (favori, lien partagé). *Exporter (CSV)* la sélection.
- **Fiche porteur** (*Paramètres → Porteurs*, ou depuis la fiche d'un vêtement) : vêtements actuels et **historique de dotation** (qui a eu quoi, de quand à quand). Un compte « Porteur » relié à sa fiche voit **Mes vêtements**.
- **Départ d'un pompier** : sur sa fiche, *Départ du porteur* → chaque vêtement est **restitué** (un vêtement nominatif redevient banalisé et réattribuable, même s'il était déjà au stock) ou **réformé** ; un vêtement en laverie se traite à son retour. Puis **Anonymiser** : nom, prénom, casier et lien au compte effacés, matricule remplacé par un code `ANONYME-…`, fiche désactivée. L'historique des vêtements reste entier (il ne contient que l'identifiant opaque). Irréversible. Pensez à retirer aussi son compte dans *Paramètres → Membres* s'il en avait un.
- **Inventaire** (*Accueil → Faire un inventaire*, admin, gestionnaire, opérateur laverie) : choisir le site, scanner tout ce qui s'y trouve, valider. Rapport : présents, **trouvés en plus** (rattachés ailleurs ou perdus), **manquants** ; *Déclarer les manquants perdus*, *Remettre en stock les perdus retrouvés*, export CSV. Fonctionne **hors ligne**.

### Tests

`npm test` lance les tests Vitest (normalisation des identifiants, détection des douchettes, résolution, lecture CSV, import, messages d'erreur, règles sur l'appareil, file et synchronisation hors ligne).

### Installer sur Android

Ouvrir l'URL Vercel dans Chrome → menu ⋮ → *Installer l'application*.

## Structure

```
src/
  lib/supabase.js            client Supabase
  auth/                      session, connexion mot de passe / lien magique
  organisation/              adhésions et organisation courante
  connexion/                 état réseau et de la synchronisation
  composants/                gabarit, indicateur de connexion, protections de routes
  pages/                     connexion, choix d'organisation, accueil, paramètres, /v/:code
  referentiels/              écrans sites, traitements, articles, porteurs (+ import CSV), lecteurs, membres
  identification/            adaptateurs caméra, NFC, douchette ; normaliser(), resoudre() ; scan unitaire et rafale
  vetements/                 enrôlement, fiche vêtement (tags, historique), import de l'existant
  etiquettes/                planches d'étiquettes QR
  laverie/                   collecte, réception, lots de traitement, contrôle, livraison
  journal/                   écriture des événements et des opérations de lots (via la file locale)
  alertes/                   tableau de bord, liste et acquittement des alertes
  porteurs/                  fiche porteur, historique de dotation, départ et anonymisation
  inventaire/                inventaire d'un site et écarts
  hors-ligne/                base locale (Dexie), règles sur l'appareil, file, synchronisation, conflits
public/                      icônes PWA
supabase/
  migrations/                à exécuter dans l'ordre dans le SQL Editor
  tests/rls.sql              tests d'isolation et d'immuabilité du journal
  tests/journal.sql          machine à états, idempotence, annulation, rejeu
  tests/laverie.sql          cycle laverie, comptage, circuits, écarts, contrôle renforcé
  tests/synchro.sql          tirage incrémental, deux appareils hors ligne, renvoi sans doublon
  tests/alertes.sql          ouverture et fermeture de chaque type d'alerte, acquittement, tableau de bord
  tests/etancheite.sql       prestataire multi-zones : vêtements confiés seulement, aucun nom, aucune écriture hors périmètre
  tests/porteurs.sql         départ d'un pompier, restitution libérée, anonymisation
  tests/local/               outillage pour un Postgres local (ne pas exécuter dans Supabase)
  amorcage.sql               créer une organisation et son premier admin
```

## Avancer avec Claude Code

1. Ouvrir ce dépôt dans Claude Code.
2. Demander : « Lis CLAUDE.md et docs/, puis réalise le jalon suivant du backlog. »
3. Avancer jalon par jalon ; exécuter les migrations SQL fournies dans le SQL Editor de Supabase, dans l'ordre.
