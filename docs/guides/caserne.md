# Mode d'emploi — Caserne Suivi linge

25 octobre 2026

À la caserne, l'application sert à remettre les tenues aux pompiers, à signaler une tenue contaminée après intervention, à envoyer le linge sale à la laverie et à faire l'inventaire du poste. Ce guide s'adresse au responsable habillement du poste (rôle Gestionnaire) ; la section 9 concerne les pompiers.

## 1. Qui fait quoi à la caserne

| Personne | Rôle dans l'app | Ce qu'elle fait |
| --- | --- | --- |
| Responsable habillement du poste | Gestionnaire | Attribuer, restituer, déclarer contaminé ou perdu, réformer, collecter, inventaire |
| Pompier | Porteur | Voir ses propres vêtements ; signale une contamination ou une perte au responsable |
| Chef de poste, officier | Auditeur (consultation) | Consulter les vêtements, alertes et rapports, sans rien modifier |

Les rôles sont donnés par l'administrateur de la zone. Un pompier ne déclare rien lui-même dans l'application : il prévient le responsable habillement.

## 2. Premier accès

1. Ouvrir https://laverie-khaki.vercel.app sur le téléphone ou la tablette du poste.
2. Choisir **« Lien par e-mail »**, saisir son adresse (celle donnée à l'administrateur de la zone), puis cliquer sur le lien reçu.
3. Installer l'application (menu du navigateur → « Installer l'application » ou « Ajouter à l'écran d'accueil »).

L'application fonctionne sans réseau : les gestes sont gardés sur l'appareil et envoyés dès le retour de la connexion. La ligne sous la navigation indique la connexion et les gestes en attente.

## 3. Scanner un vêtement

Tout commence par **Scanner** (barre de navigation) : caméra, douchette USB ou NFC (Chrome sur Android).

- En mode **Unitaire**, le scan ouvre la fiche du vêtement : article, taille, statut, porteur, compteurs de passages, et les **actions possibles** selon son statut.
- En mode **Rafale**, plusieurs vêtements sont scannés à la suite (inventaire, sac).
- Un **code inconnu** propose d'enrôler le vêtement : le faire seulement si c'est un vêtement neuf du poste.

## 4. Remettre et reprendre une tenue

**Attribuer** (le vêtement est « En stock ») :

1. Scanner le vêtement, puis **Attribuer**.
2. Chercher le pompier par matricule ou nom, puis valider : le vêtement passe « En service ».

L'attribution est refusée pour un vêtement qui a atteint sa limite de passages sans contrôle renforcé : le mettre de côté et prévenir la laverie.

**Restituer** (le pompier rend le vêtement, « En service ») : scanner, puis **Restituer** : le vêtement repasse « En stock ». Un vêtement **nominatif** reste lié à son pompier.

## 5. Après une intervention : vêtement contaminé

Une tenue exposée (fumées, produits, liquides biologiques) doit quitter le circuit normal tout de suite.

1. Scanner le vêtement, puis **Déclarer contaminé**.
2. Valider : le vêtement passe « À décontaminer ». Il ne pourra entrer que dans un **sac contaminé**, puis un lot contaminé, avec un contrôle renforcé avant tout retour en service.
3. Le mettre dans le **sac contaminé** du poste (section 6).

Le numéro d'intervention n'est pas enregistré dans l'application.

## 6. Envoyer le linge sale : la collecte

1. Laverie → **Collecte** (menu Laverie de la barre de navigation).
2. Scanner le **sac** du poste, ou le choisir, et indiquer le **poste** : une tournée s'ouvre.
3. Scanner chaque vêtement mis dans le sac.
4. Choisir la **laverie de destination**, puis expédier.

Un sac est **standard** ou **contaminé**. L'application refuse un vêtement contaminé dans un sac standard, et inversement : c'est voulu, ne pas forcer en changeant de sac sans vérifier.

Le retour se fait sans saisie à la caserne : à la livraison par la laverie, les vêtements reviennent « En service » (s'ils sont attribués à un pompier) ou « En stock » au poste.

## 7. Perte, vêtement retrouvé, réforme

| Situation | Action sur la fiche | Effet |
| --- | --- | --- |
| Vêtement introuvable | Déclarer perdu (motif facultatif) | Statut « Perdu » |
| Vêtement perdu qui réapparaît | Retrouvé | Retour en stock |
| Vêtement hors d'usage | Réformer, avec un motif (déchirure, brûlure, taille inadaptée…) | Sort définitivement du parc |

Une erreur de geste ne s'efface pas : l'administrateur ou le gestionnaire l'**annule** dans l'historique du vêtement, avec un motif.

## 8. Inventaire du poste

1. Accueil → **Faire un inventaire**, puis choisir le site (le poste).
2. Scanner en rafale tous les vêtements présents (casiers, réserve, sacs pas encore partis).
3. Lire le résultat : **présents**, **en plus** (rattachés à un autre site ou déclarés perdus : ils sont alors enregistrés sur ce poste) et **manquants**.
4. Déclarer perdus les manquants si besoin ; un vêtement retrouvé ensuite se remet en stock avec « Retrouvé ».

## 9. Pour les pompiers : « Mes vêtements »

1. Se connecter avec **« Lien par e-mail »** et son adresse personnelle (communiquée à l'administrateur de la zone).
2. Ouvrir **Mes vêtements** : la liste des tenues attribuées et leur statut (en service, en laverie…).

Si l'écran indique « Aucune fiche porteur n'est reliée à votre compte », demander à l'administrateur de relier la fiche. Le pompier consulte seulement : pour une contamination, une perte ou une taille inadaptée, il prévient le responsable habillement.

## 10. Problèmes fréquents

| Problème | Cause et solution |
| --- | --- |
| « Attribuer » n'apparaît pas | Le vêtement n'est pas « En stock » (déjà en service, en laverie…) |
| Attribution refusée « Seuil atteint » | Limite de passages atteinte : contrôle renforcé ou réforme nécessaire, voir avec la laverie |
| Scan refusé dans le sac | Mélange de circuits (contaminé / standard) ou vêtement pas au bon statut |
| Code inconnu | Vêtement pas encore enrôlé : prévenir le gestionnaire ou l'administrateur |
| Étiquette abîmée | Saisir à la main le code imprimé en clair près du QR, ou scanner un autre support du vêtement |
| « EN ATTENTE » ne redescend pas | Pas de réseau ; sinon ouvrir l'indicateur pour voir les gestes refusés |
| Erreur de geste | Le faire annuler dans l'historique du vêtement ; rien ne s'efface |
