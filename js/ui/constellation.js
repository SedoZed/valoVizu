/**
 * ui/constellation.js
 * Réseau des membres autour de leurs pôles.
 *
 * Reprend le rendu de la première version de l'outil, dont la lisibilité
 * tenait à quatre choses que les tentatives suivantes avaient perdues :
 *
 *   — une enveloppe teintée cerne chaque groupe, si bien qu'on voit des
 *     ensembles et non un semis de points ;
 *   — les pôles sont des anneaux portant leur nom à l'intérieur, ce qui les
 *     distingue des membres sans recourir à un renvoi de légende ;
 *   — les membres sont des disques francs, colorés d'après leur pôle : la
 *     couleur relie visuellement un point à son groupe, même à distance de
 *     l'enveloppe ;
 *   — les liens portent la teinte de leur pôle plutôt qu'un gris uniforme.
 *
 * Le zoom découvre les noms des membres, illisibles à l'échelle d'ensemble
 * mais nécessaires dès qu'on examine un groupe.
 */
import { couleurDe, horsEchelle } from './graphique.js';
import { issuDunGlissement } from './physique.js';
import { enveloppeConvexe, dilater, cheminArrondi, cercleEnglobant } from './enveloppe.js';
import { montrerInfobulle, cacherInfobulle, contenuInfobulle } from './infobulle.js';

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

function couleurCss(nom, repli) {
    if (typeof getComputedStyle !== 'function') return repli;
    return getComputedStyle(document.documentElement).getPropertyValue(nom).trim() || repli;
}

const tronquer = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));

/** Suite déterministe tirée d'une chaîne. */
function graine(chaine) {
    let h = 2166136261;
    for (let i = 0; i < chaine.length; i++) {
        h ^= chaine.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return () => {
        h ^= h << 13; h >>>= 0;
        h ^= h >> 17;
        h ^= h << 5;  h >>>= 0;
        return h / 4294967296;
    };
}

/** Rayon d'un pôle : la racine tempère l'écart entre un gros et un petit. */
export const rayonPole = (effectif, max) => 14 + Math.sqrt(effectif / Math.max(max, 1)) * 26;

const ESPACE_MEMBRE = 11;   // pas entre deux membres d'une couronne
const PAS_COURONNE  = 11;   // écart entre deux couronnes successives

/** Rayon occupé par un groupe, pôle et couronnes de membres comprises. */
function rayonGroupe(rayon, nbMembres) {
    if (!nbMembres) return rayon + 10;
    let restant = nbMembres;
    let r = rayon + 13;
    while (restant > 0) {
        const capacite = Math.max(4, Math.floor((2 * Math.PI * r) / ESPACE_MEMBRE));
        restant -= capacite;
        if (restant > 0) r += PAS_COURONNE;
    }
    return r + 7;
}

/**
 * Pavage des groupes.
 *
 * Ranger les pôles sur un même cercle convient à une poignée de groupes ;
 * au-delà d'une dizaine, le cercle devient immense et son centre reste vide.
 * On empile donc les groupes du plus gros au plus petit, chacun au plus près
 * du centre là où il ne chevauche aucun autre — la figure occupe alors une
 * tache compacte, à la manière d'un empilement de disques.
 *
 * La recherche procède par anneaux concentriques : elle est déterministe et
 * reste rapide, quelques dizaines de groupes ne demandant que quelques
 * milliers d'essais.
 */
function paver(groupes, largeur, hauteur) {
    const cx = largeur / 2, cy = hauteur / 2;
    const places = [];

    groupes.slice()
        .sort((a, b) => b.rayonGroupe - a.rayonGroupe)
        .forEach((groupe, index) => {
            if (index === 0) {
                groupe.x = cx; groupe.y = cy;
                places.push(groupe);
                return;
            }
            const libre = (x, y) => places.every(autre =>
                Math.hypot(x - autre.x, y - autre.y)
                    >= groupe.rayonGroupe + autre.rayonGroupe + 6);

            let pose = false;
            for (let rayon = 12; rayon < Math.max(largeur, hauteur) * 1.4 && !pose; rayon += 9) {
                /* Le pas angulaire suit le rayon : à distance égale du centre,
                   deux essais voisins doivent rester distants d'une dizaine de
                   points, ni plus — on manquerait des places — ni moins. */
                const pas = Math.max(10, Math.round((2 * Math.PI * rayon) / 11));
                /* Le décalage évite que tous les anneaux s'alignent sur le
                   même axe, ce qui creuserait des couloirs vides. */
                const decalage = index * 0.7;
                for (let i = 0; i < pas && !pose; i++) {
                    const angle = decalage + (i / pas) * Math.PI * 2;
                    const x = cx + Math.cos(angle) * rayon;
                    const y = cy + Math.sin(angle) * rayon;
                    if (!libre(x, y)) continue;
                    groupe.x = x; groupe.y = y; pose = true;
                }
            }
            if (!pose) { groupe.x = cx; groupe.y = cy; }
            places.push(groupe);
        });

    return groupes;
}

/**
 * Positions des pôles et de leurs membres.
 * Les membres occupent des couronnes régulières autour de leur pôle : une
 * disposition ordonnée se lit mieux qu'un nuage, et rend comparables des
 * groupes d'effectifs voisins.
 */
export function disposerConstellation(poles, individus, options = {}) {
    const { largeur = 760, hauteur = 520 } = options;
    /* Le pôle « Autres » réunit plusieurs laboratoires : le laisser fixer le
       rayon maximal rapetisserait tous les autres disques. */
    const comparables = poles.filter(p => !horsEchelle(p.valeur, p));
    const maxEffectif = Math.max(
        ...(comparables.length ? comparables : poles).map(p => p.effectif), 1);

    /* Membres rattachés à chaque pôle, pour dimensionner les couronnes. */
    const membresDe = new Map(poles.map(p => [p.valeur, []]));
    const orphelins = [];
    individus.forEach(ind => {
        const principal = ind.poles.find(v => membresDe.has(v));
        if (principal) membresDe.get(principal).push(ind);
        else orphelins.push(ind);
    });

    const groupes = poles.map(p => {
        /* Le pôle « Autres » réunit plusieurs laboratoires et dépasse le
           maximum des pôles comparables : son rayon est borné, sans quoi il
           écrase visuellement tous les autres. */
        const rayon = rayonPole(Math.min(p.effectif, maxEffectif), maxEffectif);
        return {
            ...p, rayon,
            rayonGroupe: rayonGroupe(rayon, membresDe.get(p.valeur).length),
        };
    });

    paver(groupes, largeur, hauteur);
    const parValeur = new Map(groupes.map(p => [p.valeur, p]));

    /* Membres en couronnes autour de leur pôle. */
    const placesIndividus = [];
    groupes.forEach(pole => {
        const membres = membresDe.get(pole.valeur);
        let indice = 0;
        let r = pole.rayon + 13;
        while (indice < membres.length) {
            const capacite = Math.max(4, Math.floor((2 * Math.PI * r) / ESPACE_MEMBRE));
            const surCetteCouronne = Math.min(capacite, membres.length - indice);
            for (let i = 0; i < surCetteCouronne; i++) {
                const ind = membres[indice + i];
                /* Le décalage d'une couronne à l'autre évite les rayons
                   alignés, qui donneraient une impression de roue dentée. */
                const angle = ((i + 0.5) / surCetteCouronne) * Math.PI * 2
                            + (r / PAS_COURONNE) * 0.4;
                placesIndividus.push({
                    ...ind,
                    x: pole.x + Math.cos(angle) * r,
                    y: pole.y + Math.sin(angle) * r,
                    pont: ind.poles.length > 1,
                    principal: pole,
                });
            }
            indice += surCetteCouronne;
            r += PAS_COURONNE;
        }
    });

    /* Membres sans rattachement : rangés à l'écart plutôt que mêlés aux
       groupes, où ils passeraient pour en faire partie. */
    orphelins.forEach((ind, i) => {
        const parLigne = Math.max(6, Math.floor(largeur / 16));
        placesIndividus.push({
            ...ind,
            x: 20 + (i % parLigne) * 15,
            y: hauteur - 18 - Math.floor(i / parLigne) * 15,
            isole: true, principal: null,
        });
    });

    return { poles: groupes, individus: placesIndividus };
}

export function dessinerConstellation(options) {
    const {
        poles = [], individus = [], largeur = 760, hauteur = 520,
        selection = new Set(), unite = 'membres',
        onClicPole = null, onMenuPole = null, onClicIndividu = null,
        surbrillance = null, couleurs = true, anime = true,
        detailIndividu = null, couleurPour = null,
    } = options;

    const svg = el('svg', {
        viewBox: `0 0 ${largeur} ${hauteur}`, width: '100%', height: hauteur,
        role: 'img', class: 'figure figure-constellation',
    });

    const encre  = couleurCss('--encre', '#16232B');
    const signal = couleurCss('--signal', '#0B6E5F');
    const gris   = couleurCss('--encre-3', '#7C8B93');
    const carte  = couleurCss('--carte', '#FFFFFF');
    const alerte = couleurCss('--alerte', '#A8471A');

    const teinteDe = valeur => couleurs
        ? (couleurPour ? couleurPour(valeur) : couleurDe(valeur))
        : encre;
    const parValeur = new Map(poles.map(p => [p.valeur, p]));
    const concerne = ind => !surbrillance || ind.poles.includes(surbrillance);

    /* Un groupe transformable porte tout le dessin : le zoom et le
       déplacement s'appliquent à lui seul, sans toucher aux coordonnées. */
    const racine = el('g', { class: 'constellation-racine' });
    svg.appendChild(racine);

    const coucheEnveloppes = el('g', { class: 'constellation-enveloppes' });
    const coucheLiens      = el('g', { class: 'constellation-liens' });
    const coucheIndividus  = el('g', { class: 'constellation-individus' });
    const couchePoles      = el('g', { class: 'constellation-poles' });
    racine.append(coucheEnveloppes, coucheLiens, coucheIndividus, couchePoles);

    /* ── Enveloppes ── */
    const formes = new Map();
    poles.forEach(p => {
        const forme = el('path', {
            fill: teinteDe(p.valeur), 'fill-opacity': 0.05,
            stroke: teinteDe(p.valeur), 'stroke-opacity': 0.14,
            'stroke-width': 1.2, 'stroke-linejoin': 'round',
            'pointer-events': 'none', class: 'constellation-enveloppe',
        });
        formes.set(p.valeur, forme);
        coucheEnveloppes.appendChild(forme);
        p._enveloppe = forme;
    });

    /* ── Liens ── */
    individus.forEach(ind => {
        ind._traits = [];
        ind.poles.forEach(v => {
            const pole = parValeur.get(v);
            if (!pole) return;
            const trait = el('line', {
                x1: ind.x, y1: ind.y, x2: pole.x, y2: pole.y,
                stroke: selection.has(v) ? signal : teinteDe(v),
                'stroke-width': ind.pont ? 1 : 0.6,
                /* Les liens d'un membre à son pôle n'apprennent presque rien —
                   la position le dit déjà. Ils restent en filigrane, sauf
                   ceux des membres à cheval, seuls porteurs d'information. */
                'stroke-opacity': concerne(ind) ? (ind.pont ? 0.55 : 0.12) : 0.02,
                class: 'constellation-lien',
            });
            ind._traits.push({ trait, pole });
            coucheLiens.appendChild(trait);
        });
    });

    /* ── Membres ── */
    individus.forEach((ind, i) => {
        const groupe = el('g', {
            class: 'constellation-individu',
            tabindex: onClicIndividu ? '0' : null,
        });
        /* Les membres restent gris : la couleur appartient au pôle, et la
           répéter sur chacun d'eux sature l'image sans rien ajouter — leur
           appartenance se lit déjà à leur position. Seuls les cas notables
           s'en écartent : sans rattachement, ou relevant de plusieurs pôles. */
        const teinte = ind.isole ? alerte : ind.pont ? teinteDe(ind.poles[0]) : gris;

        const disque = el('circle', {
            r: anime ? 0 : 4.2,
            fill: teinte, 'fill-opacity': concerne(ind) ? 0.85 : 0.1,
            stroke: carte, 'stroke-width': 0.8,
            class: 'individu-disque',
        });
        groupe.appendChild(disque);

        /* Le nom n'apparaît qu'au zoom : à l'échelle d'ensemble, sept cents
           libellés se recouvrent et masquent la figure. */
        const nom = texte(tronquer(ind.libelle, 26), {
            y: -11, 'text-anchor': 'middle', class: 'figure-libelle nom-individu',
            fill: encre, 'pointer-events': 'none', opacity: 0,
            'paint-order': 'stroke', stroke: carte, 'stroke-width': 3,
        });
        groupe.appendChild(nom);

        groupe.addEventListener('mousemove', evt => {
            montrerInfobulle(contenuInfobulle({
                titre: ind.libelle,
                precision: ind.isole ? 'Sans rattachement'
                         : ind.poles.join(' · '),
                elements: detailIndividu ? detailIndividu(ind) : [],
            }), evt.clientX, evt.clientY);
        });
        groupe.addEventListener('mouseleave', cacherInfobulle);
        if (onClicIndividu) {
            groupe.addEventListener('click', () => onClicIndividu(ind));
            groupe.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClicIndividu(ind); }
            });
        }

        ind._groupe = groupe;
        ind._disque = disque;
        coucheIndividus.appendChild(groupe);

        if (anime) {
            /* Apparition décalée : l'œil suit la formation des groupes au
               lieu de recevoir l'image entière d'un bloc. */
            setTimeout(() => {
                disque.style.transition = 'r .28s ease-out';
                disque.setAttribute('r', 4.2);
            }, Math.min(i * 2, 420));
        }
    });

    /* ── Pôles ── */
    poles.forEach(p => {
        const choisi = selection.has(p.valeur);
        const attenue = surbrillance && surbrillance !== p.valeur;
        const teinte = choisi ? signal : teinteDe(p.valeur);

        const groupe = el('g', {
            class: 'constellation-pole' + (attenue ? ' entree-attenuee' : ''),
            tabindex: '0', role: 'button',
        });

        /* Disque plein plutôt qu'anneau : la couleur d'un aplat se lit à
           distance, celle d'un contour se devine. Les couronnes de membres
           n'étant jamais dessous, rien n'est masqué. */
        const anneau = el('circle', {
            r: anime ? 0 : p.rayon,
            fill: teinte, 'fill-opacity': 1,
            stroke: carte, 'stroke-width': choisi ? 3 : 2,
            class: 'pole-anneau',
        });
        groupe.appendChild(anneau);

        /* L'effectif au centre, en réserve sur l'aplat. */
        const effectif = texte(p.effectif, {
            'text-anchor': 'middle', dy: '0.36em',
            class: 'effectif-pole', fill: carte, 'pointer-events': 'none',
        });
        groupe.appendChild(effectif);

        /* Le nom au-dessus du groupe, hors des couronnes : à l'intérieur du
           disque il faudrait le réduire au point de le rendre illisible sur
           les petits pôles. */
        const nom = texte(tronquer(p.valeur, 24), {
            y: -(p.rayon + 9), 'text-anchor': 'middle',
            class: 'nom-pole', fill: choisi ? signal : encre,
            'pointer-events': 'none',
            'paint-order': 'stroke', stroke: carte, 'stroke-width': 3.5,
        });
        groupe.appendChild(nom);

        groupe.addEventListener('mousemove', evt => {
            montrerInfobulle(contenuInfobulle({
                titre: p.valeur,
                precision: `${p.effectif} ${unite}`,
            }), evt.clientX, evt.clientY);
        });
        groupe.addEventListener('mouseleave', cacherInfobulle);

        if (onClicPole) {
            groupe.addEventListener('click', () => {
                if (issuDunGlissement(groupe)) return;
                onClicPole(p.valeur);
            });
            groupe.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClicPole(p.valeur); }
            });
        }
        onMenuPole?.(groupe, p.valeur);

        p._groupe = groupe;
        p._anneau = anneau;
        couchePoles.appendChild(groupe);

        if (anime) {
            setTimeout(() => {
                anneau.style.transition = 'r .45s ease-out';
                anneau.setAttribute('r', p.rayon);
            }, 20);
        }
    });

    svg._racine = racine;
    majPositions(poles, individus);
    return svg;
}

/** Réécrit les coordonnées d'une figure déjà construite. */
export function majPositions(poles, individus, options = {}) {
    const { enveloppes = true } = options;

    individus.forEach(ind => {
        if (ind._groupe) ind._groupe.setAttribute('transform', `translate(${ind.x},${ind.y})`);
        (ind._traits || []).forEach(({ trait, pole }) => {
            trait.setAttribute('x1', ind.x);
            trait.setAttribute('y1', ind.y);
            trait.setAttribute('x2', pole.x);
            trait.setAttribute('y2', pole.y);
        });
    });

    poles.forEach(p => {
        if (p._groupe) p._groupe.setAttribute('transform', `translate(${p.x},${p.y})`);
    });

    if (!enveloppes) return;

    /* Une enveloppe se recalcule à chaque image tant que la disposition
       bouge : c'est le prix de sa justesse, et le calcul reste modeste
       (quelques centaines de points triés). */
    const parPole = new Map(poles.map(p => [p.valeur, []]));
    individus.forEach(ind => {
        if (!ind.principal) return;
        const liste = parPole.get(ind.principal.valeur);
        if (liste) liste.push([ind.x, ind.y]);
    });
    poles.forEach(p => {
        const points = parPole.get(p.valeur) || [];
        points.push([p.x, p.y]);
        const forme = p._enveloppe;
        if (!forme) return;
        const enveloppe = enveloppeConvexe(points);
        /* Sous trois points, un cercle englobant tient lieu de contour : sans
           lui, un petit groupe serait le seul à ne pas être cerné. */
        forme.setAttribute('d', enveloppe
            ? cheminArrondi(dilater(enveloppe, 14))
            : cercleEnglobant(points, p.rayon + 16));
    });
}

/* ─────────────────────────────────────────────────────────────────────────
   Zoom et déplacement
───────────────────────────────────────────────────────────────────────── */

/**
 * Zoom à la molette et déplacement au cliquer-glisser sur le fond.
 *
 * Le zoom porte sur le point survolé, non sur le centre de la figure :
 * agrandir doit rapprocher de ce qu'on regarde, non déplacer la vue.
 *
 * @param auChangement  reçoit l'échelle, pour découvrir les noms des membres
 */
export function activerZoom(svg, options = {}) {
    const { min = 0.25, max = 8, auChangement = null } = options;
    const racine = svg._racine;
    if (!racine) return null;

    const vue = { k: 1, x: 0, y: 0 };
    /* L'état est exposé pour que l'ajustement automatique puisse s'y
       synchroniser : sans cela, le premier zoom manuel repartirait de
       l'échelle 1 et ferait sauter la figure. */
    svg._vue = vue;

    const appliquer = () => {
        racine.setAttribute('transform',
            `translate(${vue.x},${vue.y}) scale(${vue.k})`);
        auChangement?.(vue.k);
    };

    const versDessin = evt => {
        if (typeof svg.createSVGPoint !== 'function') return null;
        const pt = svg.createSVGPoint();
        pt.x = evt.clientX; pt.y = evt.clientY;
        const m = svg.getScreenCTM();
        return m ? pt.matrixTransform(m.inverse()) : null;
    };

    svg.addEventListener('wheel', evt => {
        evt.preventDefault();
        const p = versDessin(evt);
        if (!p) return;
        const facteur = evt.deltaY < 0 ? 1.18 : 1 / 1.18;
        const k = Math.max(min, Math.min(max, vue.k * facteur));
        if (k === vue.k) return;
        /* Le point sous le curseur doit rester sous le curseur. */
        vue.x = p.x - ((p.x - vue.x) / vue.k) * k;
        vue.y = p.y - ((p.y - vue.y) / vue.k) * k;
        vue.k = k;
        appliquer();
    }, { passive: false });

    let deplacement = null;
    svg.addEventListener('pointerdown', evt => {
        /* Seul le fond déplace la vue : sur un nœud, le geste lui appartient. */
        if (evt.target.closest('.constellation-pole, .constellation-individu')) return;
        deplacement = { x: evt.clientX, y: evt.clientY, vx: vue.x, vy: vue.y };
        svg.style.cursor = 'grabbing';
    });
    svg.addEventListener('pointermove', evt => {
        if (!deplacement) return;
        vue.x = deplacement.vx + (evt.clientX - deplacement.x);
        vue.y = deplacement.vy + (evt.clientY - deplacement.y);
        appliquer();
    });
    const finDeplacement = () => { deplacement = null; svg.style.cursor = ''; };
    svg.addEventListener('pointerup', finDeplacement);
    svg.addEventListener('pointerleave', finDeplacement);

    return {
        vue,
        appliquer,
        reinitialiser() { vue.k = 1; vue.x = 0; vue.y = 0; appliquer(); },
        zoomer(facteur) {
            vue.k = Math.max(min, Math.min(max, vue.k * facteur));
            appliquer();
        },
    };
}

/** Découvre les noms des membres au-delà d'un certain grossissement. */
export function ajusterNoms(svg, echelle, seuil = 2.1) {
    const opacite = echelle > seuil ? Math.min((echelle - seuil) * 1.2, 1) : 0;
    svg.querySelectorAll('.nom-individu').forEach(t => {
        t.setAttribute('opacity', opacite);
    });
    /* Le nom d'un pôle devient illisible une fois très agrandi : il occupe
       alors tout l'anneau. On le réduit à mesure. */
    svg.querySelectorAll('.nom-pole, .effectif-pole').forEach(t => {
        t.setAttribute('opacity', echelle > 5 ? 0.25 : 1);
    });
}


/**
 * Cadre la vue sur le contenu.
 *
 * La simulation ne confine pas les nœuds : les y contraindre les plaquerait
 * contre les bords dès que la disposition s'étend, et la disposition doit
 * pouvoir prendre la place qu'elle demande. C'est donc la vue qui s'ajuste,
 * ce qui est le bon niveau pour traiter la question.
 *
 * @returns l'échelle appliquée, pour régler l'apparition des noms
 */
export function ajusterVue(svg, poles, individus, largeur, hauteur, options = {}) {
    const { marge = 30, maximum = 1.6 } = options;
    const racine = svg._racine;
    if (!racine) return 1;

    const points = [...poles, ...individus];
    if (!points.length) return 1;

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    points.forEach(p => {
        const r = p.rayon || 5;
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
        x0 = Math.min(x0, p.x - r); x1 = Math.max(x1, p.x + r);
        y0 = Math.min(y0, p.y - r); y1 = Math.max(y1, p.y + r);
    });
    if (!Number.isFinite(x0)) return 1;

    /* Les libellés des pôles débordent au-dessus de leur disque. */
    y0 -= 18;

    const l = Math.max(x1 - x0, 1), h = Math.max(y1 - y0, 1);
    /* On n'agrandit pas au-delà d'un certain point : une figure de trois
       groupes occuperait sinon tout le cadre en pastilles géantes. */
    const k = Math.min(maximum, (largeur - marge * 2) / l, (hauteur - marge * 2) / h);
    const tx = largeur / 2 - ((x0 + x1) / 2) * k;
    const ty = hauteur / 2 - ((y0 + y1) / 2) * k;

    racine.setAttribute('transform', `translate(${tx},${ty}) scale(${k})`);
    if (svg._vue) { svg._vue.k = k; svg._vue.x = tx; svg._vue.y = ty; }
    return k;
}
