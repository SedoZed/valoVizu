/**
 * ui/montants.js
 * Figures financières.
 *
 * Deux erreurs successives avant d'arriver là, qu'il vaut mieux consigner que
 * risquer de refaire.
 *
 * La première : traiter un montant comme un champ nominal, rangé en sept
 * tranches fixes et compté en barres. La distribution étant très
 * dissymétrique, les deux premières tranches absorbaient l'essentiel des
 * opérations et les contrats exceptionnels — ce qu'on cherche — disparaissaient
 * dans la dernière. Et rien ne distinguait 26 k€ de 49 k€.
 *
 * La seconde, en réaction : remplacer cela par des figures de distribution —
 * courbe classée, courbe de concentration, boîtes à moustaches. Techniquement
 * plus justes, et moins informatives : elles répondaient à « quelle est la
 * forme statistique de la série », question que personne ne pose, et ne
 * portaient aucun chiffre lisible là où une barre étiquetée en donnait un.
 *
 * Ce que ces deux versions n'ont jamais montré : **combien d'euros, de qui,
 * quand.** C'est-à-dire des montants **cumulés par catégorie**. Le cumul avait
 * été écarté par crainte du double comptage — à tort pour l'essentiel : une
 * opération a une seule année et un seul type de contrat, la somme y est
 * exacte. La difficulté ne concerne que les laboratoires et les partenaires,
 * où une opération compte pour chacun ; le total réel est alors affiché à côté
 * de la somme des barres, et leur écart se lit.
 *
 * Les tranches subsistent en facette, où un seuil arbitraire est sans
 * conséquence puisqu'il ne sert qu'à découper une sélection.
 */

import { el, texte, decrire, ajuster, couleurTheme } from './graphique.js';
import { montrerInfobulle, cacherInfobulle, contenuInfobulle } from './infobulle.js';

const FORMAT_DEFAUT = v => String(Math.round(v));

/* ─────────────────────────────────────────────────────────────────────────
   Échelles et repères
───────────────────────────────────────────────────────────────────────── */

/** Pas « rond » — 1, 2 ou 5 fois une puissance de dix — couvrant une étendue. */
function pasRond(etendue, cible) {
    const brut = (etendue || 1) / Math.max(1, cible);
    const magnitude = Math.pow(10, Math.floor(Math.log10(brut || 1)));
    const n = brut / magnitude;
    const facteur = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return facteur * magnitude;
}

/**
 * Échelle de montants, exprimée en fraction de piste plutôt qu'en pixels :
 * la même sert aux figures verticales et horizontales.
 *
 * L'échelle logarithmique est offerte parce qu'une échelle linéaire, sur des
 * montants dont le rapport dépasse souvent mille, écrase toute la partie
 * basse contre l'axe. Elle n'est pas imposée pour autant — elle trompe l'œil
 * sur les écarts absolus, qui sont ici la chose à mesurer.
 *
 * `fraction` borne son résultat à [0, 1] : une valeur écartée du calcul du
 * maximum le dépasse par construction, et c'est là que les figures de cet
 * outil ont débordé de leur cadre six fois de suite.
 */
export function echelleValeur({ min = 0, max = 1, log = false, cible = 5 }) {
    if (log) {
        const l0 = Math.floor(Math.log10(Math.max(min, 1)));
        const l1 = Math.max(l0 + 1, Math.ceil(Math.log10(Math.max(max, 10))));
        const etendue = l1 - l0;
        const plancher = Math.pow(10, l0), borne = Math.pow(10, l1);
        const graduations = [];
        for (let k = l0; k <= l1; k++) graduations.push(Math.pow(10, k));
        return {
            log: true, plancher, borne, graduations,
            fraction: v => (Math.log10(Math.min(Math.max(v, plancher), borne)) - l0) / etendue,
        };
    }
    const pas = pasRond(max, cible);
    const borne = Math.max(pas, Math.ceil(max / pas) * pas);
    const graduations = [];
    for (let v = 0; v <= borne + pas / 2; v += pas) graduations.push(v);
    return {
        log: false, plancher: 0, borne, graduations,
        fraction: v => Math.max(0, Math.min(v, borne)) / borne,
    };
}

/**
 * Formateur de graduations : une seule unité pour tout l'axe.
 *
 * Le formateur général choisit l'unité montant par montant — ce qu'il faut
 * sur une étiquette, où « 850 € » et « 1,2 M€ » se lisent chacun au mieux.
 * Sur un axe c'est fâcheux : les graduations d'une même échelle sortaient en
 * « 0 », « 5 000 € », « 10 k€ », « 15 k€ », et l'œil doit alors convertir pour
 * comparer deux repères voisins. L'unité se décide donc une fois, sur la borne.
 */
export function graduationsMontant(borne) {
    if (borne >= 1e6) {
        return v => (v === 0 ? '0'
            : `${(v / 1e6).toFixed(v % 1e6 ? 1 : 0).replace('.', ',')} M€`);
    }
    if (borne >= 1e4) return v => (v === 0 ? '0' : `${Math.round(v / 1000)} k€`);
    return v => (v === 0 ? '0' : `${Math.round(v).toLocaleString('fr-FR')} €`);
}

/** Quantile d'une série triée par ordre croissant. */
export function quantile(triees, p) {
    if (!triees.length) return null;
    const i = (triees.length - 1) * p;
    const bas = Math.floor(i), haut = Math.ceil(i);
    if (bas === haut) return triees[bas];
    return triees[bas] + (triees[haut] - triees[bas]) * (i - bas);
}

/**
 * Part des montants portée par les plus grosses opérations.
 * Sert à une carte d'indicateur : l'énoncé — « les 10 % les plus importantes
 * portent 62 % des montants » — se lit d'un coup, là où la courbe de
 * concentration dont il est tiré demandait d'interpréter une diagonale.
 */
export function concentration(montants, part = 0.1) {
    const tries = montants.filter(v => Number.isFinite(v)).sort((a, b) => b - a);
    const total = tries.reduce((s, v) => s + v, 0);
    if (!tries.length || total <= 0) return null;
    const rang = Math.max(1, Math.round(part * tries.length));
    const cumul = tries.slice(0, rang).reduce((s, v) => s + v, 0);
    return { rang, nb: tries.length, part: rang / tries.length, poids: cumul / total, total };
}

/** Écart déterministe autour d'un axe, pour séparer des points confondus. */
function secousse(i, amplitude) {
    /* Pseudo-aléatoire reproductible : un vrai tirage déplacerait les points
       à chaque rendu, et la figure paraîtrait bouger sans raison. */
    const x = Math.sin((i + 1) * 12.9898) * 43758.5453;
    return ((x - Math.floor(x)) - 0.5) * 2 * amplitude;
}

/** Zone transparente qui reçoit le survol et le clic. */
function zoneSensible(attrs, { infobulle, onClic, onMenu, cle,
                              cliquable = false, focusable = true }) {
    const zone = el('rect', { ...attrs, fill: 'transparent' });
    if (infobulle) {
        zone.addEventListener('mousemove', evt => {
            montrerInfobulle(infobulle(), evt.clientX, evt.clientY);
        });
        zone.addEventListener('mouseleave', cacherInfobulle);
    }
    /* Un point de montant n'a pas de valeur à filtrer : son seul geste est
       d'ouvrir le menu de l'opération, posé par `onMenu`. Il doit néanmoins se
       présenter comme cliquable, faute de quoi rien n'indique qu'il y a
       quelque chose à y faire. */
    if (onClic || cliquable) {
        zone.style.cursor = 'pointer';
        zone.setAttribute('role', 'button');
        /* Les points d'une bande se comptent par centaines : les mettre dans
           le parcours au clavier y enfermerait la navigation pour des dizaines
           de tabulations. Ils restent désignables à la souris et décrits aux
           lecteurs d'écran par le rang qui les contient ; le tableau des
           enregistrements offre la même liste, elle, parcourable. */
        if (focusable) zone.setAttribute('tabindex', '0');
    }
    if (onClic) {
        const agir = () => onClic(cle);
        zone.addEventListener('click', agir);
        zone.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); agir(); }
        });
    }
    if (onMenu) onMenu(zone, cle);
    return zone;
}

/** Teinte d'une ligne : gris pour un regroupement ou une absence. */
function teinteLigne(l, { couleurs, couleurPour, choisie }) {
    const gris   = couleurTheme('--encre-3', '#7C8B93');
    const signal = couleurTheme('--signal', '#AE164E');
    const encre  = couleurTheme('--encre', '#16232B');
    if (l.horsEchelle) return gris;
    if (choisie) return signal;
    return couleurs && couleurPour ? couleurPour(l.valeur) : encre;
}

/* ─────────────────────────────────────────────────────────────────────────
   Montants cumulés — colonnes quand la catégorie est ordonnée

   La lecture d'entrée, et celle qui manquait aux deux versions précédentes :
   combien d'euros, et quand. Chaque colonne porte son montant et son nombre
   d'opérations — dix petits contrats et un gros ne se confondent pas.
───────────────────────────────────────────────────────────────────────── */

/**
 * @param options
 *   lignes  [{ valeur, total, nb, autres?, horsEchelle? }] dans l'ordre voulu
 */
export function colonnesMontants(options) {
    const {
        lignes = [], largeur = 720, hauteur = 280, log = false,
        formater = FORMAT_DEFAUT, formaterAxe = null,
        unite = 'opérations', selection = new Set(),
        onClic = null, onMenu = null, onAutres = null,
        couleurs = true, couleurPour = null,
    } = options;

    const marge = { gauche: 62, droite: 12, haut: 18, bas: 42 };
    const zoneX = Math.max(40, largeur - marge.gauche - marge.droite);
    const zoneY = hauteur - marge.haut - marge.bas;

    const svg = el('svg', {
        viewBox: `0 0 ${largeur} ${hauteur}`, width: '100%', height: hauteur,
        role: 'img', class: 'figure figure-montants',
    });
    if (!lignes.length) return svg;

    /* Un regroupement cumule des dizaines de valeurs : le laisser fixer
       l'échelle écraserait toutes les colonnes réelles. Il reste dessiné,
       borné à la piste, avec un chevron de troncature. */
    const utiles = lignes.filter(l => !l.horsEchelle);
    const echelle = echelleValeur({
        min: Math.min(...(utiles.length ? utiles : lignes).map(l => l.total).filter(v => v > 0), 1),
        max: Math.max(...(utiles.length ? utiles : lignes).map(l => l.total), 1), log,
    });
    const y = v => marge.haut + zoneY * (1 - echelle.fraction(v));
    const grad = formaterAxe || graduationsMontant(echelle.borne);

    const filet = couleurTheme('--filet', '#D9DFDD');
    const gris  = couleurTheme('--encre-3', '#7C8B93');
    const carte = couleurTheme('--carte', '#FFFFFF');
    const signal = couleurTheme('--signal', '#AE164E');

    echelle.graduations.forEach(v => {
        svg.appendChild(el('line', {
            x1: marge.gauche, x2: marge.gauche + zoneX, y1: y(v), y2: y(v),
            stroke: filet, 'stroke-width': 1,
            'stroke-dasharray': v === echelle.plancher ? null : '2,3',
        }));
        svg.appendChild(texte(grad(v), {
            x: marge.gauche - 6, y: y(v) + 3.5, 'text-anchor': 'end',
            class: 'figure-axe', fill: gris,
        }));
    });

    const pas = zoneX / lignes.length;
    const largeurColonne = Math.max(4, Math.min(56, pas * 0.64));

    lignes.forEach((l, i) => {
        const x = marge.gauche + i * pas + (pas - largeurColonne) / 2;
        const sommet = y(l.total);
        const h = Math.max(1, marge.haut + zoneY - sommet);
        const choisie = selection.has(l.valeur);
        const teinte = teinteLigne(l, { couleurs, couleurPour, choisie });
        const depasse = l.total > echelle.borne;

        const groupe = el('g', { class: 'colonne', role: 'group' });
        groupe.appendChild(el('rect', {
            x, y: sommet, width: largeurColonne, height: h, rx: 2,
            fill: teinte, 'fill-opacity': l.horsEchelle ? 0.3 : (choisie ? 1 : 0.85),
            stroke: l.horsEchelle ? gris : null,
            'stroke-dasharray': l.horsEchelle ? '3,2' : null,
        }));
        if (depasse) {
            groupe.appendChild(el('path', {
                d: `M ${x + 3} ${marge.haut + 9} l ${largeurColonne / 2 - 3} -5 `
                 + `l ${largeurColonne / 2 - 3} 5 M ${x + 3} ${marge.haut + 14} `
                 + `l ${largeurColonne / 2 - 3} -5 l ${largeurColonne / 2 - 3} 5`,
                fill: 'none', stroke: carte, 'stroke-width': 1.6, 'stroke-linecap': 'round',
            }));
        }

        /* Le montant est écrit, pas seulement dessiné : c'est ce que la
           version en courbes avait perdu. Dedans quand la colonne est assez
           haute, au-dessus sinon. */
        if (largeurColonne >= 26) {
            const dedans = h > 22;
            groupe.appendChild(texte(formater(l.total), {
                x: marge.gauche + i * pas + pas / 2, y: dedans ? sommet + 14 : sommet - 5,
                'text-anchor': 'middle', class: 'figure-valeur',
                fill: dedans ? carte : gris, 'font-weight': dedans ? '500' : null,
            }));
        }

        groupe.appendChild(texte(ajuster(l.valeur, pas - 4, 11.5), {
            x: marge.gauche + i * pas + pas / 2, y: hauteur - marge.bas + 15,
            'text-anchor': 'middle', class: 'figure-axe',
            fill: choisie ? signal : gris,
            'font-style': l.horsEchelle ? 'italic' : null,
        }));
        /* Le nombre d'opérations sous la catégorie : sans lui, une colonne
           haute peut aussi bien être un gros contrat que trente petits. */
        groupe.appendChild(texte(`${l.nb} op.`, {
            x: marge.gauche + i * pas + pas / 2, y: hauteur - marge.bas + 28,
            'text-anchor': 'middle', class: 'figure-axe', fill: gris,
            'fill-opacity': 0.75,
        }));

        groupe.appendChild(zoneSensible({
            x: marge.gauche + i * pas, y: 0, width: pas, height: hauteur,
        }, {
            cle: l.valeur,
            onClic: l.autres && onAutres ? () => onAutres() : onClic,
            /* Seul le regroupement est privé de menu. Une absence en garde un :
               « non renseigné » se masque et se filtre comme une autre valeur,
               et c'est ce que font toutes les autres figures de l'outil. */
            onMenu: l.autres ? null : onMenu,
            infobulle: () => contenuInfobulle({
                titre: l.valeur,
                precision: `${formater(l.total)} — ${l.nb} ${unite}`
                    + (l.nb ? ` · ${formater(l.total / l.nb)} en moyenne` : '')
                    + (depasse ? ` (colonne tronquée : l’échelle s’arrête à `
                                 + `${formater(echelle.borne)})` : ''),
            }),
        }));
        decrire(groupe, `${l.valeur} — ${formater(l.total)}, ${l.nb} ${unite}`);
        svg.appendChild(groupe);
    });

    return svg;
}

/* ─────────────────────────────────────────────────────────────────────────
   Montants cumulés — barres quand les libellés sont longs et sans ordre
───────────────────────────────────────────────────────────────────────── */

export function barresMontants(options) {
    const {
        lignes = [], largeur = 720, log = false, formater = FORMAT_DEFAUT,
        unite = 'opérations', selection = new Set(),
        onClic = null, onMenu = null, onAutres = null,
        couleurs = true, couleurPour = null,
    } = options;

    const hauteurBarre = 22, espace = 8, margeHaut = 6, margeBas = 6;
    const largeurLibelle = Math.min(240, Math.max(120, Math.round(largeur * 0.32)));
    const largeurValeur = 108;
    const piste = Math.max(60, largeur - largeurLibelle - largeurValeur - 16);
    const hauteur = margeHaut + margeBas + lignes.length * (hauteurBarre + espace);

    const svg = el('svg', {
        viewBox: `0 0 ${largeur} ${hauteur}`, width: '100%', height: hauteur,
        role: 'img', class: 'figure figure-montants',
    });
    if (!lignes.length) return svg;

    const utiles = lignes.filter(l => !l.horsEchelle);
    const echelle = echelleValeur({
        min: Math.min(...(utiles.length ? utiles : lignes).map(l => l.total).filter(v => v > 0), 1),
        max: Math.max(...(utiles.length ? utiles : lignes).map(l => l.total), 1), log,
    });

    const gris   = couleurTheme('--encre-3', '#7C8B93');
    const signal = couleurTheme('--signal', '#AE164E');
    const encre  = couleurTheme('--encre', '#16232B');
    const doux   = couleurTheme('--filet-doux', '#EAEEEC');
    const carte  = couleurTheme('--carte', '#FFFFFF');

    lignes.forEach((l, i) => {
        const y = margeHaut + i * (hauteurBarre + espace);
        const milieu = y + hauteurBarre / 2;
        const longueur = Math.max(2, Math.round(piste * echelle.fraction(l.total)));
        const choisie = selection.has(l.valeur);
        const teinte = teinteLigne(l, { couleurs, couleurPour, choisie });
        const depasse = l.total > echelle.borne;

        const groupe = el('g', { class: 'barre', role: 'group' });
        groupe.appendChild(el('rect', {
            x: largeurLibelle, y, width: piste, height: hauteurBarre, fill: doux, rx: 2,
        }));
        groupe.appendChild(el('rect', {
            x: largeurLibelle, y, width: longueur, height: hauteurBarre, rx: 2,
            fill: teinte, 'fill-opacity': l.horsEchelle ? 0.3 : (choisie ? 1 : 0.85),
            stroke: l.horsEchelle ? gris : null,
            'stroke-dasharray': l.horsEchelle ? '3,2' : null,
        }));
        if (depasse) {
            groupe.appendChild(el('path', {
                d: `M ${largeurLibelle + piste - 11} ${milieu - 5} l 5 5 l -5 5 `
                 + `M ${largeurLibelle + piste - 6} ${milieu - 5} l 5 5 l -5 5`,
                fill: 'none', stroke: carte, 'stroke-width': 1.6, 'stroke-linecap': 'round',
            }));
        }
        groupe.appendChild(texte(ajuster(l.valeur, largeurLibelle - 10, 12), {
            x: largeurLibelle - 10, y: milieu + 4, 'text-anchor': 'end',
            class: 'figure-libelle',
            fill: l.horsEchelle ? gris : (choisie ? signal : encre),
            'font-style': l.horsEchelle ? 'italic' : null,
        }));
        groupe.appendChild(texte(formater(l.total), {
            x: largeurLibelle + piste + 8, y: milieu + 4,
            class: 'figure-valeur', fill: encre,
        }));
        groupe.appendChild(texte(`${l.nb} op.`, {
            x: largeur - 4, y: milieu + 4, 'text-anchor': 'end',
            class: 'figure-axe', fill: gris,
        }));

        groupe.appendChild(zoneSensible({
            x: 0, y: y - espace / 2, width: largeur, height: hauteurBarre + espace,
        }, {
            cle: l.valeur,
            onClic: l.autres && onAutres ? () => onAutres() : onClic,
            /* Seul le regroupement est privé de menu. Une absence en garde un :
               « non renseigné » se masque et se filtre comme une autre valeur,
               et c'est ce que font toutes les autres figures de l'outil. */
            onMenu: l.autres ? null : onMenu,
            infobulle: () => contenuInfobulle({
                titre: l.valeur,
                precision: `${formater(l.total)} — ${l.nb} ${unite}`
                    + (l.nb ? ` · ${formater(l.total / l.nb)} en moyenne` : '')
                    + (depasse ? ` (barre tronquée : l’échelle s’arrête à `
                                 + `${formater(echelle.borne)})` : ''),
            }),
        }));
        decrire(groupe, `${l.valeur} — ${formater(l.total)}, ${l.nb} ${unite}`);
        svg.appendChild(groupe);
    });

    return svg;
}

/* ─────────────────────────────────────────────────────────────────────────
   Volume contre valeur

   Sépare ce qu'aucune des deux lectures précédentes ne sépare seule : une
   catégorie faite de beaucoup de petits contrats d'une catégorie qui tient à
   quelques gros. La droite du montant moyen d'ensemble donne la référence —
   au-dessus, les contrats sont plus gros que la moyenne de l'établissement.
───────────────────────────────────────────────────────────────────────── */

export function volumeValeur(options) {
    const {
        points = [], largeur = 720, hauteur = 320, log = false,
        formater = FORMAT_DEFAUT, formaterAxe = null,
        unite = 'opérations', selection = new Set(),
        onClic = null, onMenu = null, couleurs = true, couleurPour = null,
        nbEtiquettes = 8,
    } = options;

    const marge = { gauche: 62, droite: 16, haut: 18, bas: 38 };
    const zoneX = Math.max(40, largeur - marge.gauche - marge.droite);
    const zoneY = hauteur - marge.haut - marge.bas;

    const svg = el('svg', {
        viewBox: `0 0 ${largeur} ${hauteur}`, width: '100%', height: hauteur,
        role: 'img', class: 'figure figure-montants',
    });
    if (!points.length) return svg;

    const utiles = points.filter(p => !p.horsEchelle);
    const base = utiles.length ? utiles : points;
    const echelle = echelleValeur({
        min: Math.min(...base.map(p => p.total).filter(v => v > 0), 1),
        max: Math.max(...base.map(p => p.total), 1), log,
    });
    const nbMax = Math.max(...base.map(p => p.nb), 1);
    /* Un axe de dénombrement ne se gradue pas en fractions : sur trois ou
       quatre catégories, un pas calculé librement valait 0,2 et l'axe sortait
       « 0 0 0 1 1 1 » après arrondi des étiquettes. */
    const pasNb = Math.max(1, Math.round(pasRond(nbMax, 5)));
    const borneNb = Math.max(pasNb, Math.ceil(nbMax / pasNb) * pasNb);
    const x = n => marge.gauche + zoneX * (Math.max(0, Math.min(n, borneNb)) / borneNb);
    const y = v => marge.haut + zoneY * (1 - echelle.fraction(v));
    const grad = formaterAxe || graduationsMontant(echelle.borne);

    const filet = couleurTheme('--filet', '#D9DFDD');
    const gris  = couleurTheme('--encre-3', '#7C8B93');
    const signal = couleurTheme('--signal', '#AE164E');
    const encre = couleurTheme('--encre', '#16232B');
    const carte = couleurTheme('--carte', '#FFFFFF');

    echelle.graduations.forEach(v => {
        svg.appendChild(el('line', {
            x1: marge.gauche, x2: marge.gauche + zoneX, y1: y(v), y2: y(v),
            stroke: filet, 'stroke-width': 1, 'stroke-dasharray': '2,3',
        }));
        svg.appendChild(texte(grad(v), {
            x: marge.gauche - 6, y: y(v) + 3.5, 'text-anchor': 'end',
            class: 'figure-axe', fill: gris,
        }));
    });
    for (let n = 0; n <= borneNb + pasNb / 2; n += pasNb) {
        svg.appendChild(texte(String(Math.round(n)), {
            x: x(n), y: hauteur - marge.bas + 15, 'text-anchor': 'middle',
            class: 'figure-axe', fill: gris,
        }));
    }
    svg.appendChild(texte(`nombre d’${unite}`, {
        x: marge.gauche + zoneX, y: hauteur - 8, 'text-anchor': 'end',
        class: 'figure-axe', fill: gris,
    }));

    /* Droite du montant moyen d'ensemble : sans référence, un nuage de points
       ne dit pas ce qui est « gros ». */
    const totalGlobal = points.reduce((s, p) => s + p.total, 0);
    const nbGlobal = points.reduce((s, p) => s + p.nb, 0);
    const moyenne = nbGlobal ? totalGlobal / nbGlobal : 0;
    if (moyenne > 0) {
        const pointsDroite = [];
        for (let n = 0; n <= borneNb; n += Math.max(1, borneNb / 40)) {
            pointsDroite.push(`${n === 0 ? 'M' : 'L'} ${x(n).toFixed(1)} ${y(n * moyenne).toFixed(1)}`);
        }
        svg.appendChild(el('path', {
            d: pointsDroite.join(' '), fill: 'none', stroke: gris,
            'stroke-width': 1, 'stroke-dasharray': '4,4',
        }));
        svg.appendChild(texte(`montant moyen : ${formater(moyenne)} par opération`, {
            x: marge.gauche + 4, y: marge.haut + 12, class: 'figure-axe', fill: gris,
        }));
    }

    const etiquetes = new Set(points.slice()
        .sort((a, b) => b.total - a.total).slice(0, nbEtiquettes).map(p => p.valeur));

    points.forEach((p, i) => {
        const cx = x(p.nb), cy = y(p.total);
        const choisie = selection.has(p.valeur);
        const teinte = teinteLigne(p, { couleurs, couleurPour, choisie });
        const groupe = el('g', { class: 'barre', role: 'group' });

        groupe.appendChild(el('circle', {
            cx, cy, r: choisie ? 7 : 5.5, fill: teinte,
            'fill-opacity': p.horsEchelle ? 0.35 : (choisie ? 0.95 : 0.7),
            stroke: choisie ? carte : teinte, 'stroke-width': choisie ? 1.6 : 0.8,
        }));
        if (etiquetes.has(p.valeur)) {
            /* L'étiquette se place du côté où il reste de la place. */
            const aDroite = cx < marge.gauche + zoneX * 0.7;
            groupe.appendChild(texte(ajuster(p.valeur, zoneX * 0.3, 11), {
                x: cx + (aDroite ? 9 : -9), y: cy + 4,
                'text-anchor': aDroite ? 'start' : 'end',
                class: 'figure-libelle', fill: choisie ? signal : encre,
            }));
        }
        groupe.appendChild(zoneSensible({
            x: cx - 9, y: cy - 9, width: 18, height: 18,
        }, {
            cle: p.valeur,
            onClic: p.autres ? null : onClic,
            onMenu: p.autres ? null : onMenu,
            infobulle: () => contenuInfobulle({
                titre: p.valeur,
                precision: `${p.nb} ${unite} — ${formater(p.total)} au total, `
                    + `${formater(p.nb ? p.total / p.nb : 0)} en moyenne`,
            }),
        }));
        decrire(groupe, `${p.valeur} — ${p.nb} ${unite}, ${formater(p.total)}`);
        svg.appendChild(groupe);
    });

    return svg;
}

/* ─────────────────────────────────────────────────────────────────────────
   Cumul dans le temps

   Lit la trajectoire quand les colonnes annuelles lisent le rythme. Une
   inflexion de la pente dit un changement d'activité que deux colonnes
   voisines ne montrent pas.
───────────────────────────────────────────────────────────────────────── */

export function cumulTemporel(options) {
    const {
        lignes = [], largeur = 720, hauteur = 280,
        formater = FORMAT_DEFAUT, formaterAxe = null,
        unite = 'opérations', selection = new Set(),
        onClic = null, onMenu = null,
    } = options;

    const marge = { gauche: 62, droite: 14, haut: 18, bas: 30 };
    const zoneX = Math.max(40, largeur - marge.gauche - marge.droite);
    const zoneY = hauteur - marge.haut - marge.bas;

    const svg = el('svg', {
        viewBox: `0 0 ${largeur} ${hauteur}`, width: '100%', height: hauteur,
        role: 'img', class: 'figure figure-montants',
    });
    if (!lignes.length) return svg;

    let cumul = 0;
    const etapes = lignes.map(l => {
        cumul += l.total;
        return { ...l, cumul };
    });
    const echelle = echelleValeur({ min: 0, max: cumul || 1, log: false });
    const pas = zoneX / etapes.length;
    const x = i => marge.gauche + pas * (i + 0.5);
    const y = v => marge.haut + zoneY * (1 - echelle.fraction(v));
    const grad = formaterAxe || graduationsMontant(echelle.borne);

    const filet  = couleurTheme('--filet', '#D9DFDD');
    const gris   = couleurTheme('--encre-3', '#7C8B93');
    const signal = couleurTheme('--signal', '#AE164E');
    const encre  = couleurTheme('--encre', '#16232B');

    echelle.graduations.forEach(v => {
        svg.appendChild(el('line', {
            x1: marge.gauche, x2: marge.gauche + zoneX, y1: y(v), y2: y(v),
            stroke: filet, 'stroke-width': 1, 'stroke-dasharray': v ? '2,3' : null,
        }));
        svg.appendChild(texte(grad(v), {
            x: marge.gauche - 6, y: y(v) + 3.5, 'text-anchor': 'end',
            class: 'figure-axe', fill: gris,
        }));
    });

    const trace = etapes.map((e, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(e.cumul).toFixed(1)}`)
        .join(' ');
    svg.appendChild(el('path', {
        d: `M ${x(0)} ${y(0)} ${trace.replace(/^M/, 'L')} L ${x(etapes.length - 1)} ${y(0)} Z`,
        fill: signal, 'fill-opacity': 0.13, stroke: 'none',
    }));
    svg.appendChild(el('path', {
        d: trace, fill: 'none', stroke: signal, 'stroke-width': 2,
        'stroke-linejoin': 'round',
    }));

    etapes.forEach((e, i) => {
        const choisie = selection.has(e.valeur);
        const groupe = el('g', { class: 'barre', role: 'group' });
        groupe.appendChild(el('circle', {
            cx: x(i), cy: y(e.cumul), r: choisie ? 5 : 3.2,
            fill: signal, 'fill-opacity': 0.95,
        }));
        groupe.appendChild(texte(ajuster(e.valeur, pas - 2, 11.5), {
            x: x(i), y: hauteur - marge.bas + 15, 'text-anchor': 'middle',
            class: 'figure-axe', fill: choisie ? signal : gris,
        }));
        groupe.appendChild(zoneSensible({
            x: marge.gauche + pas * i, y: 0, width: pas, height: hauteur,
        }, {
            cle: e.valeur, onClic, onMenu,
            infobulle: () => contenuInfobulle({
                titre: `Fin ${e.valeur}`,
                precision: `${formater(e.cumul)} cumulés — dont ${formater(e.total)} `
                    + `en ${e.valeur} (${e.nb} ${unite})`,
            }),
        }));
        decrire(groupe, `Fin ${e.valeur} — ${formater(e.cumul)} cumulés`);
        svg.appendChild(groupe);
    });

    svg.appendChild(texte(`${formater(cumul)} au total`, {
        x: marge.gauche + zoneX, y: marge.haut + 12, 'text-anchor': 'end',
        class: 'figure-valeur', fill: encre,
    }));
    return svg;
}

/* ─────────────────────────────────────────────────────────────────────────
   Bande de dispersion

   Remplace à elle seule trois figures écartées : la répartition classée, les
   boîtes à moustaches et le nuage temporel. Les trois disaient la même chose
   — où se tient le gros du portefeuille et ce qui en sort — de trois manières
   abstraites. Ici les points sont les opérations elles-mêmes, sur un axe
   gradué en euros ; la médiane et l'intervalle interquartile sont marqués
   discrètement derrière, comme repères et non comme résumé.

   C'est aussi la seule lecture qui n'additionne rien : une opération portée
   par deux laboratoires apparaît dans les deux rangs sans fausser aucune
   médiane, là où un cumul compterait ses euros deux fois.
───────────────────────────────────────────────────────────────────────── */

/**
 * @param options
 *   groupes  [{ valeur, points: [{ cle, titre, montant, lignes? }], horsEchelle? }]
 *            Un seul groupe de libellé vide pour la sélection entière.
 */
export function bandeDispersion(options) {
    const {
        groupes = [], largeur = 720, log = false, formater = FORMAT_DEFAUT,
        formaterAxe = null, unite = 'opérations', selection = new Set(),
        onClic = null, onMenu = null, onMenuPoint = null,
        couleurs = true, couleurPour = null,
    } = options;

    const hauteurRang = 48, margeHaut = 10, margeBas = 32;
    const avecLibelle = groupes.some(g => g.valeur);
    const largeurLibelle = avecLibelle
        ? Math.min(220, Math.max(110, Math.round(largeur * 0.26))) : 8;
    const margeDroite = 16;
    const piste = Math.max(60, largeur - largeurLibelle - margeDroite);
    const hauteur = margeHaut + margeBas + groupes.length * hauteurRang;

    const svg = el('svg', {
        viewBox: `0 0 ${largeur} ${hauteur}`, width: '100%', height: hauteur,
        role: 'img', class: 'figure figure-montants',
    });
    if (!groupes.length) return svg;

    const utiles = groupes.filter(g => !g.horsEchelle);
    const reference = (utiles.length ? utiles : groupes).flatMap(g => g.points.map(p => p.montant));
    const echelle = echelleValeur({
        min: Math.min(...reference.filter(v => v > 0), 1),
        max: Math.max(...reference, 1), log,
    });
    const x = v => largeurLibelle + piste * echelle.fraction(v);
    const grad = formaterAxe || graduationsMontant(echelle.borne);

    const filet  = couleurTheme('--filet', '#D9DFDD');
    const doux   = couleurTheme('--filet-doux', '#EAEEEC');
    const gris   = couleurTheme('--encre-3', '#7C8B93');
    const signal = couleurTheme('--signal', '#AE164E');
    const encre  = couleurTheme('--encre', '#16232B');

    echelle.graduations.forEach(v => {
        svg.appendChild(el('line', {
            x1: x(v), x2: x(v), y1: margeHaut, y2: hauteur - margeBas,
            stroke: filet, 'stroke-width': 1, 'stroke-dasharray': '2,3',
        }));
        svg.appendChild(texte(grad(v), {
            x: x(v), y: hauteur - margeBas + 15, 'text-anchor': 'middle',
            class: 'figure-axe', fill: gris,
        }));
    });
    if (log) {
        svg.appendChild(texte('échelle logarithmique', {
            x: largeurLibelle + piste, y: hauteur - 6, 'text-anchor': 'end',
            class: 'figure-axe', fill: gris, 'font-style': 'italic',
        }));
    }

    groupes.forEach((g, rang) => {
        const haut = margeHaut + rang * hauteurRang;
        const axe = haut + hauteurRang / 2;
        const choisi = selection.has(g.valeur);
        const teinte = teinteLigne(g, { couleurs, couleurPour, choisie: choisi });
        const triees = g.points.map(p => p.montant).sort((a, b) => a - b);
        const q1 = quantile(triees, 0.25), med = quantile(triees, 0.5),
              q3 = quantile(triees, 0.75);

        const groupe = el('g', { class: 'barre', role: 'group' });

        if (rang % 2 === 1) {
            groupe.appendChild(el('rect', {
                x: largeurLibelle, y: haut, width: piste, height: hauteurRang,
                fill: doux, 'fill-opacity': 0.55,
            }));
        }

        /* Intervalle interquartile en fond, médiane en trait : des repères
           derrière les points, non un résumé à leur place. */
        if (triees.length >= 5) {
            groupe.appendChild(el('rect', {
                x: x(q1), y: axe - 15, width: Math.max(1, x(q3) - x(q1)), height: 30,
                fill: teinte, 'fill-opacity': 0.1, rx: 2,
            }));
            groupe.appendChild(el('line', {
                x1: x(med), x2: x(med), y1: axe - 16, y2: axe + 16,
                stroke: teinte, 'stroke-width': 1.6, 'stroke-opacity': 0.55,
            }));
        }

        g.points.forEach((p, i) => {
            const cx = x(p.montant);
            const cy = axe + secousse(i + rang * 97, 12);
            /* Une zone par opération : c'est ce qui rend la bande
               interrogeable — sans elle, on voit une forme sans pouvoir
               nommer aucun contrat.
               Elle précède le disque, et le disque ne reçoit pas le pointeur :
               la feuille de style peut alors mettre en valeur le point survolé
               par le sélecteur d'adjacence, ce qu'un disque posé au-dessus de
               sa zone interdirait. */
            groupe.appendChild(zoneSensible({
                x: cx - 5, y: cy - 5, width: 10, height: 10,
                class: 'zone-operation',
            }, {
                cle: p.cle, onMenu: onMenuPoint, cliquable: !!onMenuPoint,
                focusable: false,
                infobulle: () => contenuInfobulle({
                    titre: p.titre,
                    precision: formater(p.montant) + (g.valeur ? ` — ${g.valeur}` : ''),
                    elements: p.lignes || [],
                }),
            }));
            groupe.appendChild(el('circle', {
                cx, cy, r: 3, fill: teinte,
                'fill-opacity': g.horsEchelle ? 0.28 : 0.42,
                class: 'point-operation', 'pointer-events': 'none',
            }));
        });

        if (avecLibelle) {
            groupe.appendChild(texte(ajuster(g.valeur, largeurLibelle - 10, 12), {
                x: largeurLibelle - 10, y: axe - 2, 'text-anchor': 'end',
                class: 'figure-libelle',
                fill: g.horsEchelle ? gris : (choisi ? signal : encre),
                'font-style': g.horsEchelle ? 'italic' : null,
            }));
            groupe.appendChild(texte(`${g.points.length} op.`, {
                x: largeurLibelle - 10, y: axe + 11, 'text-anchor': 'end',
                class: 'figure-axe', fill: gris,
            }));
            /* Seul le libellé filtre : la bande elle-même est couverte de
               zones d'opérations, et un clic dans le vide ne doit pas
               déclencher un filtrage qu'on n'a pas visé. */
            groupe.appendChild(zoneSensible({
                x: 0, y: haut, width: largeurLibelle, height: hauteurRang,
            }, {
                cle: g.valeur,
                onClic: g.autres ? null : onClic,
                onMenu: g.autres ? null : onMenu,
                infobulle: () => contenuInfobulle({
                    titre: g.valeur,
                    precision: `${g.points.length} ${unite}`
                        + (triees.length >= 5
                            ? ` — médiane ${formater(med)}, quartiles `
                              + `${formater(q1)} – ${formater(q3)}`
                            : ` — ${triees.map(formater).join(', ')}`),
                }),
            }));
        }

        decrire(groupe, `${g.valeur || 'Ensemble'} — ${g.points.length} ${unite}`
            + (triees.length >= 5 ? `, médiane ${formater(med)}` : ''));
        svg.appendChild(groupe);
    });

    return svg;
}

/* ─────────────────────────────────────────────────────────────────────────
   Les plus gros contrats

   Les quatre lectures précédentes montrent des formes ; celle-ci nomme. Elle
   porte les deux montants l'un dans l'autre — le total du contrat et la part
   de l'établissement —, leur écart se lisant alors contrat par contrat.
───────────────────────────────────────────────────────────────────────── */

/**
 * @param options
 *   points  [{ cle, titre, sousTitre, montant, autre }]
 *           `montant` est la grandeur choisie, `autre` la seconde ou null.
 */
export function classementMontants(options) {
    const {
        points = [], largeur = 720, nb = 15, formater = FORMAT_DEFAUT,
        libelleMontant = 'montant', libelleAutre = 'autre montant',
        onMenu = null,
    } = options;

    const tries = points.slice().sort((a, b) => b.montant - a.montant).slice(0, nb);
    const hauteurLigne = 32, margeHaut = 6, margeBas = 6;
    const largeurLibelle = Math.min(300, Math.max(140, Math.round(largeur * 0.38)));
    const largeurValeur = 84;
    const piste = Math.max(60, largeur - largeurLibelle - largeurValeur - 16);
    const hauteur = margeHaut + margeBas + tries.length * hauteurLigne;

    const svg = el('svg', {
        viewBox: `0 0 ${largeur} ${hauteur}`, width: '100%', height: hauteur,
        role: 'img', class: 'figure figure-montants',
    });
    if (!tries.length) return svg;

    const max = Math.max(...tries.map(p => Math.max(p.montant, p.autre ?? 0)), 1);
    const signal = couleurTheme('--signal', '#AE164E');
    const gris   = couleurTheme('--encre-3', '#7C8B93');
    const encre  = couleurTheme('--encre', '#16232B');
    const doux   = couleurTheme('--filet-doux', '#EAEEEC');

    tries.forEach((p, i) => {
        const y = margeHaut + i * hauteurLigne;
        const milieu = y + hauteurLigne / 2;
        const aDeux = Number.isFinite(p.autre);
        const externe = aDeux ? Math.max(p.montant, p.autre) : p.montant;
        const interne = aDeux ? Math.min(p.montant, p.autre) : null;

        const groupe = el('g', { class: 'barre', role: 'group' });
        groupe.appendChild(el('rect', {
            x: largeurLibelle, y: milieu - 9, width: piste, height: 18, fill: doux, rx: 2,
        }));
        /* Barre externe : le plus élevé des deux montants, en teinte claire.
           Barre interne : le plus faible, pleine. L'imbrication rend l'écart
           lisible sans exiger de comparer deux barres distantes. */
        groupe.appendChild(el('rect', {
            x: largeurLibelle, y: milieu - 9,
            width: Math.max(2, Math.round(piste * (externe / max))), height: 18, rx: 2,
            fill: signal, 'fill-opacity': aDeux ? 0.3 : 0.82,
        }));
        if (interne !== null) {
            groupe.appendChild(el('rect', {
                x: largeurLibelle, y: milieu - 6,
                width: Math.max(2, Math.round(piste * (interne / max))), height: 12, rx: 2,
                fill: signal, 'fill-opacity': 0.9,
            }));
        }

        groupe.appendChild(texte(`${i + 1}. ${ajuster(p.titre, largeurLibelle - 30, 12)}`, {
            x: largeurLibelle - 10, y: milieu - 1, 'text-anchor': 'end',
            class: 'figure-libelle', fill: encre,
        }));
        if (p.sousTitre) {
            groupe.appendChild(texte(ajuster(p.sousTitre, largeurLibelle - 10, 10), {
                x: largeurLibelle - 10, y: milieu + 11, 'text-anchor': 'end',
                class: 'figure-axe', fill: gris,
            }));
        }
        groupe.appendChild(texte(formater(p.montant), {
            x: largeurLibelle + piste + 8, y: milieu + 4,
            class: 'figure-valeur', fill: encre,
        }));

        groupe.appendChild(zoneSensible({
            x: 0, y, width: largeur, height: hauteurLigne,
        }, {
            cle: p.cle, onMenu, cliquable: !!onMenu,
            infobulle: () => contenuInfobulle({
                titre: p.titre,
                precision: `${libelleMontant} : ${formater(p.montant)}`
                    + (aDeux ? ` · ${libelleAutre} : ${formater(p.autre)}` : ''),
                elements: p.lignes || [],
            }),
        }));
        decrire(groupe, `${i + 1}. ${p.titre} — ${formater(p.montant)}`);
        svg.appendChild(groupe);
    });

    return svg;
}
