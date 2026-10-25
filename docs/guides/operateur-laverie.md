# Mode d'emploi — Opérateur laverie Suivi linge

25 octobre 2026

L'opérateur laverie fait passer le linge dans le circuit : collecte au poste, réception, lots de traitement, contrôle et livraison. Chaque geste se fait en scannant ; l'application compte les passages et signale les écarts.

## 1. Premier accès

1. Ouvrir https://laverie-khaki.vercel.app sur le téléphone ou la tablette de la laverie.
2. Choisir **« Lien par e-mail »**, saisir l'adresse donnée à l'administrateur de la zone, puis cliquer sur le lien reçu.
3. Installer l'application (menu du navigateur → « Installer l'application » ou « Ajouter à l'écran d'accueil ») : elle s'ouvre alors comme une application, même sans réseau.
4. Ouvrir **Laverie** dans la barre de navigation, puis choisir la **Laverie de travail** : elle reste mémorisée sur l'appareil.

La ligne sous la navigation indique la connexion et les gestes en attente d'envoi (« EN LIGNE · RIEN EN ATTENTE »).

## 2. Le circuit en un coup d'œil

Chaque étape fait avancer le statut du vêtement. Un geste n'est accepté que si le vêtement a le bon statut.

| Étape (menu Laverie) | Statut avant | Statut après |
| --- | --- | --- |
| 1. Collecte | En service, En stock ou À décontaminer | Collecté |
| 2. Réception | Collecté | En laverie |
| 3. Lot de traitement (ajout) | En laverie | En traitement |
| 3. Lot clôturé | En traitement | Traité (+1 passage) |
| 3. Lot avorté | En traitement | En laverie (rien compté) |
| 4. Contrôle conforme | Traité | Prêt |
| 4. Contrôle à réparer, puis Réparé | Traité, puis À réparer | À réparer, puis Traité (à recontrôler) |
| 4. Contrôle à réformer | Traité | Réformé |
| 5. Livraison | Prêt | En service (attribué à un pompier) ou En stock |

## 3. Collecte au poste

1. Laverie → **Collecte**.
2. Scanner le **sac de collecte**, ou le choisir dans la liste : une **tournée** s'ouvre.
3. Scanner chaque vêtement mis dans le sac.
4. Choisir la **Laverie de destination**, puis expédier : le sac passe « Expédié, en route ».

Un sac est soit **standard**, soit **contaminé** (sac dédié, visuellement distinct). Un vêtement contaminé n'entre jamais dans un sac standard, et inversement : l'application refuse le scan.

## 4. Réception d'un sac

1. Laverie → **Réception**.
2. Scanner le **sac reçu**, ou le choisir parmi les sacs en route vers cette laverie.
3. Scanner chaque vêtement sorti du sac.
4. Valider : les vêtements passent « En laverie ». Les **manquants** sont signalés et une alerte « Écart de réception » s'ouvre.

Un sac qui n'est pas attendu dans cette laverie est refusé : vérifier la laverie de travail choisie.

## 5. Lots de traitement

Un lot, c'est un passage en machine : un traitement, un circuit, des vêtements.

1. Laverie → **Lots de traitement** → **Nouveau lot**.
2. Choisir le **traitement** (lavage, séchage…), le **circuit** (Standard ou Contaminé), et noter si besoin le **programme** et la **machine**.
3. Ouvrir le lot, puis scanner chaque vêtement mis en machine. Un vêtement mis par erreur se **retire** du lot.
4. Après le cycle :
    - **Clôturer le lot** : chaque vêtement gagne un passage pour ce traitement, le lot ne peut plus être modifié ;
    - **Avorter le lot** (avec un motif) si le cycle n'a pas été au bout : aucun passage n'est compté, les vêtements reviennent en attente de traitement.

Un vêtement n'est compté qu'une fois par lot. Le traitement doit être permis pour le circuit du lot : un lot contaminé n'accepte que les traitements prévus pour le circuit contaminé.

## 6. Contrôle après traitement

1. Laverie → **Contrôle** : la liste montre les vêtements traités à contrôler.
2. Scanner un vêtement, puis choisir le verdict :
    - **Conforme** : le vêtement passe « Prêt » ;
    - **À réparer** : motif à choisir (couture, fermeture, bande réfléchissante, accroc…) ;
    - **À réformer** : motif à choisir (déchirure, brûlure, contamination non traitable, fin de vie…).
3. Valider.

**Contrôle renforcé** : il est **obligatoire** pour un vêtement contaminé ou qui a atteint sa limite de passages (la fiche s'affiche en rouge). Faire le contrôle renforcé prévu par la procédure de la zone, puis cocher « Contrôle renforcé effectué » avant de valider « Conforme ».

**Après réparation** : dans la liste « À réparer », cliquer **Réparé** sur le vêtement. Il revient « Traité » et doit être recontrôlé.

## 7. Livraison

1. Laverie → **Livraison** : les vêtements prêts sont listés par poste.
2. Livrer, au choix :
    - tout le groupe d'un poste d'un coup (« Livrer ces N vêtement(s) à … ») ;
    - ou avec **Livrer par scan** : choisir le **poste de destination**, scanner les vêtements, puis valider.
3. Un vêtement attribué à un pompier repasse « En service » ; les autres passent « En stock » au poste.

## 8. Scanner efficacement

- **Caméra** : viser le code, à 10–20 cm, bien éclairé. **Douchette USB** : scanner directement, sans toucher l'écran. **NFC** : bouton NFC sur Chrome Android, approcher le tag du dos du téléphone.
- Chaque lecture fait un **bip et une vibration**. Le même code relu dans les 2 secondes n'est compté qu'une fois.
- **Code inconnu** : l'application le garde et propose de l'enrôler ; prévenir le gestionnaire si ce n'est pas votre rôle.
- **Étiquette abîmée** : saisir à la main le code imprimé en clair à côté du QR, ou utiliser un autre support du vêtement (NFC, code-barres).

## 9. Hors ligne

La laverie fonctionne sans réseau. Tous les gestes sont enregistrés sur l'appareil, puis envoyés dès le retour de la connexion ; l'indicateur affiche le nombre de gestes **en attente**.

Si un geste est refusé à l'envoi (par exemple, le vêtement a été traité entre-temps sur un autre appareil), l'indicateur le signale : l'ouvrir, lire le motif, et refaire le geste correct si besoin.

## 10. Problèmes fréquents

| Problème | Cause et solution |
| --- | --- |
| « Choisissez la laverie où vous travaillez » | Choisir la laverie de travail en haut de l'écran |
| Le sac n'apparaît pas en réception | Il n'a pas été expédié vers cette laverie, ou pas encore synchronisé |
| Scan refusé dans un sac ou un lot | Mélange de circuits (contaminé / standard), ou statut du vêtement qui ne permet pas ce geste |
| « Valider » grisé au contrôle | Contrôle renforcé non coché pour un vêtement qui l'exige, ou motif manquant |
| Un vêtement manque à la réception | Le valider quand même : l'écart est signalé et suivi par une alerte |
| Erreur de geste | Prévenir le gestionnaire ou l'administrateur : il l'annule dans l'historique du vêtement ; rien ne s'efface |
| « EN ATTENTE » ne redescend pas | Pas de réseau ; sinon ouvrir l'indicateur pour voir les gestes refusés |
