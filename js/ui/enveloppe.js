/**
 * ui/enveloppe.js
 * Enveloppe convexe d'un nuage de points.
 *
 * Sert à cerner d'une teinte les membres d'un même groupe. C'est ce qui rend
 * un réseau lisible d'un coup d'œil : sans elle, on distingue des points et
 * des traits, mais pas les ensembles qu'ils forment.
 *
 * Algorithme de la chaîne monotone d'Andrew : tri par abscisse puis parcours
 * en deux passes. Suffisant ici — quelques centaines de points au plus — et
 * sans dépendance.
 */

/** Produit vectoriel : signe de l'orientation du triplet. */
function orientation(o, a, b) {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/**
 * @param points [[x, y], …]
 * @returns les sommets de l'enveloppe, dans le sens trigonométrique, ou null
 *          si le nuage n'a pas de surface (moins de trois points distincts).
 */
export function enveloppeConvexe(points) {
    if (!points || points.length < 3) return null;

    const tries = points
        .map(p => [p[0], p[1]])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

    /* Points confondus : l'enveloppe n'aurait pas de surface. */
    const distincts = tries.filter((p, i) =>
        i === 0 || p[0] !== tries[i - 1][0] || p[1] !== tries[i - 1][1]);
    if (distincts.length < 3) return null;

    const bas = [];
    for (const p of distincts) {
        while (bas.length >= 2 && orientation(bas[bas.length - 2], bas[bas.length - 1], p) <= 0) {
            bas.pop();
        }
        bas.push(p);
    }

    const haut = [];
    for (let i = distincts.length - 1; i >= 0; i--) {
        const p = distincts[i];
        while (haut.length >= 2 && orientation(haut[haut.length - 2], haut[haut.length - 1], p) <= 0) {
            haut.pop();
        }
        haut.push(p);
    }

    bas.pop(); haut.pop();
    const enveloppe = bas.concat(haut);
    return enveloppe.length >= 3 ? enveloppe : null;
}

/**
 * Écarte l'enveloppe de son centre, pour qu'elle englobe les points au lieu
 * de passer exactement dessus — un contour tangent donne l'impression que les
 * points débordent du groupe.
 */
export function dilater(enveloppe, marge = 16) {
    if (!enveloppe) return null;
    const cx = enveloppe.reduce((s, p) => s + p[0], 0) / enveloppe.length;
    const cy = enveloppe.reduce((s, p) => s + p[1], 0) / enveloppe.length;
    return enveloppe.map(([x, y]) => {
        const dx = x - cx, dy = y - cy;
        const d = Math.hypot(dx, dy) || 1;
        return [x + (dx / d) * marge, y + (dy / d) * marge];
    });
}

/**
 * Chemin SVG arrondi passant par les sommets.
 * Un polygone aux angles vifs se lit comme une figure géométrique ; arrondi,
 * il se lit comme une zone — ce qu'il est.
 */
export function cheminArrondi(enveloppe, arrondi = 0.35) {
    if (!enveloppe || enveloppe.length < 3) return '';
    const n = enveloppe.length;
    const milieu = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

    let d = '';
    for (let i = 0; i < n; i++) {
        const precedent = enveloppe[(i - 1 + n) % n];
        const courant   = enveloppe[i];
        const suivant   = enveloppe[(i + 1) % n];
        const entree = milieu(courant, precedent, arrondi);
        const sortie = milieu(courant, suivant, arrondi);
        d += i === 0 ? `M ${entree[0]} ${entree[1]}` : ` L ${entree[0]} ${entree[1]}`;
        d += ` Q ${courant[0]} ${courant[1]} ${sortie[0]} ${sortie[1]}`;
    }
    return d + ' Z';
}


/**
 * Contour d'un groupe trop petit pour avoir une enveloppe.
 *
 * Une enveloppe convexe suppose au moins trois points distincts. En deçà, le
 * groupe se retrouverait sans contour alors que ses voisins en ont un : la
 * figure paraîtrait inachevée, et rien n'indiquerait qu'un pôle isolé forme
 * lui aussi un groupe. On lui trace donc un cercle englobant.
 */
export function cercleEnglobant(points, marge = 18) {
    if (!points || !points.length) return '';
    const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
    const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
    const r = Math.max(...points.map(p => Math.hypot(p[0] - cx, p[1] - cy))) + marge;
    /* Deux arcs suffisent à décrire un cercle en chemin SVG. */
    return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0 Z`;
}
