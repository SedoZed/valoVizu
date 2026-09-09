/**
 * ui/flux.js
 * Diagramme de flux entre deux ensembles.
 *
 * Remplace la disposition libre par forces, qui donnait un enchevêtrement :
 * sur des données où presque tout est relié à presque tout, un placement
 * libre produit une pelote centrale d'où l'on ne tire aucune lecture. Deux
 * colonnes suppriment d'un coup ce défaut — reste à ordonner chaque côté
 * pour limiter les croisements, ce dont se charge `ordonnerColonnes`.
 *
 * La hauteur d'un nœud est proportionnelle à son volume, l'épaisseur d'un
 * ruban au nombre d'opérations communes. Les deux se lisent l'une par
 * l'autre : un nœud haut dont partent des rubans fins travaille avec
 * beaucoup de partenaires, un nœud haut avec un seul ruban épais concentre
 * son activité.
 */

import { couleurDe, horsEchelle } from './graphique.js';

const NS = 'http://www.w3.org/2000/svg';

const el = (nom, attrs = {}) => {
    const e = document.createElementNS(NS, nom);
    Object.entries(attrs).forEach(([k, v]) => {
        if (v !== null && v !== undefined) e.setAttribute(k, String(v));
    });
    return e;
};

const texte = (contenu, attrs = {}) => {
    const t = el('text', attrs);
    t.textContent = contenu;
    return t;
};

const tronquer = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));

/**
 * Calcule la géométrie du diagramme.
 * @returns { noeudsG, noeudsD, rubans, hauteur }
 */
export function disposerFlux(gauche, droite, liens, options = {}) {
    const {
        hauteur = 520, epaisseurMin = 2, ecart = 6, margeHaut = 8,
    } = options;

    const totalG = gauche.reduce((s, n) => s + n.effectif, 0);
    const totalD = droite.reduce((s, n) => s + n.effectif, 0);
    const total = Math.max(totalG, totalD, 1);

    /* La hauteur disponible est partagée au prorata du volume, une fois
       retranchés les écarts entre nœuds. Un nœud de très faible effectif
       garde une hauteur minimale : le réduire à un trait le rendrait
       impossible à viser. */
    const placer = (noeuds, totalCote) => {
        const ecarts = ecart * Math.max(0, noeuds.length - 1);
        const utile = Math.max(40, hauteur - ecarts - margeHaut * 2);
        const brut = noeuds.map(n => (n.effectif / Math.max(totalCote, 1)) * utile);
        const ajuste = brut.map(h => Math.max(epaisseurMin * 2, h));
        /* La mise à l'échelle minimale a pu allonger l'ensemble : on
           renormalise pour rester dans le cadre. */
        const somme = ajuste.reduce((s, h) => s + h, 0);
        const facteur = somme > utile ? utile / somme : 1;

        let y = margeHaut;
        return noeuds.map((n, i) => {
            const h = ajuste[i] * facteur;
            const place = { ...n, y0: y, y1: y + h, hauteur: h, curseur: y };
            y += h + ecart;
            return place;
        });
    };

    const noeudsG = placer(gauche, totalG);
    const noeudsD = placer(droite, totalD);
    const parG = new Map(noeudsG.map(n => [n.valeur, n]));
    const parD = new Map(noeudsD.map(n => [n.valeur, n]));

    /* Les rubans sont empilés dans l'ordre des nœuds d'en face : c'est ce qui
       évite qu'ils se croisent inutilement à leur propre point d'attache. */
    const rangD = new Map(noeudsD.map((n, i) => [n.valeur, i]));
    const rangG = new Map(noeudsG.map((n, i) => [n.valeur, i]));

    const aretes = [...liens.entries()]
        .map(([cle, valeur]) => {
            const [a, b] = cle.split('\u0000');
            return { a, b, valeur };
        })
        .filter(l => parG.has(l.a) && parD.has(l.b));

    aretes.sort((x, y) =>
        (rangG.get(x.a) - rangG.get(y.a)) || (rangD.get(x.b) - rangD.get(y.b)));

    /**
     * Épaisseurs des rubans attachés à un nœud.
     *
     * Le plancher qui rend un ruban visible ne peut pas s'appliquer
     * indépendamment à chacun : un nœud portant vingt liens fins verrait la
     * somme de ses rubans dépasser sa propre hauteur, et les derniers
     * sortiraient du bloc. C'est le cas systématique du regroupement
     * « Autres », qui réunit par construction beaucoup de valeurs.
     *
     * Le plancher est donc borné par la part disponible, puis l'ensemble est
     * renormalisé pour occuper exactement la hauteur du nœud : les rubans
     * remplissent le bloc sans jamais le déborder.
     */
    const epaisseursDe = (noeud, liensDuNoeud) => {
        const n = liensDuNoeud.length;
        if (!n) return [];
        const plancher = Math.min(epaisseurMin, noeud.hauteur / n);
        const brutes = liensDuNoeud.map(l =>
            Math.max(plancher, (l.valeur / Math.max(noeud.effectif, 1)) * noeud.hauteur));
        const somme = brutes.reduce((s, e) => s + e, 0);
        const facteur = somme > 0 ? noeud.hauteur / somme : 1;
        return brutes.map(e => e * facteur);
    };

    const parNoeud = (cle) => {
        const index = new Map();
        aretes.forEach(l => {
            const k = l[cle];
            if (!index.has(k)) index.set(k, []);
            index.get(k).push(l);
        });
        return index;
    };

    const liensG = parNoeud('a'), liensD = parNoeud('b');
    const epG = new Map(), epD = new Map();
    liensG.forEach((ls, nom) => {
        epaisseursDe(parG.get(nom), ls).forEach((e, i) => epG.set(ls[i], e));
    });
    liensD.forEach((ls, nom) => {
        epaisseursDe(parD.get(nom), ls).forEach((e, i) => epD.set(ls[i], e));
    });

    const rubans = aretes.map(arete => {
        const g = parG.get(arete.a), d = parD.get(arete.b);
        const eG = epG.get(arete), eD = epD.get(arete);
        const ruban = {
            a: arete.a, b: arete.b, valeur: arete.valeur,
            y0: g.curseur, y1: g.curseur + eG,
            y2: d.curseur, y3: d.curseur + eD,
        };
        g.curseur += eG;
        d.curseur += eD;
        return ruban;
    });

    return { noeudsG, noeudsD, rubans, hauteur };
}

/**
 * Dessine le diagramme.
 * @param options { gauche, droite, liens, largeur, hauteur, selection,
 *                  titreG, titreD, unite, onClic, onMenu, surbrillance }
 */
export function dessinerFlux(options) {
    const {
        gauche = [], droite = [], liens = new Map(),
        largeur = 760, hauteur = 520, selection = new Set(),
        titreG = '', titreD = '', unite = 'opérations',
        onClic = null, onMenu = null, surbrillance = null,
        onSurvol = null, couleurs = true, couleurPour = null,
    } = options;
    const teinteDe = v => (couleurPour ? couleurPour(v) : couleurDe(v)) || couleurDe(v);

    const margeTexte = Math.min(220, Math.max(120, largeur * 0.24));
    const largeurNoeud = 11;
    const xG = margeTexte;
    const xD = largeur - margeTexte - largeurNoeud;
    const hautTitre = 22;

    const { noeudsG, noeudsD, rubans } = disposerFlux(gauche, droite, liens, {
        hauteur: hauteur - hautTitre,
    });
    const decaler = n => ({ ...n, y0: n.y0 + hautTitre, y1: n.y1 + hautTitre });
    const g = noeudsG.map(decaler);
    const d = noeudsD.map(decaler);

    const svg = el('svg', {
        viewBox: `0 0 ${largeur} ${hauteur}`, width: '100%', height: hauteur,
        class: 'figure figure-flux', role: 'img',
    });

    /* Titres de colonnes */
    svg.appendChild(texte(titreG.toUpperCase(), {
        x: xG + largeurNoeud, y: 12, 'text-anchor': 'end',
        class: 'figure-axe', fill: 'var(--encre-3)',
    }));
    svg.appendChild(texte(titreD.toUpperCase(), {
        x: xD, y: 12, 'text-anchor': 'start',
        class: 'figure-axe', fill: 'var(--encre-3)',
    }));

    /* Rubans sous les nœuds */
    const coucheRubans = el('g', { class: 'flux-rubans' });
    const concerne = (a, b) => !surbrillance
        || (surbrillance.cote === 'gauche' ? a : b) === surbrillance.valeur;

    rubans.forEach(r => {
        const y0 = r.y0 + hautTitre, y1 = r.y1 + hautTitre;
        const y2 = r.y2 + hautTitre, y3 = r.y3 + hautTitre;
        const mx = (xG + largeurNoeud + xD) / 2;
        const actif = selection.has(r.a) || selection.has(r.b);

        /* Un ruban est une bande fermée, pas un trait épaissi : sa largeur
           peut différer aux deux extrémités, chaque nœud répartissant sa
           propre hauteur entre ses liens. */
        const chemin = el('path', {
            d: `M ${xG + largeurNoeud} ${y0} `
             + `C ${mx} ${y0}, ${mx} ${y2}, ${xD} ${y2} `
             + `L ${xD} ${y3} `
             + `C ${mx} ${y3}, ${mx} ${y1}, ${xG + largeurNoeud} ${y1} Z`,
            fill: actif ? 'var(--signal)'
                : horsEchelle(r.a) ? 'var(--encre-3)'
                : (couleurs ? teinteDe(r.a) : 'var(--encre-2)'),
            'fill-opacity': actif ? 0.5 : (couleurs ? 0.3 : 0.22),
            class: 'flux-ruban' + (concerne(r.a, r.b) ? '' : ' lien-efface'),
            'data-gauche': r.a, 'data-droite': r.b,
        });
        const titre = el('title');
        titre.textContent = `${r.a} → ${r.b} — ${r.valeur} ${unite}`;
        chemin.appendChild(titre);
        coucheRubans.appendChild(chemin);
    });
    svg.appendChild(coucheRubans);

    /* Nœuds et libellés */
    const cote = (noeuds, x, ancrage, nomCote) => {
        noeuds.forEach(n => {
            const choisi = selection.has(n.valeur);
            const attenue = surbrillance
                && !(surbrillance.cote === nomCote && surbrillance.valeur === n.valeur)
                && ![...liens.keys()].some(cle => {
                    const [a, b] = cle.split('\u0000');
                    if (surbrillance.cote === 'gauche') {
                        return a === surbrillance.valeur && (nomCote === 'droite' ? b : a) === n.valeur;
                    }
                    return b === surbrillance.valeur && (nomCote === 'gauche' ? a : b) === n.valeur;
                });

            const groupe = el('g', {
                class: 'flux-noeud' + (attenue ? ' entree-attenuee' : ''),
                tabindex: '0', role: 'button',
            });
            const titre = el('title');
            titre.textContent = `${n.valeur} — ${n.effectif} ${unite}`;
            groupe.appendChild(titre);

            /* Zone de visée large : un nœud fin serait autrement difficile
               à atteindre. */
            groupe.appendChild(el('rect', {
                x: ancrage === 'end' ? 0 : x, y: n.y0 - 2,
                width: ancrage === 'end' ? x + largeurNoeud : largeur - x,
                height: Math.max(12, n.y1 - n.y0 + 4),
                fill: 'transparent',
            }));

            groupe.appendChild(el('rect', {
                x, y: n.y0, width: largeurNoeud, height: Math.max(1.5, n.y1 - n.y0),
                fill: choisi ? 'var(--signal)'
                    : horsEchelle(n.valeur, n) ? 'var(--encre-3)'
                    : couleurs ? teinteDe(n.valeur)
                    : (nomCote === 'gauche' ? 'var(--signal)' : 'var(--alerte)'),
                'fill-opacity': n.autres ? 0.5 : 0.9,
                rx: 1.5, class: 'flux-barre',
            }));

            /* Le libellé n'est écrit que si le nœud a la place de l'accueillir ;
               au-dessous, il chevaucherait ses voisins. */
            const place = (n.y1 - n.y0) >= 9;
            if (place || choisi) {
                const y = (n.y0 + n.y1) / 2 + 4;
                groupe.appendChild(texte(tronquer(n.valeur, 26), {
                    x: ancrage === 'end' ? x - 8 : x + largeurNoeud + 8, y,
                    'text-anchor': ancrage, class: 'figure-libelle',
                    fill: choisi ? 'var(--signal)' : n.autres ? 'var(--encre-3)' : 'var(--encre)',
                    'font-style': n.autres ? 'italic' : null,
                }));
                /* L'effectif est inscrit dans le nœud quand il y tient, à côté
                   sinon : il ne doit jamais manquer. */
                if ((n.y1 - n.y0) >= 14) {
                    groupe.appendChild(texte(n.effectif, {
                        x: x + largeurNoeud / 2, y,
                        'text-anchor': 'middle', class: 'figure-valeur',
                        fill: 'var(--carte)', 'font-weight': '500',
                    }));
                } else {
                    groupe.appendChild(texte(n.effectif, {
                        x: ancrage === 'end' ? x - 8 : x + largeurNoeud + 8, y: y + 11,
                        'text-anchor': ancrage, class: 'figure-valeur',
                        fill: 'var(--encre-3)',
                    }));
                }
            }

            if (onSurvol) {
                groupe.addEventListener('mouseenter', () => onSurvol(nomCote, n.valeur, coucheRubans, svg));
                groupe.addEventListener('mouseleave', () => onSurvol(null, null, coucheRubans, svg));
            }
            if (onClic) {
                const agir = () => onClic(nomCote, n);
                groupe.addEventListener('click', agir);
                groupe.addEventListener('keydown', e => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); agir(); }
                });
            }
            onMenu?.(groupe, nomCote, n);

            svg.appendChild(groupe);
        });
    };

    cote(g, xG, 'end',   'gauche');
    cote(d, xD, 'start', 'droite');

    return svg;
}
