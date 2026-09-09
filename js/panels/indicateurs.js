/**
 * panels/indicateurs.js
 * Bandeau de chiffres-clés en tête de tableau de bord.
 *
 * Chaque indicateur porte une explication au survol quand son calcul mérite
 * une précision — notamment les effectifs multi-valués, où la somme dépasse
 * le nombre d'enregistrements sans que ce soit une erreur.
 */
import { UNITE } from '../core/champs.js';
import { valeursVisibles } from '../core/selection.js';

function distinctes(rows, source, cle, etat) {
    const set = new Set();
    rows.forEach(r => valeursVisibles(r, source, cle, etat).forEach(v => set.add(v)));
    return set;
}

function indicateursEc(rows, etat) {
    return [
        { valeur: rows.length, libelle: UNITE.ec.pluriel },
        { valeur: distinctes(rows, 'ec', 'labo', etat).size,    libelle: 'laboratoires' },
        { valeur: distinctes(rows, 'ec', 'domaine', etat).size, libelle: 'domaines HCERES' },
        { valeur: distinctes(rows, 'ec', 'cnu', etat).size,     libelle: 'sections CNU' },
        { valeur: distinctes(rows, 'ec', 'motcle', etat).size,  libelle: 'mots-clés distincts',
          aide: 'Un enseignant-chercheur peut porter plusieurs mots-clés.' },
    ];
}

function indicateursOpe(rows, etat) {
    const annees = rows.map(r => r.annee).filter(Boolean).map(Number).filter(n => !isNaN(n));
    const periode = annees.length
        ? (Math.min(...annees) === Math.max(...annees)
            ? String(Math.min(...annees))
            : `${Math.min(...annees)}–${Math.max(...annees)}`)
        : '—';

    return [
        { valeur: rows.length, libelle: UNITE.ope.pluriel },
        { valeur: distinctes(rows, 'ope', 'partenaire', etat).size, libelle: 'partenaires distincts',
          aide: 'Une opération peut associer plusieurs partenaires.' },
        { valeur: distinctes(rows, 'ope', 'contrat', etat).size, libelle: 'types de contrat' },
        { valeur: distinctes(rows, 'ope', 'labo', etat).size, libelle: 'laboratoires impliqués' },
        { valeur: periode, libelle: 'période couverte' },
    ];
}

export function rendreIndicateurs(hote, rows, source, etat) {
    const items = source === 'ec' ? indicateursEc(rows, etat) : indicateursOpe(rows, etat);
    hote.innerHTML = '';
    items.forEach(it => {
        const bloc = document.createElement('div');
        bloc.className = 'indicateur';
        if (it.aide) bloc.title = it.aide;
        const v = document.createElement('span');
        v.className = 'indicateur-valeur';
        v.textContent = it.valeur;
        const l = document.createElement('span');
        l.className = 'indicateur-libelle';
        l.textContent = it.libelle;
        bloc.append(v, l);
        hote.appendChild(bloc);
    });
}
