# Mode d'emploi — Administrateur de zone Suivi linge

25 octobre 2026

L'administrateur de zone paramètre sa zone (sites, articles, porteurs, membres), y donne les accès, et suit le parc de vêtements. Il dispose de toutes les fonctions de l'application pour sa zone ; ce guide suit l'ordre d'une mise en service.

## 1. Premier accès et repères

L'accès se fait par lien e-mail, sans mot de passe à retenir.

1. Ouvrir https://laverie-khaki.vercel.app.
2. Choisir **« Lien par e-mail »**, saisir l'adresse communiquée à la plateforme, puis cliquer sur le lien reçu.
3. À la première connexion, l'invitation se transforme en accès administrateur : la zone s'ouvre.
4. Sur téléphone, installer l'application (menu du navigateur → « Installer l'application » ou « Ajouter à l'écran d'accueil »).

**Repères à l'écran** :

- **Accueil** : les boutons d'action (scanner, rechercher, rapports, inventaire, enrôler, étiquettes, import, paramètres) et le tableau de bord de la zone ;
- **Scanner**, **Laverie**, **Réglages** : la barre de navigation ;
- la ligne sous la navigation indique la connexion et les enregistrements en attente (« EN LIGNE · RIEN EN ATTENTE ») ;
- **Sombre / Clair** dans l'en-tête change le thème ; **Changer** passe à une autre zone si l'on en a plusieurs.

L'application fonctionne hors ligne : les scans et gestes sont gardés sur l'appareil et envoyés dès le retour du réseau. Les écrans de paramétrage, les rapports et la recherche demandent une connexion.

## 2. Mise en route : l'ordre du paramétrage

Tout se saisit dans **Réglages** (page Paramètres). Suivre cet ordre évite les allers-retours, chaque étape servant aux suivantes.

1. **Organisation** : nom de la zone, logo, règles (section 9).
2. **Sites** : postes, magasins, laveries internes et externes. Une laverie externe doit exister avant d'inviter le prestataire.
3. **Traitements** : vérifier ceux créés par défaut (lavage, séchage, nettoyage à sec, décontamination…), les compléter ou désactiver. Le **circuit** (Standard, Contaminé, Les deux) décide dans quels lots le traitement est permis. Le code ne change plus après création.
4. **Articles** : le catalogue, avec limites par traitement et notice fabricant (section 4).
5. **Porteurs** : les pompiers, à la main ou par import CSV.
6. **Sacs de collecte** : sacs standard et contaminés, avec leur code (QR généré par l'app, ou code-barres / NFC déjà présent).
7. **Lecteurs** : douchettes, caméras et NFC utilisés, avec la technologie qu'ils lisent.
8. **Membres** : inviter les équipes (section 3).

Rien n'est supprimé : un élément qui ne sert plus se décoche « Actif », l'historique reste lisible.

## 3. Membres et rôles

Chaque personne reçoit un rôle qui fixe ce qu'elle voit et fait. Donner le rôle le plus restreint qui suffit.

| Rôle | Pour qui | Ce qu'il peut faire |
| --- | --- | --- |
| Administrateur | Responsable de la zone | Tout, y compris membres et réglages de la zone |
| Gestionnaire | Logistique habillement | Enrôler, étiquettes, porteurs, attribuer, collecter, inventaire, rapports |
| Opérateur laverie | Laverie interne | Collecte, réception, lots, contrôle, livraison, inventaire, rapports |
| Laverie externe | Prestataire, lié à un site | Réception, lots, contrôle et livraison des seuls vêtements qui lui sont confiés ; jamais le nom des porteurs |
| Auditeur | Contrôle, prévention | Consultation et rapports, sans modification |
| Porteur | Pompier | Voir ses propres vêtements (« Mes vêtements ») |

**Inviter un membre** : Réglages → Membres → Ajouter, saisir l'e-mail et le rôle (pour une laverie externe, choisir aussi son site).

- La personne a déjà un compte : elle voit la zone tout de suite.
- Sinon, l'invitation apparaît sous « Invitations en attente ». Elle devient membre à sa première connexion par « Lien par e-mail », avec cette adresse exacte.

**Modifier ou retirer** : ouvrir le membre pour changer son rôle ou décocher « Actif ». Une invitation non utilisée s'annule depuis la même page.

Pour qu'un pompier voie ses vêtements, l'inviter avec le rôle Porteur, puis relier sa fiche porteur à ce compte (champ « Compte dans l'app »).

## 4. Articles, limites et notices

Un article ne s'active, et donc ne s'enrôle, qu'avec ses **limites de passages par traitement** et sa **notice fabricant** jointe.

1. Réglages → Articles → Ajouter : désignation, référence fabricant, durée de vie en mois si le fabricant en donne une.
2. Ouvrir l'article, section **Limites par traitement** : pour chaque traitement concerné, le nombre maximal de passages et le seuil d'alerte « fin de vie proche » (en % de la limite).
3. Section **Notice fabricant** : joindre la notice en PDF.
4. Cliquer **Activer l'article**.

Les valeurs viennent de la notice du fabricant : l'application n'en propose aucune. Selon la règle choisie dans Organisation, une seule limite suffit ou il en faut une par traitement actif.

Chaque passage est compté à la clôture d'un lot de traitement, une seule fois par lot. Quand un vêtement approche ou atteint sa limite, une alerte s'ouvre.

## 5. Enrôler les vêtements

Enrôler, c'est donner à un vêtement son identité dans l'application et lui associer un ou plusieurs supports (QR, code-barres, DataMatrix, NFC). Trois façons, depuis l'Accueil :

**Un par un : « Enrôler un vêtement »**

1. Choisir l'article (actif), la taille, le n° de série, le site, la date de mise en service, et cocher « nominatif » s'il est attitré à un pompier.
2. Ajouter ses identifiants : scanner l'étiquette ou le tag déjà posé, ou générer un QR à imprimer.
3. Cliquer **Enrôler le vêtement**.

Un code inconnu scanné n'importe où dans l'application propose aussi de l'enrôler.

**Imprimer des étiquettes QR**

- Choisir le format de planche (ou un format personnalisé en mm), le nombre de codes, et les emplacements déjà utilisés sur la première planche.
- Imprimer à l'**échelle 100 %** (« taille réelle »), sans marges ajoutées ; corriger un décalage avec les réglages « vers la droite / vers le bas ».
- Les QR ne contiennent qu'un code opaque : aucun nom ni matricule.

**Importer l'existant (CSV)**

- Une ligne par vêtement. Colonne obligatoire : `article` (désignation d'un article actif). Colonnes possibles : `taille`, `numero_serie`, `nominatif`, `site`, `mis_en_service`, et les codes déjà posés (`code_barres`, `qr`, `datamatrix`, `nfc`).
- L'application analyse le fichier et montre lignes valides, doublons et erreurs avant d'écrire quoi que ce soit.

## 6. Le quotidien

**Scanner** : caméra du téléphone, douchette USB ou NFC (Chrome sur Android). Deux modes :

- **Unitaire** : un scan ouvre la fiche du vêtement et les actions possibles selon son statut ;
- **Rafale** : une liste se remplit en direct, sans doublon, avec les compteurs lus / attendus / inconnus, puis on valide le tout.

**Actions sur un vêtement** (fiche, bloc Actions) :

| Action | Quand |
| --- | --- |
| Attribuer | Remettre le vêtement à un pompier |
| Restituer | Le pompier le rend (retour en stock) |
| Déclarer contaminé | Après une exposition : il passe dans le circuit contaminé |
| Déclarer perdu / Retrouvé | Vêtement introuvable, puis retrouvé |
| Réformer | Fin de vie, âge dépassé, contamination non traitable, taille inadaptée… |

**Circuit laverie** (menu Laverie), dans l'ordre :

1. **Collecte** : remplir un sac au poste, puis l'expédier vers une laverie.
2. **Réception** : à la laverie, scanner le sac et son contenu ; les écarts (manquants, en trop) sont signalés.
3. **Lots de traitement** : constituer un lot pour un traitement, puis le **clôturer**, ce qui compte +1 passage par vêtement, ou l'**avorter**, ce qui ne compte rien.
4. **Contrôle** : conforme, à réparer ou à réformer.
5. **Livraison** : rendre au poste ou au pompier.

Un vêtement contaminé ne peut entrer ni dans un sac ni dans un lot standard, et inversement : l'application le refuse, même hors ligne.

**Corriger une erreur** : dans l'historique du vêtement, **Annuler** l'événement fautif avec un motif. Rien ne s'efface : l'annulation s'ajoute au journal et le vêtement est recalculé.

## 7. Suivre le parc

**Tableau de bord** (Accueil) : les vêtements par statut et les alertes à surveiller. Un chiffre en couleur signale un état (vert = bon, orange = à surveiller, rouge = critique).

**Alertes** : elles s'ouvrent et se ferment toutes seules selon le journal ; on les filtre par type et on peut les **Acquitter** une fois traitées.

| Alerte | Signification |
| --- | --- |
| Fin de vie proche | Le seuil d'alerte de l'article est atteint pour un traitement |
| Limite de passages atteinte | Le vêtement a atteint sa limite fabricant |
| Âge maximal dépassé | Durée de vie de l'article dépassée |
| Tag à remplacer | Le support approche la garantie de son fabricant |
| Non revenu | Collecté ou en laverie depuis plus longtemps que le délai réglé |
| Écart de réception | Un sac reçu ne correspond pas à ce qui était attendu |
| Mélange de circuits | Tentative de mélanger contaminé et standard |

**Rechercher un vêtement** : filtres par code, n° de série, taille, article, statut, porteur ; export CSV.

**Rapports** : passages de la période et état du parc, vêtements **à renouveler** (usure ou âge, seuils réglables), activité d'une laverie (lots, sacs et vêtements reçus).

**Faire un inventaire** : choisir le site, scanner en rafale ; l'écran classe les vêtements en présents, en plus et manquants. Les manquants peuvent être déclarés perdus ; un vêtement déclaré perdu par erreur se remet en stock avec « Retrouvé ».

## 8. Départ d'un pompier

Au départ d'un pompier, on récupère ses vêtements puis on efface son identité, sans perdre l'historique du linge.

1. Ouvrir sa fiche (Réglages → Porteurs, puis le porteur) et la section **Départ du porteur**.
2. Choisir le site où ranger les vêtements rendus, puis les restituer ; un vêtement non rendu se réforme comme perdu.
3. **Anonymiser** le porteur : son nom, son prénom et son matricule sont remplacés par un code `ANONYME-…`.

L'anonymisation est définitive. Les passages et événements des vêtements restent, rattachés au code anonyme.

## 9. Réglages de la zone

Réglages → **Organisation**, réservé à l'administrateur. Tout se modifie à tout moment ; cliquer **Enregistrer** en bas de page.

| Réglage | Effet | Par défaut |
| --- | --- | --- |
| Nom | Nom affiché de la zone | Celui donné par la plateforme |
| Logo | En-tête et icône de l'application installée (PNG, JPEG, WebP ou SVG, carré) | Aucun |
| Activation d'un article | Une limite suffit, ou une par traitement actif | Une limite suffit |
| Fenêtre anti-doublon | Le même code relu dans ce délai ne compte qu'une fois | 2 s |
| Garantie des tags | Passages garantis par technologie, pour l'alerte « Tag à remplacer » | Vide (pas d'alerte) |
| Seuil d'usure des tags | % de la garantie qui déclenche l'alerte | 80 % |
| Délais « Non revenu » | Jours collecté sans réception, et jours en laverie | 2 et 7 jours |
| Résumé quotidien par e-mail | Un e-mail chaque matin aux rôles choisis, seulement s'il y a de nouvelles alertes | Désactivé |
| Accès support | Autorise la plateforme à consulter la zone pour vous aider | Non autorisé |

**Accès support** : le support consulte en lecture seule, 2 heures par accès, avec un motif, et ne voit jamais le nom des pompiers. Les 10 derniers accès (qui, quand, pourquoi) s'affichent sous la case. Décocher la case coupe tout accès en cours.

Une application déjà installée garde son ancienne icône jusqu'à sa réinstallation.

## 10. Règles et problèmes fréquents

**Règles à connaître** :

- le journal ne s'efface jamais : une erreur se corrige par une annulation ;
- le statut et les compteurs d'un vêtement se déduisent du journal, ils ne se saisissent pas ;
- aucune donnée personnelle sur une étiquette ou un tag ;
- un code peut être remplacé (étiquette abîmée) sans perdre l'historique du vêtement.

| Problème | Cause et solution |
| --- | --- |
| Un article n'apparaît pas à l'enrôlement | Il n'est pas actif : ajouter ses limites et sa notice, puis l'activer |
| L'invité ne voit pas la zone | Il ne s'est pas encore connecté, ou avec une autre adresse que celle de l'invitation |
| La laverie externe ne voit pas un vêtement | Il ne lui a pas été confié (sac expédié vers son site) |
| « EN ATTENTE » ne redescend pas | Pas de réseau ; sinon ouvrir l'indicateur pour voir les enregistrements refusés et les traiter |
| Un scan est refusé en laverie | Mélange de circuits (contaminé / standard) ou statut qui ne permet pas ce geste |
| Code inconnu au scan | L'application propose de l'enrôler ; rien n'est perdu |
| Le lien de connexion n'arrive pas | Vérifier les indésirables ; redemander un lien après une minute |
| La zone affiche « suspendue » | Contacter la plateforme |
