# Mode d'emploi — Super-administrateur Suivi linge

25 octobre 2026

Le super-administrateur gère les clients de la plateforme : il les crée, suit leur activité, les suspend, et peut consulter une zone en lecture seule quand elle l'autorise. Il ne travaille pas dans les zones à la place de leurs équipes.

## 1. Se connecter et ouvrir l'Espace Plateforme

L'Espace Plateforme s'ouvre depuis l'application, avec un compte déclaré super-administrateur.

1. Ouvrir https://laverie-khaki.vercel.app.
2. Choisir **« Lien par e-mail »**, saisir son adresse, puis cliquer sur le lien reçu par e-mail.
3. Sur l'écran de choix de zone, cliquer **Espace Plateforme**. Depuis une zone ouverte, le bouton **Plateforme** est dans l'en-tête.
4. Pour revenir aux zones, cliquer **Mes zones**.

L'adresse directe est https://laverie-khaki.vercel.app/plateforme. Un compte qui n'est pas super-administrateur y lit « Espace réservé aux administrateurs de la plateforme ».

Un super-administrateur peut aussi être membre d'une zone (par exemple administrateur de la zone de test). Ce rôle-là se donne dans la zone, comme pour n'importe quel membre.

## 2. Créer un client

Un client (une zone de secours, par exemple) se crée en une fois avec l'adresse de son premier administrateur.

1. Dans **Nouveau client**, saisir le **nom** (il doit être unique, majuscules comprises), le **type** (Zone de secours ou Autre) et l'**e-mail du premier administrateur**.
2. Cliquer **Créer le client**.
3. Lire le message affiché :
    - « … en est l'administrateur » : la personne avait déjà un compte, elle a accès tout de suite ;
    - « Communiquez l'adresse de l'app … » : la personne n'a pas encore de compte, une **invitation** est enregistrée.
4. En cas d'invitation, envoyer à la personne l'adresse https://laverie-khaki.vercel.app. Elle se connecte par **« Lien par e-mail »** avec l'adresse exacte saisie, et devient administrateur de la zone à cette première connexion.

La zone naît avec les traitements par défaut. L'administrateur de la zone saisit ensuite lui-même ses sites, articles, limites de lavage et porteurs : la plateforme ne remplit rien à sa place.

## 3. Lire le tableau de suivi

Chaque client a sa carte dans la liste, triée par nom. On y lit son état et son activité sans entrer dans la zone.

| Élément de la carte | Ce qu'il indique |
| --- | --- |
| Actif / Suspendu | État d'accès de la zone ; une zone suspendue affiche la date et le motif |
| Support autorisé | La zone accepte un accès support (voir section 6) |
| Vêtements | Vêtements en circulation, hors réformés et perdus |
| Utilisateurs | Membres actifs de la zone |
| Passages ce mois | Passages en laverie comptés depuis le 1er du mois |
| Alertes ouvertes | Alertes de la zone non clôturées |
| Administrateurs | Adresses des administrateurs de la zone |
| Invitations en attente | Personnes invitées qui ne se sont pas encore connectées |
| Dernière activité | Dernier événement reçu de la zone |

Une zone sans activité depuis longtemps, ou avec des invitations qui restent en attente, est le signe qu'il faut relancer le client.

## 4. Administrateurs et logo d'un client

**Ajouter un administrateur** à un client existant, par exemple quand le premier est parti :

1. Sur la carte du client, cliquer **Ajouter un administrateur**.
2. Saisir son e-mail, puis valider.
3. Même règle qu'à la création : compte existant = accès immédiat ; sinon invitation, activée à la première connexion par « Lien par e-mail ».

Les autres membres (gestionnaires, opérateurs de laverie, laverie externe, porteurs) sont gérés par l'administrateur de la zone, pas par la plateforme.

**Déposer le logo** du client :

1. Sur la carte du client, cliquer **Ajouter un logo** (ou **Changer le logo**).
2. Choisir un fichier PNG, JPEG, WebP ou SVG, carré de préférence, 512 px ou plus, 5 Mo au plus.
3. L'application prépare elle-même les icônes. Le logo apparaît dans l'en-tête de la zone et devient l'icône de l'application sur les téléphones qui l'installent depuis cette zone.

Une application déjà installée garde son icône jusqu'à sa réinstallation. Le logo est public (nécessaire pour l'icône) : n'y mettre qu'un logo. L'administrateur de la zone peut aussi le changer dans Réglages → Organisation.

## 5. Suspendre et réactiver un client

La suspension coupe l'accès de tous les membres de la zone, sans rien effacer.

1. Sur la carte du client, cliquer **Suspendre**.
2. Saisir le **motif** (obligatoire, par exemple « contrat terminé »), puis valider.
3. La carte passe en **Suspendu**, avec la date et le motif.

Pendant la suspension :

- les membres de la zone, laverie externe comprise, ne voient plus la zone et ne peuvent plus rien enregistrer ; à la connexion, un message leur indique que la zone est suspendue ;
- les données (vêtements, journal, compteurs) restent intactes ;
- l'administrateur de la zone ne peut pas se réactiver lui-même ;
- aucun accès support n'est possible.

Pour **réactiver**, cliquer **Réactiver** sur la carte : l'accès revient aussitôt, tel qu'il était.

## 6. Accès support

L'accès support permet de consulter une zone pour aider son équipe : **lecture seule, 2 heures, motif obligatoire, tracé**, et seulement si la zone l'a autorisé.

**Condition préalable** : l'administrateur de la zone coche **« Autoriser le support »** dans Réglages → Organisation, puis enregistre. Sans cette case, le bouton **Accès support** reste grisé et la carte n'affiche pas « Support autorisé ».

**Ouvrir un accès** :

1. Sur la carte du client, cliquer **Accès support**.
2. Saisir le **motif** (par exemple « aide au paramétrage des articles »). Il est visible par l'administrateur de la zone.
3. Valider : l'application ouvre la zone, avec un bandeau « Accès support en lecture seule, tracé — jusqu'à … ».
4. Une fois terminé, cliquer **Quitter** dans le bandeau : l'accès est fermé et on revient à l'Espace Plateforme.

**Ce que l'on voit et ne voit pas** :

| Pendant l'accès support | |
| --- | --- |
| Visible | Vêtements, historique, lots, alertes, référentiels, rapports |
| Invisible | Nom et prénom des porteurs (matricule et casier seulement) |
| Impossible | Scanner, enregistrer un événement, modifier un réglage ou un référentiel |

**Fin de l'accès** : après 2 heures, au clic sur Quitter, ou dès que l'administrateur de la zone décoche l'autorisation. Pour continuer après 2 heures, ouvrir un nouvel accès avec un motif.

**Traçabilité** : chaque accès (qui, quand, pourquoi) apparaît dans **Accès support récents** de l'Espace Plateforme et dans Réglages → Organisation de la zone concernée.

## 7. Gérer les super-administrateurs

La liste est en bas de l'Espace Plateforme, sous **Administrateurs de la plateforme**. Le badge « Vous » marque son propre compte.

**Ajouter** un super-administrateur :

1. La personne doit d'abord avoir un compte : elle se connecte une fois par **« Lien par e-mail »** sur https://laverie-khaki.vercel.app (elle arrive sur un écran sans zone, c'est normal).
2. Saisir son e-mail dans le champ en bas de la liste, puis cliquer **Ajouter**.

**Retirer** un super-administrateur : cliquer **Retirer** sur sa ligne. Il perd aussitôt l'accès à l'Espace Plateforme ; ses éventuels rôles dans des zones restent. Le dernier super-administrateur ne peut jamais être retiré.

Donner ce rôle avec parcimonie : un super-administrateur peut suspendre n'importe quel client.

## 8. Limites et problèmes fréquents

Le super-administrateur **ne fait pas** :

- de saisie dans une zone (vêtements, lots, porteurs, réglages) : c'est le travail de l'équipe de la zone ;
- de lecture des noms des porteurs ;
- de suppression d'un client ou de ses données : on suspend, on n'efface pas ;
- de correction du journal : une erreur se corrige dans la zone par une annulation.

| Problème | Cause et solution |
| --- | --- |
| Le bouton Accès support est grisé | La zone n'a pas coché « Autoriser le support », ou elle est suspendue |
| « Cette valeur existe déjà » à la création | Un client porte déjà ce nom : en choisir un autre |
| Ajout d'un super-administrateur refusé | La personne n'a pas encore de compte : elle doit se connecter une fois par « Lien par e-mail » |
| Invitation en attente qui ne disparaît pas | La personne ne s'est pas connectée, ou avec une autre adresse que celle saisie |
| Le lien de connexion n'arrive pas | Vérifier les indésirables ; renvoyer un lien après une minute |
| L'icône de l'application n'a pas changé | L'application était déjà installée : la désinstaller puis la réinstaller depuis la zone |
| L'accès support s'est fermé tout seul | 2 heures écoulées, ou la zone a retiré son autorisation |
