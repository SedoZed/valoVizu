/**
 * core/adresse.js
 * Report de l'état de sélection dans l'adresse de la page.
 *
 * L'outil compte assez de réglages — source, sept facettes, masquages,
 * détachements, recherche — pour qu'une vue intéressante soit presque
 * impossible à décrire de vive voix. Un lien la transmet telle quelle.
 *
 * Ce qui est reporté et ce qui ne l'est pas
 * ----------------------------------------
 * Seule la **sélection** l'est : ce qui détermine quels enregistrements sont
 * retenus, et ce qui a été écarté. Les réglages d'affichage — mode d'une
 * figure, sens des barres, niveau de détail, thème — restent locaux. Ils
 * relèvent du confort de celui qui regarde, non de ce qu'il montre, et les
 * embarquer allongerait l'adresse sans rien apporter à qui la reçoit.
 *
 * Les valeurs sont portées par des paramètres répétés plutôt que par une
 * liste à séparateur : un nom de laboratoire peut contenir n'importe quel
 * caractère, et tout séparateur finirait par se retrouver dans une valeur.
 */

const PREFIXE_FACETTE = 'f.';

/** Sérialise l'état d'un tableau de bord. */
export function versAdresse(source, etat) {
    const params = new URLSearchParams();
    params.set('t', source);

    Object.entries(etat.facettes || {}).forEach(([cle, choix]) => {
        [...(choix || [])].sort().forEach(v => params.append(PREFIXE_FACETTE + cle, v));
    });
    [...(etat.masquees || [])].sort().forEach(v => params.append('m', v));
    Object.entries(etat.epinglees || {}).forEach(([cle, choix]) => {
        [...(choix || [])].sort().forEach(v => params.append('e.' + cle, v));
    });
    if (etat.recherche?.trim()) params.set('q', etat.recherche.trim());

    return params.toString();
}

/**
 * Reconstruit un état depuis une adresse.
 * Les valeurs sont reprises telles quelles : les confronter au jeu de données
 * suppose de l'avoir chargé, ce qui n'est pas le cas au moment où l'adresse
 * est lue. Une valeur inconnue ne filtre alors rien et se voit dans la
 * légende, ce qui vaut mieux que de l'écarter en silence.
 */
export function depuisAdresse(chaine) {
    const params = new URLSearchParams(chaine.replace(/^#/, ''));
    if (![...params.keys()].length) return null;

    const facettes = {}, epinglees = {};
    params.forEach((valeur, cle) => {
        if (cle.startsWith(PREFIXE_FACETTE)) {
            const champ = cle.slice(PREFIXE_FACETTE.length);
            (facettes[champ] = facettes[champ] || new Set()).add(valeur);
        } else if (cle.startsWith('e.')) {
            const champ = cle.slice(2);
            (epinglees[champ] = epinglees[champ] || new Set()).add(valeur);
        }
    });

    return {
        source: params.get('t') === 'ec' ? 'ec' : 'ope',
        etat: {
            facettes,
            masquees: new Set(params.getAll('m')),
            epinglees,
            recherche: params.get('q') || '',
        },
    };
}

/**
 * Écrit l'adresse sans empiler d'entrée dans l'historique du navigateur.
 *
 * Chaque case cochée y créerait sinon une étape, et le bouton « précédent »
 * deviendrait un annulateur maladroit — remontant parfois une seule case,
 * parfois quittant la page. L'outil a son propre historique, dont il maîtrise
 * la granularité.
 */
export function ecrireAdresse(source, etat) {
    if (typeof location === 'undefined'
        || typeof history === 'undefined'
        || typeof history.replaceState !== 'function') return;
    const chaine = versAdresse(source, etat);
    const cible = `${location.pathname}${location.search}#${chaine}`;
    if (location.hash.replace(/^#/, '') === chaine) return;
    history.replaceState(null, '', cible);
}

/** Adresse complète de la vue courante, pour la copier. */
export function lienCourant(source, etat) {
    if (typeof location === 'undefined') return '#' + versAdresse(source, etat);
    return `${location.origin}${location.pathname}${location.search}#${versAdresse(source, etat)}`;
}
