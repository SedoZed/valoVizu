/**
 * panels/partenaires.js
 * Les partenaires vus pour eux-mêmes.
 *
 * Jusqu'ici un partenaire n'existait que comme valeur de filtre : on pouvait
 * s'en servir pour restreindre la sélection, mais pas le consulter. Ce panneau
 * le rétablit comme objet d'étude — son activité, son type, le nombre
 * d'opérations qu'il porte, les laboratoires avec lesquels il travaille et sa
 * période d'activité.
 *
 * Les effectifs sont calculés sur la sélection courante : un partenaire actif
 * de longue date affichera moins d'opérations si l'on a restreint les années,
 * ce qui est le comportement attendu d'un tableau de bord filtrable.
 */
import { valeursVisibles } from '../core/selection.js';

const PAS = 25;

export class Partenaires {
    constructor(hote, options) {
        this.hote = hote;
        this.o = options;
        this.limite = PAS;
        this.tri = { colonne: 'operations', ascendant: false };
        this.recherche = '';
    }

    /** Agrège les opérations retenues par partenaire. */
    _synthese(rows, etat) {
        const parNom = new Map();

        rows.forEach(rec => {
            /* On repart des objets partenaires pour disposer du type et de
               l'activité, tout en respectant les valeurs mises hors périmètre. */
            const visibles = new Set(valeursVisibles(rec, 'ope', 'partenaire', etat));
            (rec.partenaires || []).forEach(p => {
                if (!p.nom || !visibles.has(p.nom)) return;
                let fiche = parNom.get(p.nom);
                if (!fiche) {
                    fiche = {
                        nom: p.nom, type: p.type || '', naf: p.naf || '',
                        operations: 0, labos: new Set(), annees: new Set(), url: p.url || '',
                    };
                    parNom.set(p.nom, fiche);
                }
                fiche.operations++;
                (rec.labos || []).forEach(l => fiche.labos.add(l));
                if (rec.annee) fiche.annees.add(rec.annee);
                /* Type et activité peuvent manquer sur une occurrence et être
                   renseignés sur une autre : on retient la première trouvée. */
                if (!fiche.type && p.type) fiche.type = p.type;
                if (!fiche.naf && p.naf)   fiche.naf = p.naf;
            });
        });

        return [...parNom.values()].map(f => {
            const annees = [...f.annees].sort();
            return {
                ...f,
                nbLabos: f.labos.size,
                labosTexte: [...f.labos].sort((a, b) => a.localeCompare(b, 'fr')).join(', '),
                periode: annees.length
                    ? (annees[0] === annees[annees.length - 1]
                        ? annees[0] : `${annees[0]}–${annees[annees.length - 1]}`)
                    : '—',
                debutTri: annees[0] || '',
            };
        });
    }

    rendre(rows) {
        const etat = this.o.etat();
        this.hote.innerHTML = '';

        let fiches = this._synthese(rows, etat);
        const total = fiches.length;

        if (this.recherche.trim()) {
            const q = this.recherche.normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
            fiches = fiches.filter(f =>
                `${f.nom} ${f.type} ${f.naf}`.normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(q));
        }

        const colonnes = [
            { cle: 'nom',        titre: 'Partenaire' },
            { cle: 'type',       titre: 'Type' },
            { cle: 'naf',        titre: 'Activité' },
            { cle: 'operations', titre: 'Opérations', nombre: true },
            { cle: 'nbLabos',    titre: 'Laboratoires', nombre: true },
            { cle: 'periode',    titre: 'Période' },
        ];

        /* Barre d'outils */
        const outils = document.createElement('div');
        outils.className = 'partenaires-outils';
        const rech = document.createElement('input');
        rech.type = 'search';
        rech.placeholder = 'Rechercher un partenaire…';
        rech.value = this.recherche;
        rech.addEventListener('input', () => {
            this.recherche = rech.value;
            this.limite = PAS;
            this.rendre(rows);
            this.hote.querySelector('input[type=search]')?.focus();
        });
        const compte = document.createElement('span');
        compte.className = 'note';
        compte.textContent = this.recherche.trim()
            ? `${fiches.length} sur ${total} partenaires`
            : `${total} partenaires dans la sélection`;
        outils.append(rech, compte);
        this.hote.appendChild(outils);

        if (!fiches.length) {
            const vide = document.createElement('p');
            vide.className = 'note';
            vide.textContent = 'Aucun partenaire ne correspond.';
            this.hote.appendChild(vide);
            return;
        }

        const sens = this.tri.ascendant ? 1 : -1;
        const col = this.tri.colonne;
        fiches.sort((a, b) => {
            if (col === 'operations' || col === 'nbLabos') {
                return sens * (a[col] - b[col]) || a.nom.localeCompare(b.nom, 'fr');
            }
            if (col === 'periode') return sens * String(a.debutTri).localeCompare(String(b.debutTri));
            return sens * String(a[col]).localeCompare(String(b[col]), 'fr');
        });

        const table = document.createElement('table');
        table.className = 'tableau';
        const trh = table.createTHead().insertRow();
        colonnes.forEach(c => {
            const th = document.createElement('th');
            th.textContent = c.titre;
            th.className = 'triable' + (c.nombre ? ' colonne-nombre' : '');
            if (this.tri.colonne === c.cle) {
                th.classList.add(this.tri.ascendant ? 'tri-asc' : 'tri-desc');
            }
            th.addEventListener('click', () => {
                if (this.tri.colonne === c.cle) this.tri.ascendant = !this.tri.ascendant;
                else this.tri = { colonne: c.cle, ascendant: c.nombre ? false : true };
                this.rendre(rows);
            });
            trh.appendChild(th);
        });

        const tbody = table.createTBody();
        fiches.slice(0, this.limite).forEach(f => {
            const tr = tbody.insertRow();
            tr.className = 'tableau-ligne';
            const choisi = (etat.facettes.partenaire || new Set()).has(f.nom);
            if (choisi) tr.classList.add('ligne-choisie');

            colonnes.forEach(c => {
                const td = tr.insertCell();
                const v = f[c.cle];
                td.textContent = v === '' ? '—' : v;
                if (c.nombre) td.className = 'colonne-nombre';
                if (c.cle === 'nbLabos' && f.labosTexte) td.title = f.labosTexte;
            });

            tr.title = choisi
                ? 'Retirer ce partenaire du filtre'
                : 'Filtrer sur ce partenaire';
            tr.addEventListener('click', () => this.o.onFiltrer('partenaire', f.nom));
            this.o.onMenu?.(tr, 'partenaire', f.nom);
        });

        this.hote.appendChild(table);

        if (fiches.length > this.limite) {
            const plus = document.createElement('button');
            plus.type = 'button';
            plus.className = 'lien';
            plus.textContent = `Afficher ${Math.min(PAS, fiches.length - this.limite)} partenaires `
                             + `de plus (${this.limite} sur ${fiches.length})`;
            plus.addEventListener('click', () => { this.limite += PAS; this.rendre(rows); });
            this.hote.appendChild(plus);
        }

        this._fiches = fiches;
    }

    csv() {
        const lignes = [['Partenaire', 'Type', 'Activité', 'Opérations',
                         'Laboratoires', 'Période'].map(t => `"${t}"`).join(';')];
        (this._fiches || []).forEach(f => {
            lignes.push([f.nom, f.type, f.naf, f.operations, f.labosTexte, f.periode]
                .map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'));
        });
        return lignes.join('\r\n');
    }
}
