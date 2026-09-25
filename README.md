# Valorisation Paris 8 — tableau de bord Omeka S

Refonte. Deux tableaux de bord distincts (opérations de partenariat,
enseignants-chercheurs) alimentés par l'API Omeka S.

Ce document dit **pourquoi** l'outil est fait ainsi : les partis pris, et les
défauts qui les ont imposés. Le `CHANGELOG.md` dit **ce qui a changé**, version
par version.

## Installation

Déposer le dossier sur le serveur. Aucune dépendance, aucune étape de
compilation, aucun fichier à recopier à la main.

Deux conditions techniques :

- **HTTP(S) obligatoire** — l'application utilise les modules ES, qui ne
  fonctionnent pas en `file://`.
- **CORS** — l'API Omeka S doit autoriser le domaine qui sert ces pages.

**Aucune adresse d'API n'est inscrite dans le code.** Une adresse codée en dur
se retrouve dans le code publié, y désigne une instance qui ne regarde
personne d'autre, et impose de modifier le code pour déployer ailleurs.

Au premier lancement, l'application demande l'adresse plutôt que de présenter
un échec — un message d'erreur laisserait croire à une panne alors qu'il n'y a
rien à réparer. Une fois indiquée, elle est retenue dans le navigateur : la
saisie n'a lieu qu'une fois par poste.

Tant qu'aucune adresse n'est connue, aucune requête ne part. Une adresse vide
produirait une requête relative au serveur qui héberge la page, dont l'échec
ressemblerait à une panne de l'API plutôt qu'à une absence de configuration.

L'adresse de l'API se règle depuis le bouton *Configuration*, en haut à
droite. Les clés d'accès ne sont nécessaires que si les données ne sont pas
publiques ; elles restent dans le navigateur. Le bouton *Oublier l'adresse*
efface la configuration et ramène à l'écran d'accueil.

### Développement en local

`http://localhost/...` fonctionne — c'est bien du HTTP. En revanche l'API
Omeka S doit alors autoriser l'origine `http://localhost` (ou le port
utilisé), sans quoi le navigateur bloque les requêtes. Servir l'application
depuis le même domaine que l'API évite entièrement la question.

## Organisation

```
index.html
css/style.css
js/core/omeka.js      chargement, cache, normalisation JSON-LD → enregistrements
js/core/champs.js     registre des champs des deux tableaux de bord
js/core/selection.js  moteur de sélection : le point de vérité unique
js/core/groupe.js     regroupement « Autres » préservant les totaux
js/core/reglages.js   renommages, profils, identité ≠ libellé
js/ui/facettes.js     filtres à cases à cocher avec compteurs contextuels
js/ui/legende.js      phrase décrivant la sélection courante
js/panels/            indicateurs, figures, relations, partenaires, tableau,
                      contrôle des données, atelier
js/ui/                facettes, légende, menu contextuel, figures, flux,
                      export d'image
js/app.js             orchestration
test/                 vérifications automatiques
```

**Un seul endroit décide de ce qui est dans la sélection** :
`selection.js`. Tout compteur, tout panneau, tout export en dépend. C'est ce
qui garantit que les chiffres concordent d'un panneau à l'autre.

## Principes appliqués

1. **Ne jamais écarter en silence.** Valeurs masquées, recherche active,
   regroupements : tout figure dans la barre de légende.
2. **Regrouper plutôt que supprimer.** Au-delà des *n* premières valeurs, le
   reste est réuni sous « Autres », jamais retiré : la somme des barres égale
   toujours l'effectif de la sélection.
3. **Compteurs contextuels.** L'effectif affiché à côté d'une valeur ignore la
   sélection de sa propre facette : on voit ce qu'apporterait une case de plus.
4. **Identité ≠ libellé.** Renommer une valeur change son affichage, jamais les
   comptages. Deux valeurs distinctes portant le même nom restent comptées
   séparément, et l'outil le signale.
5. **Le masquage porte sur les valeurs, pas sur les enregistrements.** Masquer
   un partenaire d'une opération qui en compte trois retire ce partenaire des
   comptages ; l'opération demeure.

## Cache

Les données sont conservées six heures dans le navigateur. Le bouton
*Recharger les données* vide le cache et réinterroge l'API. En cas d'API
injoignable, un cache périmé est utilisé en secours plutôt que d'échouer.

Le cache porte le numéro de version du format des enregistrements
(`VERSION_FORMAT` dans `core/omeka.js`). Toute modification de la
normalisation — nouvelle propriété lue, règle de date modifiée — impose de
l'incrémenter : les caches produits par la version précédente sont alors
ignorés d'office.

Cette précaution n'est pas théorique. Sans elle, une correction apportée à la
lecture des données reste sans effet visible tant que le cache n'a pas
expiré ; on croit le correctif inopérant et on cherche l'erreur ailleurs.
Pour la même raison, la ligne de source affiche l'âge des données.

## Vérifications

```sh
sh valo/test/tout.sh           # l'ensemble
node valo/test/moteur.mjs      # sélection, regroupement, réglages, légende
node valo/test/interface.mjs   # page réelle pilotée dans jsdom, API simulée
node valo/test/effets.mjs      # combinaisons de mécanismes, effets de bord
node valo/test/styles.mjs      # contrôles statiques sur le style et le script
```

`test/interface.mjs` instancie `index.html`, simule l'API Omeka S et pilote
l'interface comme un utilisateur (clics sur les cases, saisies, bascule
d'onglet). C'est ce qui vérifie que les pièces fonctionnent ensemble.

`test/effets.mjs` porte sur les combinaisons plutôt que sur les mécanismes
pris isolément : le détachement croise le masquage, le filtrage et les
compteurs, et c'est à leurs intersections que les contradictions
apparaissent — une valeur masquée ne doit pas être ressuscitée par un
détachement, un détachement ne doit modifier aucun effectif.

`test/styles.mjs` existe parce que le rendu simulé a ses angles morts. jsdom
accorde la priorité à l'attribut `hidden` sur la feuille de style, là où un
navigateur fait l'inverse : une règle telle que `.modale { display: flex }`
laissait donc les tests au vert tout en affichant la fenêtre de configuration
en permanence. Ces contrôles portent sur les fichiers eux-mêmes — conflits
avec `hidden`, variables de couleur non déclarées, identifiants absents du
document, interpolations dans `innerHTML`.

## Lecture des données Omeka S

Deux points méritent d'être connus, parce qu'ils reposent sur des choix
d'interprétation et non sur une lecture littérale.

**Quand un champ ressort vide.** La configuration comporte un bouton
*Inspecter* qui relève les propriétés réellement présentes sur un échantillon
d'une classe, avec leur forme (texte ou lien) et un exemple. C'est le moyen
de vérifier plutôt que de supposer : deviner le nom d'une propriété est la
principale source d'erreur silencieuse, le champ ressortant vide sans qu'aucun
message ne l'indique.

L'application recherche d'abord les intitulés attendus, puis, à défaut, toute
propriété dont le nom contient le mot pertinent — `start`, `debut`, `statut`.
Cela couvre les écarts de nommage sans exiger de retoucher le code.

**Type de contrat** (`valo:opeType`). Lu sous trois formes : item lié, texte
saisi en clair, ou propriété portant un autre intitulé. Il alimente une
facette, une colonne du tableau, un indicateur, un constat de qualité quand il
manque, et un panneau propre.

Ce panneau propose quatre lectures, dont trois croisées. La répartition seule
dit peu de chose ; c'est la distribution par durée, par année ou par type de
partenaire qui renseigne sur la manière dont l'établissement contractualise —
d'où le croisement par durée retenu par défaut.

**Valeurs littérales ou liées.** Une même propriété peut être saisie comme
texte ou comme lien vers un item — le statut d'un enseignant-chercheur, par
exemple. Les deux formes sont lues. N'en lire qu'une vidait le champ sans
qu'aucune erreur ne le signale.

**Année d'une opération**, par ordre de fiabilité décroissante :

1. `curation:start`, quand la date de début est renseignée ;
2. une propriété de date générique (`dcterms:date`) ;
3. l'année inscrite dans l'identifiant, de forme `OPE-AAAA-nnnn`.

Le troisième cas existe parce que beaucoup d'opérations n'ont pas de dates
saisies : sans ce repli elles disparaîtraient de toute lecture chronologique.
Chaque enregistrement conserve l'origine retenue, visible dans le détail d'une
ligne du tableau, pour ne pas confondre ce qui est saisi et ce qui est déduit.

**Durée.** Calculée entre `curation:start` et `curation:end` lorsque les deux
existent. Les dates au format JJ/MM/AA sont interprétées au XXIe siècle. Une
date de fin antérieure à la date de début ne produit aucune durée plutôt
qu'une valeur négative.

L'affichage se règle dans *Configuration → Paramètres* : tranches (moins de
6 mois, 6 à 12 mois, 1 à 2 ans, 2 à 4 ans, plus de 4 ans), mois, ou jours.
Quel que soit le réglage, survoler une durée dans le tableau en montre les
dates, le nombre de jours, la décomposition et la tranche — une tranche seule
ne dit pas d'où elle vient.

Le filtre « Durée » conserve les tranches en toutes circonstances : proposer
des centaines de valeurs exactes dans une liste de cases à cocher n'aurait
pas d'usage.

## Préférences d'affichage

Les réglages de *Configuration → Paramètres* ne portent que sur la
présentation. Aucun ne modifie un comptage : afficher une durée en jours
change la lecture, jamais le nombre d'opérations retenues. Cette séparation
évite qu'un réglage d'aspect fasse bouger les chiffres à l'insu de celui qui
le manipule — un test s'en assure.

## Montants

Deux champs financiers : le **budget de l'opération** (`valo:budgOPE`), part
revenant à l'établissement, et le **montant global TTC**
(`valo:montantGlobal`), total de l'opération tous partenaires confondus. Le
second englobe le premier, et leur écart est lui-même une information — d'où
le maintien des deux plutôt qu'un seul.

**Un montant n'est pas une catégorie.** Tous les autres champs servent à
compter des opérations ; un montant se mesure. Une première version l'a
pourtant traité comme un champ nominal ordinaire, rangé en sept **tranches**
fixes et compté en barres. La lecture était fausse par construction : une
distribution de montants est très dissymétrique — beaucoup de petites
opérations, quelques très grosses —, si bien que les deux premières tranches
absorbaient l'essentiel des effectifs et que les contrats exceptionnels,
c'est-à-dire précisément ce qu'on cherche, disparaissaient dans la dernière.
Les tranches imposaient de surcroît une granularité arbitraire : rien ne
distinguait 26 k€ de 49 k€.

Les tranches n'ont pas disparu, elles ont changé de rôle. Elles restent en
**facette**, où un seuil arbitraire est sans conséquence puisqu'il ne sert
qu'à découper une sélection : « les contrats de plus de 100 k€ » est un filtre
qu'on veut poser d'un clic. Elles ne décrivent plus rien.

### Cinq lectures, et des euros écrits

Une deuxième erreur a précédé la version actuelle, et mérite d'être consignée :
les tranches ont d'abord été remplacées par des figures de **distribution** —
courbe classée, courbe de concentration, boîtes à moustaches, nuage temporel.
Techniquement plus justes, et moins informatives. Elles répondaient à « quelle
est la forme statistique de la série », question que personne ne pose, et ne
portaient **aucun chiffre lisible** là où une barre étiquetée en donnait un. Le
défaut des tranches n'était pas « des barres » : c'était la question posée.

Ce qu'aucune des deux versions ne montrait : **combien d'euros, de qui, quand.**
C'est-à-dire des montants **cumulés par catégorie**. Le cumul avait été écarté
par crainte du double comptage — à tort pour l'essentiel : une opération a une
seule année et un seul type de contrat, la somme y est exacte. La difficulté ne
concerne que les laboratoires et les partenaires, où une opération compte pour
chacun ; la somme des barres est alors annoncée à côté du total réel, et leur
écart se lit.

**Trois réglages plutôt qu'un menu unique** : la *grandeur* décide de ce qu'on
mesure (budget de l'opération ou montant global), la *lecture* de la manière de
le montrer, la *maille* de la catégorie d'agrégation. Combinés en un seul menu,
ils feraient soixante entrées pour trois décisions indépendantes.

| Lecture | Ce qu'elle répond |
|---|---|
| **Montants cumulés** (défaut) | Combien d'euros par année, type de contrat, laboratoire, partenaire ou domaine d'activité |
| **Volume contre valeur** | Beaucoup de petits contrats, ou peu de gros |
| **Bande de dispersion** | À quoi ressemble le portefeuille, opération par opération |
| **Cumul dans le temps** | La trajectoire plutôt que le rythme annuel |
| **Les plus gros contrats** | Lesquels, avec qui, et la part de l'établissement |

**Chaque figure porte ses euros et son nombre d'opérations.** C'est la règle qui
résume la refonte : une colonne haute peut être un gros contrat ou trente
petits, et seule la mention des deux le dit.

**L'orientation se déduit du champ**, elle n'est plus un défaut global. Une
échelle ordonnée — années, durées, tranches — se lit à la verticale : c'est la
convention de l'histogramme, et l'axe du temps ne se met pas debout. Des
libellés longs et sans ordre — laboratoires, partenaires — restent à
l'horizontale, où ils tiennent. Le bouton de bascule ne sert plus qu'à passer
outre.

**La bande de dispersion remplace à elle seule trois figures écartées** — la
répartition classée, les boîtes à moustaches et le nuage temporel. Les trois
disaient la même chose, où se tient le gros du portefeuille et ce qui en sort,
de trois manières abstraites. Ici les points sont les opérations elles-mêmes,
sur un axe gradué en euros ; la médiane et l'intervalle interquartile sont
marqués discrètement *derrière* les points, comme repères et non à leur place.
C'est aussi la seule lecture qui n'additionne rien : une opération portée par
deux laboratoires apparaît dans les deux rangs sans fausser aucune médiane.
Sous cinq valeurs, les repères disparaissent — une médiane sur deux points
donnerait une précision que la donnée ne porte pas.

**La concentration a quitté les figures pour une carte d'indicateur.** « Les
10 % des opérations les plus importantes portent 62 % des montants » est une
phrase, pas un axe : la courbe de type Lorenz dont elle est tirée demandait
d'interpréter un écart à une diagonale, et il fallait de toute façon en tirer
cette phrase. La carte ne paraît qu'au-delà de dix montants renseignés — sur
quatre contrats, « les 10 % les plus gros » désigne un seul contrat et l'énoncé
ne veut rien dire.

**Échelle linéaire ou logarithmique**, au choix, partout où un axe porte des
montants bruts. Ni l'une ni l'autre n'est bonne en toutes circonstances : la
linéaire dit les écarts réels mais écrase la partie basse quand le rapport
entre montants dépasse le millier ; la logarithmique rend toute la plage
lisible mais trompe l'œil sur ces mêmes écarts. Elle est offerte, jamais
imposée. Les **graduations portent une seule unité** sur tout l'axe : elles
sortaient en « 0 », « 5 000 € », « 10 k€ », « 15 k€ », et l'œil devait
convertir pour comparer deux repères voisins.

**Une opération sans montant lisible ne figure sur aucune de ces figures**, et
le décompte des écartées s'affiche dessous, avec le total réel de la sélection.
La ramener à zéro lui prêterait un montant nul qu'elle n'a pas ; la taire
laisserait croire la figure exhaustive.

**L'écart entre la somme des barres et le total réel est annoncé dans les deux
sens.** Au-dessus, quand un champ multivalué fait compter une opération pour
chacune de ses valeurs. En dessous, quand un masquage retire *toutes* les
valeurs d'une opération pour le champ affiché — ce que le masquage de
l'université elle-même, appliqué d'office côté partenaires, produit dès qu'une
opération n'a pas d'autre partenaire. Annoncer « au-delà du total réel » dans
ce second cas serait un contresens. Sous une restriction d'affichage la somme
est plus petite par construction, et le bandeau le dit déjà : la note se tait.

**Un point n'est pas une valeur à filtrer**, c'est une opération : son clic —
gauche comme droit — ouvre le menu de l'enregistrement, d'où l'on gagne sa
fiche Omeka S. Réserver ce menu au clic droit l'y aurait rendu introuvable,
faute d'autre geste possible. Dans la bande de dispersion, seul le libellé du
rang filtre : la piste est couverte de zones d'opérations, et un clic dans le
vide ne doit pas déclencher un filtrage qu'on n'a pas visé.


### Lire des montants saisis à la main

La base ne contient que des nombres, mais sous des formes qui se
contredisent : `123`, `123,45`, mais aussi `1 234,56`, `5000 €`, ou
`12 000 € TTC`. Et `1.234` vaut mille deux cent trente-quatre dans une saisie
française, un et des poussières ailleurs — d'où des règles explicites plutôt
qu'un `parseFloat` qui trancherait au hasard.

**Une valeur illisible vaut « inconnu », jamais zéro.** Un zéro se fondrait
dans les sommes et les tirerait vers le bas sans que rien ne le signale ; une
absence se compte et s'affiche. Sur le jeu d'essai, compter `environ 5000`
pour zéro fait tomber le budget médian de 7 750 € à 3 501 €.

Le contrôle des données signale trois choses : les **montants non
interprétables** — plus graves qu'une absence, puisqu'ils donnent l'impression
que le montant est connu —, les **budgets supérieurs au montant global**, qui
trahissent une inversion des deux champs, et les **budgets manquants**.

## Modes de lecture

Un panneau peut proposer plusieurs lectures de la même donnée, nommées par ce
qu'elles montrent. *Laboratoires et statuts*, côté chercheurs, en offre trois :
« Effectifs et statuts par laboratoire », « Effectifs par laboratoire »,
« Statuts seuls ».

Les deux premières figures étaient auparavant deux panneaux distincts. Séparés,
ils obligeaient à rapprocher de tête un classement et une répartition, et
surtout ils ne disaient rien de la composition d'un laboratoire donné : combien
de professeurs dans *celui-ci*. La lecture croisée, retenue par défaut, répond
aux trois questions à la fois sans rien perdre — la longueur totale reste
l'effectif, les segments le détaillent.

Les modes nomment ce qu'ils affichent plutôt que de demander à l'utilisateur de
composer un croisement. Un menu générique du type « réparti par… » laisse le
travail de conception à celui qui vient chercher une réponse.

**Une ligne qui n'est pas une valeur reste neutre, même décomposée.** Un
regroupement ou une valeur non renseignée voit ses segments virés au gris,
nuancés pour rester distinguables. En mode simple sa barre est déjà grise ;
décomposée, elle reprenait les teintes des séries et son plus gros segment
portait la couleur du statut dominant — la ligne se confondait alors avec
celles qu'on peut comparer. Sa composition demeure lisible, son statut de
non-valeur aussi.

**Le champ de décomposition n'est jamais regroupé.** Il est nommé dans le mode
retenu : « Effectifs et statuts par laboratoire » demande à voir les statuts,
tous. En réunir une partie sous « Autres » retirerait précisément ce qu'on est
venu chercher. Un plafond ne subsiste qu'à vingt valeurs, comme garde-fou pour
un champ où la légende deviendrait inutilisable.

Les barres sont horizontales : les libellés de laboratoires sont longs, et une
colonne les contraindrait à l'oblique ou à la troncature. L'ordre
d'empilement est identique d'une ligne à l'autre, sans quoi deux lignes ne se
compareraient pas du regard. Un axe gradué accompagne l'empilement — sans
repère chiffré, il ne se lirait qu'au survol, segment par segment.

Les séries sont limitées à huit, au-delà desquelles une légende cesse d'être
lisible ; le reste est réuni sous « Autres », consultable comme partout
ailleurs. Cliquer un segment filtre sur cette série, cliquer un libellé filtre
sur la valeur.

## Sens des barres

Chaque figure en barres porte un bouton de bascule entre l'horizontale et la
verticale. Le bon sens dépend de la donnée et de la place, pas de la figure :
un libellé long se lit mieux à l'horizontale, une série chronologique à la
verticale. Le choix vaut aussi pour les figures décomposées, qui passent alors
des barres empilées aux colonnes empilées.

Sur le panneau des montants, le sens n'est plus un défaut global mais se
**déduit du champ** : une échelle ordonnée — années, durées, tranches — se lit
à la verticale, c'est la convention de l'histogramme et l'axe du temps ne se
met pas debout ; des libellés longs et sans ordre restent à l'horizontale, où
ils tiennent. Le bouton ne sert alors qu'à passer outre. Les autres panneaux
gardent leur défaut historique, le champ n'y changeant pas d'un mode à l'autre.

## Nuage de mots

Les mots-clés s'affichent en nuage plutôt qu'en barres. Ni le regroupement ni
l'absence n'y figurent : « Autres » n'est pas un terme du vocabulaire, et
« Sans mot-clé » encore moins — c'est souvent la valeur la plus fréquente, elle
occuperait le centre en gros caractères et écraserait tout le vocabulaire
réel. Les deux sont comptés dans la note sous la figure. Un histogramme de
mots-clés est trompeur : il impose un classement là où l'écart entre le
vingtième et le trentième terme ne signifie rien, et son axe donne une
précision que des étiquettes saisies à la main ne portent pas. Le nuage
renonce au classement pour montrer ce que le corpus a de saillant, question
qu'on lui pose effectivement. Les barres restent à un clic pour qui cherche un
effectif exact.

La taille suit la racine de la fréquence : proportionnelle à la hauteur, un
terme deux fois plus fréquent occuperait quatre fois la surface et paraîtrait
bien plus dominant qu'il ne l'est.

L'échelle s'ajuste à la place disponible. Une échelle fixe fait déborder les
grands termes dès que le vocabulaire s'étoffe, et la moitié du nuage se
retrouve sans emplacement — la mesure donnait un tiers des termes placés sur
un vocabulaire de quatre-vingt-dix. Plutôt que d'estimer une taille plausible,
ce qui tombait systématiquement à côté à l'essai, l'aire réellement occupée
est mesurée puis ramenée à un taux de remplissage tenable. Tous les termes
trouvent alors place, quel que soit leur nombre.

Le placement suit une spirale depuis le centre, les termes les plus fréquents
posés d'abord — les poser après les laisserait en périphérie, où leur
importance ne se lirait plus. Il est déterministe : deux affichages des mêmes
données donnent la même image.

Deux précautions le rendent praticable sur un vocabulaire fourni. Les
emplacements occupés sont rangés dans une grille, faute de quoi chaque essai
de la spirale compare le mot à tous ceux déjà posés. Et la spirale reprend là
où le mot précédent s'est posé : le centre est déjà occupé, le réexplorer
depuis le début à chaque mot ne trouve rien et coûte l'essentiel du temps de
calcul. Sur deux cents termes, le rendu passe de 126 à 46 millisecondes.

Le nuage porte le compte des termes affichés et de ceux que la sélection
contient. Avec plusieurs milliers de mots-clés distincts, l'image reste dense
après un filtrage et paraît ne pas avoir bougé, alors que son contenu a
entièrement changé : le compte rend ce lien lisible.

## Limites de la donnée

Certaines figures portent une mention sur ce que les données ne disent pas.
*Durée des partenariats par laboratoire* signale qu'avant 2020, tous les
contrats ne figuraient pas dans GFC : un creux y traduit un défaut de
versement autant qu'une baisse d'activité. Sans cette mention, une frise qui
remonte à 2015 laisse lire une lacune de saisie comme un fait.

## Échelle des figures

**Ni le regroupement « Autres » ni les valeurs non renseignées n'entrent dans
le calcul de l'échelle.** Ce ne sont pas des valeurs comparables aux autres :
l'un cumule des dizaines d'entrées, l'autre compte une lacune de saisie. L'un
comme l'autre atteint facilement le plus grand effectif — c'est systématique
dès qu'on masque la valeur dominante — et écrase alors toutes les barres
réelles, qui n'occupent plus que quelques pour cent de leur piste.

L'échelle se cale donc sur les valeurs comparables. Celles qui dépassent
restent dessinées, **bornées au cadre**, avec des chevrons de troncature et la
mention dans leur infobulle : sans ce repère, on lirait leur longueur comme
comparable aux autres alors qu'elle est coupée.

La borne au dessin est aussi importante que l'exclusion du calcul. Une
catégorie écartée du maximum le dépasse par construction : sans borne, sa
colonne monte à plusieurs fois la hauteur du cadre et, les figures autorisant
le débordement pour leurs libellés, se répand sur le reste de la page.

Dans une figure décomposée, la ligne qui dépasse voit ses segments **comprimés
plutôt que coupés** : elle occupe exactement la piste et conserve ses
proportions internes. La tronquer après le premier segment ferait perdre le
peu qu'on peut encore en lire, alors qu'elle est déjà signalée comme non
comparable.

La règle vaut partout — barres, colonnes, barres empilées, colonnes empilées,
bulles, matrice des croisements, et jusqu'au rayon des pôles du réseau, où un
pôle « Autres » rapetissait tous les autres disques.

## Une règle, quatre oublis

Le même défaut est réapparu cinq fois au cours du développement : **exclure une
valeur du calcul de l'échelle sans borner son dessin**. Une valeur écartée du
maximum le dépasse par construction ; sans borne, sa représentation sort du
cadre — colonne montant à plusieurs fois la hauteur du panneau, disque
débordant de sa ligne, mot de quatre-vingt-quatorze pixels, pôle de rayon
triple.

Les figures appliquent désormais la règle uniformément : barres, colonnes,
barres et colonnes empilées, bulles, nuage de mots, matrice, pôles du réseau.
La valeur reste dessinée, bornée, signalée par des chevrons de troncature ou
une mention dans son infobulle. Une vérification parcourt toutes les figures
et échoue dès qu'un élément sort de son cadre.

La règle jumelle vaut pour les couleurs : **les segments qui se touchent
demandent des teintes écartées**, ceux qui sont séparés par du blanc peuvent
se contenter de teintes stables. Elle s'applique aux barres empilées, aux
colonnes empilées et aux rubans du diagramme de flux.

## Contraste des séries empilées

Dans un empilement, deux segments se jouxtent sans séparation : des teintes
proches y deviennent indiscernables, là où elles restaient lisibles sur des
barres séparées par du blanc. Les séries empilées reçoivent donc une
attribution distincte de l'attribution ordinaire, qui maximise l'écart entre
les teintes retenues plutôt que leur stabilité d'une figure à l'autre.

La sélection est gloutonne : on part d'une teinte, puis on retient à chaque
tour celle qui est la plus éloignée de toutes les précédentes, l'écart étant
mesuré sur les composantes pondérées selon la sensibilité de l'œil. Au-delà de
la taille de la palette, les reprises sont éclaircies ou assombries plutôt que
répétées à l'identique — deux séries seraient sinon indiscernables. Espacer
régulièrement les indices de la palette ne suffit pas — celle-ci n'étant pas
rangée par teinte, deux indices éloignés peuvent tomber sur des couleurs
voisines, ce que je constatais effectivement à l'essai. L'écart minimal entre
séries passe ainsi du simple au double ou au triple selon leur nombre.

## Figures

Les graphiques sont du SVG produit à la main, sans bibliothèque : barres
horizontales pour les catégories aux libellés longs, colonnes pour les séries
ordonnées, colonnes empilées pour un croisement.

Une seule couleur d'encre pour les barres. La couleur ne code rien tant
qu'elle n'a rien à coder — un camaïeu par catégorie laisserait croire à une
information supplémentaire qui n'existe pas. Elle n'apparaît que dans les
colonnes empilées, où elle distingue réellement des séries, et pour marquer
la sélection.

Chaque barre est cliquable et déclenche exactement le même geste que cocher
la case correspondante dans les filtres : les deux voies mènent au même état,
plutôt qu'à deux mécanismes parallèles qui finiraient par diverger.

Le réglage *Valeurs détaillées* fixe le nombre de valeurs représentées avant
regroupement. Le regroupement « Autres » se déplie sur son contenu, et la
somme des barres égale toujours l'effectif de la sélection — c'est ce que
vérifie l'un des tests.

## Charte graphique

L'interface reprend l'identité visuelle de l'université Paris 8, « Université
des Créations ». Palette du logotype primaire, telle que la définit la charte
officielle :

| | hex | Pantone |
|---|---|---|
| Poppy | `#E30F1B` | 485C |
| Raspberry | `#AE164E` | 215C |
| Purple | `#7B206B` | 255C |
| Maroon | `#75151F` | 188C |
| Black | `#000000` | Black 6C |

Typographie : **Poppins**, police de l'identité, libre de droit. Les chiffres
conservent une chasse fixe, sans laquelle colonnes de tableaux et axes de
figures cessent de s'aligner.

**Répartition retenue.** Raspberry porte l'interaction et la sélection : il
appartient au rouge institutionnel, ce qui donne à l'outil son air de famille,
tout en étant moins agressif que Poppy sur les grandes surfaces d'un tableau
de bord. Poppy est réservé à l'avertissement, où le rouge vif est attendu — le
garder pour cet usage évite qu'il se banalise. Maroon habille les bandeaux
sombres, où sa profondeur convient mieux qu'un noir neutre. L'esperluette,
symbole récurrent de la charte, est reprise en filigrane dans le bandeau.

**Contrastes.** La charte demande explicitement le respect des normes
d'accessibilité. Les quatre couleurs dépassent le seuil AA sur fond clair
— de 4,8 pour Poppy à 11,2 pour Maroon. Aucune ne le franchit sur fond
sombre : Raspberry n'y atteint que 2,3, Purple 1,7. Le thème sombre emploie
donc des variantes éclaircies à ton constant, jusqu'au seuil AA. La charte ne
fige pas de valeurs pour un fond sombre, qu'elle n'envisage que pour le
logotype.

**La palette des figures n'est pas la palette institutionnelle.** Elle s'ouvre
sur les teintes de la charte puis s'élargit, pour la seule raison qui vaille
ici : distinguer. Cinq couleurs ne peuvent pas séparer trente-cinq
laboratoires, et un camaïeu de rouges rendrait les figures illisibles.

**Le soulignement est réservé aux liens**, comme la charte l'exige. Les
valeurs rapprochées du contrôle qualité, qui portaient un soulignement
pointillé, emploient désormais un filet bas.

Une vérification automatique contrôle la provenance des couleurs, la présence
de la typographie et l'absence de soulignement hors liens.

**Le logotype n'est pas fourni** : son usage est encadré par la charte, et le
fichier doit être obtenu auprès du service communication. Il trouverait
naturellement sa place dans le bandeau, à gauche du titre.

## Thème sombre

Trois réglages dans *Configuration → Paramètres* : suivre le système, clair,
sombre. Le bouton du bandeau fait défiler les trois. « Suivre le système »
réagit au changement du réglage du système d'exploitation, mais un choix
explicite n'est jamais écrasé.

Le thème sombre n'est pas le thème clair inversé : sur fond sombre un blanc
pur éblouit et les aplats saturés vibrent. L'encre devient un gris clair
légèrement chaud, et les couleurs de signal sont éclaircies — un vert profond
disparaîtrait sur fond foncé.

Les figures lisent les couleurs au moment où elles sont dessinées : changer
de thème impose de les reconstruire, ce que fait l'application. La palette
des séries est choisie dans une plage de luminance moyenne pour rester
lisible sur les deux fonds ; un test vérifie les contrastes des deux thèmes
et de la palette.

## Masquage et entités liées

Le type et l'activité d'un partenaire ne sont pas des propriétés de
l'opération : ce sont celles du partenaire. Les champs concernés déclarent
donc l'entité dont ils dérivent, et le masquage s'applique à cette entité
avant d'en extraire la valeur.

Sans cela, masquer « Université Paris 8 » retirait bien le partenaire du
décompte des partenaires, mais laissait sa contribution au décompte des
types : la catégorie « Université » restait gonflée par un partenaire qu'on
venait pourtant de mettre hors périmètre.

Deux conséquences voulues : masquer un partenaire n'écarte pas l'opération,
qui a existé et conserve ses autres partenaires ; et une opération dont tous
les partenaires sont masqués n'affiche pas « non renseigné » pour autant, ce
qui affirmerait une absence en base qui n'existe pas.

## Masquage d'office et absences

**L'établissement porteur est masqué au premier chargement.** Il figure comme
partenaire dans la plupart des opérations, ce qui est exact mais sans intérêt
pour la lecture : il écrase l'échelle des figures, gonfle le type
« Université » et masque les partenaires extérieurs, qui sont le sujet. La
reconnaissance se fait sur une forme réduite du libellé — accents,
ponctuation, chiffres romains — les graphies variant d'une saisie à l'autre.

Le masquage est posé une seule fois, reste réversible d'un clic, figure dans
le panneau des valeurs masquées et dans la légende, et une note en explique
la raison. Rien n'est écarté en silence, et surtout pas ce que l'utilisateur
n'a pas lui-même décidé.

**Les valeurs « non renseigné » sont traitées à part.** Ce ne sont pas des
catégories mais des lacunes de saisie, et trois conséquences en découlent :

- elles **ferment le classement** quel que soit leur effectif. « Laboratoire
  non renseigné » avec trois cents enregistrements prendrait autrement la
  tête des figures, faisant lire une lacune comme la première catégorie du
  corpus ;
- elles **ne se fondent jamais dans « Autres »**, qui réunit des valeurs de
  faible effectif — deux choses de nature différente ;
- elles **ne consomment aucune teinte** de la palette et se dessinent en gris
  effacé, hachuré. Le hachurage les distingue du regroupement, lui aussi
  gris : « Autres » contient des valeurs, une absence n'en contient aucune.

## Facettes repliables

Sept facettes déployées saturent la colonne des filtres. Chacune se replie sur
un en-tête, et l'état est mémorisé comme celui des figures. Toutes sont
fermées à l'ouverture.

Une facette repliée ne dissimule jamais un filtre actif : son en-tête porte le
nombre de valeurs retenues, et celles-ci sont rappelées en clair sous le
titre. Un filtre qui agirait sans se montrer serait pire que la surcharge
qu'on cherche à éviter.

Un menu déroulant classique aurait été plus compact encore, mais il n'accepte
qu'un choix unique là où les facettes sont multi-choix, et il aurait fait
perdre les compteurs contextuels ainsi que les gestes d'isolement et de
masquage.

## Gestes sur les figures empilées

**Survoler un segment décrit ce segment**, non la ligne entière : la série,
son effectif, et la part qu'elle représente dans le total de la ligne. Lister
tous les segments obligeait à retrouver des yeux celui qu'on désigne — l'in­verse
de ce qu'on attend d'un survol.

**Le clic droit sur un segment** propose d'isoler la combinaison, ce qui pose
deux filtres exacts d'un seul geste : le type de contrat *et* la durée, par
exemple. Les filtres portant sur d'autres champs sont conservés — les effacer
reviendrait à défaire en silence une sélection construite pas à pas. Le menu
offre aussi d'isoler l'une ou l'autre des deux valeurs séparément.

**L'étiquette d'un axe agit sur sa colonne entière** : le clic bascule le
filtre, le clic droit propose de n'afficher que cette valeur. Le clic aurait
pu isoler directement, mais cet endroit serait alors le seul de l'outil où un
clic remplace la sélection au lieu de s'y ajouter. L'infobulle annonce le
geste.

## Menu contextuel

Les entrées sont rangées par **nature d'action**, et chaque nature a son
verbe :

- **garder** agit sur la sélection — ajouter au filtre, ne garder que cette
  valeur, vider le filtre, masquer. Tous ces gestes changent les effectifs
  partout dans l'outil ;
- **afficher** agit sur le dessin d'une figure — n'afficher que cette valeur,
  tout réafficher, remettre dans le regroupement. Aucun effectif ne change ;
- **ouvrir** et **copier** sortent de l'outil.

Employer le même mot pour deux natures différentes était la confusion la plus
coûteuse : « n'afficher que cette valeur » désignait à la fois un filtre qui
écarte des enregistrements et une restriction qui n'en écarte aucun, deux
entrées voisines au libellé identique.

**Les séparateurs sont posés par l'assemblage, non à la main.** Une famille
vide disparaît sans laisser de trait, et il ne peut y avoir ni séparateur en
tête ni deux de suite. Posés entrée par entrée, ils finissaient par isoler des
lignes seules — trois traits pour les trois dernières — au lieu de marquer des
familles.

Masquer rejoint la famille de la sélection plutôt que d'occuper la sienne :
comme un filtre, le geste change les effectifs partout, et sa teinte
d'avertissement suffit à le distinguer. Une entrée seule entre deux traits
n'est pas une famille.

**Un doublon a disparu.** « Retirer les autres valeurs de ce filtre » faisait
deux choses selon que la valeur pointée y figurait ou non : garder celle-ci
seule — ce que « ne garder que cette valeur » dit déjà — ou vider le filtre.
Seul le second cas subsiste, sous son nom.

Une vérification porte sur la forme produite et non sur les intentions du
code : aucun séparateur en tête ni en fin, jamais deux de suite, au plus trois
familles, des traits rares au regard des entrées, et aucun intitulé en double
dans un même menu.

### Gestes disponibles

Un clic gauche ne peut porter qu'une action, et c'est le filtrage qui l'a
prise. Le clic droit rassemble les autres — isoler, retirer les autres
valeurs, mettre hors périmètre, copier — partout où une valeur apparaît :
facette, figure, matrice, réseau, tableau, panneau des partenaires. Le même
jeu d'actions au même geste, plutôt que des commandes différentes selon
l'endroit.

Maintenir Maj en cliquant droit affiche le menu du navigateur, comme le veut
l'usage.

## Réseau des chercheurs

Chaque point est un chercheur, rangé autour de son pôle de rattachement —
laboratoire, domaine, section ou statut, au choix.

Les groupes sont **pavés** plutôt qu'alignés sur un cercle. Ranger les pôles
sur un même cercle convient à une poignée de groupes ; au-delà d'une dizaine,
le cercle devient immense et son centre reste vide. Chaque groupe est donc
posé au plus près du centre là où il ne chevauche aucun autre, du plus gros au
plus petit — la figure forme une tache compacte. La recherche procède par
anneaux concentriques : déterministe, et rapide pour quelques dizaines de
groupes.

Les membres occupent des **couronnes régulières** autour de leur pôle. Une
disposition ordonnée se lit mieux qu'un nuage et rend comparables des groupes
d'effectifs voisins.

Le rendu :

- le **pôle est un disque plein** portant son effectif en réserve — la couleur
  d'un aplat se lit à distance, celle d'un contour se devine ;
- son **nom est placé au-dessus** du groupe : à l'intérieur du disque, il
  faudrait le réduire au point de le rendre illisible sur les petits pôles ;
- les **membres sont de petits points gris**. Répéter la couleur du pôle sur
  chacun d'eux sature l'image sans rien ajouter : leur appartenance se lit
  déjà à leur position. Seuls les cas notables s'en écartent — sans
  rattachement, ou relevant de plusieurs pôles ;
- les **liens restent en filigrane**, sauf ceux des membres à cheval, seuls
  porteurs d'information ;
- une **enveloppe teintée** cerne chaque groupe, discrète mais présente.

## Simulation de forces

La disposition **Libre**, celle par défaut, reprend la simulation de la
première version de l'outil. Les réglages sont repris tels quels, ayant été
éprouvés sur les données réelles : liens à distance 50 et intensité 0,45 ;
répulsion de −35 par chercheur et −420 par pôle, portée 180 ; centrage 0,08 ;
collision de rayon 8 et 28 ; groupement 0,28 ; refroidissement 0,025 ;
freinage 0,4.

Trois traits font sa qualité, et c'est leur absence qui rendait mes tentatives
précédentes inférieures.

**La répulsion porte entre tous les nœuds.** Un arbre quaternaire ramène le
coût à une valeur praticable : un groupe lointain est traité comme un point
unique placé à son barycentre — l'approximation de Barnes et Hut. Une grille
de voisinage, telle que j'en avais employé une, ne fait travailler que les
nœuds proches : deux groupes éloignés ne se repoussent alors pas du tout et ne
trouvent jamais leur place l'un par rapport à l'autre. Sans cette
approximation, le coût par image passe de 6 à 25 millisecondes, au-delà du
budget d'une animation.

**La force des liens est pondérée par le degré.** Un pôle relié à quarante
chercheurs reçoit de chaque lien une fraction correspondante, si bien qu'il
n'est pas emporté par la somme de leurs tractions. Tirer les deux extrémités
également, comme je le faisais, secoue les pôles et brouille l'ensemble : sur
un moyeu de trente liens, il parcourt alors huit fois plus de chemin que ses
feuilles.

**Rien ne confine les nœuds dans un cadre.** Le confinement que j'avais ajouté
les plaquait contre les bords dès que la disposition s'étendait. C'est la vue
qui s'ajuste au contenu, ce qui est le bon niveau pour traiter la question :
le cadrage suit la simulation pendant qu'elle se déploie, et le bouton
*Ajuster* le refait à la demande.

Le pavage sert de position de départ. Partir d'un placement calculé plutôt que
du hasard évite à la simulation de démêler une pelote avant de commencer son
travail, et rend la disposition finale reproductible — aucun tirage aléatoire
n'intervenant, les mêmes données donnent toujours la même image.

**Les réglages sont resserrés par rapport à ceux de la première version.**
Celle-ci disposait d'une fenêtre bien plus large. À résolution réduite, une
répulsion de longue portée étale la figure sur près de treize cents points,
que le cadrage doit ensuite réduire de moitié : les chercheurs deviennent des
poussières de deux pixels. Portée ramenée de 180 à 90, distance des liens de
50 à 26, charges et rayons de collision diminués d'autant — l'emprise tombe à
huit cents points et la taille apparente des points double, sans qu'aucun
chercheur ne se retrouve plus près d'un autre groupe que du sien. Le cadre
suit la largeur du panneau plutôt qu'une hauteur fixe, la disposition étant à
peu près carrée.

Sur les proportions réelles — trente-cinq laboratoires, sept cents chercheurs
— la disposition se pose en quelques centaines d'images à moins de six
millisecondes l'une, sans aucun chevauchement de groupes ni aucun chercheur
plus proche d'un autre pôle que du sien.

**Le cadrage automatique cesse dès que l'utilisateur intervient** — zoom,
déplacement de la vue, saisie d'un nœud. Sans cela, il continuerait à recadrer
sous les doigts pendant qu'on manipule la figure. Le bouton *Ajuster* le
réactive.

Les coordonnées du curseur sont converties par la matrice du **groupe
transformé**, non par celle du `<svg>`. Les nœuds vivent dans ce groupe, que
le zoom et le cadrage déplacent et redimensionnent : convertir au niveau du
`<svg>` revient à ignorer cette transformation, et le nœud saisi saute vers le
centre au lieu de suivre le curseur.

La disposition **Rangée** s'en tient au pavage, immobile : préférable avant un
export, où le mouvement n'apporte rien.

Un groupe de moins de trois membres n'a pas d'enveloppe convexe — il en
faudrait trois points distincts. Un cercle englobant lui en tient lieu, sans
quoi il serait le seul à ne pas être cerné et la figure paraîtrait inachevée.

Le **zoom découvre les noms des membres**, illisibles à l'échelle d'ensemble
mais nécessaires dès qu'on examine un groupe : molette ou boutons, glisser le
fond pour déplacer. Le zoom porte sur le point survolé plutôt que sur le
centre — agrandir doit rapprocher de ce qu'on regarde.

Le contenu est découpé au cadre du panneau. La règle générale des figures
autorise au contraire un léger débordement, pour que les libellés dépassent
sans être coupés ; sur une figure zoomable ce serait le contenu entier qui
déborderait sur la page.

Le placement de départ est **calculé, non tiré au hasard**. La structure
visée n'est pas quelconque : un chercheur appartient à un seul laboratoire et
à un ou deux domaines, c'est un graphe en étoiles. Les pôles occupent un
cercle, chacun entouré de ses membres en couronnes successives ; ceux qui
relèvent de plusieurs pôles se placent à leur barycentre.

Deux dispositions sont proposées.

**Libre** relaxe ensuite ce placement par des forces et laisse déplacer les
pôles à la souris. Partir d'une position calculée plutôt qu'aléatoire a deux
effets : la simulation converge en quelques dizaines d'images au lieu de
plusieurs centaines, n'ayant plus qu'à défaire les chevauchements ; et comme
aucun tirage aléatoire n'intervient, la disposition finale reste identique
d'un affichage à l'autre. L'animation s'arrête d'elle-même une fois
stabilisée — la laisser tourner consommerait le processeur sans rien apporter
— et reprend brièvement après un déplacement.

La répulsion n'est pas calculée entre toutes les paires : sur sept cents
chercheurs cela ferait un quart de million de distances par image. Une grille
spatiale ne fait travailler que les voisins immédiats, ce qui suffit puisque
seuls les chevauchements demandent à être défaits.

**Rangée** s'en tient au placement calculé, immobile — préférable pour une
figure destinée à l'export, où le mouvement n'apporte rien.

Traîner un pôle et cliquer dessus sont deux gestes distincts : le premier
range la figure, le second filtre. Un déplacement de plus de quelques pixels
neutralise le clic qui suit son relâchement. La neutralisation passe par un
drapeau plutôt que par une interception d'événement : `stopPropagation` ne
suspend pas les autres écouteurs du même élément, et l'ordre d'appel dépend
de l'ordre d'enregistrement.

Cette figure est propre au tableau de bord des chercheurs. Côté opérations,
chaque enregistrement porte plusieurs partenaires et plusieurs laboratoires :
la structure n'est plus en étoiles, et ce sont les flux qui conviennent.
Symétriquement, croiser laboratoire et domaine côté chercheurs ne ferait que
redire la composition des laboratoires — le panneau des croisements y est donc
absent, l'atelier restant disponible pour les rapprochements ponctuels.

## Bulles temporelles et frise

Deux lectures du temps, qui ne disent pas la même chose.

Les **bulles** comptent par période : une valeur par ligne, une autre par
colonne, l'aire d'un disque proportionnelle à l'effectif. Elles sont
disponibles dans l'atelier plutôt qu'en panneau fixe, leur lecture étant plus
ponctuelle que celle des autres figures. L'aire, et
non le rayon — doubler le rayon quadruple la surface perçue, et un effectif
deux fois plus grand paraîtrait quatre fois plus important. C'est la figure
qui répond d'un coup d'œil à « qui était actif quand » sur plusieurs dizaines
d'entités.

La **frise** montre l'étendue : chaque segment couvre la période réelle d'une
opération, de sa date de début à sa date de fin. Une opération de trois ans y
occupe trois ans. Les segments sont translucides, si bien que leurs
superpositions se lisent comme des périodes d'activité plus dense. C'est la
seule figure qui emploie les dates telles quelles plutôt qu'à travers l'année
de rattachement — les opérations dépourvues de l'une des deux dates n'y
figurent donc pas, et leur nombre est indiqué sous la figure.

L'axe s'arrête par défaut à 2036. Quelques dates de fin lointaines — saisie
erronée, ou convention pour un partenariat sans terme — étireraient sinon
l'axe sur des décennies et tasseraient toutes les autres opérations sur une
fraction de la largeur. Les opérations qui se poursuivent au-delà y sont
tronquées plutôt qu'écartées : elles ont bien couru sur la période affichée.
Le nombre d'opérations concernées est indiqué, avec de quoi lever la limite.

L'axe porte une graduation par année, mais un intitulé seulement là où il
tient : les afficher tous les serre au point de les rendre illisibles, alors
qu'un axe chronologique se lit très bien avec un repère sur deux ou sur cinq.
Les bornes sont ramenées aux limites d'année, une frise commençant au 17 mars
ne se lisant pas.

## Croisements

Le panneau vaut pour les deux tableaux de bord : laboratoire par domaine côté
chercheurs, laboratoire par partenaire côté opérations, et tout autre
croisement au choix. Trois lectures de la même donnée, offertes ensemble parce
qu'aucune ne remplace les autres :

- **Liens** — deux colonnes reliées, l'épaisseur du trait donnant le
  nombre d'opérations communes. Survoler une entrée éteint les liens qui ne
  la concernent pas ; le clic droit propose de maintenir cette mise en avant,
  ce qui permet de comparer deux entrées éloignées sans avoir à mémoriser la
  première pendant qu'on survole la seconde. Elle porte sur une entrée
  précise plutôt que sur un mode général : un réglage global aurait demandé
  de l'activer, puis de viser, puis de le désactiver. L'ordre des colonnes n'est pas celui des effectifs mais
  celui qui limite les croisements : heuristique du barycentre — chaque
  valeur se place à la hauteur moyenne de ses voisines, en alternant les
  côtés — suivie d'une passe de transposition. Classer par effectif produit
  un enchevêtrement dès la dizaine de liens.
- **Matrice** — les effectifs exacts, avec en-têtes fixes au défilement et un
  bouton de copie au format tableur. L'intensité de fond double le chiffre,
  elle ne le remplace pas.
- **Flux** — les volumes, proportionnels de bout en bout : la hauteur d'un
  bloc suit son nombre d'opérations, l'épaisseur d'un ruban le nombre
  d'opérations communes. Un bloc haut traversé de rubans fins travaille avec
  beaucoup d'interlocuteurs ; un bloc haut relié par un seul ruban épais
  concentre son activité.

Les épaisseurs de rubans sont normalisées nœud par nœud. Le plancher qui rend
un ruban fin visible ne peut pas s'appliquer indépendamment à chacun : un bloc
portant une nuée de liens marginaux verrait la somme de ses rubans dépasser sa
propre hauteur, et les derniers sortiraient du cadre — situation systématique
pour « Autres », qui réunit par construction de nombreuses valeurs. Le plancher
est donc borné par la part disponible, puis l'ensemble renormalisé.

Une disposition libre par simulation de forces a été essayée puis retirée.
Sur des données où presque tout est relié à presque tout, elle produit une
pelote centrale dont on ne tire aucune lecture : les nœuds importants ne
ressortent pas, les libellés se chevauchent, et deux affichages successifs ne
se ressemblent pas. Deux colonnes ordonnées répondent aux mêmes questions
sans ces défauts.

**Les deux axes sont libres.** Laboratoire × partenaire est le croisement le
plus demandé, mais type × laboratoire ou activité × année répondent à
d'autres questions. Un bouton intervertit les deux. Croiser un champ avec
lui-même est interdit : cela ne produirait qu'une diagonale.

Le niveau de détail se règle indépendamment sur chaque axe ; au-delà, les
valeurs sont réunies sous « Autres » sans jamais être retirées. Un test force
le regroupement au maximum et vérifie que la somme des cellules reste
inchangée.

**Détacher une valeur d'un regroupement n'est pas la filtrer.** La distinction
est structurante et n'allait pas de soi : porter une valeur au filtre restreint
les enregistrements, donc la figure finit par ne plus montrer qu'elle. Détacher
la fait au contraire apparaître à côté des autres barres, sans que la sélection
bouge d'un enregistrement.

Les deux gestes sont donc séparés dans la fenêtre d'un regroupement :
« + afficher » détache, « + filtre » restreint. Les valeurs détachées sont
mentionnées dans la légende — sans cela, deux figures du même sous-ensemble
pourraient différer sans explication — et conservées dans les profils.

**Tout regroupement est consultable.** Partout où « Autres » apparaît —
figures en barres, colonnes empilées, relations — un dépliant en donne le
contenu, valeur par valeur, chacune cliquable pour filtrer. Un regroupement
qui ne se déplierait pas reviendrait à masquer définitivement une partie des
données.

## Contrôle des données

Un tableau de bord donne une impression de complétude qu'aucun jeu de données
ne mérite : les valeurs manquantes n'y apparaissent pas, les variantes
d'écriture y comptent comme des entités distinctes, et rien ne signale qu'une
année a été déduite plutôt que saisie. Le panneau *Contrôle des données*
remet ces défauts sous les yeux, à côté des chiffres qu'ils affectent.

Il est replié par défaut — ces informations comptent mais ne doivent pas
s'interposer entre l'utilisateur et ce qu'il cherche — et son résumé reste
visible dans l'en-tête, ce qui suffit à savoir s'il y a lieu de l'ouvrir.

Les constats portent sur la **sélection courante**, non sur le corpus entier :
les défauts d'un sous-ensemble ne sont pas ceux de l'ensemble, et c'est le
sous-ensemble qu'on est en train de lire.

Aucun constat n'est une erreur en soi. Une date manquante renseigne sur la
saisie, pas sur une faute. Le rapprochement des variantes d'écriture est
**indicatif et ne fusionne rien** : « Éditions Dupont » et « Editions Dupond »
désignent probablement la même entité, mais « Lycée Voltaire » et « Lycée
Molière » non, malgré leur ressemblance. Une fusion automatique modifierait
les comptages sur une simple présomption.

## Couleurs

La teinte est tirée du libellé, ce qui la rend stable d'une figure à l'autre :
un laboratoire se repère d'un panneau au suivant sans relire les intitulés.
Un tirage par rang d'affichage aurait l'effet inverse — la même valeur
changerait de teinte dès qu'un filtre modifie le classement.

Mais la stabilité ne garantit pas la **distinction** : deux valeurs affichées
côte à côte peuvent tomber sur la même case de la palette, et la couleur cesse
alors de distinguer ce qu'on lui demande de distinguer. Chaque figure attribue
donc ses teintes en partant de la teinte préférée de chaque valeur, puis en
avançant dans la palette tant qu'elle est déjà prise. Le résultat reste
déterministe pour un ensemble donné ; entre deux figures portant les mêmes
valeurs, les teintes concordent.

La palette compte vingt-quatre teintes, de quoi couvrir les trente-cinq
laboratoires sans répétition visible sur une figure ordinaire.

Le mode *Encre unique*, dans les paramètres, convient mieux à une impression
en noir et blanc.

## Infobulles

L'attribut `title` du navigateur ne suffit pas partout : il tarde à paraître,
ne se met pas à jour quand la souris se déplace à l'intérieur d'un même
élément, et n'accepte qu'un texte brut. Sur la frise, c'est précisément ce
qu'il faudrait, l'information dépendant de l'endroit exact où l'on pointe et
plusieurs opérations se recouvrant sur une même ligne.

**Là où l'outil affiche sa propre infobulle, l'élément ne porte pas de
`<title>`.** Celui-ci produit une bulle native, tardive et pauvre, qui se
superposait à la nôtre — deux textes affichés en même temps sur le même
élément. La description passe par `aria-label`, qui informe les lecteurs
d'écran sans rien afficher. Les figures dépourvues d'infobulle propre gardent
leur `<title>` : il y reste la seule description disponible. Une vérification
parcourt les cinq familles de figures concernées et échoue dès qu'un élément
porte les deux.

Une infobulle propre à l'outil suit donc le pointeur : elle affiche la date
survolée, les opérations en cours à cette date sur la ligne, et met en avant
les segments correspondants en atténuant les autres. Un repère vertical
matérialise la date. Les attributs `title` sont conservés en parallèle : ils
servent aux lecteurs d'écran et survivent à l'export, là où l'infobulle est
propre à la page.

## Partager une vue

L'état de sélection est reporté dans l'adresse de la page : source, facettes,
masquages, détachements, recherche. Un lien transmet donc la vue telle quelle,
ce que les profils ne permettaient qu'à l'intérieur d'un même navigateur.

**Seule la sélection est reportée.** Les réglages d'affichage — mode d'une
figure, sens des barres, niveau de détail, thème, repli — restent locaux : ils
relèvent du confort de celui qui regarde, non de ce qu'il montre, et les
embarquer allongerait l'adresse sans rien apporter à qui la reçoit.

Les valeurs sont portées par des paramètres répétés plutôt que par une liste à
séparateur : un nom de laboratoire peut contenir n'importe quel caractère, et
tout séparateur finirait par se retrouver dans une valeur.

L'adresse est réécrite sans empiler d'entrée dans l'historique du navigateur.
Chaque case cochée y créerait sinon une étape, et le bouton « précédent »
deviendrait un annulateur maladroit — remontant parfois une seule case,
parfois quittant la page.

## Annuler

Le menu contextuel rend le masquage très accessible, et donc facile à
déclencher par mégarde — or masquer une valeur modifie tous les chiffres de la
page. Deux boutons dans la colonne des filtres, et les raccourcis usuels,
défont et refont les changements de sélection. Le bouton dit ce qu'il défera :
« Annuler le filtre laboratoire », « Annuler un masquage ».

**Le relevé se fait au rendu, non à l'action.** Les modifications de la
sélection partent d'une douzaine d'endroits — facettes, menu contextuel, clics
dans les figures, fenêtre des regroupements, profils. Instrumenter chacun
demanderait de n'en oublier aucun, aujourd'hui et à chaque ajout, et un oubli
ne se verrait pas. L'état est donc comparé à chaque rendu avec le dernier
relevé : aucun point d'appel à instrumenter, et tout changement est saisi,
d'où qu'il vienne.

Le raccourci est ignoré lorsqu'une saisie a le focus : il doit y défaire la
frappe, non la sélection.

## Repli des figures

Chaque figure porte une commande de repli dans son en-tête : un tableau de
bord long se parcourt mieux quand on peut écarter ce qui ne sert pas à la
question du moment. **L'état est mémorisé** — le refaire à chaque ouverture
serait une corvée d'autant plus sensible que le tableau de bord compte huit
panneaux.

Deux registres distincts, et non un seul : les figures sont ouvertes par
défaut et l'on mémorise celles qu'on referme, tandis que le contrôle des
données et l'atelier sont fermés par défaut et l'on mémorise ceux qu'on ouvre.
Les confondre inverserait l'état initial de la moitié des panneaux. La commande reste discrète au repos et se révèle au
survol du titre — la figure, non sa commande, doit retenir l'œil.

Cliquer la barre « Autres » détaille l'ensemble des valeurs, geste attendu
quand on veut voir d'un coup ce que le regroupement contient. L'examen valeur
par valeur reste accessible par le lien sous la figure.

## Export des figures

Chaque figure s'exporte en SVG ou en PNG, avec **la légende incrustée dans le
fichier** — non proposée à côté. Une figure exportée quitte l'outil et circule
seule : sans la phrase qui décrit son sous-ensemble, plus personne ne saura
trois semaines plus tard sur quoi elle portait ni ce qui en avait été écarté.

Les styles sont figés en attributs au moment de l'export : les variables CSS
du document ne suivent pas la figure dans le fichier, et un SVG exporté sans
cette étape s'ouvre sans couleurs. Le PNG est produit en double résolution,
une figure à l'échelle 1 étant floue une fois collée dans un document.

## Explorer librement

Les panneaux du tableau de bord répondent à des questions prévues. L'atelier
répond aux autres : deux champs au choix, une forme au choix — barres,
colonnes, empilées ou tableau.

Il est placé en fin de page et replié par défaut. Dans un tableau de bord, un
panneau qui demande à l'utilisateur de formuler sa question est un corps
étranger ; mais l'absence de soupape enferme dans les seuls croisements
anticipés, et ce sont rarement les plus intéressants. Il consomme les mêmes
fonctions que les autres panneaux, si bien que ce qu'on y lit concorde avec le
reste, filtres et masquages compris.

## Deux champs voisins : type et domaine d'activité

Le **type de partenaire** — une dizaine de valeurs contrôlées, Université,
Entreprise, Association — et le **domaine d'activité**, tiré du code NAF, qui
en compte plusieurs dizaines, se ressemblaient à l'oreille sous leurs anciens
intitulés. Le second s'appelle désormais « Domaine d'activité du partenaire ».

Le panneau *Années et partenaires* offre les deux lectures plutôt que d'en
imposer une, avec les années seules en troisième. Le type reste l'entrée : une
colonne empilée à trente segments est illisible, là où dix types se lisent
d'un coup d'œil.

Retirer la série d'un croisement le ramène à une figure simple sur son axe :
la forme suit le mode, sans quoi le panneau tenterait d'empiler une série
unique.

## Restreindre l'affichage d'une figure

Le clic droit sur une valeur propose « **N'afficher que cette valeur ici** ».
La figure ne dessine plus que celle-là ; le reste du tableau de bord ne bouge
pas.

**Rien ne se recalcule.** Une restriction ne filtre pas : elle dit à une
figure de ne pas dessiner certaines de ses valeurs. Aucun effectif ne change,
aucun enregistrement n'est écarté — la même barre est montrée seule. C'est ce
qui permet de la poser sans que la légende, les totaux ou les figures voisines
cessent d'être exacts, et c'est la raison de ce choix plutôt qu'un filtre
local : une figure recalculée sur un sous-ensemble afficherait des chiffres
que la légende ne décrit plus.

Ce qui en découle :

- **Chaque figure garde la sienne.** C'est ce qui permet de comparer une
  figure restreinte à un laboratoire avec ses voisines restées générales.
- **La figure le dit**, dans un bandeau qui rappelle que les effectifs sont
  inchangés, compte les valeurs non dessinées et offre de tout réafficher.
  Sans lui, la figure paraîtrait décrire toute la sélection.
- **L'export emporte cette mention.** La légende incrustée reprend la
  restriction de cette figure-là, sans quoi l'image sortirait muette sur ce
  qu'elle ne montre pas.
- **La légende générale la signale** — « 2 figures à affichage restreint » —
  mais sommairement : y dire quelle figure montre quoi laisserait croire que
  les effectifs annoncés en dépendent.
- **Elle s'annule et se partage comme un filtre**, puisqu'elle change ce qu'on
  voit. `Ctrl+Z` la lève, un lien la reproduit.
- **Le regroupement est levé** quand elle agit : « Autres » désignerait les
  valeurs qu'on vient justement d'écarter.

**La restriction est liée au champ représenté, non au seul panneau.** Un mode
change le champ sans changer l'identité de la figure : une restriction posée
sur un laboratoire se serait appliquée à des statuts au passage en « Statuts
seuls », aucune valeur n'aurait correspondu et la figure se serait vidée sans
rien dire.

**Une restriction devenue sans objet se signale.** La sélection a pu changer
depuis qu'elle a été posée, et les valeurs retenues n'existent plus
forcément : la figure se viderait alors en silence et l'on chercherait la
panne du mauvais côté.

**Un bouton lève toutes les restrictions d'un coup**, sous la réinitialisation
des filtres. Celle-ci ne les touche pas, et c'est juste — une restriction
n'écarte aucun enregistrement, elle ne compte donc pas parmi les filtres. Mais
rien ne permettait alors de les lever ensemble, et quatre figures restreintes
demandaient quatre gestes.

**Les profils les emportent**, comme les filtres : un profil doit reproduire
ce qu'on voyait, non seulement ce qu'on avait filtré.

Le geste n'est proposé que là où il agit — barres, colonnes, barres empilées,
nuage de mots, frise. Offrir une entrée de menu sans effet ailleurs serait
l'hétérogénéité qu'on venait de corriger.

## Cohérence du filtrage

Le filtrage part d'une douzaine d'endroits : facettes, figures, matrice, flux,
liens, réseau, tableau, partenaires, contrôle des données, atelier. Tous
mènent au même point de vérité, et tous les panneaux reçoivent la même
sélection filtrée — seules les facettes lisent le corpus entier, pour afficher
leurs compteurs contextuels.

Vérifier chaque point à la main laisse passer celui qu'on oublie, et un oubli
ne se voit pas : l'élément reste cliquable, le clic ne fait simplement rien.
Un **balayage systématique** prend donc chaque famille d'éléments cliquables,
clique, et constate que la sélection a bougé. Il porte sur le comportement et
non sur le câblage : un gestionnaire branché sur la mauvaise clé y échoue.

Deux défauts en sont sortis, tous deux invisibles à l'usage :

- **Les cellules de la matrice** n'avaient ni clic ni menu. Dans la vue
  désormais ouverte par défaut, le croisement le plus précis de la figure
  était le seul endroit inerte, alors que sa ligne et sa colonne filtraient
  toutes deux. Une cellule désigne une intersection, non une valeur :
  « ajouter au filtre » n'y aurait pas de sens — ajouter la ligne ou la
  colonne ? Le clic retient donc les deux, et le clic droit ouvre le menu de
  combinaison.
- **Les disques temporels** recevaient leurs rappels de clic et de menu sans
  jamais les brancher. La figure était la seule de l'outil où désigner une
  valeur ne faisait rien, sans que rien ne le laisse voir.

## Renvois vers Omeka S

Les fiches s'ouvrent dans l'**interface d'administration** :
`{racine}/admin/item/{id}`, la racine étant déduite de l'adresse de l'API par
retrait du segment `/api`. C'est là qu'on consulte et qu'on corrige ; la
connexion est requise, ce qui est cohérent avec cet usage.

**Le lien du tableau était cassé.** Il pointait sur l'`@id` renvoyé par l'API,
qui désigne la ressource JSON et non une page lisible : il menait à du texte
brut. Le panneau des partenaires, lui, chargeait l'adresse sans jamais
l'afficher — la fiche y était inatteignable, et son identifiant n'était même
pas repris dans les fiches agrégées.

Le renvoi est aussi proposé **au clic droit sur une valeur** dans les figures,
les facettes et les tableaux, lorsque cette valeur provient d'un item lié :
partenaire, type de partenaire, code d'activité, type de contrat. Leur
identifiant Omeka est désormais conservé au chargement, alors qu'il était
jusqu'ici jeté une fois le libellé résolu.

Les champs **calculés** — année, tranche de durée, laboratoire déduit — n'ont
pas de fiche. Le renvoi n'y est pas proposé, plutôt que de mener à une page
inexistante.

Le clic gauche continue de filtrer, partout : le renvoi est un geste
secondaire, comme le masquage ou l'isolement.

## Boîte à outils

Un menu en haut à gauche rassemble des liens vers d'autres outils. Ils sont
réglés depuis *Configuration → Outils* et conservés dans le navigateur, non
inscrits dans le code : une liste codée en dur exposerait des adresses
internes dans un dépôt publié et imposerait de modifier le code pour ajouter
un outil.

L'instance Omeka S y figure d'office, son adresse étant déduite de celle de
l'API. Elle suit donc la configuration et n'a pas à être saisie.

## État d'avancement

Toutes les étapes prévues sont livrées : socle de données, filtres à facettes,
légende de sélection, indicateurs, figures, relations entre deux champs en
trois vues, panneau des partenaires, tableau, contrôle des données, atelier
d'exploration, exports CSV et figures, profils de filtres, thème sombre.

Pistes non traitées, par ordre d'utilité décroissante à mon sens : le
renommage des valeurs depuis l'interface — la mécanique existe dans
`core/reglages.js` mais n'a pas d'écran ; la mémorisation de la sélection dans
l'adresse de la page, pour partager un état par simple lien ; l'export du
tableau de bord entier en un document.
