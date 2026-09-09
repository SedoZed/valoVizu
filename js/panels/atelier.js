/**
 * panels/atelier.js
 * Exploration libre : deux champs au choix, une forme au choix.
 *
 * Les panneaux du tableau de bord répondent à des questions prévues. Celui-ci
 * répond aux autres. Il est placé en fin de page et présenté comme tel : dans
 * un tableau de bord, un panneau qui demande à l'utilisateur de formuler sa
 * question est un corps étranger, mais l'absence de soupape enferme dans les
 * seuls croisements anticipés — et ce sont rarement les plus intéressants.
 *
 * Il consomme les mêmes fonctions que les autres panneaux : ce qu'on y lit
 * concorde avec le reste, filtres et masquages compris.
 */
import { CHAMPS, champ, UNITE } from '../core/champs.js';
import { estDeplie, basculerDepliement } from '../core/preferences.js';
import { preferences } from '../core/preferences.js';
import { effectifs, croisement } from '../core/selection.js';
import { regrouper, noteRegroupement, LIBELLE_AUTRES } from '../core/groupe.js';
import { barresHorizontales, colonnes, colonnesEmpilees, legendeCouleurs,
         bullesTemporelles, attribuerCouleurs,
         attribuerCouleursContrastees } from '../ui/graphique.js';

const FORMES = [
    { cle: 'barres',   libelle: 'Barres',   croise: false },
    { cle: 'colonnes', libelle: 'Colonnes', croise: false },
    { cle: 'empilees', libelle: 'Empilées', croise: true },
    { cle: 'bulles',   libelle: 'Bulles',   croise: true },
    { cle: 'tableau',  libelle: 'Tableau',  croise: true },
];

export class Atelier {
    constructor(hote, options) {
        this.hote = hote;
        this.o = options;
        /* L'état de dépliement est repris des préférences à chaque rendu. */
        this.ouvert = false;
        this.champA = null;      // fixé au premier rendu selon la source
        this.champB = '';        // vide = pas de croisement
        this.forme = 'barres';
        this.detail = 12;
    }

    /** Champ par défaut, à la première ouverture ou au changement de source. */
    _defaut(source) {
        return source === 'ope' ? 'partenaire' : 'labo';
    }

    rendre(rows) {
        const source = this.o.source();
        const etat = this.o.etat();
        this.hote.innerHTML = '';

        this.ouvert = estDeplie(source, 'atelier');

        if (!this.champA || !champ(source, this.champA)) {
            this.champA = this._defaut(source);
            this.champB = '';
        }
        if (this.champB && !champ(source, this.champB)) this.champB = '';

        const tete = document.createElement('div');
        tete.className = 'panneau-tete';
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.className = 'qualite-bascule';
        bouton.setAttribute('aria-expanded', String(this.ouvert));
        const fleche = document.createElement('span');
        fleche.className = 'qualite-fleche';
        fleche.textContent = this.ouvert ? '▾' : '▸';
        const titre = document.createElement('h2');
        titre.textContent = 'Explorer librement';
        bouton.append(fleche, titre);
        bouton.addEventListener('click', () => {
            this.ouvert = basculerDepliement(this.o.source(), 'atelier');
            this.rendre(rows);
        });
        tete.appendChild(bouton);

        const sous = document.createElement('span');
        sous.className = 'qualite-resume';
        sous.textContent = this.ouvert
            ? this._intitule(source)
            : 'Croiser deux champs de son choix';
        tete.appendChild(sous);
        this.hote.appendChild(tete);

        if (!this.ouvert) return;

        this.hote.appendChild(this._reglages(source, rows));

        const corps = document.createElement('div');
        corps.className = 'figure-corps';
        this.hote.appendChild(corps);

        if (!rows.length) {
            corps.innerHTML = '<p class="note">Aucune donnée dans la sélection.</p>';
            return;
        }

        const croise = this.champB && FORMES.find(f => f.cle === this.forme)?.croise;
        if (croise) this._croise(rows, source, etat, corps);
        else        this._simple(rows, source, etat, corps);
    }

    _intitule(source) {
        const a = champ(source, this.champA)?.libelle || this.champA;
        if (!this.champB) return a;
        const b = champ(source, this.champB)?.libelle || this.champB;
        return `${a} × ${b}`;
    }

    /* ── Réglages ── */
    _reglages(source, rows) {
        const barre = document.createElement('div');
        barre.className = 'atelier-reglages';

        const menu = (etiquette, valeur, options, appliquer) => {
            const bloc = document.createElement('div');
            bloc.className = 'reglage-detail';
            const lab = document.createElement('label');
            lab.className = 'etiquette-champ';
            lab.textContent = etiquette;
            const select = document.createElement('select');
            options.forEach(o => {
                const opt = document.createElement('option');
                opt.value = o.valeur;
                opt.textContent = o.libelle;
                if (o.desactive) opt.disabled = true;
                if (o.valeur === valeur) opt.selected = true;
                select.appendChild(opt);
            });
            select.addEventListener('change', () => { appliquer(select.value); this.rendre(rows); });
            bloc.append(lab, select);
            return bloc;
        };

        const champsDispo = CHAMPS[source].map(c => ({ valeur: c.cle, libelle: c.libelle }));

        barre.appendChild(menu('Champ', this.champA,
            champsDispo.map(c => ({ ...c, desactive: c.valeur === this.champB })),
            v => { this.champA = v; }));

        barre.appendChild(menu('Croisé avec', this.champB,
            [{ valeur: '', libelle: '— aucun —' },
             ...champsDispo.map(c => ({ ...c, desactive: c.valeur === this.champA }))],
            v => {
                this.champB = v;
                /* Une forme croisée sans second champ n'aurait rien à montrer. */
                if (!v && FORMES.find(f => f.cle === this.forme)?.croise) this.forme = 'barres';
            }));

        barre.appendChild(menu('Forme', this.forme,
            FORMES.map(f => ({
                valeur: f.cle, libelle: f.libelle,
                desactive: f.croise && !this.champB,
            })),
            v => { this.forme = v; }));

        const defA = champ(source, this.champA);
        if (defA?.nature !== 'temporel') {
            barre.appendChild(menu('Valeurs détaillées', String(this.detail),
                ['8', '12', '20', '40', '0'].map(n => ({
                    valeur: n, libelle: n === '0' ? 'Toutes' : n })),
                v => { this.detail = +v; }));
        }

        return barre;
    }

    /* ── Un seul champ ── */
    _simple(rows, source, etat, corps) {
        const def = champ(source, this.champA);
        const unite = UNITE[source].pluriel;
        const comptes = effectifs(rows, source, this.champA, etat);
        if (!Object.keys(comptes).length) {
            corps.innerHTML = '<p class="note">Aucune valeur renseignée pour ce champ.</p>';
            return;
        }

        const temporel = def?.nature === 'temporel';
        const resultat = regrouper(comptes, {
            nb: temporel ? 0 : this.detail,
            tri: temporel ? 'ordre' : (def?.ordre ? 'ordre' : 'effectif'),
            ordre: temporel
                ? Object.keys(comptes).sort((a, b) =>
                    String(a).localeCompare(String(b), 'fr', { numeric: true }))
                : def?.ordre,
            epinglees: etat.epinglees?.[this.champA],
        });

        const largeur = Math.max(360, this.hote.clientWidth || 760);
        const selection = etat.facettes[this.champA] || new Set();
        const teintes = attribuerCouleurs(resultat.lignes.map(l => l.valeur));
        const commun = {
            lignes: resultat.lignes, largeur, selection, unite,
            onClic: valeur => this.o.onFiltrer(this.champA, valeur),
            onMenu: (element, valeur) => this.o.onMenu?.(element, this.champA, valeur),
            couleurs: preferences.couleurs,
            couleurPour: v => teintes.get(v),
        };

        if (this.forme === 'tableau') this._tableau(resultat, corps, unite);
        else if (this.forme === 'colonnes') corps.appendChild(colonnes(commun));
        else corps.appendChild(barresHorizontales({
            ...commun,
            onAutres: () => { this.detail = 0; this.o.onRafraichir(); },
        }));

        if (resultat.regroupees) {
            const note = document.createElement('p');
            note.className = 'note';
            note.append(document.createTextNode(noteRegroupement(resultat, unite) + ' '));
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'lien';
            const membres = resultat.lignes.find(l => l.autres)?.membres || [];
            b.textContent = `Voir les ${membres.length} valeurs`;
            b.addEventListener('click', () => this.o.onOuvrirAutres?.(this.champA, membres));
            note.appendChild(b);
            corps.appendChild(note);
        }
    }

    /* ── Deux champs croisés ── */
    _croise(rows, source, etat, corps) {
        const defA = champ(source, this.champA), defB = champ(source, this.champB);
        const unite = UNITE[source].pluriel;
        const cellules = croisement(rows, source, this.champA, this.champB, etat);
        if (!cellules.size) {
            corps.innerHTML = '<p class="note">Ce croisement ne donne aucune donnée.</p>';
            return;
        }

        const totauxA = {}, totauxB = {};
        cellules.forEach(c => {
            totauxA[c.a] = (totauxA[c.a] || 0) + c.valeur;
            totauxB[c.b] = (totauxB[c.b] || 0) + c.valeur;
        });

        const temporelA = defA?.nature === 'temporel';
        const groupesA = regrouper(totauxA, {
            nb: temporelA ? 0 : this.detail,
            tri: temporelA ? 'ordre' : 'effectif',
            ordre: temporelA
                ? Object.keys(totauxA).sort((a, b) =>
                    String(a).localeCompare(String(b), 'fr', { numeric: true }))
                : null,
            epinglees: etat.epinglees?.[this.champA],
        });
        /* Au-delà de six couleurs, une légende cesse d'être lisible. */
        /* Six séries au plus en couleurs, mais les bulles n'emploient pas de
           couleur : elles peuvent en afficher davantage. */
        const temporelB = defB?.nature === 'temporel';
        const groupesB = regrouper(totauxB, {
            nb: temporelB ? 0 : (this.forme === 'bulles' ? 14 : 6),
            tri: temporelB ? 'ordre' : 'effectif',
            ordre: temporelB
                ? Object.keys(totauxB).sort((a, b) =>
                    String(a).localeCompare(String(b), 'fr', { numeric: true }))
                : null,
            epinglees: etat.epinglees?.[this.champB],
        });

        if (this.forme === 'tableau') {
            this._tableauCroise(groupesA, groupesB, cellules, corps, unite);
            return;
        }

        if (this.forme === 'bulles') {
            this._bulles(groupesA, groupesB, cellules, corps, etat, unite);
            return;
        }

        const nomsA = new Set(groupesA.lignes.filter(l => !l.autres).map(l => l.valeur));
        const nomsB = new Set(groupesB.lignes.filter(l => !l.autres).map(l => l.valeur));
        const categories = groupesA.lignes.map(l => l.valeur);
        const series = groupesB.lignes.map(l => ({ nom: l.valeur, valeurs: {} }));
        const parNom = new Map(series.map(s => [s.nom, s]));

        cellules.forEach(c => {
            const a = nomsA.has(c.a) ? c.a : LIBELLE_AUTRES;
            const b = nomsB.has(c.b) ? c.b : LIBELLE_AUTRES;
            const cible = parNom.get(b);
            if (!cible || !categories.includes(a)) return;
            cible.valeurs[a] = (cible.valeurs[a] || 0) + c.valeur;
        });

        const largeur = Math.max(360, this.hote.clientWidth || 760);
        /* Segments jointifs : teintes écartées plutôt que stables. */
        const teintesSeries = attribuerCouleursContrastees(series.map(s => s.nom));
        corps.appendChild(colonnesEmpilees({
            categories, series, largeur, hauteur: 300, unite,
            couleurs: preferences.couleurs,
            couleurPour: v => teintesSeries.get(v),
            onClicCategorie: valeur => this.o.onFiltrer(this.champA, valeur),
            onMenuCategorie: (element, valeur) =>
                this.o.onMenu?.(element, this.champA, valeur),
            onMenuSegment: (element, serie, categorie, effectif) => {
                if (serie === LIBELLE_AUTRES) return;
                this.o.onMenuCombinaison?.(element, this.champA, categorie,
                                           this.champB, serie, effectif);
            },
            onClic: nom => {
                if (nom === LIBELLE_AUTRES) {
                    this.o.onOuvrirAutres?.(this.champB,
                        groupesB.lignes.find(l => l.autres)?.membres || []);
                    return;
                }
                this.o.onFiltrer(this.champB, nom);
            },
        }));
        corps.appendChild(legendeCouleurs(series.map(s => s.nom), nom => {
            if (nom === LIBELLE_AUTRES) {
                this.o.onOuvrirAutres?.(this.champB,
                    groupesB.lignes.find(l => l.autres)?.membres || []);
                return;
            }
            this.o.onFiltrer(this.champB, nom);
        }));

        [[groupesA, this.champA, defA], [groupesB, this.champB, defB]].forEach(([g, cle, def]) => {
            if (!g.regroupees) return;
            const note = document.createElement('p');
            note.className = 'note';
            note.append(document.createTextNode(
                `${g.regroupees} ${(def?.libelle || cle).toLowerCase()}s réunis sous « Autres ». `));
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'lien';
            const membres = g.lignes.find(l => l.autres)?.membres || [];
            b.textContent = `Voir les ${membres.length} valeurs`;
            b.addEventListener('click', () => this.o.onOuvrirAutres?.(cle, membres));
            note.appendChild(b);
            corps.appendChild(note);
        });
    }

    /** Bulles : une valeur du premier champ par ligne, du second par colonne. */
    _bulles(groupesA, groupesB, cellules, corps, etat, unite) {
        const nomsA = new Set(groupesA.lignes.filter(l => !l.autres).map(l => l.valeur));
        const nomsB = new Set(groupesB.lignes.filter(l => !l.autres).map(l => l.valeur));
        const grille = new Map();
        cellules.forEach(c => {
            const a = nomsA.has(c.a) ? c.a : LIBELLE_AUTRES;
            const b = nomsB.has(c.b) ? c.b : LIBELLE_AUTRES;
            const k = a + '\u0000' + b;
            grille.set(k, (grille.get(k) || 0) + c.valeur);
        });
        corps.appendChild(bullesTemporelles({
            entites: groupesA.lignes,
            categories: groupesB.lignes.map(l => l.valeur),
            cellules: grille,
            largeur: Math.max(360, this.hote.clientWidth || 760),
            selection: etat.facettes[this.champA] || new Set(),
            unite, couleurs: preferences.couleurs,
            onClic: valeur => this.o.onFiltrer(this.champA, valeur),
            onMenu: (element, valeur) => this.o.onMenu?.(element, this.champA, valeur),
        }));
    }

    /* ── Formes tabulaires ── */
    _tableau(resultat, corps, unite) {
        const total = resultat.total || 1;
        const table = document.createElement('table');
        table.className = 'tableau';
        const trh = table.createTHead().insertRow();
        ['Valeur', unite.charAt(0).toUpperCase() + unite.slice(1), 'Part'].forEach((t, i) => {
            const th = document.createElement('th');
            th.textContent = t;
            if (i) th.className = 'colonne-nombre';
            trh.appendChild(th);
        });
        const tb = table.createTBody();
        resultat.lignes.forEach(l => {
            const tr = tb.insertRow();
            tr.className = 'tableau-ligne';
            const nom = tr.insertCell();
            nom.textContent = l.valeur;
            if (l.autres) nom.style.fontStyle = 'italic';
            const nb = tr.insertCell(); nb.className = 'colonne-nombre'; nb.textContent = l.effectif;
            const pc = tr.insertCell(); pc.className = 'colonne-nombre';
            pc.textContent = (100 * l.effectif / total).toFixed(1).replace('.', ',') + ' %';
            if (!l.autres) {
                tr.addEventListener('click', () => this.o.onFiltrer(this.champA, l.valeur));
                this.o.onMenu?.(tr, this.champA, l.valeur);
            }
        });
        corps.appendChild(table);
        corps.appendChild(this._copier(() => {
            const lignes = ['Valeur\t' + unite + '\tPart'];
            resultat.lignes.forEach(l => lignes.push(
                `${l.valeur}\t${l.effectif}\t${(100 * l.effectif / total).toFixed(1)}`));
            return lignes.join('\n');
        }));
    }

    _tableauCroise(groupesA, groupesB, cellules, corps, unite) {
        const colonnesB = groupesB.lignes.map(l => l.valeur);
        const nomsA = new Set(groupesA.lignes.filter(l => !l.autres).map(l => l.valeur));
        const nomsB = new Set(groupesB.lignes.filter(l => !l.autres).map(l => l.valeur));

        const grille = new Map();
        cellules.forEach(c => {
            const a = nomsA.has(c.a) ? c.a : LIBELLE_AUTRES;
            const b = nomsB.has(c.b) ? c.b : LIBELLE_AUTRES;
            const k = a + '\u0000' + b;
            grille.set(k, (grille.get(k) || 0) + c.valeur);
        });

        const table = document.createElement('table');
        table.className = 'tableau matrice';
        const trh = table.createTHead().insertRow();
        const coin = document.createElement('th');
        coin.className = 'matrice-coin';
        coin.textContent = `${this._intitule(this.o.source())}`;
        trh.appendChild(coin);
        colonnesB.forEach(b => {
            const th = document.createElement('th');
            th.className = 'matrice-tete';
            const span = document.createElement('span');
            span.textContent = b;
            th.appendChild(span); th.title = b;
            trh.appendChild(th);
        });
        const thT = document.createElement('th');
        thT.className = 'matrice-tete colonne-nombre'; thT.textContent = 'Total';
        trh.appendChild(thT);

        const max = Math.max(...grille.values(), 1);
        const tb = table.createTBody();
        groupesA.lignes.forEach(l => {
            const tr = tb.insertRow();
            const nom = tr.insertCell();
            nom.className = 'matrice-nom'; nom.textContent = l.valeur; nom.title = l.valeur;
            colonnesB.forEach(b => {
                const td = tr.insertCell();
                td.className = 'matrice-cellule';
                const v = grille.get(l.valeur + '\u0000' + b) || 0;
                if (v) {
                    td.textContent = v;
                    td.style.background = `color-mix(in srgb, var(--signal) `
                        + `${Math.round(12 + (v / max) * 55)}%, transparent)`;
                    td.title = `${l.valeur} × ${b} — ${v} ${unite}`;
                }
            });
            const tdT = tr.insertCell();
            tdT.className = 'colonne-nombre matrice-total'; tdT.textContent = l.effectif;
        });

        const enveloppe = document.createElement('div');
        enveloppe.className = 'matrice-enveloppe';
        enveloppe.appendChild(table);
        corps.appendChild(enveloppe);
        corps.appendChild(this._copier(() => {
            const lignes = [['', ...colonnesB].join('\t')];
            groupesA.lignes.forEach(l => lignes.push([l.valeur,
                ...colonnesB.map(b => grille.get(l.valeur + '\u0000' + b) || 0)].join('\t')));
            return lignes.join('\n');
        }));
    }

    _copier(construire) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'lien';
        b.textContent = 'Copier (format tableur)';
        b.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(construire());
                b.textContent = 'Copié';
            } catch { b.textContent = 'Copie impossible'; }
            setTimeout(() => { b.textContent = 'Copier (format tableur)'; }, 1800);
        });
        return b;
    }
}
