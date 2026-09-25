# Journal des modifications

Ce fichier dit **ce qui a changé** ; le `LISEZMOI.md` dit **pourquoi**. Quand une
décision a une raison qui mérite d'être conservée, elle est consignée là-bas et
seulement résumée ici.

Les entrées sont classées de la plus récente à la plus ancienne. Chacune
distingue *Ajouté*, *Modifié*, *Corrigé* et *Retiré*. Ce journal a été ouvert au
moment du premier dépôt : les dates antérieures à celui-ci sont approximatives,
et les versions plus anciennes que `0.5.0` sont regroupées.

Une mention **⚠ cache** signale un changement de `VERSION_FORMAT` dans
`js/core/omeka.js` : les données conservées dans le navigateur sont alors
invalidées et rechargées depuis l'API au premier affichage.

---

## [1.0.0] — 2026-09-25

Refonte complète du panneau *Montants*, après deux versions écartées. Le détail
du raisonnement est dans le `LISEZMOI.md`, section « Montants » ; le résumé est
qu'une donnée financière ne se décrit pas par la forme statistique de sa
distribution mais par des euros cumulés, écrits.

### Ajouté

- Panneau *Montants* à **cinq lectures** : montants cumulés, volume contre
  valeur, bande de dispersion, cumul dans le temps, les plus gros contrats.
- **Trois réglages indépendants** dans la tête du panneau — la grandeur
  mesurée (budget de l'opération / montant global TTC), la lecture, la maille
  d'agrégation (année, type de contrat, laboratoire, partenaire, type de
  partenaire, domaine d'activité). Réunis en un menu unique, ils auraient fait
  soixante entrées pour trois décisions.
- **Chaque figure porte ses euros et son nombre d'opérations.** Une colonne
  haute peut être un gros contrat ou trente petits ; seule la mention des deux
  le dit.
- **Bande de dispersion** : un point par opération sur un axe gradué en euros,
  médiane et intervalle interquartile marqués derrière les points. Seule
  lecture qui n'additionne rien, donc seule immune au double comptage.
- **Indicateur de concentration** : « X % portés par les 10 % les plus gros »,
  affiché au-delà de dix montants renseignés seulement.
- **Bascule d'échelle linéaire / logarithmique** partout où un axe porte des
  montants bruts.
- **Menu de l'enregistrement sur un point de figure**, au clic gauche comme au
  clic droit : un point n'est pas une valeur à filtrer mais une opération, et
  réserver ce menu au clic droit l'y rendait introuvable. Option `auClic`
  ajoutée à `attacherMenu`.
- **Note d'écart entre la somme des barres et le total réel**, dans les deux
  sens (voir *Corrigé*).
- Nouveau module `js/ui/montants.js`. `js/ui/graphique.js` exporte désormais ses
  primitives partagées (`el`, `texte`, `decrire`, `ajuster`, `couleurTheme`).
- **Sentinelle d'erreurs** dans `test/interface.mjs` : les exceptions levées
  dans un gestionnaire d'événement sont relevées et comptées. Elles étaient
  jusqu'ici avalées par jsdom, et une figure pouvait casser à l'usage sans
  qu'aucune vérification ne bronche.

### Modifié

- **L'orientation des barres se déduit du champ** sur le panneau *Montants* :
  une échelle ordonnée — années, durées, tranches — se lit à la verticale,
  convention de l'histogramme ; des libellés longs et sans ordre restent à
  l'horizontale. Le bouton de bascule ne sert plus qu'à passer outre.
  `_sens()` et `_boutonSens()` acceptent un défaut fourni par l'appelant.
- **Les tranches de montant ne servent plus qu'à filtrer.** Elles restent en
  facette, où un seuil arbitraire est sans conséquence, et ont quitté les
  figures.
- **Classement des plus gros contrats** : les deux montants sont imbriqués l'un
  dans l'autre, l'écart se lisant contrat par contrat.
- **Graduations d'axe à unité unique.** Elles sortaient en « 0 », « 5 000 € »,
  « 10 k€ », « 15 k€ » : l'œil devait convertir pour comparer deux repères
  voisins. L'unité se décide une fois, sur la borne de l'échelle.
- La tête de panneau autorise le retour à la ligne plutôt que de comprimer ses
  sélecteurs.

### Corrigé

- **Message d'écart inversé.** La note comparant la somme des barres au total
  réel annonçait « au-delà du total réel » dans tous les cas. L'écart va dans
  les deux sens : il est négatif dès qu'un masquage retire *toutes* les valeurs
  d'une opération pour le champ affiché — ce que le masquage d'office de
  l'université produit en maille « Partenaire » pour toute opération sans autre
  partenaire. Le message annonçait donc un double comptage là où il manquait de
  l'argent. Les deux directions ont désormais leur énoncé, et la note se tait
  sous une restriction d'affichage, où la somme est plus petite par
  construction.
- **Menu contextuel absent sur les valeurs « non renseigné ».** La coupure
  portait sur `horsEchelle`, qui englobe l'absence en plus du regroupement.
  Partout ailleurs dans l'outil, seul « Autres » en est privé : une absence se
  masque et se filtre comme une autre valeur.
- **Axe de dénombrement gradué en fractions.** Sur trois ou quatre catégories,
  *Volume contre valeur* calculait un pas de 0,2 et l'axe sortait
  « 0 0 0 1 1 1 » après arrondi des étiquettes.
- **Centaines d'arrêts de tabulation.** Chaque point de la bande de dispersion
  était atteignable au clavier ; avec plusieurs centaines de contrats la
  navigation s'y enfermait. Les points en sortent — ils restent cliquables et
  décrits par le rang qui les contient —, le rang y reste.
- Les disques de la bande interceptaient le pointeur, ce qui empêchait de
  mettre en valeur le point survolé.

### Retiré

- **Courbe de répartition classée**, **courbe de concentration**, **boîtes à
  moustaches** et **nuage temporel**, livrées puis écartées. Techniquement
  justes, muettes à l'usage : elles répondaient à « quelle est la forme
  statistique de la série », question que personne ne pose, et ne portaient
  aucun chiffre lisible. Les trois premières sont remplacées par la bande de
  dispersion ; la concentration devient un indicateur.
- L'histogramme des tranches de montant, qui les avait précédées.

---

## [0.9.0] — 2026-09-24

### Ajouté

- **Champs financiers** `valo:budgOPE` (budget de l'opération, part revenant à
  l'établissement) et `valo:montantGlobal` (total tous partenaires confondus),
  avec lecture stricte des montants saisis à la main : `123`, `123,45`,
  `1 234,56`, `5000 €`, `12 000 € TTC`. Une valeur illisible vaut « inconnu »,
  jamais zéro. **⚠ cache** (`VERSION_FORMAT` porté à 7).
- Indicateurs financiers : budget cumulé, montant global cumulé, budget médian,
  chacun accompagné de son taux de renseignement.
- Contrôles de données : montant non interprétable, budget supérieur au montant
  global (inversion probable des deux champs), budget manquant, type de contrat
  manquant.
- **Isolement d'affichage par figure** : restreindre une figure à quelques
  valeurs sans toucher aux effectifs ni aux autres figures. Reporté dans
  l'adresse, annulable, signalé par un bandeau sous la figure et repris dans la
  légende des exports.
- Champ `valo:opeType` (type de contrat).

### Modifié

- **Menu contextuel restructuré** en familles — sélection, affichage, renvois
  externes —, les séparateurs étant posés par l'assemblage et non à la main.
  Ils finissaient par isoler des entrées seules plutôt que par marquer des
  groupes.
- Libellés : « Opérations et partenariat » devient *Partenariats* ; « Activité
  du partenaire » devient *Domaine d'activité du partenaire* ; « Étendue des
  opérations » devient *Durée des partenariats par laboratoire*.
- La matrice s'affiche par défaut dans les croisements, plus lisible que les
  flux.

### Corrigé

- **Cohérence du filtrage** : plusieurs zones cliquables n'étaient pas branchées
  sur la sélection générale. Un contrôle systématique parcourt désormais une
  valeur de chaque famille de figures et vérifie que la sélection change.
- La zone « Enregistrements » n'ouvrait pas de menu contextuel, et la fiche
  Omeka S d'une opération restait inatteignable.
- Infobulle en double sur les segments d'empilement : un `<title>` SVG produit
  une bulle native qui doublait celle de l'outil. Remplacé par `aria-label`.

### Retiré

- Visualisation « Domaines HCERES » : la nomenclature n'apportait pas de lecture
  que les effectifs par laboratoire ne donnaient déjà. Le champ reste en
  facette, dans l'atelier et dans les croisements.

---

## [0.8.0] — 2026-09-24

### Ajouté

- **Charte graphique de l'Université Paris 8 des Créations** : palette
  (Raspberry, Poppy, Maroon), typographie Poppins. Le thème sombre emploie des
  variantes éclaircies, aucune couleur de la charte n'atteignant le niveau AA
  sur fond sombre.
- **Renvois vers Omeka S** depuis les figures, les tableaux et les listes, vers
  la page d'administration de l'item (`/admin/item/{id}`) — l'identifiant `@id`
  renvoyant du JSON et non une page lisible.
- **Boîte à outils** en tête de page, vers d'autres outils. Les liens sont
  réglés par l'utilisateur et conservés dans le navigateur ; l'instance Omeka S
  est déduite de l'adresse de l'API.

### Modifié

- **L'adresse de l'API n'est plus inscrite dans le code.** Le champ est vide au
  premier lancement et l'adresse saisie est conservée dans le navigateur : le
  dépôt peut être publié sans désigner d'instance interne.

---

## [0.7.0] — 2026-09-24

### Ajouté

- **Partage par l'adresse** : la sélection — facettes, masquages, détachements,
  recherche — est reportée dans l'adresse de la page, sans empiler d'entrée dans
  l'historique du navigateur. Les réglages d'affichage restent locaux.
- **Annulation et rétablissement** de la sélection, avec description de ce que
  le retour en arrière défera. L'état est relevé au rendu et non à l'action :
  aucun point d'appel à instrumenter, et tout changement est saisi, d'où qu'il
  vienne.
- Repli des figures, conservé d'une session à l'autre.
- Facettes en listes dépliables.
- Survol d'un segment d'empilement : l'infobulle décrit la portion pointée, non
  la ligne entière. Clic droit pour isoler un croisement.
- Clic sur un libellé d'axe : agit sur la colonne entière.
- Bouton de bascule du sens des barres.
- Nuage de mots par défaut pour les mots-clés, un histogramme imposant un
  classement là où l'écart entre le vingtième et le trentième terme ne signifie
  rien.

### Corrigé

- Nuage de mots : 34 % des termes seulement étaient placés. La taille est
  désormais calibrée sur l'aire réellement occupée, mesurée et non estimée.
- Débordements de figures hors de leur cadre, sur une valeur écartée du calcul
  du maximum — le même défaut, six fois de suite. Ce qui dépasse est borné et
  signalé par un chevron de troncature, et un contrôle systématique parcourt
  toutes les familles de figures.
- « UNIVERSITÉ PARIS 8 » est masquée d'office, et les valeurs « non renseigné »
  s'affichent discrètement au lieu de fixer les échelles.

---

## [0.6.0] — 2026-09-24

### Modifié

- **Physique du réseau reprise de la première interface**, jugée meilleure :
  arbre quaternaire et approximation de Barnes-Hut pour la répulsion, force de
  lien pondérée par le degré, pas de confinement. Une grille à maille fixe ne
  permet pas cette approximation : deux groupes éloignés ne se repoussent pas du
  tout et ne trouvent jamais leur place l'un par rapport à l'autre.
- Enveloppes convexes autour des groupements.
- Couleur dans les figures, avec trois stratégies d'attribution selon l'usage :
  teinte stable tirée du libellé, attribution sans collision, et teintes
  écartées dans la palette pour les segments qui se touchent.
- Cadre du réseau agrandi ; le zoom agit sur la physique et ne déborde plus de
  son panneau.
- Tous les laboratoires affichés par défaut dans le réseau.

### Corrigé

- **Glisser un pôle appliquait un filtre.** `stopPropagation` ne suspend pas les
  autres écouteurs du même élément : un drapeau posé sur l'élément distingue le
  glissement du clic.
- Nœuds plaqués contre les bords après redimensionnement : les positions étaient
  mises à l'échelle autour du centre du *nouveau* cadre alors qu'elles étaient
  exprimées dans l'ancien.
- Une bulle saisie se replaçait au centre au lieu de suivre le curseur.
- Couleurs dupliquées entre deux valeurs voisines, qui empêchaient de les
  distinguer.
- Barres de frise directement cliquables, et infobulle de contexte au survol.
- Axe des liens et des flux sur « Type de partenaire » par défaut ; frise bornée
  à 2036.

---

## [0.5.0] et versions antérieures — septembre 2026

Construction de l'outil : chargement depuis l'API Omeka S avec cache versionné
dans le navigateur, normalisation des enregistrements, registre de champs,
sélection par facettes avec masquages et détachements, tableau de données,
panneaux de figures (barres, colonnes, empilements, bulles, frises, matrices,
réseau), atelier de croisements, contrôle de la qualité des données, profils de
réglages, export des figures, thème clair et sombre.

Principe directeur, valable depuis le début : **un seul point de vérité par
tableau de bord.** Tous les panneaux reçoivent les mêmes enregistrements filtrés,
et chaque geste dans une figure agit sur la sélection commune.

---

## Vérifications

L'outil n'a pas de dépendance d'exécution et ses vérifications tournent avec
Node seul : `sh test/tout.sh`.

| Suite | Objet | Vérifications |
|---|---|---|
| `test/moteur.mjs` | sélection, regroupements, lecture des données | 233 |
| `test/interface.mjs` | parcours complet dans jsdom | 482 |
| `test/effets.mjs` | effets de bord, géométrie des figures | 227 |
| `test/styles.mjs` | feuille de style, contrastes | 26 |
| | **total** | **968** |

Méthode suivie à chaque correction : écrire la vérification, **saboter le code**
et confirmer qu'elle échoue. Plusieurs vérifications ont passé alors que le
défaut était présent — parce qu'elles mesuraient une grandeur indirecte, parce
qu'une garde escamotait tout un bloc en silence, ou parce qu'une lecture non
protégée interrompait la série. Le sabotage est le seul moyen de s'en assurer.
