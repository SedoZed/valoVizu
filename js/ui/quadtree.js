/**
 * ui/quadtree.js
 * Arbre quaternaire.
 *
 * Sert aux deux forces qui, sans lui, coûteraient le carré du nombre de
 * nœuds : la répulsion entre tous et la résolution des collisions. Sur sept
 * cents chercheurs, cela ferait un quart de million de distances par image,
 * soixante fois par seconde.
 *
 * L'arbre découpe le plan en quadrants successifs. La répulsion peut alors
 * traiter un groupe lointain comme un seul point placé à son barycentre :
 * c'est l'approximation de Barnes et Hut, qui ramène le coût au nombre de
 * nœuds multiplié par son logarithme, sans que la différence se voie.
 *
 * Une grille à maille fixe, que j'avais d'abord employée, ne permet pas cette
 * approximation : elle ne fait travailler que les voisins immédiats, si bien
 * que deux groupes éloignés ne se repoussent pas du tout et ne trouvent
 * jamais leur place l'un par rapport à l'autre.
 */

/**
 * @param points   objets portant des coordonnées
 * @param accesX   (point) → abscisse
 * @param accesY   (point) → ordonnée
 */
export function construireArbre(points, accesX = p => p.x, accesY = p => p.y) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    points.forEach(p => {
        const x = accesX(p), y = accesY(p);
        if (isNaN(x) || isNaN(y)) return;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
    });
    if (x0 > x1) return null;   // aucun point exploitable

    /* Le carré englobant est étendu à une puissance de deux : les quadrants
       se divisent alors exactement, sans arrondi cumulé. */
    const cote = Math.max(x1 - x0, y1 - y0) || 1;
    let taille = 1;
    while (taille < cote) taille *= 2;
    x1 = x0 + taille;
    y1 = y0 + taille;

    const racine = { x0, y0, x1, y1, feuille: null, enfants: null };

    const inserer = (noeud, point, x, y) => {
        for (;;) {
            /* Quadrant vide : le point s'y installe. */
            if (!noeud.enfants && !noeud.feuille) { noeud.feuille = [point]; return; }

            if (noeud.feuille) {
                const premier = noeud.feuille[0];
                const px = accesX(premier), py = accesY(premier);
                /* Points confondus : les séparer indéfiniment ferait diverger
                   la subdivision. Ils partagent la même feuille. */
                if (Math.abs(px - x) < 1e-6 && Math.abs(py - y) < 1e-6) {
                    noeud.feuille.push(point);
                    return;
                }
                const anciens = noeud.feuille;
                noeud.feuille = null;
                noeud.enfants = [null, null, null, null];
                anciens.forEach(a => placer(noeud, a, accesX(a), accesY(a)));
            }
            noeud = placer(noeud, point, x, y);
        }
    };

    /* Descend d'un niveau et renvoie le quadrant où poursuivre. */
    const placer = (noeud, point, x, y) => {
        if (!noeud.enfants) noeud.enfants = [null, null, null, null];
        const mx = (noeud.x0 + noeud.x1) / 2;
        const my = (noeud.y0 + noeud.y1) / 2;
        const droite = x >= mx ? 1 : 0;
        const bas    = y >= my ? 1 : 0;
        const indice = bas * 2 + droite;
        if (!noeud.enfants[indice]) {
            noeud.enfants[indice] = {
                x0: droite ? mx : noeud.x0, x1: droite ? noeud.x1 : mx,
                y0: bas ? my : noeud.y0,    y1: bas ? noeud.y1 : my,
                feuille: null, enfants: null,
            };
        }
        const enfant = noeud.enfants[indice];
        if (!enfant.enfants && !enfant.feuille) { enfant.feuille = [point]; return null; }
        return enfant;
    };

    points.forEach(p => {
        const x = accesX(p), y = accesY(p);
        if (isNaN(x) || isNaN(y)) return;
        let courant = racine;
        for (;;) {
            if (!courant.enfants && !courant.feuille) { courant.feuille = [p]; break; }
            if (courant.feuille) {
                const premier = courant.feuille[0];
                if (Math.abs(accesX(premier) - x) < 1e-6
                 && Math.abs(accesY(premier) - y) < 1e-6) {
                    courant.feuille.push(p);
                    break;
                }
                const anciens = courant.feuille;
                courant.feuille = null;
                anciens.forEach(a => {
                    const suite = placer(courant, a, accesX(a), accesY(a));
                    if (suite) inserer(suite, a, accesX(a), accesY(a));
                });
            }
            const suite = placer(courant, p, x, y);
            if (!suite) break;
            courant = suite;
        }
    });

    return racine;
}

/**
 * Accumule sur chaque nœud interne la somme des charges et leur barycentre.
 * C'est ce qui autorise à traiter un quadrant lointain comme un point unique.
 */
export function accumuler(noeud, charge, accesX = p => p.x, accesY = p => p.y) {
    if (!noeud) return null;
    let somme = 0, sx = 0, sy = 0;

    if (noeud.feuille) {
        noeud.feuille.forEach(p => {
            const c = charge(p);
            somme += c;
            sx += accesX(p) * Math.abs(c);
            sy += accesY(p) * Math.abs(c);
        });
        const poids = noeud.feuille.reduce((s, p) => s + Math.abs(charge(p)), 0) || 1;
        noeud.valeur = somme;
        noeud.cx = sx / poids;
        noeud.cy = sy / poids;
        return noeud;
    }

    if (noeud.enfants) {
        let poids = 0;
        noeud.enfants.forEach(enfant => {
            if (!enfant) return;
            accumuler(enfant, charge, accesX, accesY);
            somme += enfant.valeur;
            const p = Math.abs(enfant.valeur) || 1e-9;
            sx += enfant.cx * p;
            sy += enfant.cy * p;
            poids += p;
        });
        noeud.valeur = somme;
        noeud.cx = poids ? sx / poids : (noeud.x0 + noeud.x1) / 2;
        noeud.cy = poids ? sy / poids : (noeud.y0 + noeud.y1) / 2;
    }
    return noeud;
}

/**
 * Parcourt l'arbre. Le rappel renvoie `true` pour renoncer à descendre plus
 * bas — c'est ainsi que Barnes-Hut coupe court sur les quadrants lointains.
 */
export function parcourir(noeud, rappel) {
    if (!noeud) return;
    const pile = [noeud];
    while (pile.length) {
        const courant = pile.pop();
        if (rappel(courant)) continue;
        if (courant.enfants) {
            for (let i = 3; i >= 0; i--) {
                if (courant.enfants[i]) pile.push(courant.enfants[i]);
            }
        }
    }
}
