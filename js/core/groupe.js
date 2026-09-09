import { estAbsence } from './champs.js';

/**
 * core/groupe.js
 * Regroupement des valeurs au-delà des n premières.
 *
 * Afficher toutes les valeurs sature la figure ; les supprimer fausse la
 * donnée. On regroupe donc, on ne retire jamais : la somme des barres
 * affichées égale exactement l'effectif de la sélection, quel que soit le
 * niveau de détail retenu.
 *
 * Le regroupement « Autres » est signalé comme tel — gris, en italique, en
 * fin de liste pour qu'on ne lise pas sa position comme un rang — et il
 * s'ouvre sur la liste de ce qu'il contient.
 */

export const LIBELLE_AUTRES = 'Autres';

/**
 * @param comptes  { valeur: effectif }
 * @param options  { nb, tri, ordre, epinglees }
 *    nb         nombre de valeurs détaillées avant regroupement (0 = tout garder)
 *    tri        'effectif' (défaut) | 'libelle' | 'ordre'
 *    ordre      ordre imposé si tri === 'ordre' (années par exemple)
 *    epinglees  Set de valeurs à détailler quel que soit leur rang
 * @returns { lignes: [{ valeur, effectif, autres? , membres? }], total, regroupees }
 */
export function regrouper(comptes, options = {}) {
    const { nb = 0, tri = 'effectif', ordre = null, epinglees = null } = options;

    let lignes = Object.entries(comptes)
        .map(([valeur, effectif]) => ({ valeur, effectif }));

    const total = lignes.reduce((s, l) => s + l.effectif, 0);

    if (tri === 'ordre' && ordre) {
        const rang = new Map(ordre.map((v, i) => [v, i]));
        lignes.sort((a, b) => (rang.get(a.valeur) ?? 1e9) - (rang.get(b.valeur) ?? 1e9));
    } else if (tri === 'libelle') {
        lignes.sort((a, b) => String(a.valeur).localeCompare(String(b.valeur), 'fr'));
    } else {
        /* Les absences sont rejetées en fin de classement, quel que soit leur
           effectif. « Laboratoire non renseigné » n'est pas un laboratoire :
           le laisser en tête ferait lire une lacune de saisie comme la
           première catégorie du corpus. */
        lignes.sort((a, b) => {
            const aa = estAbsence(a.valeur), ab = estAbsence(b.valeur);
            if (aa !== ab) return aa ? 1 : -1;
            return b.effectif - a.effectif
                || String(a.valeur).localeCompare(String(b.valeur), 'fr');
        });
    }

    if (!nb || lignes.length <= nb) {
        return { lignes, total, regroupees: 0 };
    }

    /* Le regroupement n'a de sens que sur un tri par effectif : sur un axe
       ordonné (les années), retirer « les suivantes » n'aurait aucun sens. */
    if (tri !== 'effectif') {
        return { lignes, total, regroupees: 0 };
    }

    /* Une valeur épinglée reste détaillée même si son effectif la placerait
       dans le regroupement : c'est le geste par lequel on sort une valeur
       d'« Autres » pour la comparer aux autres barres. */
    /* Une absence est conservée détaillée : la fondre dans « Autres »
       mêlerait une lacune de saisie à des valeurs de faible effectif, deux
       choses de nature différente. */
    const estEpinglee = l => epinglees?.has(l.valeur) || estAbsence(l.valeur);
    const gardees = [
        ...lignes.slice(0, nb),
        ...lignes.slice(nb).filter(estEpinglee),
    ];
    const reste   = lignes.slice(nb).filter(l => !estEpinglee(l));
    const cumul   = reste.reduce((s, l) => s + l.effectif, 0);

    /* Tout a été épinglé : il n'y a plus de regroupement à afficher. */
    if (!reste.length) return { lignes: gardees, total, regroupees: 0 };

    gardees.push({
        valeur: LIBELLE_AUTRES,
        effectif: cumul,
        autres: true,
        membres: reste,          // consultable : le contenu du regroupement
    });

    return { lignes: gardees, total, regroupees: reste.length };
}

/**
 * Note explicative accompagnant un regroupement, à afficher sous la figure.
 * Rien ne doit être écarté sans que le lecteur puisse le savoir.
 */
export function noteRegroupement(resultat, unite) {
    if (!resultat.regroupees) return '';
    return `${resultat.regroupees} valeurs de faible effectif sont regroupées sous « ${LIBELLE_AUTRES} ». `
         + `Elles restent comptées : le total affiché reste ${resultat.total} ${unite}.`;
}
