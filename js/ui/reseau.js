/**
 * ui/reseau.js
 * Ordonnancement d'un graphe biparti en deux colonnes.
 *
 * Une disposition libre par forces a été essayée puis retirée : sur des
 * données où presque tout est relié à presque tout, elle produit une pelote
 * centrale dont on ne tire aucune lecture. Deux colonnes suppriment d'un coup
 * les deux défauts d'un placement libre — plus d'amas au centre, plus de
 * nœuds éjectés. Reste à ordonner chaque côté pour limiter les croisements,
 * ce dont s'occupe ce module.
 */

/* ─────────────────────────────────────────────────────────────────────────
   Disposition en deux colonnes
───────────────────────────────────────────────────────────────────────── */

/**
 * Ordonne les deux colonnes d'un graphe biparti pour limiter les croisements.
 *
 * Ranger les valeurs par effectif décroissant est le classement le plus
 * naturel, mais il produit un enchevêtrement de traits dès qu'il y a plus
 * d'une dizaine de liens : chaque colonne suit son propre ordre, sans égard
 * pour l'autre. On applique donc l'heuristique classique du barycentre —
 * chaque nœud se place à la hauteur moyenne de ses voisins, en alternant les
 * côtés — suivie d'une passe de transposition qui échange deux voisins
 * lorsque cela réduit le nombre de croisements.
 *
 * « Autres » est épinglé en fin de colonne : ce n'est pas une valeur classée,
 * et laisser sa position varier ferait lire un rang là où il n'y en a pas.
 *
 * Une colonne peut être déclarée fixe : un axe chronologique conserve son
 * ordre, quitte à croiser davantage. Réordonner des années pour faire joli
 * rendrait la figure fausse à la lecture.
 *
 * @param gauche  [{ valeur, effectif, autres? }]
 * @param droite  idem
 * @param liens   Map "gauche\u0000droite" → poids
 * @param options { gaucheFixe, droiteFixe }
 * @returns { gauche, droite } réordonnés
 */
export function ordonnerColonnes(gauche, droite, liens, options = {}) {
    const { gaucheFixe = false, droiteFixe = false } = options;
    if (gaucheFixe && droiteFixe) return { gauche: gauche.slice(), droite: droite.slice() };
    const aretes = [...liens.entries()].map(([cle, poids]) => {
        const [a, b] = cle.split('\u0000');
        return { a, b, poids };
    });

    const parGauche = {}, parDroite = {};
    aretes.forEach(l => {
        (parGauche[l.a] = parGauche[l.a] || []).push(l);
        (parDroite[l.b] = parDroite[l.b] || []).push(l);
    });

    let g = gauche.slice(), d = droite.slice();

    /* Une passe : chaque nœud prend la position moyenne de ses voisins,
       pondérée par l'intensité des liens. */
    const balayer = (cote, autre, index, clef) => {
        const rang = {};
        autre.forEach((n, i) => { rang[n.valeur] = i; });
        cote.forEach((n, i) => {
            const ls = index[n.valeur] || [];
            let somme = 0, poids = 0;
            ls.forEach(l => {
                const p = rang[l[clef]];
                if (p === undefined) return;
                somme += p * l.poids; poids += l.poids;
            });
            n._bary = poids ? somme / poids : i;
        });
        cote.sort((x, y) => x._bary - y._bary || y.effectif - x.effectif);
    };

    for (let i = 0; i < 8; i++) {
        if (!gaucheFixe) balayer(g, d, parGauche, 'b');
        if (!droiteFixe) balayer(d, g, parDroite, 'a');
    }

    /* Croisements induits par l'ordre (u, v) sur une colonne. */
    const croisements = (u, v, index, autre, clef) => {
        const rang = {};
        autre.forEach((n, i) => { rang[n.valeur] = i; });
        const lu = index[u.valeur] || [], lv = index[v.valeur] || [];
        let c = 0;
        lu.forEach(a => lv.forEach(b => {
            const pa = rang[a[clef]], pb = rang[b[clef]];
            if (pa === undefined || pb === undefined) return;
            if (pa > pb) c += a.poids * b.poids;
        }));
        return c;
    };

    const transposer = (cote, autre, index, clef) => {
        let ameliore = true, garde = 0;
        while (ameliore && garde++ < 12) {
            ameliore = false;
            for (let j = 0; j < cote.length - 1; j++) {
                const u = cote[j], v = cote[j + 1];
                if (croisements(u, v, index, autre, clef) >
                    croisements(v, u, index, autre, clef)) {
                    cote[j] = v; cote[j + 1] = u;
                    ameliore = true;
                }
            }
        }
    };

    if (!gaucheFixe) transposer(g, d, parGauche, 'b');
    if (!droiteFixe) transposer(d, g, parDroite, 'a');

    /* « Autres » en fin de colonne, quelle que soit sa position calculée.
       Sur un axe fixe on n'y touche pas : l'ordre y fait sens de bout en bout. */
    const epingler = (liste, fixe) => fixe ? liste : [
        ...liste.filter(n => !n.autres),
        ...liste.filter(n => n.autres),
    ];

    return { gauche: epingler(g, gaucheFixe), droite: epingler(d, droiteFixe) };
}

/**
 * Nombre total de croisements d'un ordonnancement.
 * Employé par les vérifications automatiques : c'est la seule façon de
 * s'assurer que l'ordonnancement fait bien ce qu'il prétend, plutôt que de
 * constater à l'œil que « ça a l'air mieux ».
 */
export function compterCroisements(gauche, droite, liens) {
    const rangG = {}, rangD = {};
    gauche.forEach((n, i) => { rangG[n.valeur] = i; });
    droite.forEach((n, i) => { rangD[n.valeur] = i; });

    const aretes = [...liens.entries()].map(([cle]) => {
        const [a, b] = cle.split('\u0000');
        return { a: rangG[a], b: rangD[b] };
    }).filter(l => l.a !== undefined && l.b !== undefined);

    let total = 0;
    for (let i = 0; i < aretes.length; i++) {
        for (let j = i + 1; j < aretes.length; j++) {
            const u = aretes[i], v = aretes[j];
            if ((u.a - v.a) * (u.b - v.b) < 0) total++;
        }
    }
    return total;
}
