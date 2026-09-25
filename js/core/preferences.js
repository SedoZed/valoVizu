/**
 * core/preferences.js
 * Préférences d'affichage, persistées dans le navigateur.
 *
 * Elles ne portent que sur la présentation. Aucune ne modifie un comptage :
 * afficher une durée en jours plutôt qu'en tranches change la lecture, jamais
 * le nombre d'opérations retenues. Cette séparation évite qu'un réglage d'aspect
 * fasse bouger les chiffres à l'insu de celui qui le manipule.
 */

const CLE = 'valo_preferences';

export const DEFAUTS = {
    /* Thème : « systeme » suit le réglage du système d'exploitation, ce qui
       est le comportement attendu par défaut ; les deux autres l'emportent. */
    theme: 'systeme',            // 'systeme' | 'clair' | 'sombre'
    /* Les figures emploient une couleur par valeur, stable d'un panneau à
       l'autre. Le mode sobre s'en tient à une encre unique, préférable pour
       une impression en noir et blanc. */
    couleurs: true,
    /* Durée d'une opération : tranches lisibles, ou valeur exacte quand on
       travaille sur des chiffres précis. */
    dureeAffichage: 'tranches',   // 'tranches' | 'mois' | 'jours'
    /* Nombre de lignes ajoutées à chaque « afficher plus ». */
    pasTableau: 60,
    /* Panneaux repliés, par tableau de bord et par panneau. Le repli relève
       du confort de lecture : le refaire à chaque ouverture est une corvée
       d'autant plus sensible que le tableau de bord est long. */
    replies: {},
    /* Panneaux dépliés. Distinct du précédent : les figures sont ouvertes par
       défaut et l'on mémorise celles qu'on referme, tandis que le contrôle des
       données et l'atelier sont fermés par défaut et l'on mémorise ceux qu'on
       ouvre. Un seul registre confondrait les deux et inverserait l'état
       initial de la moitié des panneaux. */
    deplies: {},
    /* Liens vers d'autres outils, réglés par l'utilisateur. Les inscrire dans
       le code exposerait des adresses internes et imposerait de le modifier
       pour en ajouter un. */
    outils: [],
};

export const preferences = { ...DEFAUTS };

export function chargerPreferences() {
    try {
        const stocke = JSON.parse(localStorage.getItem(CLE) || '{}');
        Object.keys(DEFAUTS).forEach(k => {
            if (stocke[k] !== undefined) preferences[k] = stocke[k];
        });
    } catch { /* préférences illisibles : les valeurs par défaut suffisent */ }
    return preferences;
}

export function enregistrerPreferences(patch) {
    Object.assign(preferences, patch);
    localStorage.setItem(CLE, JSON.stringify(preferences));
}

export function reinitialiserPreferences() {
    Object.assign(preferences, DEFAUTS);
    localStorage.removeItem(CLE);
}

/* ─────────────────────────────────────────────────────────────────────────
   Durées
───────────────────────────────────────────────────────────────────────── */

/** Formulation d'une durée selon la préférence retenue. */
export function afficherDuree(rec) {
    if (rec.dureeJours === null || rec.dureeJours === undefined) {
        return rec.duree || 'Durée non renseignée';
    }
    switch (preferences.dureeAffichage) {
        case 'jours':
            return `${rec.dureeJours} j`;
        case 'mois': {
            const m = rec.dureeMois;
            return m < 1 ? `${rec.dureeJours} j` : `${m} mois`;
        }
        default:
            return rec.duree;
    }
}

/**
 * Détail complet d'une durée, pour l'infobulle : les dates saisies, le calcul
 * et son résultat exact. Une tranche seule ne dit pas d'où elle vient ;
 * la survoler doit permettre de le vérifier sans ouvrir la fiche.
 */
export function detaillerDuree(rec) {
    if (!rec.debut && !rec.fin) {
        return 'Aucune date de début ni de fin renseignée dans la base.';
    }
    if (!rec.debut || !rec.fin) {
        const connue = rec.debut ? `début le ${jolieDate(rec.debut)}`
                                 : `fin le ${jolieDate(rec.fin)}`;
        return `Seule la date de ${rec.debut ? 'début' : 'fin'} est renseignée `
             + `(${connue}) : la durée ne peut pas être calculée.`;
    }
    if (rec.dureeJours === null || rec.dureeJours === undefined) {
        return `Dates incohérentes : la fin (${jolieDate(rec.fin)}) précède `
             + `le début (${jolieDate(rec.debut)}). Aucune durée n’est calculée.`;
    }
    const ans = Math.floor(rec.dureeJours / 365);
    const reste = rec.dureeJours % 365;
    const moisEntiers = Math.floor(reste / 30.44);
    const jours = Math.round(reste - moisEntiers * 30.44);
    const detail = [
        ans ? `${ans} an${ans > 1 ? 's' : ''}` : null,
        moisEntiers ? `${moisEntiers} mois` : null,
        jours ? `${jours} jour${jours > 1 ? 's' : ''}` : null,
    ].filter(Boolean).join(' ') || 'moins d’un jour';

    return `Du ${jolieDate(rec.debut)} au ${jolieDate(rec.fin)}\n`
         + `Soit ${rec.dureeJours} jours — ${detail}\n`
         + `Équivalent : ${rec.dureeMois} mois\n`
         + `Tranche : ${rec.duree}`;
}

export function jolieDate(iso) {
    if (!iso) return '—';
    const [a, m, j] = String(iso).split('-');
    return `${j}/${m}/${a}`;
}


/* ─────────────────────────────────────────────────────────────────────────
   Thème
───────────────────────────────────────────────────────────────────────── */

/** Thème effectivement appliqué, une fois « systeme » résolu. */
export function themeEffectif() {
    if (preferences.theme !== 'systeme') return preferences.theme;
    const sombre = typeof matchMedia === 'function'
        && matchMedia('(prefers-color-scheme: dark)').matches;
    return sombre ? 'sombre' : 'clair';
}

/** Pose le thème sur le document. */
export function appliquerTheme() {
    const theme = themeEffectif();
    document.documentElement.setAttribute('data-theme', theme);
    return theme;
}

/**
 * Suit les changements du réglage système, mais seulement tant que
 * l'utilisateur n'a pas choisi explicitement : un choix manuel ne doit pas
 * être écrasé parce que la nuit tombe.
 */
export function suivreThemeSysteme(auChangement) {
    if (typeof matchMedia !== 'function') return;
    const requete = matchMedia('(prefers-color-scheme: dark)');
    const reagir = () => {
        if (preferences.theme !== 'systeme') return;
        appliquerTheme();
        auChangement?.();
    };
    if (requete.addEventListener) requete.addEventListener('change', reagir);
    else if (requete.addListener) requete.addListener(reagir);
}


/* ─────────────────────────────────────────────────────────────────────────
   Repli des panneaux
───────────────────────────────────────────────────────────────────────── */

export function estReplie(source, panneau) {
    return !!preferences.replies?.[`${source}.${panneau}`];
}

export function basculerRepli(source, panneau) {
    const cle = `${source}.${panneau}`;
    const replies = { ...(preferences.replies || {}) };
    if (replies[cle]) delete replies[cle];
    else replies[cle] = true;
    enregistrerPreferences({ replies });
    return !!replies[cle];
}


export function estDeplie(source, panneau) {
    return !!preferences.deplies?.[`${source}.${panneau}`];
}

export function basculerDepliement(source, panneau) {
    const cle = `${source}.${panneau}`;
    const deplies = { ...(preferences.deplies || {}) };
    if (deplies[cle]) delete deplies[cle];
    else deplies[cle] = true;
    enregistrerPreferences({ deplies });
    return !!deplies[cle];
}


/* ─────────────────────────────────────────────────────────────────────────
   Facettes dépliées
───────────────────────────────────────────────────────────────────────── */

export function facetteDepliee(source, cle) {
    return estDeplie(source, 'facette.' + cle);
}

export function basculerFacette(source, cle) {
    return basculerDepliement(source, 'facette.' + cle);
}
