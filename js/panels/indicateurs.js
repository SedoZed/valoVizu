/**
 * panels/indicateurs.js
 * Bandeau de chiffres-clés en tête de tableau de bord.
 *
 * Chaque indicateur porte une explication au survol quand son calcul mérite
 * une précision — notamment les effectifs multi-valués, où la somme dépasse
 * le nombre d'enregistrements sans que ce soit une erreur.
 */
import { UNITE } from '../core/champs.js';
import { formaterMontant } from '../core/omeka.js';
import { concentration } from '../ui/montants.js';
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
        { valeur: distinctes(rows, 'ec', 'motcle', etat).size,  libelle: 'thèmes de recherche',
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
        /* Les montants ne sont pas des effectifs : on les additionne. Le taux
           de renseignement accompagne la somme, sans quoi elle paraîtrait
           autoritaire alors qu'elle ne couvre parfois qu'une fraction des
           opérations. */
        ...cartesMontant(rows),
    ];
}

/**
 * Cartes financières.
 *
 * La somme porte sur les opérations de la sélection, chacune comptée une
 * fois : c'est le seul endroit où le total est exact, puisqu'on n'y répartit
 * rien entre laboratoires ni partenaires. Les figures, elles, comptent une
 * opération pour chacun de ses laboratoires — leur somme dépasse donc ce
 * total, et c'est pourquoi celui-ci doit rester visible.
 */
function cartesMontant(rows) {
    const budgets = rows.map(r => r.budget).filter(v => typeof v === 'number');
    const globaux = rows.map(r => r.montant).filter(v => typeof v === 'number');
    if (!budgets.length && !globaux.length) return [];

    const somme = liste => liste.reduce((s, v) => s + v, 0);
    const cartes = [];

    if (budgets.length) {
        const part = Math.round((budgets.length / Math.max(rows.length, 1)) * 100);
        cartes.push({
            valeur: formaterMontant(somme(budgets)),
            libelle: 'budget cumulé',
            aide: `Renseigné sur ${budgets.length} opération(s) de la sélection, `
                + `soit ${part} %. Les autres ne sont pas comptées : leur budget `
                + `est inconnu, non nul.`,
        });
    }
    if (globaux.length) {
        cartes.push({
            valeur: formaterMontant(somme(globaux)),
            libelle: 'montant global cumulé',
            aide: 'Montant total des opérations, tous partenaires confondus. '
                + 'Le budget de l’opération n’en est qu’une part.',
        });
    }
    if (budgets.length) {
        const tries = [...budgets].sort((a, b) => a - b);
        const milieu = Math.floor(tries.length / 2);
        const mediane = tries.length % 2
            ? tries[milieu] : (tries[milieu - 1] + tries[milieu]) / 2;
        cartes.push({
            valeur: formaterMontant(mediane),
            libelle: 'budget médian',
            aide: 'La médiane plutôt que la moyenne : quelques contrats très '
                + 'importants déplaceraient la seconde loin de ce qu’on observe '
                + 'ordinairement.',
        });
    }

    /* Concentration.
       Cette information a d'abord été une figure — une courbe de type Lorenz,
       avec sa diagonale d'égalité parfaite. Elle ne se lisait pas : sur
       quelques dizaines de contrats, l'écart à la diagonale ne dit rien à
       l'œil, et il fallait de toute façon en tirer une phrase. Autant ne
       garder que la phrase : une statistique se lit sur une carte, pas sur un
       axe. */
    const base = budgets.length ? budgets : globaux;
    const conc = base.length >= 10 ? concentration(base, 0.1) : null;
    if (conc) {
        cartes.push({
            valeur: `${Math.round(conc.poids * 100)} %`,
            libelle: 'portés par les 10 % les plus gros',
            aide: `Les ${conc.rang} opération(s) les plus importantes sur `
                + `${conc.nb} portent ${Math.round(conc.poids * 100)} % du total. `
                + `Au-delà de 50 %, l’activité tient à quelques contrats : leur `
                + `renouvellement pèse plus que l’ensemble des autres.`,
        });
    }
    return cartes;
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
