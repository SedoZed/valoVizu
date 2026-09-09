/**
 * panels/tableau.js
 * Le tableau des enregistrements retenus.
 *
 * C'est la vue de contrôle : elle permet de vérifier à l'œil que les chiffres
 * des autres panneaux portent bien sur ce qu'on croit. Elle donne donc la
 * donnée telle quelle, sans agrégation, avec un export CSV de la sélection.
 */
import { UNITE } from '../core/champs.js';
import { valeursVisibles } from '../core/selection.js';
import { libelleDe } from '../core/reglages.js';
import { preferences, afficherDuree, detaillerDuree } from '../core/preferences.js';

const COLONNES = {
    ec: [
        { cle: 'nomComplet', titre: 'Nom',            largeur: '22%' },
        { cle: 'statut',     titre: 'Statut',         largeur: '12%', champ: 'statut' },
        { cle: 'labo',       titre: 'Laboratoire',    largeur: '22%', champ: 'labo' },
        { cle: 'domaines',   titre: 'Domaine HCERES', largeur: '22%', champ: 'domaine' },
        { cle: 'cnu',        titre: 'Section CNU',    largeur: '22%', champ: 'cnu' },
    ],
    ope: [
        { cle: 'titre',       titre: 'Opération',    largeur: '20%' },
        { cle: 'typeContrat', titre: 'Type de contrat', largeur: '14%', champ: 'contrat' },
        { cle: 'annee',       titre: 'Année',        largeur: '7%',  champ: 'annee' },
        { cle: 'duree',       titre: 'Durée',        largeur: '12%', champ: 'duree' },
        { cle: 'partenaires', titre: 'Partenaires',  largeur: '27%', champ: 'partenaire' },
        { cle: 'type',        titre: 'Type',         largeur: '15%', champ: 'type' },
        { cle: 'labos',       titre: 'Laboratoires', largeur: '15%', champ: 'labo' },
    ],
};

/* Pas de pagination : voir les préférences. */
const pas = () => preferences.pasTableau || 60;

export class Tableau {
    constructor(hote, options) {
        this.hote = hote;
        this.o = options;
        this.limite = pas();
        this.tri = null;       // { colonne, ascendant }
        this.ouverte = null;   // identifiant de la ligne dépliée
    }

    /** Contenu d'une cellule, sous forme de tableau de libellés. */
    _cellule(rec, col, source, etat, reglages) {
        /* La durée suit la préférence d'affichage plutôt que la valeur
           stockée : la tranche sert au filtrage, la précision à la lecture. */
        if (col.cle === 'duree') return [afficherDuree(rec)];
        if (col.champ) {
            return valeursVisibles(rec, source, col.champ, etat)
                .map(v => libelleDe(reglages, col.champ, v));
        }
        const brut = rec[col.cle];
        return Array.isArray(brut) ? brut : [brut ?? ''];
    }

    rendre(rows) {
        const source   = this.o.source();
        const etat     = this.o.etat();
        const reglages = this.o.reglages();
        const cols     = COLONNES[source];
        const u        = UNITE[source];

        this.hote.innerHTML = '';

        const compteur = this.o.elCompteur;
        if (compteur) {
            compteur.textContent = `${rows.length} ${rows.length > 1 ? u.pluriel : u.singulier}`;
        }

        if (!rows.length) {
            const vide = document.createElement('p');
            vide.className = 'note';
            vide.textContent = 'Aucun enregistrement ne correspond aux filtres actifs.';
            this.hote.appendChild(vide);
            return;
        }

        /* Tri */
        let lignes = rows.slice();
        if (this.tri) {
            const col = cols.find(c => c.cle === this.tri.colonne);
            if (col) {
                const sens = this.tri.ascendant ? 1 : -1;
                lignes.sort((a, b) => sens * String(this._cellule(a, col, source, etat, reglages).join(', '))
                    .localeCompare(String(this._cellule(b, col, source, etat, reglages).join(', ')), 'fr',
                        { numeric: col.champ === 'annee' }));
            }
        }

        const table = document.createElement('table');
        table.className = 'tableau';

        const thead = table.createTHead();
        const trh = thead.insertRow();
        cols.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col.titre;
            th.style.width = col.largeur;
            th.classList.add('triable');
            if (this.tri?.colonne === col.cle) {
                th.classList.add(this.tri.ascendant ? 'tri-asc' : 'tri-desc');
            }
            th.addEventListener('click', () => {
                if (this.tri?.colonne === col.cle) this.tri.ascendant = !this.tri.ascendant;
                else this.tri = { colonne: col.cle, ascendant: true };
                this.rendre(rows);
            });
            trh.appendChild(th);
        });

        const tbody = table.createTBody();
        lignes.slice(0, this.limite).forEach(rec => {
            const tr = tbody.insertRow();
            tr.className = 'tableau-ligne';
            cols.forEach(col => {
                const td = tr.insertCell();
                const vals = this._cellule(rec, col, source, etat, reglages);
                /* Aucune valeur visible alors que le champ en porte : toutes
                   ont été masquées. Le signaler évite de lire une cellule
                   vide comme une donnée manquante en base. */
                td.textContent = vals.length ? vals.join(' · ') : '⊘';
                if (!vals.length) {
                    td.classList.add('cellule-masquee');
                    td.title = 'Toutes les valeurs de ce champ sont masquées.';
                }
                /* Sur la durée, l'infobulle donne les dates et le calcul :
                   une tranche seule ne dit pas d'où elle vient. */
                if (vals.length) {
                    td.title = col.cle === 'duree' ? detaillerDuree(rec) : vals.join('\n');
                }
                if (col.cle === 'duree') td.classList.add('cellule-duree');
                /* Une cellule à valeur unique porte le menu : au-delà, on ne
                   saurait pas laquelle des valeurs l'action vise. */
                if (col.champ && vals.length === 1 && this.o.onMenu) {
                    this.o.onMenu(td, col.champ, vals[0]);
                    td.classList.add('cellule-actionnable');
                }
            });
            tr.addEventListener('click', () => this._basculerDetail(rec, tr, tbody));
        });

        this.hote.appendChild(table);

        if (lignes.length > this.limite) {
            const plus = document.createElement('button');
            plus.type = 'button';
            plus.className = 'lien';
            plus.textContent = `Afficher ${Math.min(pas(), lignes.length - this.limite)} lignes de plus `
                             + `(${this.limite} sur ${lignes.length})`;
            plus.addEventListener('click', () => { this.limite += pas(); this.rendre(rows); });
            this.hote.appendChild(plus);
        }
    }

    /** Détail d'une ligne : les champs qui ne tiennent pas dans le tableau. */
    _basculerDetail(rec, tr, tbody) {
        const suivante = tr.nextElementSibling;
        if (suivante?.classList.contains('tableau-detail')) { suivante.remove(); return; }
        tbody.querySelectorAll('.tableau-detail').forEach(e => e.remove());

        const source = this.o.source();
        const ligne = tbody.insertRow(tr.rowIndex);
        ligne.className = 'tableau-detail';
        const cell = ligne.insertCell();
        /* Le nombre de colonnes diffère d'un tableau de bord à l'autre :
           une valeur fixe déborde ou laisse un blanc. */
        cell.colSpan = COLONNES[source].length;

        const paires = source === 'ec'
            ? [['Mots-clés', (rec.motscles || []).join(', ')],
               ['Prénom / nom', `${rec.prenom} ${rec.nom}`.trim()]]
            : [['EC impliqués', (rec.ecs || []).join(', ')],
               ['Période', rec.debut || rec.fin
                    ? `${rec.debut || '?'} → ${rec.fin || '?'}`
                      + (rec.dureeMois != null ? ` (${rec.dureeMois} mois)` : '')
                    : ''],
               ['Année déduite de', rec.anneeOrigine || ''],
               ['Codes NAF', (rec.partenaires || []).map(p => p.naf).filter(Boolean).join(', ')]];

        paires.forEach(([titre, texte]) => {
            if (!texte) return;
            const p = document.createElement('p');
            const fort = document.createElement('b');
            fort.textContent = `${titre} : `;
            p.append(fort, document.createTextNode(texte));
            cell.appendChild(p);
        });
        if (rec.url) {
            const a = document.createElement('a');
            a.href = rec.url; a.target = '_blank'; a.rel = 'noopener';
            a.className = 'lien';
            a.textContent = 'Ouvrir la fiche dans Omeka S';
            cell.appendChild(a);
        }
        if (!cell.childNodes.length) cell.textContent = 'Aucune information complémentaire.';
    }

    /** Export CSV de la sélection, séparateur point-virgule (Excel français). */
    csv(rows) {
        const source   = this.o.source();
        const etat     = this.o.etat();
        const reglages = this.o.reglages();
        const cols     = COLONNES[source];
        const echapper = v => `"${String(v).replace(/"/g, '""')}"`;

        const lignes = [cols.map(c => echapper(c.titre)).join(';')];
        rows.forEach(rec => {
            lignes.push(cols
                .map(col => echapper(this._cellule(rec, col, source, etat, reglages).join(' | ')))
                .join(';'));
        });
        return lignes.join('\r\n');
    }
}
