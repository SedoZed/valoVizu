/**
 * panels/relations.js
 * Les relations entre laboratoires et partenaires, selon trois lectures.
 *
 * Une même donnée, trois usages distincts :
 *   colonnes  qui travaille avec qui, lien par lien — la lecture de détail ;
 *   matrice   les chiffres exacts, recopiables dans un document ;
 *   réseau    la structure d'ensemble, les pôles et les isolats.
 *
 * Aucune n'est meilleure : la matrice répond mal à « qui est central ? », le
 * réseau répond mal à « combien exactement ? ». Elles sont donc offertes
 * ensemble plutôt que remplacées l'une par l'autre.
 */
import { croisement, valeursVisibles } from '../core/selection.js';
import { preferences } from '../core/preferences.js';
import { attribuerCouleursContrastees, horsEchelle } from '../ui/graphique.js';
import { CHAMPS, champ, UNITE } from '../core/champs.js';
import { regrouper, noteRegroupement, LIBELLE_AUTRES } from '../core/groupe.js';
import { ordonnerColonnes } from '../ui/reseau.js';
import { dessinerFlux } from '../ui/flux.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (nom, attrs = {}) => {
    const e = document.createElementNS(NS, nom);
    Object.entries(attrs).forEach(([k, v]) => {
        if (v !== null && v !== undefined) e.setAttribute(k, String(v));
    });
    return e;
};

export class Relations {
    constructor(hote, options) {
        this.hote = hote;
        this.o = options;
        this.vue = 'colonnes';
        /* Les deux axes sont libres : laboratoire × partenaire est le
           croisement le plus demandé, mais type × laboratoire ou
           activité × année répondent à d'autres questions. */
        /* Axes par défaut : le croisement le plus demandé de chaque tableau
           de bord. Ils sont réévalués si la source change. */
        this.axeGauche = null;
        this.axeDroite = null;
        this.detailGauche = 12;
        this.detailDroite = 15;
        /* Mise en avant maintenue sur une entrée précise, choisie au clic
           droit. Comparer deux entrées éloignées oblige sinon à mémoriser la
           première pendant qu'on survole la seconde.
           Elle porte sur une valeur donnée plutôt que sur un mode général :
           un réglage global aurait demandé de l'activer, puis de viser, puis
           de le désactiver — trois gestes pour un besoin ponctuel. */
        this.surbrillance = null;   // { cote, valeur }
    }

    /** Intitulés des deux axes, selon la vue : « gauche » et « droite » ne
        veulent rien dire dans une matrice ni dans un réseau. */
    _nomsAxes() {
        if (this.vue === 'matrice') return ['Lignes', 'Colonnes'];
        if (this.vue === 'flux')    return ['Origine', 'Destination'];
        return ['Axe gauche', 'Axe droit'];
    }

    /** Champs proposés comme axes : tout sauf les identifiants d'opération. */
    _axesPossibles() {
        return CHAMPS.ope.filter(c => c.cle !== 'ec' || true);
    }

    /* Croisement filtré et regroupé, commun aux trois vues. */
    _preparer(rows, etat) {
        const cleG = this.axeGauche, cleD = this.axeDroite;
        const source = this.o.source();
        const defG = champ(source, cleG), defD = champ(source, cleD);
        const cellules = croisement(rows, source, cleG, cleD, etat);

        const totalG = {}, totalD = {};
        cellules.forEach(c => {
            totalG[c.a] = (totalG[c.a] || 0) + c.valeur;
            totalD[c.b] = (totalD[c.b] || 0) + c.valeur;
        });

        /* Un axe temporel garde son ordre chronologique : le classer par
           effectif rendrait la lecture absurde. */
        const triG = defG?.nature === 'temporel' ? 'libelle' : 'effectif';
        const triD = defD?.nature === 'temporel' ? 'libelle' : 'effectif';
        const g = regrouper(totalG, { nb: triG === 'effectif' ? this.detailGauche : 0,
                                     tri: triG, epinglees: etat.epinglees?.[cleG] });
        const d = regrouper(totalD, { nb: triD === 'effectif' ? this.detailDroite : 0,
                                     tri: triD, epinglees: etat.epinglees?.[cleD] });

        const etiqG = LIBELLE_AUTRES + ` (${(defG?.libelle || cleG).toLowerCase()})`;
        const etiqD = LIBELLE_AUTRES + ` (${(defD?.libelle || cleD).toLowerCase()})`;
        const nomsG = new Set(g.lignes.filter(l => !l.autres).map(l => l.valeur));
        const nomsD = new Set(d.lignes.filter(l => !l.autres).map(l => l.valeur));

        /* Les valeurs regroupées ne disparaissent pas : elles sont reportées
           sur une entrée « Autres », qui conserve leur poids. */
        const liens = new Map();
        cellules.forEach(c => {
            const a = nomsG.has(c.a) ? c.a : etiqG;
            const b = nomsD.has(c.b) ? c.b : etiqD;
            const cle = a + '\u0000' + b;
            liens.set(cle, (liens.get(cle) || 0) + c.valeur);
        });

        const marquer = (resultat, etiquette) => resultat.lignes.map(l => ({
            ...l, valeur: l.autres ? etiquette : l.valeur }));

        return {
            cleG, cleD, defG, defD,
            gauche: marquer(g, etiqG),
            droite: marquer(d, etiqD),
            liens, regroupees: g.regroupees + d.regroupees,
            resumeG: g, resumeD: d,
        };
    }

    _unite() { return UNITE[this.o.source()].pluriel; }

    /** Croisement de départ, par tableau de bord. */
    _axesParDefaut(source) {
        /* Type de partenaire plutôt que partenaire : quelques types se lisent
           d'un coup d'œil là où plusieurs centaines de partenaires imposent
           d'emblée un regroupement massif. Le partenaire reste à un menu de
           distance pour qui veut le détail. */
        return source === 'ope' ? ['labo', 'type'] : ['labo', 'domaine'];
    }

    rendre(rows) {
        const etat = this.o.etat();
        const source = this.o.source();
        this.hote.innerHTML = '';

        /* Les champs diffèrent d'une source à l'autre : un axe qui n'existe
           pas dans la source courante est remplacé plutôt que laissé vide. */
        const [defautG, defautD] = this._axesParDefaut(source);
        if (!this.axeGauche || !champ(source, this.axeGauche)) this.axeGauche = defautG;
        if (!this.axeDroite || !champ(source, this.axeDroite)) this.axeDroite = defautD;
        /* Deux axes identiques ne produiraient qu'une diagonale. Reprendre la
           valeur par défaut ne suffit pas : elle peut être celle qui vient
           d'être choisie de l'autre côté. On prend donc le premier champ qui
           diffère réellement. */
        if (this.axeGauche === this.axeDroite) {
            const secours = [defautD, defautG, ...CHAMPS[source].map(c => c.cle)]
                .find(cle => cle !== this.axeGauche && champ(source, cle));
            this.axeDroite = secours || this.axeDroite;
        }


        if (!rows.length) {
            this.hote.innerHTML = '<p class="note">Aucune opération dans la sélection.</p>';
            return;
        }

        const donnees = this._preparer(rows, etat);
        if (!donnees.liens.size) {
            this.hote.innerHTML = '<p class="note">Aucune relation entre laboratoire '
                                + 'et partenaire dans la sélection.</p>';
            return;
        }

        const barre = document.createElement('div');
        barre.className = 'relations-barre';
        barre.append(this._selecteurVue(), this._selecteurAxes(donnees));
        this.hote.appendChild(barre);

        if (this.vue === 'colonnes' || this.vue === 'flux') {
            if (this.surbrillance) this.hote.appendChild(this._rappelSurbrillance());
        } else {
            this.surbrillance = null;
        }

        const corps = document.createElement('div');
        corps.className = 'figure-corps';
        this.hote.appendChild(corps);

        if (this.vue !== 'matrice') {
            setTimeout(() => this.o.onExport?.(barre, corps,
                `${donnees.defG?.libelle || donnees.cleG} et ${donnees.defD?.libelle || donnees.cleD}`), 0);
        }

        if (this.vue === 'matrice')   this._matrice(donnees, corps, etat);
        else if (this.vue === 'flux') this._flux(donnees, corps, etat);
        else                          this._colonnes(donnees, corps, etat);

        if (donnees.regroupees) {

            /* Le regroupement doit rester consultable : sans cela, « Autres »
               masque définitivement une partie des données. */
            [['gauche', donnees.resumeG, donnees.cleG, donnees.defG],
             ['droite', donnees.resumeD, donnees.cleD, donnees.defD]]
                .forEach(([cote, resume, cle, def]) => {
                    if (!resume.regroupees) return;
                    this.hote.appendChild(this._accesAutres(cote, resume, cle, def));
                });
        }
        this.hote.appendChild(this._reglages(donnees));
    }

    /** Rappel de l'entrée dont la mise en avant est maintenue. */
    _rappelSurbrillance() {
        const boite = document.createElement('div');
        boite.className = 'relations-surbrillance';

        const etiquette = document.createElement('span');
        etiquette.className = 'note';
        etiquette.textContent = 'Mise en avant maintenue :';

        const actuel = document.createElement('span');
        actuel.className = 'surbrillance-actuelle';
        actuel.textContent = this.surbrillance.valeur;
        actuel.title = this.surbrillance.valeur;

        const retirer = document.createElement('button');
        retirer.type = 'button';
        retirer.className = 'lien';
        retirer.textContent = 'retirer';
        retirer.addEventListener('click', () => {
            this.surbrillance = null;
            this.o.onRafraichir();
        });

        boite.append(etiquette, actuel, retirer);
        return boite;
    }

    /** Accès au contenu d'un regroupement. */
    _accesAutres(cote, resume, cle, def) {
        const membres = resume.lignes.find(l => l.autres)?.membres || [];
        const p = document.createElement('p');
        p.className = 'note';
        p.append(document.createTextNode(
            `${resume.regroupees} ${(def?.libelle || cle).toLowerCase()}s réunis sous « Autres ». `));
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.className = 'lien';
        bouton.textContent = `Voir les ${membres.length} valeurs`;
        bouton.addEventListener('click', () => this.o.onOuvrirAutres?.(cle, membres));
        this.o.onMenuAutres?.(bouton, cle, membres);
        p.appendChild(bouton);
        return p;
    }

    /** Choix des deux axes croisés. */
    _selecteurAxes(donnees) {
        const boite = document.createElement('div');
        boite.className = 'relations-axes';

        const menu = (etiquette, valeurCourante, autre, appliquer) => {
            const bloc = document.createElement('div');
            bloc.className = 'reglage-detail';
            const lab = document.createElement('label');
            lab.className = 'etiquette-champ';
            lab.textContent = etiquette;
            const select = document.createElement('select');
            CHAMPS[this.o.source()].forEach(c => {
                const o = document.createElement('option');
                o.value = c.cle;
                o.textContent = c.libelle;
                /* Croiser un champ avec lui-même ne produirait qu'une
                   diagonale : l'option est retirée plutôt que laissée
                   sélectionnable pour rien. */
                if (c.cle === autre) o.disabled = true;
                if (c.cle === valeurCourante) o.selected = true;
                select.appendChild(o);
            });
            select.addEventListener('change', () => {
                appliquer(select.value);
                        this.o.onRafraichir();
            });
            bloc.append(lab, select);
            return bloc;
        };

        const inverser = document.createElement('button');
        inverser.type = 'button';
        inverser.className = 'btn btn-petit';
        inverser.textContent = '⇄';
        inverser.title = 'Intervertir les deux axes';
        inverser.setAttribute('aria-label', 'Intervertir les deux axes');
        inverser.addEventListener('click', () => {
            const g = this.axeGauche;
            this.axeGauche = this.axeDroite;
            this.axeDroite = g;
            const dg = this.detailGauche;
            this.detailGauche = this.detailDroite;
            this.detailDroite = dg;
                this.o.onRafraichir();
        });

        const [nomG, nomD] = this._nomsAxes();
        boite.append(
            menu(nomG, this.axeGauche, this.axeDroite, v => { this.axeGauche = v; }),
            inverser,
            menu(nomD, this.axeDroite, this.axeGauche, v => { this.axeDroite = v; }),
        );
        return boite;
    }

    _selecteurVue() {
        const barre = document.createElement('div');
        barre.className = 'onglets onglets-vue';
        barre.setAttribute('role', 'tablist');
        [['colonnes', 'Liens',   'Chaque lien, entrée par entrée'],
         ['flux',     'Flux',    'Les volumes, proportionnels de bout en bout'],
         ['matrice',  'Matrice', 'Les effectifs exacts, recopiables']].forEach(([cle, nom, aide]) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'onglet' + (this.vue === cle ? ' actif' : '');
            b.textContent = nom;
            b.title = aide;
            b.setAttribute('role', 'tab');
            b.setAttribute('aria-selected', String(this.vue === cle));
            b.addEventListener('click', () => { this.vue = cle; this.o.onRafraichir(); });
            barre.appendChild(b);
        });
        return barre;
    }

    /* ── Colonnes : deux colonnes reliées ── */
    _colonnes(donnees, corps, etat) {
        const { liens, cleG, cleD, defG, defD } = donnees;

        /* Ordre calculé pour limiter les croisements : classer chaque colonne
           par effectif produit un enchevêtrement dès la dizaine de liens. */
        const { gauche, droite } = ordonnerColonnes(donnees.gauche, donnees.droite, liens, {
            gaucheFixe: defG?.nature === 'temporel',
            droiteFixe: defD?.nature === 'temporel',
        });

        const largeur = Math.max(460, this.hote.clientWidth || 760);
        const pas = 26, marge = 24;
        const hauteur = marge * 2 + Math.max(gauche.length, droite.length) * pas;
        const xGauche = Math.min(250, largeur * 0.3);
        const xDroite = largeur - xGauche;

        const svg = el('svg', {
            viewBox: `0 0 ${largeur} ${hauteur}`, width: '100%', height: hauteur,
            class: 'figure', role: 'img',
        });

        const rang = (liste, valeur) => liste.findIndex(l => l.valeur === valeur);
        const yDe = (liste, valeur) => marge + rang(liste, valeur) * pas + pas / 2;
        const max = Math.max(...liens.values(), 1);
        const selG = etat.facettes[cleG] || new Set();
        const selD = etat.facettes[cleD] || new Set();

        /* En-têtes de colonnes : sans eux, on ne sait pas ce qu'on lit. */
        svg.appendChild(Object.assign(el('text', {
            x: xGauche, y: 14, 'text-anchor': 'end', class: 'figure-axe',
            fill: 'var(--encre-3)',
        }), { textContent: (defG?.libelle || cleG).toUpperCase() }));
        svg.appendChild(Object.assign(el('text', {
            x: xDroite, y: 14, 'text-anchor': 'start', class: 'figure-axe',
            fill: 'var(--encre-3)',
        }), { textContent: (defD?.libelle || cleD).toUpperCase() }));

        const coucheLiens = el('g', { class: 'relations-liens' });
        /* Un lien est mis en avant s'il touche l'entrée survolée ou épinglée. */
        const concerne = (a, b) => !this.surbrillance
            || (this.surbrillance.cote === 'gauche' ? a : b) === this.surbrillance.valeur;
        /* Valeurs reliées à l'entrée maintenue, pour atténuer les autres. */
        const relieesMaintenues = new Set();
        if (this.surbrillance) {
            liens.forEach((_, cle) => {
                const [ga, dr] = cle.split('\u0000');
                if (this.surbrillance.cote === 'gauche' && ga === this.surbrillance.valeur) {
                    relieesMaintenues.add(dr);
                } else if (this.surbrillance.cote === 'droite' && dr === this.surbrillance.valeur) {
                    relieesMaintenues.add(ga);
                }
            });
        }
        liens.forEach((valeur, cle) => {
            const [a, b] = cle.split('\u0000');
            if (rang(gauche, a) < 0 || rang(droite, b) < 0) return;
            const y1 = yDe(gauche, a), y2 = yDe(droite, b);
            const actif = selG.has(a) || selD.has(b);
            const chemin = el('path', {
                d: `M ${xGauche + 6} ${y1} C ${(xGauche + xDroite) / 2} ${y1}, `
                 + `${(xGauche + xDroite) / 2} ${y2}, ${xDroite - 6} ${y2}`,
                fill: 'none', stroke: actif ? 'var(--signal)' : 'var(--encre-3)',
                'stroke-width': 0.7 + (valeur / max) * 4,
                'stroke-opacity': actif ? 0.85 : 0.28,
                class: 'lien-relation' + (concerne(a, b) ? '' : ' lien-efface'),
                'data-gauche': a, 'data-droite': b,
            });
            const titre = el('title');
            titre.textContent = `${a} ↔ ${b} — ${valeur} ${this._unite()}`;
            chemin.appendChild(titre);
            coucheLiens.appendChild(chemin);
        });
        svg.appendChild(coucheLiens);

        const colonne = (liste, x, ancrage, cle, selection) => {
            liste.forEach(ligne => {
                const y = yDe(liste, ligne.valeur);
                const cote = ancrage === 'end' ? 'gauche' : 'droite';
                const attenuee = this.surbrillance
                    && !(this.surbrillance.cote === cote
                         && this.surbrillance.valeur === ligne.valeur)
                    && !relieesMaintenues.has(ligne.valeur);
                const groupe = el('g', {
                    class: 'barre' + (attenuee ? ' entree-attenuee' : ''),
                    tabindex: '0', role: 'button',
                });
                /* Voisines de cette entrée : sert à atténuer les entrées sans
                   rapport lors de la mise en avant. */
                const voisines = [];
                liens.forEach((_, cle) => {
                    const [ga, dr] = cle.split('\u0000');
                    if (ancrage === 'end' ? ga === ligne.valeur : dr === ligne.valeur) {
                        voisines.push(ancrage === 'end' ? dr : ga);
                    }
                });
                groupe.dataset.relie = voisines.join('\u0001');

                const titre = el('title');
                titre.textContent = `${ligne.valeur} — ${ligne.effectif} ${this._unite()}`;
                groupe.appendChild(titre);

                groupe.appendChild(el('rect', {
                    x: ancrage === 'end' ? 0 : x, y: y - pas / 2,
                    width: ancrage === 'end' ? x : largeur - x, height: pas,
                    fill: 'transparent',
                }));

                const t = el('text', {
                    x: ancrage === 'end' ? x - 12 : x + 12, y: y + 4,
                    'text-anchor': ancrage, class: 'figure-libelle',
                    fill: selection.has(ligne.valeur) ? 'var(--signal)'
                        : ligne.autres ? 'var(--encre-3)' : 'var(--encre)',
                    'font-style': ligne.autres ? 'italic' : null,
                });
                t.textContent = ligne.valeur.length > 32
                    ? ligne.valeur.slice(0, 31) + '…' : ligne.valeur;
                groupe.appendChild(t);

                /* L'effectif accompagne le libellé : il évite d'avoir à
                   survoler pour savoir ce que pèse une ligne. */
                groupe.appendChild(Object.assign(el('text', {
                    x: ancrage === 'end' ? x - 12 : x + 12, y: y + 14,
                    'text-anchor': ancrage, class: 'figure-valeur',
                    fill: 'var(--encre-3)',
                }), { textContent: ligne.effectif }));

                groupe.appendChild(el('circle', {
                    cx: x, cy: y, r: 3.5,
                    fill: selection.has(ligne.valeur) ? 'var(--signal)' : 'var(--encre-3)',
                }));

                /* Survoler une entrée éteint les liens qui ne la concernent
                   pas : c'est ce qui rend la figure lisible quand elle est
                   dense. */
                const mettreEnAvant = () => {
                    coucheLiens.querySelectorAll('.lien-relation').forEach(l => {
                        l.classList.toggle('lien-efface',
                            l.dataset[cote] !== ligne.valeur);
                    });
                    svg.querySelectorAll('.barre').forEach(b => {
                        b.classList.toggle('entree-attenuee',
                            b !== groupe && !b.dataset.relie?.split('\u0001')
                                .includes(ligne.valeur));
                    });
                };
                const retablir = () => {
                    coucheLiens.querySelectorAll('.lien-relation')
                        .forEach(l => l.classList.remove('lien-efface'));
                    svg.querySelectorAll('.barre')
                        .forEach(b => b.classList.remove('entree-attenuee'));
                };

                /* Le survol reste transitoire ; une mise en avant maintenue
                   ne doit pas être effacée en passant la souris ailleurs. */
                groupe.addEventListener('mouseenter', () => {
                    if (this.surbrillance) return;
                    mettreEnAvant();
                });
                groupe.addEventListener('mouseleave', () => {
                    if (this.surbrillance) return;
                    retablir();
                });

                const membresDe = () => {
                    const resume = ancrage === 'end' ? donnees.resumeG : donnees.resumeD;
                    return resume.lignes.find(l => l.autres)?.membres || [];
                };
                const agir = ligne.autres
                    ? () => {
                        /* Détailler tout l'axe concerné, comme ailleurs. */
                        if (ancrage === 'end') this.detailGauche = 0;
                        else                   this.detailDroite = 0;
                        this.o.onRafraichir();
                      }
                    : () => this.o.onFiltrer(cle, ligne.valeur);
                groupe.addEventListener('click', agir);
                groupe.addEventListener('keydown', e => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); agir(); }
                });
                if (ligne.autres) {
                    this.o.onMenuAutres?.(groupe, cle, membresDe());
                } else {
                    const maintenue = this.surbrillance?.cote === cote
                                   && this.surbrillance?.valeur === ligne.valeur;
                    this.o.onMenu?.(groupe, cle, ligne.valeur, () => [{
                        libelle: maintenue
                            ? 'Ne plus maintenir la mise en avant'
                            : 'Maintenir la mise en avant',
                        aide: maintenue ? null : 'ses liens seuls',
                        action: () => {
                            this.surbrillance = maintenue
                                ? null : { cote, valeur: ligne.valeur };
                            this.o.onRafraichir();
                        },
                    }]);
                }
                svg.appendChild(groupe);
            });
        };

        colonne(gauche, xGauche, 'end',   cleG, selG);
        colonne(droite, xDroite, 'start', cleD, selD);

        corps.appendChild(svg);
        const legende = document.createElement('p');
        legende.className = 'note';
        legende.textContent = `L’épaisseur d’un trait indique le nombre de `
            + `${this._unite()} en commun. Survolez une entrée pour isoler ses liens ; `
            + `l’ordre des colonnes est calculé pour limiter les croisements.`;
        corps.appendChild(legende);
    }

    /* ── Matrice : les chiffres exacts ── */
    _matrice(donnees, corps, etat) {
        const { gauche, droite, liens, cleG, cleD, defG, defD } = donnees;
        /* L'intensité de fond se calibre sur les croisements comparables :
           une cellule « Autres × Autres » cumule des dizaines de valeurs et
           saturerait le gradient, rendant tout le reste indistinct. */
        const ecartees = new Set([
            ...gauche.filter(l => horsEchelle(l.valeur, l)).map(l => l.valeur),
            ...droite.filter(l => horsEchelle(l.valeur, l)).map(l => l.valeur),
        ]);
        const utiles = [...liens.entries()]
            .filter(([cle]) => !cle.split('\u0000').some(p => ecartees.has(p)))
            .map(([, v]) => v);
        const max = Math.max(...(utiles.length ? utiles : [...liens.values()]), 1);

        const enveloppe = document.createElement('div');
        enveloppe.className = 'matrice-enveloppe';
        const table = document.createElement('table');
        table.className = 'tableau matrice';

        const trh = table.createTHead().insertRow();
        const coin = document.createElement('th');
        coin.className = 'matrice-coin';
        coin.textContent = `${defG?.libelle || cleG} ╲ ${defD?.libelle || cleD}`;
        trh.appendChild(coin);
        droite.forEach(p => {
            const th = document.createElement('th');
            th.className = 'matrice-tete';
            const span = document.createElement('span');
            span.textContent = p.valeur;
            th.appendChild(span);
            th.title = `${p.valeur} — ${p.effectif} ${this._unite()}`;
            if (!p.autres) {
                th.classList.add('triable');
                th.addEventListener('click', () => this.o.onFiltrer(cleD, p.valeur));
                this.o.onMenu?.(th, cleD, p.valeur);
            }
            trh.appendChild(th);
        });
        const thTotal = document.createElement('th');
        thTotal.className = 'matrice-tete colonne-nombre';
        thTotal.textContent = 'Total';
        trh.appendChild(thTotal);

        const tbody = table.createTBody();
        gauche.forEach(l => {
            const tr = tbody.insertRow();
            const tdNom = tr.insertCell();
            tdNom.className = 'matrice-nom';
            tdNom.textContent = l.valeur;
            tdNom.title = `${l.valeur} — ${l.effectif} ${this._unite()}`;
            if (!l.autres) {
                tdNom.classList.add('triable');
                tdNom.addEventListener('click', () => this.o.onFiltrer(cleG, l.valeur));
                this.o.onMenu?.(tdNom, cleG, l.valeur);
            }
            droite.forEach(p => {
                const td = tr.insertCell();
                td.className = 'matrice-cellule';
                const v = liens.get(l.valeur + '\u0000' + p.valeur) || 0;
                if (v) {
                    td.textContent = v;
                    /* L'intensité double le chiffre plutôt que de le remplacer :
                       elle guide le regard, le chiffre reste la donnée. */
                    td.style.background =
                        `color-mix(in srgb, var(--signal) ${Math.round(12 + (v / max) * 55)}%, transparent)`;
                    td.title = `${l.valeur} ↔ ${p.valeur} — ${v} ${this._unite()}`;
                }
                tr.appendChild(td);
            });
            const tdT = tr.insertCell();
            tdT.className = 'colonne-nombre matrice-total';
            tdT.textContent = l.effectif;
        });

        enveloppe.appendChild(table);
        corps.appendChild(enveloppe);

        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.className = 'lien';
        bouton.textContent = 'Copier la matrice (format tableur)';
        bouton.addEventListener('click', async () => {
            const lignes = [['', ...droite.map(p => p.valeur)].join('\t')];
            gauche.forEach(l => lignes.push([l.valeur,
                ...droite.map(p => liens.get(l.valeur + '\u0000' + p.valeur) || 0)].join('\t')));
            try {
                await navigator.clipboard.writeText(lignes.join('\n'));
                bouton.textContent = 'Matrice copiée';
            } catch { bouton.textContent = 'Copie impossible'; }
            setTimeout(() => { bouton.textContent = 'Copier la matrice (format tableur)'; }, 1800);
        });
        corps.appendChild(bouton);
    }

    /* ── Flux : les volumes, proportionnels de bout en bout ── */
    _flux(donnees, corps, etat) {
        const { liens, cleG, cleD, defG, defD } = donnees;

        const { gauche, droite } = ordonnerColonnes(donnees.gauche, donnees.droite, liens, {
            gaucheFixe: defG?.nature === 'temporel',
            droiteFixe: defD?.nature === 'temporel',
        });

        const largeur = Math.max(520, this.hote.clientWidth || 820);
        const hauteur = Math.max(340, Math.min(620,
            60 + Math.max(gauche.length, droite.length) * 26));

        const selection = new Set([
            ...(etat.facettes[cleG] || []), ...(etat.facettes[cleD] || []),
        ]);

        /* Une teinte par valeur des deux axes réunis : un même libellé
           présent des deux côtés doit garder la même couleur. */
        /* Les rubans d'un même bloc se jouxtent : même exigence d'écart. */
        const teintes = attribuerCouleursContrastees(
            [...gauche.map(n => n.valeur), ...droite.map(n => n.valeur)]);

        const svg = dessinerFlux({
            gauche, droite, liens, largeur, hauteur, selection,
            couleurs: preferences.couleurs,
            couleurPour: v => teintes.get(v),
            titreG: defG?.libelle || cleG,
            titreD: defD?.libelle || cleD,
            unite: this._unite(),
            surbrillance: this.surbrillance,
            onSurvol: (cote, valeur, coucheRubans) => {
                if (this.surbrillance) return;   // une mise en avant maintenue prime
                coucheRubans.querySelectorAll('.flux-ruban').forEach(r => {
                    r.classList.toggle('lien-efface',
                        cote !== null && r.dataset[cote] !== valeur);
                });
            },
            onClic: (cote, noeud) => {
                const cle = cote === 'gauche' ? cleG : cleD;
                if (noeud.autres) {
                    if (cote === 'gauche') this.detailGauche = 0;
                    else                   this.detailDroite = 0;
                    this.o.onRafraichir();
                    return;
                }
                this.o.onFiltrer(cle, noeud.valeur);
            },
            onMenu: (element, cote, noeud) => {
                const cle = cote === 'gauche' ? cleG : cleD;
                if (noeud.autres) {
                    const resume = cote === 'gauche' ? donnees.resumeG : donnees.resumeD;
                    this.o.onMenuAutres?.(element, cle,
                        resume.lignes.find(l => l.autres)?.membres || []);
                    return;
                }
                const maintenue = this.surbrillance?.cote === cote
                               && this.surbrillance?.valeur === noeud.valeur;
                this.o.onMenu?.(element, cle, noeud.valeur, () => [{
                    libelle: maintenue
                        ? 'Ne plus maintenir la mise en avant'
                        : 'Maintenir la mise en avant',
                    aide: maintenue ? null : 'ses flux seuls',
                    action: () => {
                        this.surbrillance = maintenue ? null : { cote, valeur: noeud.valeur };
                        this.o.onRafraichir();
                    },
                }]);
            },
        });
        corps.appendChild(svg);

        const legende = document.createElement('p');
        legende.className = 'note';
        legende.textContent = `La hauteur d’un bloc est proportionnelle à son nombre de `
            + `${this._unite()}, l’épaisseur d’un ruban au nombre de ${this._unite()} en commun. `
            + 'Un bloc haut traversé de rubans fins travaille avec beaucoup '
            + 'd’interlocuteurs ; un bloc haut relié par un seul ruban épais '
            + 'concentre son activité.';
        corps.appendChild(legende);
    }

    /* ── Niveau de détail des deux axes ── */
    _reglages(donnees) {
        const barre = document.createElement('div');
        barre.className = 'relations-reglages';

        const champLocal = (etiquette, valeurCourante, total, appliquer, desactive) => {
            const boite = document.createElement('div');
            boite.className = 'reglage-detail';
            const lab = document.createElement('label');
            lab.className = 'etiquette-champ';
            lab.textContent = etiquette;
            const select = document.createElement('select');
            select.disabled = !!desactive;
            [8, 12, 15, 25, 0].forEach(n => {
                if (n !== 0 && n >= total + 5) return;
                const o = document.createElement('option');
                o.value = n;
                o.textContent = n === 0 ? 'Toutes' : String(n);
                if (n === valeurCourante) o.selected = true;
                select.appendChild(o);
            });
            select.addEventListener('change', () => {
                appliquer(+select.value);
                        this.o.onRafraichir();
            });
            boite.append(lab, select);
            if (desactive) {
                const note = document.createElement('span');
                note.className = 'note';
                note.textContent = 'axe chronologique';
                boite.appendChild(note);
            }
            return boite;
        };

        barre.append(
            champLocal(`${donnees.defG?.libelle || donnees.cleG} détaillés`,
                       this.detailGauche, donnees.gauche.length,
                       v => { this.detailGauche = v; },
                       donnees.defG?.nature === 'temporel'),
            champLocal(`${donnees.defD?.libelle || donnees.cleD} détaillés`,
                       this.detailDroite, donnees.droite.length,
                       v => { this.detailDroite = v; },
                       donnees.defD?.nature === 'temporel'),
        );
        return barre;
    }
}
