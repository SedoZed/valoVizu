/**
 * core/reglages.js
 * Réglages de l'utilisateur, persistés dans le navigateur.
 *
 * Distinction structurante, reprise telle quelle : **l'identité d'une valeur
 * n'est pas son libellé**. L'identité est ce sur quoi on compte, groupe et
 * filtre ; le libellé est ce qui s'affiche. Renommer ne touche qu'au libellé.
 *
 * Confondre les deux revient à modifier les statistiques par un geste censé
 * être d'affichage : corriger un intitulé fusionnerait deux catégories.
 * Conséquence assumée : renommer « Entreprise » en « Société » alors qu'une
 * valeur « Société » existe déjà laisse deux entrées de même nom, comptées
 * séparément. Un avertissement le signale, faute de quoi on croirait à un bug.
 */

const CLE_PROFILS = 'valo_profils';

/* ─────────────────────────────────────────────────────────────────────────
   Renommages : { source: { cleChamp: { identite: libelle } } }
───────────────────────────────────────────────────────────────────────── */

export function libelleDe(reglages, cle, identite) {
    return reglages.renommages?.[cle]?.[identite] ?? identite;
}

export function renommer(reglages, cle, identite, libelle) {
    if (!reglages.renommages[cle]) reglages.renommages[cle] = {};
    const propre = String(libelle || '').trim();
    if (!propre || propre === identite) delete reglages.renommages[cle][identite];
    else reglages.renommages[cle][identite] = propre;
}

/** Libellés en collision : deux identités affichant le même texte. */
export function collisions(reglages, cle, identites) {
    const parLibelle = {};
    identites.forEach(id => {
        const l = libelleDe(reglages, cle, id);
        (parLibelle[l] = parLibelle[l] || []).push(id);
    });
    return Object.entries(parLibelle)
        .filter(([, ids]) => ids.length > 1)
        .map(([libelle, ids]) => ({ libelle, identites: ids }));
}

export function reglagesVides() {
    return { renommages: {} };
}

/* ─────────────────────────────────────────────────────────────────────────
   Profils : un état de filtrage complet, nommé et rechargeable
───────────────────────────────────────────────────────────────────────── */

export function listerProfils() {
    try { return JSON.parse(localStorage.getItem(CLE_PROFILS) || '[]'); }
    catch { return []; }
}

function ecrire(profils) {
    localStorage.setItem(CLE_PROFILS, JSON.stringify(profils));
}

export function enregistrerProfil(nom, source, etat, reglages) {
    const profils = listerProfils();
    const facettes = {};
    Object.entries(etat.facettes).forEach(([k, choix]) => {
        if (choix && choix.size) facettes[k] = [...choix];
    });
    const profil = {
        id: Date.now().toString(36),
        nom: String(nom).trim(),
        source,
        cree: new Date().toISOString(),
        facettes,
        masquees: [...etat.masquees],
        epinglees: Object.fromEntries(
            Object.entries(etat.epinglees || {})
                .filter(([, v]) => v && v.size)
                .map(([k, v]) => [k, [...v]])),
        /* Un profil doit reproduire ce qu'on voyait, non seulement ce qu'on
           avait filtré : une restriction change l'image sans changer les
           effectifs, et l'omettre rendait le profil infidèle. */
        restrictions: Object.fromEntries(
            Object.entries(etat.restrictions || {})
                .filter(([, v]) => v && v.size)
                .map(([k, v]) => [k, [...v]])),
        recherche: etat.recherche,
        renommages: reglages.renommages,
    };
    profils.push(profil);
    ecrire(profils);
    return profil;
}

export function supprimerProfil(id) {
    ecrire(listerProfils().filter(p => p.id !== id));
}

export function lireProfil(id) {
    return listerProfils().find(p => p.id === id) || null;
}

/**
 * Reconstruit un état et des réglages depuis un profil.
 * Les valeurs absentes du jeu de données courant sont signalées plutôt
 * qu'appliquées en silence : un profil bâti sur une autre extraction ne
 * doit pas filtrer sur des valeurs qui n'existent plus.
 */
export function appliquerProfil(profil, valeursConnues) {
    const facettes = {};
    const ignorees = [];

    Object.entries(profil.facettes || {}).forEach(([cle, liste]) => {
        const connues = valeursConnues[cle] || new Set();
        const gardees = liste.filter(v => {
            if (connues.has(v)) return true;
            ignorees.push(`${cle} : ${v}`);
            return false;
        });
        if (gardees.length) facettes[cle] = new Set(gardees);
    });

    const restrictions = {};
    Object.entries(profil.restrictions || {}).forEach(([cle, liste]) => {
        restrictions[cle] = new Set(liste);
    });

    const epinglees = {};
    Object.entries(profil.epinglees || {}).forEach(([cle, liste]) => {
        epinglees[cle] = new Set(liste);
    });

    return {
        etat: {
            facettes,
            masquees: new Set(profil.masquees || []),
            epinglees,
            restrictions,
            recherche: profil.recherche || '',
        },
        reglages: { renommages: profil.renommages || {} },
        ignorees,
    };
}
