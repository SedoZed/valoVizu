/**
 * core/selection.js
 * Le moteur de sélection. C'est le point de vérité unique de l'application :
 * tout compteur, tout graphique, tout export passe par `retenus()` ou
 * `comptesFacette()`. Aucun panneau ne refait ce travail dans son coin.
 *
 * Ordre d'application, qui n'est pas arbitraire :
 *   1. valeurs masquées   — déclarées hors périmètre, elles ne doivent
 *                           apparaître nulle part, pas même dans les compteurs
 *   2. facettes           — OU à l'intérieur d'une facette, ET entre facettes
 *   3. recherche libre    — tous les mots doivent être présents
 *
 * `exceptCle` permet d'évaluer la sélection en ignorant une facette précise.
 * C'est indispensable pour les compteurs : à côté de chaque valeur d'une
 * facette on affiche ce qu'elle rapporterait si on la cochait, ce qui n'a
 * de sens qu'en ignorant les cases déjà cochées de cette même facette.
 */
import { CHAMPS, champ, estAbsence } from './champs.js';

/** Pliage : minuscules, accents retirés. Sert aux comparaisons de texte. */
export function plier(texte) {
    return String(texte ?? '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim();
}

/**
 * État de filtrage d'un tableau de bord.
 * `masquees` porte sur les valeurs, pas sur les enregistrements : masquer un
 * partenaire dans une opération qui en compte trois n'écarte pas l'opération,
 * il retire ce partenaire des comptages. L'opération existe toujours.
 */
export function etatVide() {
    return {
        facettes: {},          // { cleChamp: Set(valeurs cochées) }
        masquees: new Set(),   // valeurs mises hors périmètre
        /* Valeurs toujours détaillées dans les figures, quel que soit leur
           effectif. Rien à voir avec un filtre : épingler « Ville de Saint-Denis »
           la fait apparaître à côté des autres barres, alors que la porter au
           filtre écarterait toutes les opérations qui ne la concernent pas —
           et la figure n'afficherait plus qu'elle. */
        epinglees: {},         // { cleChamp: Set(valeurs détachées d'« Autres ») }
        recherche: '',
    };
}

/* ─────────────────────────────────────────────────────────────────────────
   Lecture des valeurs, masquage appliqué
───────────────────────────────────────────────────────────────────────── */

/**
 * Valeurs d'un enregistrement pour un champ, valeurs masquées retirées.
 *
 * Pour un champ dérivé d'une entité liée — le type ou l'activité d'un
 * partenaire —, le masquage s'applique d'abord à l'entité : écarter
 * « Université Paris 8 » retire ce partenaire, donc aussi sa contribution au
 * décompte des types. Filtrer seulement le résultat laisserait la catégorie
 * « Université » gonflée par un partenaire mis hors périmètre.
 */
export function valeursVisibles(rec, source, cle, etat) {
    const c = champ(source, cle);
    if (!c) return [];

    if (c.entite) {
        const entrees = rec[c.entite] || [];
        const gardees = etat.masquees.size
            ? entrees.filter(e => !etat.masquees.has(c.identite(e)))
            : entrees;
        let vals = gardees.map(c.extrait).map(v => String(v ?? '').trim()).filter(Boolean);
        if (etat.masquees.size) vals = vals.filter(v => !etat.masquees.has(v));
        /* Toutes les entités écartées : l'enregistrement n'a plus rien à dire
           sur ce champ. Il n'affiche donc pas « non renseigné », qui
           signifierait à tort que l'information manque en base. */
        if (!vals.length) return entrees.length && !gardees.length ? [] : [c.absent];
        return vals;
    }

    const brutes = c.valeurs(rec);
    if (!etat.masquees.size) return brutes;
    return brutes.filter(v => !etat.masquees.has(v));
}

/** Index de recherche : toutes les valeurs textuelles d'un enregistrement. */
function indexRecherche(rec, source) {
    if (rec._index) return rec._index;
    const morceaux = [];
    CHAMPS[source].forEach(c => c.valeurs(rec).forEach(v => morceaux.push(v)));
    if (rec.nomComplet) morceaux.push(rec.nomComplet);
    if (rec.titre)      morceaux.push(rec.titre);
    /* Espaces en bordure : permettent de chercher un mot entier. */
    rec._index = ' ' + plier(morceaux.join(' ')) + ' ';
    return rec._index;
}

/* ─────────────────────────────────────────────────────────────────────────
   Le test central
───────────────────────────────────────────────────────────────────────── */

/**
 * Cet enregistrement fait-il partie de la sélection ?
 * @param exceptCle  facette à ignorer (pour les compteurs contextuels)
 */
export function retenuSauf(rec, source, etat, exceptCle = null) {
    /* 1. Facettes */
    for (const [cle, choix] of Object.entries(etat.facettes)) {
        if (cle === exceptCle || !choix || !choix.size) continue;
        const vals = valeursVisibles(rec, source, cle, etat);
        if (!vals.some(v => choix.has(v))) return false;
    }

    /* 2. Recherche libre — tous les mots, pas forcément contigus.
          « paris universite » trouve « Université de Paris 8 ». */
    const requete = plier(etat.recherche);
    if (requete) {
        const index = indexRecherche(rec, source);
        for (const mot of requete.split(/\s+/).filter(Boolean)) {
            if (!index.includes(mot)) return false;
        }
    }

    return true;
}

/** Les enregistrements de la sélection courante. */
export function retenus(records, source, etat) {
    return records.filter(r => retenuSauf(r, source, etat, null));
}

/* ─────────────────────────────────────────────────────────────────────────
   Compteurs
───────────────────────────────────────────────────────────────────────── */

/**
 * Compteurs d'une facette : { valeur: effectif }.
 * Calculés en ignorant la sélection de cette facette, pour que l'utilisateur
 * voie toujours ce qu'ajouterait une case supplémentaire.
 * Les valeurs cochées mais retombées à zéro restent présentes : sans quoi
 * elles disparaîtraient de la liste et deviendraient impossibles à décocher.
 */
export function comptesFacette(records, source, etat, cle) {
    const c = champ(source, cle);
    if (!c) return {};
    const comptes = {};
    records.forEach(rec => {
        if (!retenuSauf(rec, source, etat, cle)) return;
        valeursVisibles(rec, source, cle, etat)
            .forEach(v => { comptes[v] = (comptes[v] || 0) + 1; });
    });
    (etat.facettes[cle] || new Set()).forEach(v => {
        if (!(v in comptes)) comptes[v] = 0;
    });
    return comptes;
}

/**
 * Effectifs par valeur d'un champ sur une liste déjà filtrée.
 * Utilisé par les graphiques. Un enregistrement portant plusieurs valeurs
 * compte dans chacune : la somme des effectifs peut donc dépasser le nombre
 * d'enregistrements, et c'est signalé à l'affichage.
 */
export function effectifs(rows, source, cle, etat) {
    const comptes = {};
    rows.forEach(rec => {
        valeursVisibles(rec, source, cle, etat)
            .forEach(v => { comptes[v] = (comptes[v] || 0) + 1; });
    });
    return comptes;
}

/** Croisement de deux champs : Map "a\u0000b" → { a, b, valeur, records }. */
export function croisement(rows, source, cleA, cleB, etat) {
    const cellules = new Map();
    rows.forEach(rec => {
        const va = valeursVisibles(rec, source, cleA, etat);
        const vb = valeursVisibles(rec, source, cleB, etat);
        va.forEach(a => vb.forEach(b => {
            const k = a + '\u0000' + b;
            let cell = cellules.get(k);
            if (!cell) { cell = { a, b, valeur: 0, records: [] }; cellules.set(k, cell); }
            cell.valeur++; cell.records.push(rec);
        }));
    });
    return cellules;
}

/** Valeurs distinctes d'un champ sur l'ensemble des enregistrements. */
export function valeursDistinctes(records, source, cle) {
    const c = champ(source, cle);
    if (!c) return [];
    const set = new Set();
    records.forEach(r => c.valeurs(r).forEach(v => set.add(v)));
    return [...set].sort((a, b) => {
        const aAbs = estAbsence(a), bAbs = estAbsence(b);
        if (aAbs !== bAbs) return aAbs ? 1 : -1;   // absences en fin de liste
        return String(a).localeCompare(String(b), 'fr');
    });
}

/** Nombre de filtres actifs, pour l'affichage du bouton de réinitialisation. */
export function nombreFiltres(etat) {
    let n = Object.values(etat.facettes).reduce((s, c) => s + (c?.size || 0), 0);
    if (etat.recherche.trim()) n++;
    return n;
}
