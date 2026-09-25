/**
 * panels/figures.js
 * Les panneaux graphiques.
 *
 * Chaque panneau répond à une question fixe et ne demande aucun réglage pour
 * livrer sa réponse. Le seul réglage offert est le niveau de détail — combien
 * de valeurs sont détaillées avant regroupement —, parce qu'il dépend de ce
 * qu'on cherche et non de la donnée.
 *
 * Cliquer une barre filtre l'ensemble du tableau de bord. La figure sert donc
 * autant à interroger qu'à lire, et la boucle se referme : on voit le résultat
 * de son geste dans la même page.
 */
import { champ, UNITE, CHAMPS, estAbsence } from '../core/champs.js';
import { preferences, estReplie, basculerRepli } from '../core/preferences.js';
import { effectifs, croisement, valeursVisibles } from '../core/selection.js';
import { analyserDate, formaterMontant } from '../core/omeka.js';
import { regrouper, noteRegroupement, LIBELLE_AUTRES } from '../core/groupe.js';
import { barresHorizontales, colonnes, colonnesEmpilees, legendeCouleurs,
         bullesTemporelles, frise, attribuerCouleurs,
         barresEmpilees, attribuerCouleursContrastees,
         nuageMots, horsEchelle } from '../ui/graphique.js';
import { colonnesMontants, barresMontants, volumeValeur, cumulTemporel,
         bandeDispersion, classementMontants } from '../ui/montants.js';

/** Définition des panneaux, par tableau de bord. */
const PANNEAUX = {
    ope: [
        { id: 'annees', titre: 'Opérations par année', cle: 'annee', forme: 'colonnes',
          note: 'L’année provient de la date de début lorsqu’elle est renseignée, '
              + 'sinon de l’identifiant de l’opération.' },
        /* Le type de contrat ne se lit pleinement que croisé : sa répartition
           seule dit peu, sa distribution par durée ou par année dit comment
           l'établissement contractualise. */
        { id: 'contrats', titre: 'Types de contrat', forme: 'barres', detail: 12,
          cle: 'contrat',
          modes: [
              { cle: 'duree', libelle: 'Types de contrat par durée',
                champ: 'contrat', serie: 'duree' },
              { cle: 'seul', libelle: 'Types de contrat seuls', champ: 'contrat' },
              { cle: 'annee', libelle: 'Types de contrat par année',
                champ: 'contrat', serie: 'annee' },
              { cle: 'partenaire', libelle: 'Types de contrat par type de partenaire',
                champ: 'contrat', serie: 'type' },
          ] },

        { id: 'types', titre: 'Types de partenaires', cle: 'type', forme: 'barres', detail: 10 },
        { id: 'partenaires', titre: 'Partenaires', cle: 'partenaire', forme: 'barres', detail: 12,
          note: 'Une opération associant plusieurs partenaires compte pour chacun : '
              + 'la somme des barres dépasse donc le nombre d’opérations.' },
        { id: 'labos', titre: 'Laboratoires', cle: 'labo', forme: 'barres', detail: 12 },
        { id: 'durees', titre: 'Durée des opérations', cle: 'duree', forme: 'barres', detail: 0 },
        /* Les montants : deux erreurs successives avant d'arriver là.
           D'abord des tranches fixes comptées en barres — la distribution
           étant très dissymétrique, les deux premières absorbaient
           l'essentiel des opérations et les contrats exceptionnels
           disparaissaient dans la dernière. Puis, en réaction, des figures de
           distribution — courbe classée, concentration, boîtes à moustaches :
           plus justes techniquement, et moins informatives, puisqu'elles
           répondaient à « quelle est la forme statistique de la série » et ne
           portaient aucun chiffre lisible.
           Ce qu'aucune des deux ne montrait : combien d'euros, de qui, quand.
           D'où des montants cumulés par catégorie. Le cumul avait été écarté
           par crainte du double comptage, à tort pour l'essentiel : une
           opération a une seule année et un seul type de contrat, la somme y
           est exacte. Sur les laboratoires et les partenaires, le total réel
           est affiché à côté de la somme des barres.
           Trois réglages plutôt qu'un menu unique : la grandeur décide de ce
           qu'on mesure, la lecture de la manière de le montrer, la catégorie
           de la maille. Combinés, ils feraient soixante entrées. */
        { id: 'montants', titre: 'Montants', forme: 'montants',
          mesures: [
              { cle: 'budget',  libelle: 'Budget de l’opération' },
              { cle: 'montant', libelle: 'Montant global (TTC)' },
          ],
          categories: [
              { cle: 'annee',      libelle: 'Année' },
              { cle: 'contrat',    libelle: 'Type de contrat', detail: 12 },
              { cle: 'labo',       libelle: 'Laboratoire', detail: 12 },
              { cle: 'partenaire', libelle: 'Partenaire', detail: 12 },
              { cle: 'type',       libelle: 'Type de partenaire', detail: 10 },
              { cle: 'naf',        libelle: 'Domaine d’activité du partenaire', detail: 12 },
          ],
          modes: [
              { cle: 'cumules',    libelle: 'Montants cumulés',
                categorie: 'annee' },
              { cle: 'volume',     libelle: 'Volume contre valeur',
                categorie: 'contrat' },
              { cle: 'bande',      libelle: 'Bande de dispersion',
                categorie: 'facultative' },
              { cle: 'cumul',      libelle: 'Cumul dans le temps' },
              { cle: 'classement', libelle: 'Les plus gros contrats' },
          ],
          note: 'Une opération dont le montant n’est pas renseigné ne peut pas être '
              + 'placée sur un axe de valeurs : elle est décomptée sous la figure '
              + 'plutôt que ramenée à zéro. La bande de dispersion est la seule '
              + 'lecture qui n’additionne rien : une opération portée par deux '
              + 'laboratoires y apparaît deux fois sans fausser aucune médiane.' },

        /* Deux champs se ressemblent à l'oreille : le « type » de partenaire
           — une dizaine de valeurs contrôlées — et son « domaine d'activité »,
           tiré du code NAF, qui en compte plusieurs dizaines. Les deux
           lectures sont offertes plutôt que d'en imposer une : le type reste
           l'entrée, une colonne empilée à trente segments étant illisible. */
        { id: 'croise', titre: 'Années et partenaires', forme: 'empilees',
          /* Zéro : toutes les séries sont montrées. Le croisement est déclaré,
             il n'y a pas lieu d'en cacher une partie. */
          cleX: 'annee', cleSerie: 'type', detailSerie: 0,
          modes: [
              { cle: 'type', libelle: 'Années et types de partenaire',
                champX: 'annee', champSerie: 'type' },
              { cle: 'naf', libelle: 'Années et domaines d’activité',
                champX: 'annee', champSerie: 'naf', detailSerie: 12 },
              { cle: 'annee', libelle: 'Années seules',
                champX: 'annee', champSerie: null },
          ] },
        { id: 'frise', titre: 'Durée des partenariats par laboratoire', forme: 'frise',
          cle: 'labo', detail: 12, anneeMax: 2036,
          note: 'Chaque segment couvre la période réelle d’une opération, de sa date de '
              + 'début à sa date de fin. Les opérations sans les deux dates n’y figurent '
              + 'pas : leur étendue est inconnue. Les superpositions se lisent comme des '
              + 'périodes d’activité plus dense. '
              /* Limite de la donnée, non de la figure : avant 2020, le
                 versement des contrats dans GFC n'était pas systématique.
                 Une frise qui remonte à 2015 laisse croire à un creux
                 d'activité là où il n'y a qu'un défaut de saisie. */
              + 'Avant 2020, tous les contrats ne figuraient pas dans GFC : '
              + 'les périodes antérieures sont incomplètes, et un creux y traduit '
              + 'un défaut de versement autant qu’une baisse d’activité.' },
    ],
    ec: [
        /* Un seul panneau plutôt que deux : séparés, ils obligeaient à
           rapprocher de tête un classement et une répartition, et ne disaient
           rien de la composition d'un laboratoire donné. Les modes nomment ce
           qu'ils montrent — l'utilisateur choisit une lecture, il n'a pas à
           composer un croisement. */
        { id: 'labos', titre: 'Laboratoires et statuts', forme: 'barres', detail: 15,
          cle: 'labo',
          modes: [
              { cle: 'croise', libelle: 'Effectifs et statuts par laboratoire',
                champ: 'labo', serie: 'statut' },
              { cle: 'effectifs', libelle: 'Effectifs par laboratoire', champ: 'labo' },
              { cle: 'statuts', libelle: 'Statuts seuls', champ: 'statut' },
          ] },
        /* Nuage par défaut : un histogramme de mots-clés impose un classement
           là où l'écart entre le vingtième et le trentième terme ne signifie
           rien, et son axe donne une précision que des étiquettes saisies à la
           main ne portent pas. Les barres restent à un clic pour qui cherche
           un effectif exact. */
        { id: 'motscles', titre: 'Mots-clés', cle: 'motcle', forme: 'nuage',
          detail: 60,
          modes: [
              { cle: 'nuage', libelle: 'Nuage de mots', champ: 'motcle', forme: 'nuage' },
              { cle: 'barres', libelle: 'Barres classées', champ: 'motcle', forme: 'barres' },
          ],
          note: 'Les mots-clés sont saisis librement : les variantes d’écriture '
              + 'ne sont pas regroupées.' },
        /* Les sections CNU viennent en dernier : elles décrivent le
           rattachement administratif plutôt que l'activité, et intéressent
           moins souvent que les effectifs ou les thèmes.
           Les domaines HCERES avaient leur figure ; elle a été retirée, la
           nomenclature n'apportant pas de lecture que les effectifs par
           laboratoire ne donnent déjà. Le champ reste disponible en facette,
           dans l'atelier et dans les croisements. */
        { id: 'cnu', titre: 'Sections CNU', cle: 'cnu', forme: 'barres', detail: 12 },
    ],
};

export class Figures {
    constructor(hote, options) {
        this.hote = hote;
        this.o = options;
        this.detail = {};     // niveau de détail choisi, par panneau
        this.plafond = {};    // année limite de l'axe, par panneau
        this.modes = {};      // lecture retenue, par panneau
        this.sens = {};       // orientation des barres, par panneau
        this.mesures = {};    // grandeur représentée, pour les panneaux financiers
        this.categories = {}; // maille retenue, par panneau et par lecture
        this.log = {};        // échelle logarithmique, par panneau
    }

    rendre(rows) {
        const source = this.o.source();
        const etat   = this.o.etat();
        const unite  = UNITE[source].pluriel;

        this.hote.innerHTML = '';

        if (!rows.length) {
            const vide = document.createElement('p');
            vide.className = 'note';
            vide.textContent = 'Aucune donnée à représenter avec les filtres actifs.';
            this.hote.appendChild(vide);
            return;
        }

        PANNEAUX[source].forEach(definition => {
            let def = definition;
            const section = document.createElement('section');
            section.className = 'panneau';

            const tete = document.createElement('div');
            tete.className = 'panneau-tete';

            /* Repli : un tableau de bord long se parcourt mieux quand on peut
               écarter ce qui ne sert pas à la question du moment. Le bouton
               reste discret — la figure, pas sa commande, doit retenir l'œil. */
            const replie = estReplie(source, def.id);
            const bascule = document.createElement('button');
            bascule.type = 'button';
            bascule.className = 'replier';
            bascule.setAttribute('aria-expanded', String(!replie));
            bascule.title = replie ? 'Déplier cette figure' : 'Replier cette figure';
            bascule.textContent = replie ? '▸' : '▾';
            bascule.addEventListener('click', () => {
                basculerRepli(source, def.id);
                this.o.onRafraichir();
            });

            const h = document.createElement('h2');
            h.textContent = def.titre;
            tete.append(bascule, h);

            /* Sens des barres. Un libellé long se lit mieux à l'horizontale,
               une série chronologique à la verticale : le bon sens dépend de
               la donnée et de la place, pas de la figure. */
            if (['barres', 'colonnes'].includes(def.forme)) {
                tete.appendChild(this._boutonSens(def));
            }

            section.appendChild(tete);

            if (replie) {
                section.classList.add('panneau-replie');
                this.hote.appendChild(section);
                return;
            }
            /* Le bouton d'export est ajouté après le rendu, quand la figure
               existe : il n'a rien à exporter avant. */
            setTimeout(() => this.o.onExport?.(tete, corps, def.titre), 0);

            const corps = document.createElement('div');
            corps.className = 'figure-corps';
            section.appendChild(corps);

            /* Le mode retenu redéfinit le champ représenté et, le cas
               échéant, celui qui le décompose. */
            if (def.modes) {
                const choisi = def.modes.find(m => m.cle === this.modes[def.id])
                            || def.modes[0];
                tete.appendChild(this._reglageMode(def, choisi));
                /* Un mode redéfinit soit le champ d'une figure simple, soit
                   les deux axes d'un croisement. Un croisement dont la série
                   est retirée devient une figure simple sur son axe : la
                   forme suit, sans quoi le panneau tenterait d'empiler une
                   seule série. */
                def = { ...def,
                        cle: choisi.champ ?? choisi.champX ?? def.cle,
                        serie: choisi.serie,
                        cleX: choisi.champX ?? def.cleX,
                        cleSerie: choisi.champSerie !== undefined
                            ? choisi.champSerie : def.cleSerie,
                        forme: choisi.forme
                            || (choisi.champX && !choisi.champSerie ? 'colonnes' : def.forme),
                        detail: choisi.detail ?? def.detail,
                        detailSerie: choisi.detailSerie ?? def.detailSerie };
            }

            if (def.forme === 'empilees')    this._empilees(def, rows, source, etat, corps, tete, unite);
            else if (def.forme === 'bulles') this._bulles(def, rows, source, etat, corps, tete, unite);
            else if (def.forme === 'frise')  this._frise(def, rows, source, etat, corps, tete);
            else if (def.forme === 'nuage')  this._nuage(def, rows, source, etat, corps, tete, unite);
            else if (def.forme === 'montants') this._montants(def, rows, source, etat, corps, tete, unite);
            else                             this._simple(def, rows, source, etat, corps, tete, unite);

            if (def.note) {
                const note = document.createElement('p');
                note.className = 'note';
                note.textContent = def.note;
                section.appendChild(note);
            }

            this.hote.appendChild(section);
        });
    }

    /* ── Barres ou colonnes sur un seul champ ── */
    _simple(def, rows, source, etat, corps, tete, unite) {
        const def_ = champ(source, def.cle);
        const comptes = effectifs(rows, source, def.cle, etat);
        const cles = Object.keys(comptes);

        if (!cles.length) {
            corps.innerHTML = '<p class="note">Aucune valeur renseignée pour ce champ.</p>';
            return;
        }

        /* Décomposition : la figure garde ses totaux mais les détaille par un
           second champ. Deux figures séparées obligeraient à faire le
           rapprochement de tête, et ne diraient rien de la composition d'une
           valeur donnée. */
        /* La décomposition vient du mode retenu, non d'un menu à composer. */
        const cleRepartition = def.serie || '';
        const detail = this.detail[def.id] ?? def.detail ?? 0;
        const tri = def_?.nature === 'temporel' ? 'ordre'
                  : def_?.ordre ? 'ordre' : 'effectif';
        const ordre = def_?.nature === 'temporel'
            ? cles.slice().sort((a, b) => String(a).localeCompare(String(b), 'fr', { numeric: true }))
            : def_?.ordre;

        /* La restriction s'applique aux valeurs dessinées, non aux effectifs :
           chaque barre garde la sienne, seules les autres cessent d'être
           tracées. Le regroupement est levé quand elle agit — « Autres »
           désignerait les valeurs qu'on vient justement d'écarter. */
        const restriction = this._restriction(def);
        const affiches = this._restreindre(comptes, def);

        /* La sélection a pu changer depuis que la restriction a été posée :
           les valeurs retenues n'existent plus forcément. La figure se
           viderait alors sans rien dire, et l'on chercherait la panne du
           mauvais côté. */
        if (restriction && !Object.keys(affiches).length) {
            const vide = document.createElement('p');
            vide.className = 'note note-restriction';
            vide.append(document.createTextNode(
                `Aucune des valeurs retenues pour cette figure `
                + `(${[...restriction].join(', ')}) n’est présente dans la `
                + `sélection courante. `));
            const lever = document.createElement('button');
            lever.type = 'button';
            lever.className = 'lien';
            lever.textContent = 'Tout réafficher';
            lever.addEventListener('click', () => this._poserRestriction(def, null));
            vide.appendChild(lever);
            corps.appendChild(vide);
            return;
        }
        const resultat = regrouper(affiches, {
            nb: restriction ? 0 : detail, tri, ordre,
            epinglees: etat.epinglees?.[def.cle],
        });
        const selection = etat.facettes[def.cle] || new Set();

        /* Réglage du niveau de détail, seulement s'il change quelque chose.
           Il n'en change aucune quand l'affichage est déjà restreint. */
        if (!restriction && tri === 'effectif' && cles.length > 5) {
            tete.appendChild(this._reglageDetail(def, cles.length));
        }
        const bandeau = this._bandeauRestriction(def, cles.length);
        if (bandeau) corps.appendChild(bandeau);

        const largeur = Math.max(360, this.hote.clientWidth || 720);
        /* Teintes distinctes pour les valeurs de cette figure : la couleur
           tirée du seul libellé peut faire tomber deux valeurs voisines sur
           la même case de la palette. */
        const teintes = attribuerCouleurs(resultat.lignes.map(l => l.valeur));
        const basculer = valeur => this.o.onFiltrer(def.cle, valeur);
        const menu = this.o.onMenu
            ? (element, valeur) => this.o.onMenu(element, def.cle, valeur,
                                                 () => this._entreesRestriction(def, valeur))
            : null;

        if (cleRepartition) {
            this._empilees_horizontales(def, cleRepartition, rows, source, etat,
                corps, resultat, largeur, unite, this._sens(def));
            if (resultat.regroupees) {
                corps.appendChild(this._noteAutres(resultat, def.cle, unite));
            }
            return;
        }

        if (this._sens(def) === 'vertical') {
            corps.appendChild(colonnes({
                lignes: resultat.lignes, largeur, selection, unite,
                onClic: basculer, onMenu: menu, couleurs: preferences.couleurs,
                couleurPour: v => teintes.get(v),
            }));
        } else {
            corps.appendChild(barresHorizontales({
                lignes: resultat.lignes, largeur, selection, unite,
                onClic: basculer, onMenu: menu, couleurs: preferences.couleurs,
                couleurPour: v => teintes.get(v),
                /* Cliquer le regroupement détaille l'ensemble des valeurs :
                   c'est le geste attendu quand on veut « voir ce qu'il y a
                   dedans » d'un coup. L'examen valeur par valeur reste
                   accessible par le lien sous la figure. */
                onAutres: () => { this.detail[def.id] = 0; this.o.onRafraichir(); },
            }));
        }

        if (resultat.regroupees) {
            corps.appendChild(this._noteAutres(resultat, def.cle, unite));
        }
    }

    /**
     * Sens courant d'une figure en barres.
     *
     * Le défaut peut être imposé par l'appelant : une échelle ordonnée — années,
     * durées, tranches — se lit à la verticale, c'est la convention de
     * l'histogramme, tandis que des libellés longs et sans ordre tiennent mieux
     * à l'horizontale. Le sens se déduit alors du champ, et le bouton ne sert
     * qu'à passer outre.
     */
    _sens(def, defaut = null) {
        return this.sens[def.id]
            || defaut
            || (def.forme === 'colonnes' ? 'vertical' : 'horizontal');
    }

    /** Bouton de bascule du sens. */
    _boutonSens(def, defaut = null) {
        const vertical = this._sens(def, defaut) === 'vertical';
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'bouton-sens';
        b.textContent = vertical ? '⇅' : '⇄';
        b.title = vertical
            ? 'Passer les barres à l’horizontale'
            : 'Passer les barres à la verticale';
        b.setAttribute('aria-label', b.title);
        b.addEventListener('click', () => {
            this.sens[def.id] = vertical ? 'horizontal' : 'vertical';
            this.o.onRafraichir();
        });
        return b;
    }

    /* ── Montants ────────────────────────────────────────────────────────
       Cinq lectures d'une même grandeur, et une règle commune : chaque figure
       porte des euros lisibles. C'est ce qui manquait à la version en courbes
       de distribution — techniquement juste, muette à l'usage. */

    /** Grandeur représentée : part de l'établissement, ou total du contrat. */
    _mesure(def) {
        return def.mesures.find(m => m.cle === this.mesures[def.id]) || def.mesures[0];
    }

    /** Maille de la lecture courante. Chaque lecture a son défaut propre. */
    _categorie(def, mode) {
        const entrees = mode.categorie === 'facultative'
            ? [{ cle: '', libelle: 'Aucune (toutes les opérations)' }, ...def.categories]
            : def.categories;
        const memorisee = this.categories[`${def.id}:${mode.cle}`];
        const defaut = mode.categorie === 'facultative' ? '' : mode.categorie;
        return entrees.find(c => c.cle === memorisee)
            || entrees.find(c => c.cle === defaut)
            || entrees[0];
    }

    _montants(def, rows, source, etat, corps, tete, unite) {
        const mesure = this._mesure(def);
        const mode = def.modes.find(m => m.cle === this.modes[def.id]) || def.modes[0];
        const largeur = Math.max(360, this.hote.clientWidth || 720);
        const formater = formaterMontant;
        const log = !!this.log[def.id];

        /* La grandeur se choisit avant la lecture : elle décide de ce qu'on
           mesure, la lecture seulement de la manière de le montrer. Le
           sélecteur de mode ayant déjà été posé par le rendu général,
           celui-ci s'insère devant lui plutôt que de s'ajouter après. */
        tete.insertBefore(this._reglageMesure(def, mesure),
                          tete.querySelector('.reglage-mode'));

        const cat = mode.categorie ? this._categorie(def, mode) : null;
        if (cat) tete.appendChild(this._reglageCategorie(def, mode, cat));
        /* L'échelle logarithmique n'a de sens que là où un axe porte des
           montants bruts. Un cumul croissant et un classement n'ont rien à y
           régler. */
        if (['cumules', 'volume', 'bande'].includes(mode.cle)) {
            tete.appendChild(this._boutonEchelle(def));
        }

        /* Une opération dont le montant n'a pas pu être lu ne peut pas être
           placée sur un axe de valeurs, et la ramener à zéro lui prêterait un
           montant nul qu'elle n'a pas. Elle est écartée de la figure et
           décomptée dessous — l'absence est une information, pas un vide. */
        const retenus = [];
        let sansMontant = 0;
        rows.forEach(rec => {
            const v = rec[mesure.cle];
            if (typeof v === 'number' && Number.isFinite(v)) retenus.push({ rec, montant: v });
            else sansMontant++;
        });

        if (!retenus.length) {
            corps.innerHTML = '<p class="note">Aucune opération de la sélection ne porte '
                + 'de montant lisible pour cette grandeur.</p>';
            return;
        }

        const totalReel = retenus.reduce((s, p) => s + p.montant, 0);

        if (mode.cle === 'classement')    this._classement(def, mesure, retenus, corps, largeur, formater);
        else if (mode.cle === 'cumul')    this._cumulTemps(def, retenus, source, etat, corps, largeur, formater, unite);
        else if (mode.cle === 'bande')    this._bande(def, cat, retenus, source, etat, corps, tete, largeur, log, formater, unite);
        else                              this._cumules(def, mode, cat, retenus, source, etat, corps, tete, largeur, log, formater, unite, totalReel);

        /* Le total réel, toujours : c'est la seule référence qui ne dépende
           pas de la maille choisie, et sans elle une somme de barres paraît
           être le total de la sélection. */
        corps.appendChild(this._noteEcart(
            `Total réel de la sélection : ${formater(totalReel)} sur ${retenus.length} `
            + `opération${retenus.length > 1 ? 's' : ''} au montant renseigné.`
            + (sansMontant
                ? ` ${sansMontant} autre${sansMontant > 1 ? 's' : ''} `
                  + `n’${sansMontant > 1 ? 'ont' : 'a'} pas de `
                  + `${mesure.libelle.toLowerCase()} lisible et ne figure`
                  + `${sansMontant > 1 ? 'nt' : ''} pas sur cette figure.`
                : '')));
    }

    /**
     * Somme des montants par catégorie, et nombre d'opérations.
     *
     * Les opérations qui n'entrent dans aucune catégorie sont comptées à part.
     * Le cas n'est pas théorique : un masquage — celui de l'université
     * elle-même, appliqué d'office côté partenaires — peut retirer toutes les
     * valeurs d'un enregistrement pour ce champ. Il disparaît alors de la
     * figure, et sans ce décompte la somme des barres passerait en dessous du
     * total réel sans explication.
     */
    _agreger(cle, retenus, source, etat) {
        const paires = {};
        let sansValeur = 0;
        retenus.forEach(({ rec, montant }) => {
            const valeurs = valeursVisibles(rec, source, cle, etat);
            if (!valeurs.length) { sansValeur++; return; }
            valeurs.forEach(v => {
                const e = paires[v] = paires[v] || { total: 0, nb: 0, points: [] };
                e.total += montant;
                e.nb++;
                e.points.push({ rec, montant });
            });
        });
        /* Porté par l'objet plutôt que renvoyé à côté : tous les appelants
           passent l'agrégation entière à `_grouperMontants`, et un second
           canal se serait perdu en route. Les parcours de catégories passent
           donc par `_categoriesDe`. */
        Object.defineProperty(paires, '_sansValeur',
            { value: sansValeur, enumerable: false });
        return paires;
    }

    /** Catégories réelles d'une agrégation, le décompte des absents mis à part. */
    _categoriesDe(paires) {
        const reste = { ...paires };
        delete reste._sansValeur;
        return reste;
    }

    /**
     * Regroupe des catégories selon une grandeur.
     * Le classement se fait sur les euros, non sur le nombre d'opérations :
     * « les douze premières » doit désigner les douze qui pèsent, sinon la
     * figure écarte précisément ce qu'on est venu voir.
     */
    _grouperMontants(defCat, paires, cle, source, etat, mesureDe) {
        const carte = Object.fromEntries(
            Object.entries(this._categoriesDe(paires)).map(([v, e]) => [v, mesureDe(e)]));
        const champCat = champ(source, cle);
        const tri = champCat?.nature === 'temporel' ? 'ordre'
                  : champCat?.ordre ? 'ordre' : 'effectif';
        const ordre = champCat?.nature === 'temporel'
            ? Object.keys(carte).slice()
                .sort((a, b) => String(a).localeCompare(String(b), 'fr', { numeric: true }))
            : champCat?.ordre;

        const restriction = this._restriction(defCat);
        const detail = this.detail[defCat.id] ?? defCat.detail ?? 0;
        const resultat = regrouper(this._restreindre(carte, defCat), {
            nb: restriction ? 0 : detail, tri, ordre,
            epinglees: etat.epinglees?.[cle],
        });

        const lignes = resultat.lignes.map(l => {
            const membres = l.autres ? (l.membres || []).map(m => m.valeur) : [l.valeur];
            const nb = membres.reduce((s, v) => s + (paires[v]?.nb || 0), 0);
            const total = membres.reduce((s, v) => s + (paires[v]?.total || 0), 0);
            return {
                valeur: l.valeur, total, nb, autres: !!l.autres,
                points: membres.flatMap(v => paires[v]?.points || []),
                /* Même règle que dans toutes les autres figures : un
                   regroupement ou une absence ne commande pas l'échelle. */
                horsEchelle: horsEchelle(l.valeur, l),
            };
        });
        return { lignes, resultat, tri, restriction, total: Object.keys(carte).length };
    }

    /** Accessoires communs aux lectures par catégorie. */
    _accessoires(defCat, cle, etat) {
        return {
            selection: etat.facettes[cle] || new Set(),
            onClic: valeur => this.o.onFiltrer(cle, valeur),
            onMenu: this.o.onMenu
                ? (element, valeur) => this.o.onMenu(element, cle, valeur,
                    () => this._entreesRestriction(defCat, valeur))
                : null,
            onAutres: () => { this.detail[defCat.id] = 0; this.o.onRafraichir(); },
        };
    }

    /** Montants cumulés, ou volume contre valeur, sur une même agrégation. */
    _cumules(def, mode, cat, retenus, source, etat, corps, tete, largeur, log,
             formater, unite, totalReel) {
        const cle = cat.cle;
        const defCat = { ...def, cle, detail: cat.detail };
        const paires = this._agreger(cle, retenus, source, etat);
        if (!Object.keys(this._categoriesDe(paires)).length) {
            corps.innerHTML = '<p class="note">Aucune valeur renseignée pour ce champ.</p>';
            return;
        }

        /* Le volume se classe par nombre d'opérations, le cumul par euros :
           chacun garde en tête ce qu'il met en avant. */
        const groupe = this._grouperMontants(defCat, paires, cle, source, etat,
            mode.cle === 'volume' ? e => e.nb : e => e.total);
        const { lignes, resultat, tri, restriction, total } = groupe;

        if (restriction && !lignes.length) {
            corps.appendChild(this._noteEcart(
                `Aucune des valeurs retenues pour cette figure `
                + `(${[...restriction].join(', ')}) n’est présente dans la `
                + `sélection courante.`));
            return;
        }
        if (!restriction && tri === 'effectif' && total > 5) {
            tete.appendChild(this._reglageDetail(defCat, total));
        }
        const bandeau = this._bandeauRestriction(defCat, total);
        if (bandeau) corps.appendChild(bandeau);

        const teintes = attribuerCouleurs(lignes.map(l => l.valeur));
        const commun = {
            lignes, largeur, log, formater, unite,
            couleurs: preferences.couleurs,
            couleurPour: v => teintes.get(v),
            ...this._accessoires(defCat, cle, etat),
        };

        if (mode.cle === 'volume') {
            corps.appendChild(volumeValeur({
                points: lignes, largeur, log, formater, unite,
                couleurs: preferences.couleurs, couleurPour: v => teintes.get(v),
                selection: commun.selection, onClic: commun.onClic, onMenu: commun.onMenu,
            }));
        } else {
            /* Une échelle ordonnée — années, durées — se lit à la verticale :
               c'est la convention de l'histogramme, et l'axe du temps ne se
               met pas debout. Des libellés longs et sans ordre — laboratoires,
               partenaires — restent à l'horizontale, où ils tiennent. Le sens
               se déduit donc du champ, et le bouton ne sert qu'à passer outre. */
            const champCat = champ(source, cle);
            const ordonne = champCat?.nature === 'temporel' || !!champCat?.ordre;
            const sens = this._sens(def, ordonne ? 'vertical' : 'horizontal');
            tete.appendChild(this._boutonSens(def, ordonne ? 'vertical' : 'horizontal'));
            corps.appendChild(sens === 'vertical'
                ? colonnesMontants(commun)
                : barresMontants(commun));
        }

        if (resultat.regroupees) corps.appendChild(this._noteAutres(resultat, cle, unite));

        /* Écart entre la somme des barres et le total réel. Il peut aller dans
           les deux sens, et la première version ne disait que l'un des deux :
           au-dessus quand un champ multivalué fait compter une opération pour
           chacune de ses valeurs, en dessous quand un masquage retire toutes
           les valeurs d'une opération pour ce champ. Annoncer « au-delà » dans
           le second cas serait un contresens.
           La somme porte sur les barres effectivement dessinées. Sous une
           restriction d'affichage elle est plus petite par construction, et le
           bandeau le dit déjà : la note se tait alors. */
        const sommeBarres = lignes.reduce((s, l) => s + l.total, 0);
        const ecart = Math.round(sommeBarres) - Math.round(totalReel);
        if (!restriction && ecart > 0) {
            corps.appendChild(this._noteEcart(
                `La somme des barres atteint ${formater(sommeBarres)}, au-delà du `
                + `total réel : une opération associée à plusieurs valeurs de ce `
                + `champ compte pour chacune.`));
        } else if (!restriction && ecart < 0 && paires._sansValeur) {
            corps.appendChild(this._noteEcart(
                `${paires._sansValeur} opération(s) ne figurent sur aucune barre : `
                + `toutes leurs valeurs pour ce champ sont masquées. Il manque `
                + `${formater(totalReel - sommeBarres)} à la somme des barres.`));
        }
    }

    /** Cumul chronologique : la trajectoire plutôt que le rythme annuel. */
    _cumulTemps(def, retenus, source, etat, corps, largeur, formater, unite) {
        const paires = this._agreger('annee', retenus, source, etat);
        const lignes = Object.entries(this._categoriesDe(paires))
            .map(([valeur, e]) => ({ valeur, total: e.total, nb: e.nb }))
            /* Un cumul suppose un ordre : une année absente n'a pas de place
               dans une suite chronologique et serait cumulée au hasard. */
            .filter(l => /^\d{4}$/.test(l.valeur))
            .sort((a, b) => a.valeur.localeCompare(b.valeur, 'fr', { numeric: true }));

        if (!lignes.length) {
            corps.innerHTML = '<p class="note">Aucune opération datée : un cumul '
                + 'chronologique n’a rien à ordonner.</p>';
            return;
        }
        const defCat = { ...def, cle: 'annee' };
        corps.appendChild(cumulTemporel({
            lignes, largeur, formater, unite,
            ...this._accessoires(defCat, 'annee', etat),
        }));
        const datees = lignes.reduce((s, l) => s + l.nb, 0);
        if (datees < retenus.length) {
            corps.appendChild(this._noteEcart(
                `${retenus.length - datees} opération(s) sans année exploitable ne `
                + `figurent pas dans ce cumul.`));
        }
    }

    /**
     * Bande de dispersion.
     * Remplace à elle seule la répartition classée, les boîtes à moustaches et
     * le nuage temporel : les trois disaient où se tient le gros du
     * portefeuille, de trois manières abstraites. Ici les points sont les
     * opérations, sur un axe gradué en euros.
     */
    _bande(def, cat, retenus, source, etat, corps, tete, largeur, log, formater, unite) {
        const decrirePoint = ({ rec, montant }) => {
            const p = this._point({ rec, montant });
            return { cle: p.cle, titre: p.titre, montant, lignes: p.lignes };
        };

        if (!cat.cle) {
            corps.appendChild(bandeDispersion({
                groupes: [{ valeur: '', points: retenus.map(decrirePoint) }],
                largeur, log, formater, unite,
                onMenuPoint: this._menuOperation(),
            }));
            return;
        }

        const cle = cat.cle;
        const defCat = { ...def, cle, detail: cat.detail };
        const paires = this._agreger(cle, retenus, source, etat);
        if (!Object.keys(this._categoriesDe(paires)).length) {
            corps.innerHTML = '<p class="note">Aucune valeur renseignée pour ce champ.</p>';
            return;
        }
        /* Ici le classement se fait sur le nombre d'opérations : une bande
           vaut par ses points, non par ses euros. */
        const { lignes, resultat, tri, restriction, total } =
            this._grouperMontants(defCat, paires, cle, source, etat, e => e.nb);

        if (restriction && !lignes.length) {
            corps.appendChild(this._noteEcart(
                `Aucune des valeurs retenues pour cette figure `
                + `(${[...restriction].join(', ')}) n’est présente dans la `
                + `sélection courante.`));
            return;
        }
        if (!restriction && tri === 'effectif' && total > 5) {
            tete.appendChild(this._reglageDetail(defCat, total));
        }
        const bandeau = this._bandeauRestriction(defCat, total);
        if (bandeau) corps.appendChild(bandeau);

        const teintes = attribuerCouleurs(lignes.map(l => l.valeur));
        const acces = this._accessoires(defCat, cle, etat);
        corps.appendChild(bandeDispersion({
            groupes: lignes.map(l => ({
                valeur: l.valeur, horsEchelle: l.horsEchelle, autres: l.autres,
                points: l.points.map(decrirePoint),
            })),
            largeur, log, formater, unite,
            couleurs: preferences.couleurs, couleurPour: v => teintes.get(v),
            selection: acces.selection, onClic: acces.onClic, onMenu: acces.onMenu,
            onMenuPoint: this._menuOperation(),
        }));
        if (resultat.regroupees) corps.appendChild(this._noteAutres(resultat, cle, unite));
    }

    /** Les plus gros contrats, les deux montants l'un dans l'autre. */
    _classement(def, mesure, retenus, corps, largeur, formater) {
        const autre = def.mesures.find(m => m.cle !== mesure.cle);
        corps.appendChild(classementMontants({
            points: retenus.map(({ rec, montant }) => {
                const p = this._point({ rec, montant });
                const secondaire = autre ? rec[autre.cle] : null;
                return {
                    cle: p.cle, titre: p.titre, sousTitre: p.sousTitre, montant,
                    autre: typeof secondaire === 'number' && Number.isFinite(secondaire)
                        ? secondaire : null,
                    lignes: p.lignes,
                };
            }),
            largeur, nb: 15, formater,
            libelleMontant: mesure.libelle,
            libelleAutre: autre?.libelle || '',
            onMenu: this._menuOperation(),
        }));
    }

    /** Menu d'une opération, posé sur un point de figure. */
    _menuOperation() {
        return this.o.onMenuEnregistrement
            ? (element, rec) => this.o.onMenuEnregistrement(element, rec, true)
            : null;
    }

    /** Description d'une opération pour les figures de montants. */
    _point({ rec, montant }) {
        const lignes = [];
        if (rec.typeContrat) lignes.push({ principal: rec.typeContrat, secondaire: 'contrat' });
        (rec.partenaires || []).slice(0, 3).forEach(p => {
            lignes.push({ principal: p.nom || String(p), secondaire: p.type || '' });
        });
        (rec.labos || []).slice(0, 2).forEach(l => {
            lignes.push({ principal: l, secondaire: 'laboratoire' });
        });

        return {
            cle: rec,
            titre: rec.titre || `Opération ${rec.id}`,
            montant,
            sousTitre: [rec.annee, rec.typeContrat, (rec.partenaires || [])[0]?.nom]
                .filter(Boolean).join(' · '),
            lignes,
        };
    }

    /** Note de bas de figure sur ce qui n'y figure pas. */
    _noteEcart(contenu) {
        const p = document.createElement('p');
        p.className = 'note';
        p.textContent = contenu;
        return p;
    }

    /** Sélecteur de grandeur, distinct du sélecteur de lecture. */
    _reglageMesure(def, mesure) {
        return this._selecteur('Montant', 'reglage-mesure', def.mesures, mesure.cle, valeur => {
            this.mesures[def.id] = valeur;
            this.o.onRafraichir();
        });
    }

    /** Sélecteur de maille, propre à la lecture courante. */
    _reglageCategorie(def, mode, cat) {
        const entrees = mode.categorie === 'facultative'
            ? [{ cle: '', libelle: 'Aucune (toutes les opérations)' }, ...def.categories]
            : def.categories;
        return this._selecteur('Par', 'reglage-categorie', entrees, cat.cle, valeur => {
            this.categories[`${def.id}:${mode.cle}`] = valeur;
            this.o.onRafraichir();
        });
    }

    _selecteur(etiquette, classe, entrees, courant, onChoix) {
        const boite = document.createElement('div');
        boite.className = `reglage-detail ${classe}`;
        const lab = document.createElement('label');
        lab.className = 'etiquette-champ';
        lab.textContent = etiquette;
        const select = document.createElement('select');
        entrees.forEach(e => {
            const o = document.createElement('option');
            o.value = e.cle;
            o.textContent = e.libelle;
            if (e.cle === courant) o.selected = true;
            select.appendChild(o);
        });
        select.addEventListener('change', () => onChoix(select.value));
        boite.append(lab, select);
        return boite;
    }

    /**
     * Bascule linéaire / logarithmique.
     *
     * Ni l'une ni l'autre n'est la bonne échelle en toutes circonstances :
     * la linéaire dit les écarts réels mais écrase la partie basse quand le
     * rapport entre montants dépasse le millier ; la logarithmique rend
     * lisible toute la plage mais trompe l'œil sur ces mêmes écarts. Elle
     * n'est donc pas imposée, seulement offerte.
     */
    _boutonEchelle(def) {
        const log = !!this.log[def.id];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'bouton-sens bouton-echelle';
        b.textContent = log ? 'log' : 'lin';
        b.title = log
            ? 'Échelle logarithmique — revenir à l’échelle linéaire'
            : 'Échelle linéaire — passer à l’échelle logarithmique';
        b.setAttribute('aria-label', b.title);
        b.addEventListener('click', () => {
            this.log[def.id] = !log;
            this.o.onRafraichir();
        });
        return b;
    }

    /** Nuage de mots. */
    _nuage(def, rows, source, etat, corps, tete, unite) {
        const comptes = effectifs(rows, source, def.cle, etat);
        if (!Object.keys(comptes).length) {
            corps.innerHTML = '<p class="note">Aucune valeur renseignée pour ce champ.</p>';
            return;
        }

        const detail = this.detail[def.id] ?? def.detail ?? 0;
        const restrictionN = this._restriction(def);
        const resultat = regrouper(this._restreindre(comptes, def), {
            nb: restrictionN ? 0 : detail, epinglees: etat.epinglees?.[def.cle],
        });
        const bandeauN = this._bandeauRestriction(def, Object.keys(comptes).length);
        if (bandeauN) corps.appendChild(bandeauN);
        /* Ni le regroupement ni l'absence n'ont leur place dans un nuage :
           « Autres » n'est pas un terme du vocabulaire, et « Sans mot-clé »
           encore moins — c'est souvent la valeur la plus fréquente, elle
           occuperait le centre en gros caractères et écraserait tout le
           vocabulaire réel. Les deux sont retirés de la figure, comptés dans
           la note, et le regroupement reste consultable. */
        const termes = resultat.lignes.filter(l => !l.autres && !estAbsence(l.valeur));
        const sansTerme = resultat.lignes
            .filter(l => estAbsence(l.valeur))
            .reduce((s, l) => s + l.effectif, 0);

        if (Object.keys(comptes).length > 5) {
            tete.appendChild(this._reglageDetail(def, Object.keys(comptes).length));
        }

        if (!termes.length) {
            corps.innerHTML = '<p class="note">Aucun terme dans cette sélection : '
                + 'les enregistrements retenus ne portent pas de mot-clé.</p>';
            return;
        }

        const largeur = Math.max(360, this.hote.clientWidth || 760);
        const teintes = attribuerCouleurs(termes.map(l => l.valeur));
        const svg = nuageMots({
            lignes: termes, largeur,
            hauteur: Math.max(300, Math.min(560, 160 + termes.length * 5)),
            selection: etat.facettes[def.cle] || new Set(),
            unite, couleurs: preferences.couleurs,
            couleurPour: v => teintes.get(v),
            onClic: valeur => this.o.onFiltrer(def.cle, valeur),
            onMenu: (element, valeur) => this.o.onMenu?.(element, def.cle, valeur,
                () => this._entreesRestriction(def, valeur)),
        });
        corps.appendChild(svg);

        /* Ce que le nuage montre, chiffré.
           Avec plusieurs milliers de termes distincts, l'image reste dense
           après un filtrage et paraît ne pas avoir bougé, alors que son
           contenu a entièrement changé. Le compte rend le lien à la sélection
           lisible d'un coup d'œil. */
        const total = Object.keys(comptes).filter(v => !estAbsence(v)).length;
        const note = document.createElement('p');
        note.className = 'note';
        const morceaux = [
            termes.length < total
                ? `${termes.length} termes affichés sur ${total} présents dans la sélection.`
                : `${total} terme${total > 1 ? 's' : ''} dans la sélection.`,
            'La taille suit la fréquence ; la position n’a pas de sens.',
        ];
        if (sansTerme) {
            morceaux.push(`${sansTerme} enregistrement(s) sans aucun mot-clé, `
                        + `absents du nuage.`);
        }
        if (svg._horsCadre) {
            morceaux.push(`${svg._horsCadre} terme(s) n’ont pas trouvé de place dans le cadre.`);
        }
        note.textContent = morceaux.join(' ');
        corps.appendChild(note);

        if (resultat.regroupees) corps.appendChild(this._noteAutres(resultat, def.cle, unite));
    }

    /* ── Restriction d'affichage ──────────────────────────────────────
       Une restriction ne filtre rien : elle dit à une figure de ne dessiner
       que certaines de ses valeurs. Aucun effectif ne change, aucun
       enregistrement n'est écarté — la même barre est montrée seule. C'est
       ce qui permet de la poser sans que la légende, les totaux ou les
       figures voisines cessent d'être exacts.
       Le panneau porte cette logique parce que lui seul connaît l'identité
       de chacune de ses figures. */

    /* La clé associe le panneau ET le champ représenté. L'identité du panneau
       ne suffit pas : un mode change le champ sans changer l'identité, si bien
       qu'une restriction posée sur un laboratoire se retrouvait appliquée à
       des statuts — aucune valeur ne correspondait et la figure se vidait. */
    _cleRestriction(def) { return `${def.id}:${def.cle}`; }

    _restriction(def) {
        const choix = this.o.etat().restrictions?.[this._cleRestriction(def)];
        return choix?.size ? choix : null;
    }

    _poserRestriction(def, valeurs) {
        const etat = this.o.etat();
        const cle = this._cleRestriction(def);
        etat.restrictions = etat.restrictions || {};
        if (!valeurs || !valeurs.size) delete etat.restrictions[cle];
        else etat.restrictions[cle] = valeurs;
        this.o.onRafraichir();
    }

    /** N'afficher que les valeurs retenues, ou ne garder que la restriction. */
    _restreindre(comptes, def) {
        const choix = this._restriction(def);
        if (!choix) return comptes;
        return Object.fromEntries(
            Object.entries(comptes).filter(([v]) => choix.has(v)));
    }

    /** Entrées de menu propres à la restriction, pour une valeur donnée. */
    _entreesRestriction(def, valeur) {
        const choix = this._restriction(def);
        const entrees = [];

        /* Un seul verbe pour toute la famille — afficher —, et la précision
           « cette figure » portée par l'aide plutôt que répétée dans chaque
           intitulé. Le séparateur est posé par l'assemblage, non ici : ces
           entrées ne savent pas ce qui les précède. */
        if (!choix || !choix.has(valeur) || choix.size > 1) {
            entrees.push({
                libelle: 'N’afficher que cette valeur',
                aide: 'cette figure seulement',
                action: () => this._poserRestriction(def, new Set([valeur])),
            });
        }
        if (choix && !choix.has(valeur)) {
            entrees.push({
                libelle: 'Ajouter à l’affichage',
                aide: 'cette figure',
                action: () => this._poserRestriction(def, new Set([...choix, valeur])),
            });
        }
        if (choix && choix.has(valeur) && choix.size > 1) {
            entrees.push({
                libelle: 'Retirer de l’affichage',
                aide: 'cette figure',
                action: () => this._poserRestriction(def,
                    new Set([...choix].filter(v => v !== valeur))),
            });
        }
        if (choix) {
            entrees.push({
                libelle: 'Tout réafficher',
                aide: 'cette figure',
                action: () => this._poserRestriction(def, null),
            });
        }
        return entrees;
    }

    /**
     * Bandeau signalant qu'une figure n'en montre qu'une partie.
     * Sans lui, la figure paraîtrait décrire toute la sélection alors qu'elle
     * en dessine une fraction — et son export porterait la même méprise.
     */
    _bandeauRestriction(def, total) {
        const choix = this._restriction(def);
        if (!choix) return null;

        const boite = document.createElement('p');
        boite.className = 'note note-restriction';
        const ecartees = Math.max(0, total - choix.size);
        boite.append(document.createTextNode(
            `Affichage restreint à ${[...choix].join(', ')}. `
            + `Les effectifs sont inchangés`
            + (ecartees ? ` ; ${ecartees} autre${ecartees > 1 ? 's' : ''} `
                        + `valeur${ecartees > 1 ? 's ne sont' : ' n’est'} pas dessinée`
                        + `${ecartees > 1 ? 's' : ''}` : '')
            + '. '));
        const lever = document.createElement('button');
        lever.type = 'button';
        lever.className = 'lien';
        lever.textContent = 'Tout réafficher';
        lever.addEventListener('click', () => this._poserRestriction(def, null));
        boite.appendChild(lever);
        return boite;
    }

    /** Choix de la lecture, parmi celles que le panneau propose. */
    _reglageMode(def, choisi) {
        const boite = document.createElement('div');
        boite.className = 'reglage-detail reglage-mode';
        const lab = document.createElement('label');
        lab.className = 'etiquette-champ';
        lab.textContent = 'Afficher';
        const select = document.createElement('select');
        def.modes.forEach(m => {
            const o = document.createElement('option');
            o.value = m.cle;
            o.textContent = m.libelle;
            if (m.cle === choisi.cle) o.selected = true;
            select.appendChild(o);
        });
        select.addEventListener('change', () => {
            this.modes[def.id] = select.value;
            this.o.onRafraichir();
        });
        boite.append(lab, select);
        return boite;
    }

    /** Barres empilées : le total par valeur, décomposé par un second champ. */
    _empilees_horizontales(def, cleSerie, rows, source, etat, corps, resultat,
                           largeur, unite, sens = 'horizontal') {
        const defSerie = champ(source, cleSerie);
        const cellules = croisement(rows, source, def.cle, cleSerie, etat);

        const totauxSerie = {};
        cellules.forEach(c => { totauxSerie[c.b] = (totauxSerie[c.b] || 0) + c.valeur; });

        /* Toutes les séries sont montrées.
           Le champ de décomposition n'est pas subi : il est nommé dans le mode
           choisi — « Effectifs et statuts par laboratoire » demande à voir les
           statuts, tous. En regrouper une partie sous « Autres » retirerait
           justement ce qu'on est venu chercher.
           Le plafond ne subsiste que comme garde-fou, pour un champ à très
           nombreuses valeurs où la légende deviendrait inutilisable. */
        const nbSeries = Object.keys(totauxSerie).length;
        const groupesSerie = regrouper(totauxSerie, {
            nb: nbSeries > 20 ? 20 : 0,
            epinglees: etat.epinglees?.[cleSerie],
        });
        const nomsSerie = new Set(groupesSerie.lignes.filter(l => !l.autres).map(l => l.valeur));
        const series = groupesSerie.lignes.map(l => l.valeur);

        const nomsLigne = new Set(resultat.lignes.filter(l => !l.autres).map(l => l.valeur));
        const parLigne = new Map(resultat.lignes.map(l => [l.valeur, {}]));
        cellules.forEach(c => {
            const ligne = nomsLigne.has(c.a) ? c.a : LIBELLE_AUTRES;
            const serie = nomsSerie.has(c.b) ? c.b : LIBELLE_AUTRES;
            const cible = parLigne.get(ligne);
            if (!cible) return;
            cible[serie] = (cible[serie] || 0) + c.valeur;
        });

        const lignes = resultat.lignes.map(l => ({ ...l, segments: parLigne.get(l.valeur) || {} }));
        /* Les segments d'un empilement se touchent : ils demandent des teintes
           écartées dans la palette, non les plus stables. */
        const teintesSerie = attribuerCouleursContrastees(series);

        const filtrerSerie = serie => {
            if (serie === LIBELLE_AUTRES) {
                this.o.onOuvrirAutres?.(cleSerie,
                    groupesSerie.lignes.find(l => l.autres)?.membres || []);
                return;
            }
            this.o.onFiltrer(cleSerie, serie);
        };

        if (sens === 'vertical') {
            /* Les colonnes empilées attendent une autre forme : une liste de
               séries portant chacune ses valeurs par catégorie. */
            corps.appendChild(colonnesEmpilees({
                categories: lignes.map(l => l.valeur),
                series: series.map(nom => ({
                    nom,
                    valeurs: Object.fromEntries(
                        lignes.map(l => [l.valeur, l.segments?.[nom] || 0])),
                })),
                largeur, hauteur: 320, unite,
                couleurs: preferences.couleurs,
                couleurPour: v => teintesSerie.get(v),
                onClic: filtrerSerie,
                onClicCategorie: valeur => this.o.onFiltrer(def.cle, valeur),
                onMenuCategorie: (element, valeur) =>
                    this.o.onMenu?.(element, def.cle, valeur,
                        () => this._entreesRestriction(def, valeur)),
                onMenuSegment: (element, serie, categorie, effectif) => {
                    if (serie === LIBELLE_AUTRES) return;
                    this.o.onMenuCombinaison?.(element, def.cle, categorie,
                                               cleSerie, serie, effectif);
                },
            }));
        } else {
            corps.appendChild(barresEmpilees({
                lignes, series, largeur, unite,
                selection: etat.facettes[def.cle] || new Set(),
                selectionSerie: etat.facettes[cleSerie] || new Set(),
                couleurs: preferences.couleurs,
                couleurPour: v => teintesSerie.get(v),
                onClic: valeur => this.o.onFiltrer(def.cle, valeur),
                onClicSerie: filtrerSerie,
                onMenu: (element, valeur) => this.o.onMenu?.(element, def.cle, valeur,
                    () => this._entreesRestriction(def, valeur)),
                onMenuSegment: (element, serie, ligne, effectif) => {
                    if (serie === LIBELLE_AUTRES) return;
                    this.o.onMenuCombinaison?.(element, def.cle, ligne,
                                               cleSerie, serie, effectif);
                },
            }));
        }

        corps.appendChild(legendeCouleurs(series, nom => {
            if (nom === LIBELLE_AUTRES) {
                this.o.onOuvrirAutres?.(cleSerie,
                    groupesSerie.lignes.find(l => l.autres)?.membres || []);
                return;
            }
            this.o.onFiltrer(cleSerie, nom);
        }, preferences.couleurs, v => teintesSerie.get(v)));

        const note = document.createElement('p');
        note.className = 'note';
        note.textContent = `Longueur totale : effectif par ${(champ(source, def.cle)?.libelle || def.cle).toLowerCase()}. `
            + `Segments : répartition par ${(defSerie?.libelle || cleSerie).toLowerCase()}.`
            + (groupesSerie.regroupees
                ? ` ${groupesSerie.regroupees} valeurs de faible effectif réunies sous « Autres ».`
                : '');
        corps.appendChild(note);
    }

    /**
     * Note accompagnant un regroupement, avec accès à son contenu.
     * Le contenu s'ouvre dans une fenêtre plutôt qu'en dépliant sous la
     * figure : celle-ci ne saute pas, et chaque valeur y reçoit le même jeu
     * de gestes que partout ailleurs.
     */
    _noteAutres(resultat, cle, unite) {
        const membres = resultat.lignes.find(l => l.autres)?.membres || [];
        const note = document.createElement('p');
        note.className = 'note';
        note.append(document.createTextNode(noteRegroupement(resultat, unite) + ' '));
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.className = 'lien';
        bouton.textContent = `Voir les ${membres.length} valeurs`;
        bouton.addEventListener('click', () => this.o.onOuvrirAutres?.(cle, membres));
        this.o.onMenuAutres?.(bouton, cle, membres);
        note.appendChild(bouton);
        return note;
    }

    /* ── Bulles : entité par ligne, période par colonne ── */
    _bulles(def, rows, source, etat, corps, tete, unite) {
        const cellulesBrutes = croisement(rows, source, def.cle, def.cleTemps, etat);
        if (!cellulesBrutes.size) {
            corps.innerHTML = '<p class="note">Ce croisement ne donne aucune donnée.</p>';
            return;
        }

        const totaux = {};
        const periodes = new Set();
        cellulesBrutes.forEach(c => {
            totaux[c.a] = (totaux[c.a] || 0) + c.valeur;
            periodes.add(c.b);
        });

        /* Décomposition : la figure garde ses totaux mais les détaille par un
           second champ. Deux figures séparées obligeraient à faire le
           rapprochement de tête, et ne diraient rien de la composition d'une
           valeur donnée. */
        /* La décomposition vient du mode retenu, non d'un menu à composer. */
        const cleRepartition = def.serie || '';
        const detail = this.detail[def.id] ?? def.detail ?? 0;
        const restrictionF = this._restriction(def);
        const groupees = regrouper(this._restreindre(totaux, def), {
            nb: restrictionF ? 0 : detail, epinglees: etat.epinglees?.[def.cle],
        });
        const bandeauF = this._bandeauRestriction(def, Object.keys(totaux).length);
        if (bandeauF) corps.appendChild(bandeauF);
        const detaillees = new Set(groupees.lignes.filter(l => !l.autres).map(l => l.valeur));

        /* Les valeurs regroupées gardent leur place : leurs effectifs sont
           reportés sur la ligne « Autres », année par année. */
        const cellules = new Map();
        cellulesBrutes.forEach(c => {
            const ligne = detaillees.has(c.a) ? c.a : LIBELLE_AUTRES;
            const cle = ligne + '\u0000' + c.b;
            cellules.set(cle, (cellules.get(cle) || 0) + c.valeur);
        });

        const categories = [...periodes].sort((a, b) =>
            String(a).localeCompare(String(b), 'fr', { numeric: true }));

        if (groupees.lignes.length > 5) tete.appendChild(this._reglageDetail(def, Object.keys(totaux).length));

        const teintesBulles = attribuerCouleurs(groupees.lignes.map(l => l.valeur));
        corps.appendChild(bullesTemporelles({
            entites: groupees.lignes, categories, cellules,
            largeur: Math.max(360, this.hote.clientWidth || 760),
            selection: etat.facettes[def.cle] || new Set(),
            unite, couleurs: preferences.couleurs,
            couleurPour: v => teintesBulles.get(v),
            onClic: valeur => this.o.onFiltrer(def.cle, valeur),
            onMenu: (element, valeur) => this.o.onMenu?.(element, def.cle, valeur),
        }));

        if (groupees.regroupees) corps.appendChild(this._noteAutres(groupees, def.cle, unite));
    }

    /* ── Frise : chaque opération occupe sa durée réelle ── */
    _frise(def, rows, source, etat, corps, tete) {
        /* Seules les opérations dont les deux dates sont connues ont une
           étendue : les autres ne peuvent pas figurer sur une frise. */
        const datees = rows.filter(r => r.debut && r.fin);
        if (!datees.length) {
            corps.innerHTML = '<p class="note">Aucune opération de la sélection ne porte '
                + 'à la fois une date de début et une date de fin.</p>';
            return;
        }

        const parLigne = new Map();
        datees.forEach(rec => {
            valeursVisibles(rec, source, def.cle, etat).forEach(v => {
                if (!parLigne.has(v)) parLigne.set(v, []);
                parLigne.get(v).push(rec);
            });
        });

        const totaux = {};
        parLigne.forEach((liste, v) => { totaux[v] = liste.length; });
        /* Décomposition : la figure garde ses totaux mais les détaille par un
           second champ. Deux figures séparées obligeraient à faire le
           rapprochement de tête, et ne diraient rien de la composition d'une
           valeur donnée. */
        /* La décomposition vient du mode retenu, non d'un menu à composer. */
        const cleRepartition = def.serie || '';
        const detail = this.detail[def.id] ?? def.detail ?? 0;
        const restrictionF = this._restriction(def);
        const groupees = regrouper(this._restreindre(totaux, def), {
            nb: restrictionF ? 0 : detail, epinglees: etat.epinglees?.[def.cle],
        });
        const bandeauF = this._bandeauRestriction(def, Object.keys(totaux).length);
        if (bandeauF) corps.appendChild(bandeauF);
        const detaillees = new Set(groupees.lignes.filter(l => !l.autres).map(l => l.valeur));

        const jolie = iso => {
            const [a, m, j] = String(iso).split('-');
            return `${j}/${m}/${a}`;
        };
        const plafondBrut = this.plafond[def.id] ?? def.anneeMax ?? 0;
        const limiteBrute = plafondBrut ? Date.UTC(plafondBrut, 0, 1) : Infinity;
        const periodeDe = rec => ({
            debut: analyserDate(rec.debut)?.getTime(),
            fin:   analyserDate(rec.fin)?.getTime(),
            libelle: rec.titre,
            periode: `${jolie(rec.debut)} → ${jolie(rec.fin)}`
                   + (rec.dureeMois != null ? ` · ${rec.dureeMois} mois` : ''),
            titre: `${rec.titre} — du ${jolie(rec.debut)} au ${jolie(rec.fin)}`,
        });

        const lignes = groupees.lignes.map(l => {
            const sources = l.autres
                ? [...parLigne.entries()].filter(([v]) => !detaillees.has(v)).flatMap(([, r]) => r)
                : (parLigne.get(l.valeur) || []);
            return {
                ...l,
                /* Une opération qui commence avant la limite mais se termine
                   après y est tronquée plutôt qu'écartée : elle a bien couru
                   sur la période affichée. */
                periodes: sources.map(periodeDe)
                    .filter(p => p.debut && p.fin && p.debut <= limiteBrute)
                    .map(p => p.fin > limiteBrute
                        ? { ...p, fin: limiteBrute, tronquee: true } : p),
            };
        }).filter(l => l.periodes.length);

        if (!lignes.length) {
            corps.innerHTML = '<p class="note">Aucune période exploitable.</p>';
            return;
        }

        const bornes = lignes.flatMap(l => l.periodes).reduce(
            (acc, p) => ({ min: Math.min(acc.min, p.debut), max: Math.max(acc.max, p.fin) }),
            { min: Infinity, max: -Infinity });

        /* Plafond d'année.
           Quelques dates de fin lointaines — saisie erronée, ou convention
           pour un partenariat sans terme — étirent l'axe sur des décennies et
           tassent toutes les autres opérations sur une fraction de la largeur.
           L'axe s'arrête donc par défaut à une année choisie, et le nombre
           d'opérations qui la dépassent est indiqué avec de quoi lever la
           limite. */
        const plafond = this.plafond[def.id] ?? def.anneeMax ?? 0;
        const limite = plafond ? Date.UTC(plafond, 0, 1) : Infinity;
        const auDela = lignes.flatMap(l => l.periodes).filter(p => p.debut > limite).length;
        if (plafond && bornes.max > limite) bornes.max = limite;

        /* Graduations annuelles, au 1er janvier. */
        const graduations = [];
        const premiere = new Date(bornes.min).getUTCFullYear();
        const derniere = new Date(bornes.max).getUTCFullYear();
        for (let a = premiere; a <= derniere + 1; a++) {
            graduations.push({ valeur: Date.UTC(a, 0, 1), libelle: String(a) });
        }
        /* Les bornes sont ramenées aux limites d'année : une frise qui commence
           au 17 mars ne se lit pas, et le premier intitulé tomberait hors du
           cadre. */
        bornes.min = Math.min(bornes.min, Date.UTC(premiere, 0, 1));
        bornes.max = Math.max(bornes.max, Date.UTC(derniere + 1, 0, 1));

        if (Object.keys(totaux).length > 5) {
            tete.appendChild(this._reglageDetail(def, Object.keys(totaux).length));
        }

        const teintesFrise = attribuerCouleurs(lignes.map(l => l.valeur));
        corps.appendChild(frise({
            lignes, min: bornes.min, max: bornes.max,
            largeur: Math.max(360, this.hote.clientWidth || 760),
            selection: etat.facettes[def.cle] || new Set(),
            graduations, couleurs: preferences.couleurs,
            couleurPour: v => teintesFrise.get(v),
            onClic: valeur => this.o.onFiltrer(def.cle, valeur),
            onMenu: (element, valeur) => this.o.onMenu?.(element, def.cle, valeur,
                () => this._entreesRestriction(def, valeur)),
        }));

        const ecartees = rows.length - datees.length;
        if (ecartees) {
            const note = document.createElement('p');
            note.className = 'note';
            note.textContent = `${ecartees} opération(s) de la sélection n’ont pas leurs `
                + `deux dates et ne figurent pas sur cette frise.`;
            corps.appendChild(note);
        }

        if (plafond) {
            const note = document.createElement('p');
            note.className = 'note';
            const tronquees = lignes.flatMap(l => l.periodes).filter(p => p.tronquee).length;
            const morceaux = [`L’axe s’arrête à ${plafond}.`];
            if (tronquees) morceaux.push(`${tronquees} opération(s) se poursuivent au-delà.`);
            if (auDela) morceaux.push(`${auDela} commencent après cette date et sont écartées.`);
            note.append(document.createTextNode(morceaux.join(' ') + ' '));
            const lever = document.createElement('button');
            lever.type = 'button';
            lever.className = 'lien';
            lever.textContent = 'Afficher toute la période';
            lever.addEventListener('click', () => {
                this.plafond[def.id] = 0;
                this.o.onRafraichir();
            });
            note.appendChild(lever);
            corps.appendChild(note);
        } else if (def.anneeMax) {
            const note = document.createElement('p');
            note.className = 'note';
            note.append(document.createTextNode('Toute la période est affichée. '));
            const remettre = document.createElement('button');
            remettre.type = 'button';
            remettre.className = 'lien';
            remettre.textContent = `Revenir à ${def.anneeMax}`;
            remettre.addEventListener('click', () => {
                this.plafond[def.id] = def.anneeMax;
                this.o.onRafraichir();
            });
            note.appendChild(remettre);
            corps.appendChild(note);
        }
    }

    /* ── Colonnes empilées : un axe ordonné décomposé par catégorie ── */
    _empilees(def, rows, source, etat, corps, tete, unite) {
        const cellules = croisement(rows, source, def.cleX, def.cleSerie, etat);
        if (!cellules.size) {
            corps.innerHTML = '<p class="note">Croisement sans données.</p>';
            return;
        }

        const categories = [...new Set([...cellules.values()].map(c => c.a))]
            .sort((a, b) => String(a).localeCompare(String(b), 'fr', { numeric: true }));

        /* Les séries les plus fournies sont détaillées, le reste regroupé :
           au-delà de six couleurs, une légende cesse d'être lisible. */
        const totauxSeries = {};
        cellules.forEach(c => { totauxSeries[c.b] = (totauxSeries[c.b] || 0) + c.valeur; });
        const nbTypes = Object.keys(totauxSeries).length;
        const groupees = regrouper(totauxSeries, {
            nb: def.detailSerie || (nbTypes > 20 ? 20 : 0),
            epinglees: etat.epinglees?.[def.cleSerie],
        });
        const nomsDetailles = new Set(groupees.lignes.filter(l => !l.autres).map(l => l.valeur));

        const series = groupees.lignes.map(l => ({ nom: l.valeur, valeurs: {} }));
        const parNom = new Map(series.map(s => [s.nom, s]));
        cellules.forEach(c => {
            const cible = nomsDetailles.has(c.b) ? parNom.get(c.b) : parNom.get(LIBELLE_AUTRES);
            if (!cible) return;
            cible.valeurs[c.a] = (cible.valeurs[c.a] || 0) + c.valeur;
        });

        const largeur = Math.max(360, this.hote.clientWidth || 720);
        /* Les segments d'une colonne empilée se jouxtent comme ceux d'une
           barre empilée : ils demandent le même écart de teintes. */
        const teintesSeries = attribuerCouleursContrastees(series.map(s => s.nom));
        corps.appendChild(colonnesEmpilees({
            categories, series, largeur, unite, couleurs: preferences.couleurs,
            couleurPour: v => teintesSeries.get(v),
            onClicCategorie: valeur => this.o.onFiltrer(def.cleX, valeur),
            onMenuCategorie: (element, valeur) =>
                this.o.onMenu?.(element, def.cleX, valeur),
            onMenuSegment: (element, serie, categorie, effectif) => {
                if (serie === LIBELLE_AUTRES) return;
                this.o.onMenuCombinaison?.(element, def.cleX, categorie,
                                           def.cleSerie, serie, effectif);
            },
            onClic: (nomSerie) => {
                if (nomSerie === LIBELLE_AUTRES) {
                    this.o.onOuvrirAutres?.(def.cleSerie,
                        groupees.lignes.find(l => l.autres)?.membres || []);
                    return;
                }
                this.o.onFiltrer(def.cleSerie, nomSerie);
            },
        }));
        corps.appendChild(legendeCouleurs(
            series.map(s => s.nom),
            nom => {
                if (nom === LIBELLE_AUTRES) {
                    this.o.onOuvrirAutres?.(def.cleSerie,
                        groupees.lignes.find(l => l.autres)?.membres || []);
                    return;
                }
                this.o.onFiltrer(def.cleSerie, nom);
            },
            preferences.couleurs, v => teintesSeries.get(v),
        ));

        if (groupees.regroupees) {
            corps.appendChild(this._noteAutres(groupees, def.cleSerie, unite));
        }
    }

    /* ── Réglage du niveau de détail ── */
    _reglageDetail(def, total) {
        const boite = document.createElement('div');
        boite.className = 'reglage-detail';
        const etiquette = document.createElement('label');
        etiquette.className = 'etiquette-champ';
        etiquette.textContent = 'Valeurs détaillées';
        const select = document.createElement('select');
        const courant = this.detail[def.id] ?? def.detail ?? 0;
        [5, 10, 15, 25, 0].forEach(n => {
            if (n !== 0 && n >= total) return;
            const o = document.createElement('option');
            o.value = n;
            o.textContent = n === 0 ? `Toutes (${total})` : String(n);
            if (n === courant) o.selected = true;
            select.appendChild(o);
        });
        select.addEventListener('change', () => {
            this.detail[def.id] = +select.value;
            this.o.onRafraichir();
        });
        boite.append(etiquette, select);
        return boite;
    }
}
