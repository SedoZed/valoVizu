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
import { analyserDate } from '../core/omeka.js';
import { regrouper, noteRegroupement, LIBELLE_AUTRES } from '../core/groupe.js';
import { barresHorizontales, colonnes, colonnesEmpilees, legendeCouleurs,
         bullesTemporelles, frise, attribuerCouleurs,
         barresEmpilees, attribuerCouleursContrastees,
         nuageMots } from '../ui/graphique.js';

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
        { id: 'croise', titre: 'Années et types de partenaires', forme: 'empilees',
          /* Zéro : tous les types de partenaires sont montrés. Le croisement
             est déclaré, il n'y a pas lieu d'en cacher une partie. */
          cleX: 'annee', cleSerie: 'type', detailSerie: 0 },
        { id: 'frise', titre: 'Étendue des opérations', forme: 'frise',
          cle: 'labo', detail: 12, anneeMax: 2036,
          note: 'Chaque segment couvre la période réelle d’une opération, de sa date de '
              + 'début à sa date de fin. Les opérations sans les deux dates n’y figurent '
              + 'pas : leur étendue est inconnue. Les superpositions se lisent comme des '
              + 'périodes d’activité plus dense.' },
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
        /* Les nomenclatures viennent en dernier : elles décrivent le
           rattachement administratif plutôt que l'activité, et intéressent
           moins souvent que les effectifs ou les thèmes. */
        { id: 'domaines', titre: 'Domaines HCERES', cle: 'domaine', forme: 'barres', detail: 12,
          note: 'Un enseignant-chercheur rattaché à plusieurs domaines compte pour chacun.' },
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
                def = { ...def, cle: choisi.champ, serie: choisi.serie,
                        forme: choisi.forme || def.forme,
                        detail: choisi.detail ?? def.detail };
            }

            if (def.forme === 'empilees')    this._empilees(def, rows, source, etat, corps, tete, unite);
            else if (def.forme === 'bulles') this._bulles(def, rows, source, etat, corps, tete, unite);
            else if (def.forme === 'frise')  this._frise(def, rows, source, etat, corps, tete);
            else if (def.forme === 'nuage')  this._nuage(def, rows, source, etat, corps, tete, unite);
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

        const resultat = regrouper(comptes, { nb: detail, tri, ordre,
                                              epinglees: etat.epinglees?.[def.cle] });
        const selection = etat.facettes[def.cle] || new Set();

        /* Réglage du niveau de détail, seulement s'il change quelque chose. */
        if (tri === 'effectif' && cles.length > 5) {
            tete.appendChild(this._reglageDetail(def, cles.length));
        }

        const largeur = Math.max(360, this.hote.clientWidth || 720);
        /* Teintes distinctes pour les valeurs de cette figure : la couleur
           tirée du seul libellé peut faire tomber deux valeurs voisines sur
           la même case de la palette. */
        const teintes = attribuerCouleurs(resultat.lignes.map(l => l.valeur));
        const basculer = valeur => this.o.onFiltrer(def.cle, valeur);
        const menu = this.o.onMenu
            ? (element, valeur) => this.o.onMenu(element, def.cle, valeur) : null;

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

    /** Sens courant d'une figure en barres. */
    _sens(def) {
        return this.sens[def.id] || (def.forme === 'colonnes' ? 'vertical' : 'horizontal');
    }

    /** Bouton de bascule du sens. */
    _boutonSens(def) {
        const vertical = this._sens(def) === 'vertical';
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

    /** Nuage de mots. */
    _nuage(def, rows, source, etat, corps, tete, unite) {
        const comptes = effectifs(rows, source, def.cle, etat);
        if (!Object.keys(comptes).length) {
            corps.innerHTML = '<p class="note">Aucune valeur renseignée pour ce champ.</p>';
            return;
        }

        const detail = this.detail[def.id] ?? def.detail ?? 0;
        const resultat = regrouper(comptes, {
            nb: detail, epinglees: etat.epinglees?.[def.cle],
        });
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
            onMenu: (element, valeur) => this.o.onMenu?.(element, def.cle, valeur),
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
                    this.o.onMenu?.(element, def.cle, valeur),
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
                onMenu: (element, valeur) => this.o.onMenu?.(element, def.cle, valeur),
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
        const groupees = regrouper(totaux, { nb: detail, epinglees: etat.epinglees?.[def.cle] });
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
        const groupees = regrouper(totaux, { nb: detail, epinglees: etat.epinglees?.[def.cle] });
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
            onMenu: (element, valeur) => this.o.onMenu?.(element, def.cle, valeur),
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
