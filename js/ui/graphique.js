/**
 * ui/graphique.js
 * Figures en SVG, sans bibliothèque.
 *
 * Parti pris de lecture : une seule couleur d'encre pour les barres. La
 * couleur ne code rien tant qu'elle n'a rien à coder — un camaïeu par
 * catégorie laisse croire à une information supplémentaire qui n'existe pas.
 * Elle n'est employée que dans les colonnes empilées, où elle distingue
 * réellement des séries, et pour marquer la sélection.
 *
 * Chaque barre est cliquable : la figure sert autant à filtrer qu'à lire.
 */

import { estAbsence } from '../core/champs.js';
import { LIBELLE_AUTRES } from '../core/groupe.js';
import { montrerInfobulle, deplacerInfobulle, cacherInfobulle,
         contenuInfobulle } from './infobulle.js';

const NS = 'http://www.w3.org/2000/svg';

/* Couleurs reprises de la feuille de style, résolues à l'exécution pour que
   les figures suivent le thème sans le dupliquer. */
function couleur(nom, repli) {
    if (typeof getComputedStyle !== 'function') return repli;
    const v = getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
    return v || repli;
}

/* Palette des séries. Les teintes sont choisies dans une plage de luminance
   moyenne : suffisamment sombres pour se détacher d'un fond clair, assez
   claires pour rester visibles en thème sombre. Une palette réglée sur le
   seul thème clair devient illisible sur fond foncé — un test le vérifie
   pour chacune des deux couleurs de fond. */
/**
 * Couleur stable d'une valeur.
 *
 * La teinte est tirée du libellé lui-même : une même valeur reçoit donc
 * partout la même couleur, d'une figure à l'autre et d'une séance à l'autre.
 * C'est ce qui donne son utilité à la couleur ici — repérer un laboratoire
 * d'un panneau au suivant sans relire les libellés — au lieu d'un simple
 * agrément. Un tirage par rang d'affichage aurait l'effet inverse : la même
 * valeur changerait de teinte dès qu'un filtre modifie le classement.
 *
 * Le mode sobre reste disponible, pour les figures destinées à l'impression
 * ou lorsque la couleur n'apporte rien.
 */
export function couleurDe(valeur, palette) {
    /* `couleurs.map(couleurDe)` passe l'index en second argument : sans cette
       précaution, il serait pris pour la palette et toutes les valeurs
       recevraient la même teinte, sans qu'aucune erreur ne le signale. */
    const teintes = Array.isArray(palette) && palette.length ? palette : PALETTE_SERIES;
    const texte = String(valeur ?? '');
    let h = 2166136261;
    for (let i = 0; i < texte.length; i++) {
        h ^= texte.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return teintes[Math.abs(h) % teintes.length];
}

export const PALETTE_SERIES = [
    '#1F8A76', '#C4622D', '#4C7BB5', '#B08A2E', '#8B6BA8',
    '#2E9E8F', '#A8664A', '#5E8FD0', '#C79A3C', '#7D77B8',
    '#3E9E5B', '#C0506B', '#3D8FA8', '#9A7B3A', '#6E8BC4',
    '#57A06C', '#B4566B', '#4E9FB0', '#8E7BA0', '#C1793F',
    '#2F8DA0', '#A15C8C', '#77A046', '#5B7FA8',
];

/**
 * Attribue une couleur distincte à chacune des valeurs données.
 *
 * La teinte tirée du seul libellé garantit la stabilité mais pas la
 * distinction : deux valeurs affichées côte à côte peuvent tomber sur la même
 * case de la palette, et la couleur cesse alors de distinguer quoi que ce
 * soit — c'est précisément ce qu'on lui demande. On part donc de la teinte
 * préférée, puis on avance dans la palette tant qu'elle est déjà prise.
 *
 * Le résultat reste déterministe pour un même ensemble de valeurs. Il peut
 * varier si l'ensemble change, ce qui est le prix de la distinction ; entre
 * deux figures portant les mêmes valeurs, les teintes concordent.
 */
/**
 * Attribution contrastée, pour les séries qui se touchent.
 *
 * Dans un empilement, deux segments voisins se jouxtent sans séparation : des
 * teintes proches y deviennent indiscernables, là où elles restaient lisibles
 * sur des barres séparées par du blanc. Les couleurs sont donc prises à
 * intervalles réguliers dans la palette plutôt qu'au plus près de la teinte
 * préférée de chaque valeur — on renonce à la stabilité inter-figures, qui ne
 * vaut pas la lisibilité quand le nombre de séries est faible.
 */
function composantes(hex) {
    const c = hex.replace('#', '');
    return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16));
}

/** Écart perceptuel entre deux teintes, approché sur les composantes. */
function ecart(a, b) {
    const [r1, g1, b1] = composantes(a);
    const [r2, g2, b2] = composantes(b);
    /* Pondération approchant la sensibilité de l'œil : le vert pèse plus que
       le bleu dans la perception d'une différence. */
    return Math.sqrt(2 * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + 3 * (b1 - b2) ** 2);
}

/** Éclaircit puis assombrit une teinte, selon le tour de reprise. */
function nuancer(hex, tour) {
    const facteur = tour % 2 === 1 ? 1 + 0.3 * Math.ceil(tour / 2)
                                   : 1 - 0.22 * (tour / 2);
    const ajuste = composantes(hex)
        .map(c => Math.max(0, Math.min(255, Math.round(c * facteur))));
    return '#' + ajuste.map(c => c.toString(16).padStart(2, '0')).join('');
}

export function attribuerCouleursContrastees(valeurs, palette = PALETTE_SERIES) {
    const distinctes = [...new Set(valeurs)]
        .filter(Boolean).filter(v => !estAbsence(v) && !estRegroupement(v))
        .sort((a, b) => String(a).localeCompare(String(b), 'fr'));

    /* Sélection gloutonne : on part de la première teinte, puis on retient à
       chaque tour celle qui est la plus éloignée de toutes les précédentes.
       Espacer régulièrement les indices ne suffit pas — la palette n'étant pas
       rangée par teinte, deux indices éloignés peuvent tomber sur des couleurs
       voisines, et c'est précisément ce que je constatais. */
    const retenues = [];
    const restantes = [...palette];
    if (restantes.length) retenues.push(restantes.shift());

    while (retenues.length < distinctes.length && restantes.length) {
        let meilleure = 0, meilleurEcart = -1;
        restantes.forEach((teinte, i) => {
            const proximite = Math.min(...retenues.map(r => ecart(r, teinte)));
            if (proximite > meilleurEcart) { meilleurEcart = proximite; meilleure = i; }
        });
        retenues.push(restantes.splice(meilleure, 1)[0]);
    }

    const attribuees = new Map();
    const nb = Math.max(retenues.length, 1);
    distinctes.forEach((valeur, i) => {
        const base = retenues[i % nb] || palette[0];
        /* Plus de séries que de teintes : plutôt que de répéter une couleur à
           l'identique — deux séries deviendraient alors indiscernables — on
           en éclaircit ou en assombrit la reprise. */
        const tour = Math.floor(i / nb);
        attribuees.set(valeur, tour === 0 ? base : nuancer(base, tour));
    });
    return attribuees;
}

export function attribuerCouleurs(valeurs, palette = PALETTE_SERIES) {
    const attribuees = new Map();
    const prises = new Set();

    /* Ordre stable : sans tri, l'attribution dépendrait de l'ordre
       d'affichage, qui change avec les filtres. */
    [...new Set(valeurs)]
        .filter(Boolean)
        /* Une absence reçoit un gris neutre au dessin : lui attribuer une
           teinte de la palette la ferait passer pour une catégorie et
           consommerait une couleur au détriment des vraies valeurs. */
        .filter(v => !estAbsence(v) && !estRegroupement(v))
        .sort((a, b) => String(a).localeCompare(String(b), 'fr'))
        .forEach(valeur => {
            const prefere = palette.indexOf(couleurDe(valeur, palette));
            for (let i = 0; i < palette.length; i++) {
                const indice = (prefere + i) % palette.length;
                if (prises.has(indice)) continue;
                prises.add(indice);
                attribuees.set(valeur, palette[indice]);
                return;
            }
            /* Plus de valeurs que de teintes : on retombe sur la teinte
               préférée, quitte à répéter. Mieux vaut une répétition tardive
               qu'une valeur sans couleur. */
            attribuees.set(valeur, palette[prefere] || palette[0]);
        });

    return attribuees;
}

function el(nom, attrs = {}) {
    const e = document.createElementNS(NS, nom);
    Object.entries(attrs).forEach(([k, v]) => {
        if (v !== null && v !== undefined) e.setAttribute(k, String(v));
    });
    return e;
}

/**
 * Décrit un élément sans déclencher l'infobulle du navigateur.
 *
 * Un `<title>` SVG produit une bulle native, qui doublait la nôtre là où les
 * deux coexistaient — deux textes superposés, l'un tardif et pauvre, l'autre
 * immédiat et détaillé. L'attribut `aria-label` porte la même description aux
 * lecteurs d'écran sans rien afficher.
 */
function decrire(element, contenu) {
    element.setAttribute('aria-label', contenu);
    if (!element.getAttribute('role')) element.setAttribute('role', 'img');
    return element;
}

function texte(contenu, attrs = {}) {
    const t = el('text', attrs);
    t.textContent = contenu;
    return t;
}

/**
 * Une valeur doit-elle être écartée du calcul d'échelle ?
 *
 * Un regroupement cumule des dizaines de valeurs et une absence compte une
 * lacune : ni l'un ni l'autre n'est une valeur comparable aux autres, et les
 * laisser fixer le maximum écrase toutes les barres réelles. Ils restent
 * dessinés — bornés à la piste, avec un repère de troncature — mais ne
 * commandent plus l'échelle.
 */
/**
 * Cette valeur désigne-t-elle un regroupement ?
 *
 * Une ligne le signale par un drapeau, mais une *série* n'a que son nom : dans
 * un empilement, rien ne distinguait « Autres » d'un statut ordinaire, et il
 * recevait une teinte de la palette au lieu du gris qu'il porte partout
 * ailleurs. Le nom sert donc de reconnaissance de dernier recours.
 */
export function estRegroupement(valeur, ligne = null) {
    if (ligne?.autres) return true;
    const nom = String(valeur ?? '');
    return nom === LIBELLE_AUTRES || nom.startsWith(LIBELLE_AUTRES + ' (');
}

export function horsEchelle(valeur, ligne = null) {
    return estRegroupement(valeur, ligne) || estAbsence(valeur);
}

/** Maximum d'un ensemble de lignes, regroupements et absences écartés. */
export function maximumUtile(lignes, valeurDe = l => l.effectif, nomDe = l => l.valeur) {
    const retenues = lignes.filter(l => !horsEchelle(nomDe(l), l));
    const source = retenues.length ? retenues : lignes;
    return Math.max(...source.map(valeurDe), 1);
}

/** Largeur approximative d'un texte, faute de pouvoir la mesurer hors rendu. */
function largeurApprox(chaine, taille) {
    return String(chaine).length * taille * 0.54;
}

/** Raccourcit un libellé pour tenir dans une largeur donnée. */
function ajuster(chaine, largeur, taille) {
    const s = String(chaine);
    if (largeurApprox(s, taille) <= largeur) return s;
    const max = Math.max(3, Math.floor(largeur / (taille * 0.54)) - 1);
    return s.slice(0, max) + '…';
}

/* ─────────────────────────────────────────────────────────────────────────
   Barres horizontales — pour les catégories aux libellés longs
───────────────────────────────────────────────────────────────────────── */

/**
 * @param options
 *   lignes      [{ valeur, effectif, autres?, membres? }]
 *   largeur     largeur disponible
 *   selection   Set des valeurs sélectionnées
 *   unite       mot employé dans les infobulles
 *   onClic      (valeur) => void
 *   onAutres    () => void, appelé au clic sur le regroupement
 */
export function barresHorizontales(options) {
    const {
        lignes = [], largeur = 640, selection = new Set(),
        unite = 'éléments', onClic = null, onAutres = null, onMenu = null,
        couleurs = true, couleurPour = null,
    } = options;
    const teinteDe = v => (couleurPour ? couleurPour(v) : couleurDe(v));

    const hauteurBarre = 22, espace = 6, margeHaut = 6, margeBas = 4;
    const largeurLibelle = Math.min(240, Math.max(120, Math.round(largeur * 0.34)));
    const largeurValeur  = 52;
    const largeurPiste   = Math.max(60, largeur - largeurLibelle - largeurValeur - 16);
    const hauteur = margeHaut + margeBas + lignes.length * (hauteurBarre + espace);

    const svg = el('svg', {
        viewBox: `0 0 ${largeur} ${hauteur}`, width: '100%', height: hauteur,
        role: 'img', class: 'figure',
    });

    /* Le regroupement « Autres » cumule des dizaines de valeurs : le laisser
       fixer l'échelle écrase toutes les barres réelles — c'est le cas dès
       qu'on masque la valeur dominante, où « Autres » devient le maximum et
       où les barres restantes n'occupent plus que quelques pour cent. On
       calibre donc sur les valeurs détaillées, et la barre du regroupement
       est signalée comme dépassant le cadre. */
    const max = maximumUtile(lignes);
    const encre  = couleur('--encre',   '#16232B');
    const signal = couleur('--signal',  '#0B6E5F');
    const doux   = couleur('--filet-doux', '#EAEEEC');
    const gris   = couleur('--encre-3', '#7C8B93');

    lignes.forEach((ligne, i) => {
        const y = margeHaut + i * (hauteurBarre + espace);
        const choisi = selection.has(ligne.valeur);
        const absente = estAbsence(ligne.valeur);
        const large = Math.max(1, Math.round(largeurPiste * Math.min(ligne.effectif, max) / max));

        const groupe = el('g', { class: 'barre' + (ligne.autres ? ' barre-autres' : '') });
        groupe.setAttribute('tabindex', '0');
        groupe.setAttribute('role', 'button');

        const titre = el('title');
        titre.textContent = (ligne.autres
            ? `${ligne.valeur} — ${ligne.effectif} ${unite}, ${ligne.membres?.length ?? 0} valeurs regroupées`
            : `${ligne.valeur} — ${ligne.effectif} ${unite}`)
            + (ligne.effectif > max ? ` (barre tronquée : l’échelle s’arrête à ${max})` : '');
        groupe.appendChild(titre);

        /* Zone cliquable couvrant toute la ligne, pas seulement la barre :
           viser une barre courte serait pénible. */
        groupe.appendChild(el('rect', {
            x: 0, y: y - espace / 2, width: largeur, height: hauteurBarre + espace,
            fill: 'transparent', class: 'barre-zone',
        }));

        const lib = texte(ajuster(ligne.valeur, largeurLibelle - 8, 12.5), {
            x: largeurLibelle - 8, y: y + hauteurBarre / 2 + 4,
            'text-anchor': 'end', class: 'figure-libelle',
            'font-style': ligne.autres ? 'italic' : null,
            fill: (ligne.autres || absente) ? gris : (choisi ? signal : encre),
            'fill-opacity': absente ? 0.75 : 1,
        });
        groupe.appendChild(lib);

        groupe.appendChild(el('rect', {
            x: largeurLibelle, y, width: largeurPiste, height: hauteurBarre,
            fill: doux, rx: 2,
        }));

        const depasse = ligne.effectif > max;
        const largeReelle = Math.min(large, largeurPiste);
        const teinte = ligne.autres ? gris
                     : absente ? gris
                     : choisi ? signal
                     : (couleurs ? teinteDe(ligne.valeur) : encre);
        groupe.appendChild(el('rect', {
            x: largeurLibelle, y, width: largeReelle, height: hauteurBarre,
            fill: teinte,
            /* L'absence se distingue du regroupement : plus effacée encore,
               et hachurée. « Autres » réunit des valeurs, une absence n'en
               contient aucune — deux choses qui ne doivent pas se ressembler. */
            'fill-opacity': absente ? 0.28 : ligne.autres ? 0.45 : (choisi ? 1 : 0.86),
            'stroke': absente ? gris : null,
            'stroke-width': absente ? 1 : null,
            'stroke-dasharray': absente ? '3,2' : null,
            rx: 2, class: 'barre-remplissage',
        }));

        /* Une barre qui sort du cadre est marquée comme telle : sans ce
           repère, on lirait sa longueur comme une valeur comparable aux
           autres alors qu'elle est tronquée. */
        if (depasse) {
            const bord = largeurLibelle + largeurPiste;
            groupe.appendChild(el('path', {
                d: `M ${bord - 9} ${y + 3} l 5 ${hauteurBarre / 2 - 3} l -5 ${hauteurBarre / 2 - 3} `
                 + `M ${bord - 4} ${y + 3} l 5 ${hauteurBarre / 2 - 3} l -5 ${hauteurBarre / 2 - 3}`,
                fill: 'none', stroke: 'var(--carte)', 'stroke-width': 1.6,
                'stroke-linecap': 'round',
            }));
        }

        groupe.appendChild(texte(ligne.effectif, {
            x: largeurLibelle + largeurPiste + 8, y: y + hauteurBarre / 2 + 4,
            class: 'figure-valeur', fill: gris,
        }));

        const agir = () => {
            if (ligne.autres) onAutres?.();
            else onClic?.(ligne.valeur);
        };
        groupe.addEventListener('click', agir);
        groupe.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); agir(); }
        });
        if (onMenu && !ligne.autres) onMenu(groupe, ligne.valeur);

        svg.appendChild(groupe);
    });

    return svg;
}

/* ─────────────────────────────────────────────────────────────────────────
   Colonnes — pour les séries ordonnées, les années au premier chef
───────────────────────────────────────────────────────────────────────── */

export function colonnes(options) {
    const {
        lignes = [], largeur = 640, hauteur = 220, selection = new Set(),
        unite = 'éléments', onClic = null, onMenu = null, couleurs = true,
        couleurPour = null,
    } = options;
    const teinteDe = v => (couleurPour ? couleurPour(v) : couleurDe(v));

    const margeBas = 26, margeHaut = 18;
    const n = lignes.length || 1;
    const pas = largeur / n;
    const largeurColonne = Math.max(4, Math.min(52, pas * 0.62));

    const svg = el('svg', {
        viewBox: `0 0 ${largeur} ${hauteur}`, width: '100%', height: hauteur,
        role: 'img', class: 'figure',
    });

    /* Même calibrage que les barres : un regroupement cumulé ne doit pas
       fixer l'échelle des colonnes réelles. */
    const max = maximumUtile(lignes);
    const zoneUtile = hauteur - margeBas - margeHaut;
    const encre  = couleur('--encre',  '#16232B');
    const signal = couleur('--signal', '#0B6E5F');
    const gris   = couleur('--encre-3', '#7C8B93');
    const filet  = couleur('--filet',  '#D9DFDD');
    const doux   = couleur('--filet-doux', '#EAEEEC');

    /* Piste de fond derrière chaque colonne : elle matérialise le maximum de
       l'échelle, ce qui rend les petites valeurs comparables entre elles au
       lieu de flotter au-dessus de la ligne de base. */
    lignes.forEach((_, i) => {
        svg.appendChild(el('rect', {
            x: i * pas + (pas - largeurColonne) / 2, y: margeHaut,
            width: largeurColonne, height: zoneUtile,
            fill: doux, rx: 2,
        }));
    });

    /* Ligne de base : sans elle, les colonnes flottent. */
    svg.appendChild(el('line', {
        x1: 0, x2: largeur, y1: hauteur - margeBas, y2: hauteur - margeBas,
        stroke: filet, 'stroke-width': 1,
    }));

    lignes.forEach((ligne, i) => {
        const h = Math.max(1, Math.round(zoneUtile * Math.min(ligne.effectif, max) / max));
        const depasse = ligne.effectif > max;
        const x = i * pas + (pas - largeurColonne) / 2;
        const y = hauteur - margeBas - h;
        const choisi = selection.has(ligne.valeur);

        const groupe = el('g', { class: 'colonne', tabindex: '0', role: 'button' });
        const titre = el('title');
        titre.textContent = `${ligne.valeur} — ${ligne.effectif} ${unite}`
            + (depasse ? ` (colonne tronquée : l’échelle s’arrête à ${max})` : '');
        groupe.appendChild(titre);

        groupe.appendChild(el('rect', {
            x: i * pas, y: 0, width: pas, height: hauteur,
            fill: 'transparent', class: 'colonne-zone',
        }));

        groupe.appendChild(el('rect', {
            x, y, width: largeurColonne, height: h, rx: 2,
            fill: estAbsence(ligne.valeur) ? gris
                : choisi ? signal
                : (couleurs ? teinteDe(ligne.valeur) : encre),
            'fill-opacity': estAbsence(ligne.valeur) ? 0.28 : (choisi ? 1 : 0.86),
            'stroke': estAbsence(ligne.valeur) ? gris : null,
            'stroke-dasharray': estAbsence(ligne.valeur) ? '3,2' : null,
            class: 'colonne-remplissage',
        }));

        /* Chevrons de dépassement, comme pour les barres. */
        if (depasse) {
            groupe.appendChild(el('path', {
                d: `M ${x + 3} ${margeHaut + 9} l ${largeurColonne / 2 - 3} -5 l ${largeurColonne / 2 - 3} 5 `
                 + `M ${x + 3} ${margeHaut + 14} l ${largeurColonne / 2 - 3} -5 l ${largeurColonne / 2 - 3} 5`,
                fill: 'none', stroke: 'var(--carte)', 'stroke-width': 1.6,
                'stroke-linecap': 'round',
            }));
        }

        /* La valeur est toujours lisible : au-dessus de la colonne quand la
           place le permet, à l'intérieur sinon. Une colonne dont on doit
           survoler pour connaître la valeur perd la moitié de son intérêt. */
        if (largeurColonne >= 20) {
            const dedans = h > 20;
            groupe.appendChild(texte(ligne.effectif, {
                x: i * pas + pas / 2, y: dedans ? y + 14 : y - 5,
                'text-anchor': 'middle', class: 'figure-valeur',
                fill: dedans ? couleur('--carte', '#fff') : gris,
                'font-weight': dedans ? '500' : null,
            }));
        }

        groupe.appendChild(texte(ajuster(ligne.valeur, pas - 4, 11.5), {
            x: i * pas + pas / 2, y: hauteur - margeBas + 15,
            'text-anchor': 'middle', class: 'figure-axe',
            fill: choisi ? signal : gris,
        }));

        if (onClic) {
            const agir = () => onClic(ligne.valeur);
            groupe.addEventListener('click', agir);
            groupe.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); agir(); }
            });
        }
        if (onMenu && !ligne.autres) onMenu(groupe, ligne.valeur);
        svg.appendChild(groupe);
    });

    return svg;
}

/* ─────────────────────────────────────────────────────────────────────────
   Colonnes empilées — une série ordonnée décomposée par catégorie
───────────────────────────────────────────────────────────────────────── */

/**
 * @param options
 *   categories  [valeurs de l'axe, ordonnées]
 *   series      [{ nom, valeurs: { categorie: effectif } }]
 */
export function colonnesEmpilees(options) {
    const {
        categories = [], series = [], largeur = 640, hauteur = 260,
        unite = 'éléments', onClic = null, couleurs = true, couleurPour = null,
        onClicCategorie = null, onMenuCategorie = null, onMenuSegment = null,
    } = options;
    const teinteSerie = v => (couleurPour ? couleurPour(v) : couleurDe(v));

    const margeBas = 26, margeHaut = 14;
    const n = categories.length || 1;
    const pas = largeur / n;
    const largeurColonne = Math.max(4, Math.min(46, pas * 0.6));

    const svg = el('svg', {
        viewBox: `0 0 ${largeur} ${hauteur}`, width: '100%', height: hauteur,
        role: 'img', class: 'figure',
    });

    const totaux = categories.map(c =>
        series.reduce((s, serie) => s + (serie.valeurs[c] || 0), 0));
    /* Une catégorie « non renseignée » à fort effectif écraserait les autres
       colonnes ; elle reste dessinée mais ne commande pas l'échelle. */
    const utiles = totaux.filter((_, i) => !horsEchelle(categories[i]));
    const max = Math.max(...(utiles.length ? utiles : totaux), 1);
    const zoneUtile = hauteur - margeBas - margeHaut;
    const gris  = couleur('--encre-3', '#7C8B93');
    const filet = couleur('--filet', '#D9DFDD');

    svg.appendChild(el('line', {
        x1: 0, x2: largeur, y1: hauteur - margeBas, y2: hauteur - margeBas,
        stroke: filet, 'stroke-width': 1,
    }));

    categories.forEach((cat, i) => {
        const x = i * pas + (pas - largeurColonne) / 2;
        const depasse = totaux[i] > max;
        const compression = depasse ? max / totaux[i] : 1;
        let cumul = 0;

        series.forEach((serie, j) => {
            const v = serie.valeurs[cat] || 0;
            if (!v) return;
            /* Hauteur bornée à la zone utile.
               La catégorie écartée du calcul du maximum — un regroupement, une
               absence — le dépasse par construction. Sans cette borne, sa
               colonne monte à plusieurs fois la hauteur du cadre et, les
               figures autorisant le débordement pour leurs libellés, se répand
               sur le reste de la page.
               Les segments sont comprimés plutôt que coupés, pour que la
               composition de la colonne reste lisible. */
            const h = Math.max(1, Math.round(zoneUtile * v * compression / max));
            cumul = Math.min(cumul + h, zoneUtile);
            const y = hauteur - margeBas - cumul;

            const seg = el('rect', {
                x, y, width: largeurColonne, height: h,
                fill: horsEchelle(serie.nom) ? couleur('--encre-3', '#7C8B93')
                    : couleurs ? teinteSerie(serie.nom)
                    : PALETTE_SERIES[j % PALETTE_SERIES.length],
                'fill-opacity': horsEchelle(serie.nom) ? 0.5 : 0.9, class: 'segment',
                tabindex: onClic ? '0' : null, role: onClic ? 'button' : null,
            });
            decrire(seg, `${cat} · ${serie.nom} — ${v} ${unite}`);

            seg.addEventListener('mousemove', evt => {
                const part = totaux[i] ? Math.round((v / totaux[i]) * 100) : 0;
                montrerInfobulle(contenuInfobulle({
                    titre: `${serie.nom} — ${v} ${unite}`,
                    precision: `${cat} · ${part} % de ses ${totaux[i]} ${unite}`,
                }), evt.clientX, evt.clientY);
            });
            seg.addEventListener('mouseleave', cacherInfobulle);

            if (onClic) {
                seg.addEventListener('click', () => onClic(serie.nom, cat));
                seg.addEventListener('keydown', e => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClic(serie.nom, cat); }
                });
            }
            onMenuSegment?.(seg, serie.nom, cat, v);
            svg.appendChild(seg);
        });

        /* Chevrons de dépassement, comme sur les barres et les colonnes
           simples : sans ce repère, on lirait la hauteur de cette colonne
           comme comparable aux autres alors qu'elle est tronquée. */
        if (depasse) {
            const sommet = hauteur - margeBas - cumul;
            svg.appendChild(el('path', {
                d: `M ${x + 3} ${sommet + 9} l ${largeurColonne / 2 - 3} -5 l ${largeurColonne / 2 - 3} 5 `
                 + `M ${x + 3} ${sommet + 14} l ${largeurColonne / 2 - 3} -5 l ${largeurColonne / 2 - 3} 5`,
                fill: 'none', stroke: couleur('--carte', '#fff'), 'stroke-width': 1.6,
                'stroke-linecap': 'round',
            }));
        }

        if (totaux[i] && largeurColonne >= 22) {
            svg.appendChild(texte(totaux[i], {
                x: i * pas + pas / 2, y: hauteur - margeBas - cumul - 5,
                'text-anchor': 'middle', class: 'figure-valeur', fill: gris,
            }));
        }

        /* L'intitulé de l'axe agit sur la colonne entière. Comme partout
           ailleurs, le clic bascule le filtre et le clic droit propose de
           n'afficher que cette valeur : l'isolement direct ferait de cet
           endroit le seul où un clic remplace la sélection au lieu de s'y
           ajouter. */
        const etiquette = el('g', {
            class: 'etiquette-axe',
            tabindex: onClicCategorie ? '0' : null,
            role: onClicCategorie ? 'button' : null,
        });
        etiquette.appendChild(el('rect', {
            x: i * pas, y: hauteur - margeBas + 2, width: pas, height: margeBas - 2,
            fill: 'transparent',
        }));
        etiquette.appendChild(texte(ajuster(cat, pas - 4, 11.5), {
            x: i * pas + pas / 2, y: hauteur - margeBas + 15,
            'text-anchor': 'middle', class: 'figure-axe', fill: gris,
        }));
        if (onClicCategorie) {
            const titreEtiquette = el('title');
            titreEtiquette.textContent = `${cat} — ${totaux[i]} ${unite}. `
                + `Cliquer pour ajouter au filtre.`;
            etiquette.appendChild(titreEtiquette);
            const agir = () => onClicCategorie(cat);
            etiquette.addEventListener('click', agir);
            etiquette.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); agir(); }
            });
            onMenuCategorie?.(etiquette, cat);
        }
        svg.appendChild(etiquette);
    });

    return svg;
}

/** Légende de couleurs, pour les seules figures qui en emploient. */
export function legendeCouleurs(noms, onClic = null, couleurs = true, couleurPour = null) {
    const boite = document.createElement('div');
    boite.className = 'figure-legende';
    noms.forEach((nom, i) => {
        const item = document.createElement(onClic ? 'button' : 'span');
        item.className = 'figure-legende-item';
        if (onClic) { item.type = 'button'; item.addEventListener('click', () => onClic(nom)); }
        const pastille = document.createElement('span');
        pastille.className = 'figure-pastille';
        /* Un regroupement ou une absence garde son gris dans la légende comme
           dans la figure : les deux doivent concorder. */
        pastille.style.background = horsEchelle(nom)
            ? 'var(--encre-3)'
            : couleurs
                ? (couleurPour ? couleurPour(nom) : couleurDe(nom))
                : PALETTE_SERIES[i % PALETTE_SERIES.length];
        if (horsEchelle(nom)) {
            pastille.style.opacity = estAbsence(nom) ? '.35' : '.55';
            item.style.fontStyle = estRegroupement(nom) ? 'italic' : 'normal';
        }
        const libelle = document.createElement('span');
        libelle.textContent = nom;
        item.append(pastille, libelle);
        boite.appendChild(item);
    });
    return boite;
}

/* ─────────────────────────────────────────────────────────────────────────
   Bulles temporelles — une entité par ligne, une période par colonne
───────────────────────────────────────────────────────────────────────── */

/**
 * Répond d'un coup d'œil à « qui était actif quand ». Les colonnes empilées
 * donnent la forme d'ensemble mais agrégée ; la matrice donne les chiffres
 * mais sans lecture visuelle. Ici l'aire d'un disque porte l'effectif, ce qui
 * laisse comparer des dizaines d'entités sur une même image.
 *
 * L'aire, et non le rayon : doubler le rayon quadruple la surface perçue, et
 * un effectif deux fois plus grand paraîtrait quatre fois plus important.
 *
 * @param options
 *   entites     [{ valeur, effectif, autres? }] — lignes, dans l'ordre voulu
 *   categories  [valeurs] — colonnes, ordonnées
 *   cellules    Map "entite\u0000categorie" → effectif
 */
export function bullesTemporelles(options) {
    const {
        entites = [], categories = [], cellules = new Map(),
        largeur = 760, selection = new Set(), unite = 'éléments',
        onClic = null, onMenu = null, couleurs = true, couleurPour = null,
    } = options;
    const teinteDe = v => (couleurPour ? couleurPour(v) : couleurDe(v));

    const largeurLibelle = Math.min(240, Math.max(120, largeur * 0.28));
    const hauteurLigne = 26;
    const margeHaut = 26, margeBas = 10;
    const zone = largeur - largeurLibelle - 24;
    const pas = categories.length ? zone / categories.length : zone;
    const hauteur = margeHaut + margeBas + entites.length * hauteurLigne;

    const svg = el('svg', {
        viewBox: `0 0 ${largeur} ${hauteur}`, width: '100%', height: hauteur,
        role: 'img', class: 'figure',
    });

    /* Les croisements portant un regroupement ou une absence sont écartés du
       maximum : un disque « Autres × Année inconnue » réduirait tous les
       autres à des points. */
    const nomsHorsEchelle = new Set([
        ...entites.filter(e => horsEchelle(e.valeur, e)).map(e => e.valeur),
        ...categories.filter(c => horsEchelle(c)),
    ]);
    const valeursUtiles = [...cellules.entries()]
        .filter(([cle]) => !cle.split('\u0000').some(p => nomsHorsEchelle.has(p)))
        .map(([, v]) => v);
    const max = Math.max(...(valeursUtiles.length ? valeursUtiles : [...cellules.values()]), 1);
    /* Rayon calculé sur la racine de l'effectif : c'est l'aire qui doit être
       proportionnelle, non le rayon. */
    const rayonMax = Math.min(hauteurLigne * 0.42, pas * 0.42);
    /* Rayon borné. Une cellule écartée du calcul du maximum le dépasse par
       construction : sans borne, son disque déborde de sa ligne et du cadre,
       exactement comme le faisaient les colonnes empilées. */
    const rayon = v => Math.max(1.5, Math.sqrt(Math.min(v, max) / max) * rayonMax);

    const encre  = couleur('--encre', '#16232B');
    const signal = couleur('--signal', '#0B6E5F');
    const gris   = couleur('--encre-3', '#7C8B93');
    const doux   = couleur('--filet-doux', '#EAEEEC');

    /* Colonnes : intitulé et repère vertical léger */
    categories.forEach((cat, j) => {
        const x = largeurLibelle + pas * (j + 0.5);
        svg.appendChild(texte(ajuster(cat, pas, 11), {
            x, y: margeHaut - 12, 'text-anchor': 'middle',
            class: 'figure-axe', fill: gris,
        }));
        if (j % 2 === 1) {
            svg.appendChild(el('rect', {
                x: largeurLibelle + pas * j, y: margeHaut - 6,
                width: pas, height: hauteur - margeHaut - margeBas + 6,
                fill: doux, 'fill-opacity': 0.5,
            }));
        }
    });

    entites.forEach((ent, i) => {
        const y = margeHaut + i * hauteurLigne + hauteurLigne / 2;
        const choisie = selection.has(ent.valeur);

        const groupe = el('g', { class: 'barre', tabindex: '0', role: 'button' });
        const titre = el('title');
        titre.textContent = `${ent.valeur} — ${ent.effectif} ${unite}`;
        groupe.appendChild(titre);

        groupe.appendChild(el('rect', {
            x: 0, y: y - hauteurLigne / 2, width: largeur, height: hauteurLigne,
            fill: 'transparent',
        }));

        groupe.appendChild(texte(ajuster(ent.valeur, largeurLibelle - 10, 12), {
            x: largeurLibelle - 10, y: y + 4, 'text-anchor': 'end',
            class: 'figure-libelle',
            fill: ent.autres ? gris : (choisie ? signal : encre),
            'font-style': ent.autres ? 'italic' : null,
        }));

        if (onClic && !ent.autres) {
            const agir = () => onClic(ent.valeur);
            groupe.addEventListener('click', agir);
            groupe.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); agir(); }
            });
        }
        if (onMenu && !ent.autres) onMenu(groupe, ent.valeur);
        svg.appendChild(groupe);

        categories.forEach((cat, j) => {
            const v = cellules.get(ent.valeur + '\u0000' + cat) || 0;
            if (!v) return;
            const cx = largeurLibelle + pas * (j + 0.5);
            const r = rayon(v);
            const disque = el('circle', {
                cx, cy: y, r,
                fill: choisie ? signal
                    : horsEchelle(ent.valeur, ent) ? gris
                    : (couleurs ? teinteDe(ent.valeur) : encre),
                'fill-opacity': estAbsence(ent.valeur) ? 0.3
                              : choisie ? 0.95 : 0.72,
                class: 'bulle',
            });
            decrire(disque, `${ent.valeur} · ${cat} — ${v} ${unite}`
                + (v > max ? ` (disque tronqué : l’échelle s’arrête à ${max})` : ''));

            disque.addEventListener('mousemove', evt => {
                montrerInfobulle(contenuInfobulle({
                    titre: ent.valeur,
                    precision: `${cat} — ${v} ${unite}`,
                }), evt.clientX, evt.clientY);
            });
            disque.addEventListener('mouseleave', cacherInfobulle);
            svg.appendChild(disque);

            /* L'effectif n'est inscrit que dans les disques assez grands ;
               ailleurs il reste accessible au survol. */
            if (r >= 9) {
                svg.appendChild(texte(v, {
                    x: cx, y: y + 3.5, 'text-anchor': 'middle',
                    class: 'figure-valeur', fill: couleur('--carte', '#fff'),
                    'font-weight': '500', 'pointer-events': 'none',
                }));
            }
        });
    });

    return svg;
}

/* ─────────────────────────────────────────────────────────────────────────
   Frise — chaque élément occupe sa durée réelle
───────────────────────────────────────────────────────────────────────── */

/**
 * Là où les bulles comptent par période, la frise montre l'étendue : une
 * opération de trois ans y occupe trois ans, et les chevauchements se voient.
 * C'est la seule figure qui emploie les dates telles quelles plutôt qu'à
 * travers l'année de rattachement.
 *
 * @param options
 *   lignes  [{ valeur, effectif, autres?, periodes: [{ debut, fin, titre }] }]
 *           debut et fin en millisecondes
 *   min, max  bornes de l'axe, en millisecondes
 */
export function frise(options) {
    const {
        lignes = [], min = 0, max = 1, largeur = 760,
        selection = new Set(), onClic = null, onMenu = null,
        graduations = [], couleurs = true, couleurPour = null,
    } = options;
    const teinteDe = v => (couleurPour ? couleurPour(v) : couleurDe(v));

    const largeurLibelle = Math.min(240, Math.max(120, largeur * 0.28));
    const hauteurLigne = 26, margeHaut = 30, margeBas = 16;
    const zone = largeur - largeurLibelle - 20;
    const hauteur = margeHaut + margeBas + lignes.length * hauteurLigne;
    const etendue = Math.max(1, max - min);
    const xDe = t => largeurLibelle + ((t - min) / etendue) * zone;

    /* Une graduation par année, mais un intitulé seulement là où il tient :
       les afficher tous les serre au point de les rendre illisibles, et un
       axe chronologique se lit très bien avec un repère sur deux ou sur cinq. */
    const pasAnnee = graduations.length > 1
        ? (xDe(graduations[1].valeur) - xDe(graduations[0].valeur)) : zone;
    const surUn = pasAnnee >= 34 ? 1 : pasAnnee >= 18 ? 2 : pasAnnee >= 9 ? 5 : 10;

    const svg = el('svg', {
        viewBox: `0 0 ${largeur} ${hauteur}`, width: '100%', height: hauteur,
        role: 'img', class: 'figure',
    });

    const encre  = couleur('--encre', '#16232B');
    const signal = couleur('--signal', '#0B6E5F');
    const gris   = couleur('--encre-3', '#7C8B93');
    const filet  = couleur('--filet', '#D9DFDD');

    graduations.forEach((g, i) => {
        const x = xDe(g.valeur);
        const nomme = i % surUn === 0;
        svg.appendChild(el('line', {
            x1: x, x2: x, y1: margeHaut - 8, y2: hauteur - margeBas,
            stroke: filet, 'stroke-width': nomme ? 1 : 0.5,
            'stroke-opacity': nomme ? 1 : 0.55,
        }));
        if (nomme) {
            svg.appendChild(texte(g.libelle, {
                x, y: margeHaut - 14, 'text-anchor': 'middle',
                class: 'figure-axe', fill: gris,
            }));
        }
    });

    /* Repère vertical suivant le pointeur : sur une frise, savoir à quelle
       date on se trouve importe autant que voir les segments. */
    const repere = el('line', {
        y1: margeHaut - 8, y2: hauteur - margeBas,
        stroke: signal, 'stroke-width': 1, 'stroke-dasharray': '3,3',
        'pointer-events': 'none', opacity: 0,
    });
    const dateSurvol = el('text', {
        y: margeHaut - 26, 'text-anchor': 'middle', class: 'figure-valeur',
        fill: signal, 'pointer-events': 'none', opacity: 0,
    });

    const dateDe = x => new Date(min + ((x - largeurLibelle) / zone) * etendue);
    const enFrancais = d => d.toLocaleDateString('fr-FR',
        { day: 'numeric', month: 'long', year: 'numeric' });

    lignes.forEach((ligne, i) => {
        const y = margeHaut + i * hauteurLigne;
        const milieu = y + hauteurLigne / 2;
        const choisie = selection.has(ligne.valeur);

        const groupe = el('g', { class: 'barre', tabindex: '0', role: 'button' });
        const titre = el('title');
        titre.textContent = `${ligne.valeur} — ${ligne.effectif} opération(s)`;
        groupe.appendChild(titre);
        /* Zone de visée couvrant toute la ligne, placée en premier donc sous
           les segments : ceux-ci restent visibles et cliquables, et le reste
           de la ligne demeure atteignable. */
        groupe.appendChild(el('rect', {
            x: 0, y, width: largeur, height: hauteurLigne, fill: 'transparent',
        }));
        groupe.appendChild(texte(ajuster(ligne.valeur, largeurLibelle - 10, 12), {
            x: largeurLibelle - 10, y: milieu + 4, 'text-anchor': 'end',
            class: 'figure-libelle',
            fill: ligne.autres ? gris : (choisie ? signal : encre),
            'font-style': ligne.autres ? 'italic' : null,
        }));
        if (onClic && !ligne.autres) {
            const agir = () => onClic(ligne.valeur);
            groupe.addEventListener('click', agir);
            groupe.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); agir(); }
            });
        }
        if (onMenu && !ligne.autres) onMenu(groupe, ligne.valeur);
        svg.appendChild(groupe);

        /* Survol : les segments couvrant la date pointée sont mis en avant et
           détaillés. Sur une ligne où plusieurs opérations se recouvrent, un
           simple `title` ne dirait rien de ce qui se trouve précisément sous
           le pointeur. */
        const segments = [];
        groupe.addEventListener('mousemove', evt => {
            const point = svg.createSVGPoint
                ? (() => { const pt = svg.createSVGPoint();
                           pt.x = evt.clientX; pt.y = evt.clientY;
                           const m = svg.getScreenCTM();
                           return m ? pt.matrixTransform(m.inverse()) : null; })()
                : null;
            if (!point) return;
            const t = min + ((point.x - largeurLibelle) / zone) * etendue;

            repere.setAttribute('x1', point.x);
            repere.setAttribute('x2', point.x);
            repere.setAttribute('opacity', 1);
            dateSurvol.setAttribute('x', point.x);
            dateSurvol.setAttribute('opacity', 1);
            dateSurvol.textContent = enFrancais(dateDe(point.x));

            const sous = ligne.periodes.filter(p => t >= p.debut && t <= p.fin);
            segments.forEach(({ rect, periode }) => {
                const dedans = t >= periode.debut && t <= periode.fin;
                rect.setAttribute('fill-opacity', sous.length ? (dedans ? 0.85 : 0.12) : 0.42);
            });

            if (!sous.length) { cacherInfobulle(); return; }
            montrerInfobulle(contenuInfobulle({
                titre: ligne.valeur,
                precision: `${enFrancais(dateDe(point.x))} — ${sous.length} `
                         + `opération${sous.length > 1 ? 's' : ''} en cours`,
                elements: sous.slice(0, 8).map(p => ({
                    principal: p.libelle || p.titre,
                    secondaire: p.periode,
                })),
                reste: Math.max(0, sous.length - 8),
            }), evt.clientX, evt.clientY);
        });
        groupe.addEventListener('mouseleave', () => {
            cacherInfobulle();
            repere.setAttribute('opacity', 0);
            dateSurvol.setAttribute('opacity', 0);
            segments.forEach(({ rect }) => rect.setAttribute('fill-opacity', 0.42));
        });

        /* Les segments sont translucides : leurs superpositions se lisent
           comme des périodes d'activité plus dense, sans qu'il faille les
           empiler sur des sous-lignes. */
        ligne.periodes.forEach(p => {
            const x1 = xDe(p.debut);
            const x2 = Math.max(x1 + 2, xDe(p.fin));
            const seg = el('rect', {
                x: x1, y: milieu - 5, width: x2 - x1, height: 10, rx: 2,
                fill: choisie ? signal
                    : (ligne.autres || estAbsence(ligne.valeur)) ? gris
                    : (couleurs ? teinteDe(ligne.valeur) : encre),
                'fill-opacity': estAbsence(ligne.valeur) ? 0.2 : 0.42,
                class: 'frise-segment',
            });
            decrire(seg, p.titre);
            segments.push({ rect: seg, periode: p });
            /* Le segment appartient au groupe de sa ligne : sans cela il se
               place au-dessus et intercepte le survol comme le clic, ce qui
               obligeait à viser juste à côté de la barre pour agir dessus. */
            groupe.appendChild(seg);
        });
    });

    svg.appendChild(repere);
    svg.appendChild(dateSurvol);
    return svg;
}

/* ─────────────────────────────────────────────────────────────────────────
   Barres empilées horizontales — un total décomposé
───────────────────────────────────────────────────────────────────────── */

/**
 * Fusionne deux lectures en une : le total par catégorie, et sa composition.
 *
 * Deux figures séparées — effectifs par laboratoire d'un côté, répartition
 * des statuts de l'autre — obligent à faire le rapprochement de tête, et ne
 * disent rien de la composition d'un laboratoire donné. Empilées, les mêmes
 * chiffres répondent aux deux questions à la fois sans rien perdre : la
 * longueur totale reste l'effectif, les segments le détaillent.
 *
 * Horizontales plutôt que verticales : les libellés de laboratoires sont
 * longs, et une colonne les contraindrait à l'oblique ou à la troncature.
 *
 * @param options
 *   lignes      [{ valeur, effectif, autres?, segments: { serie: effectif } }]
 *   series      [noms des séries, dans l'ordre d'empilement]
 */
export function barresEmpilees(options) {
    const {
        lignes = [], series = [], largeur = 760,
        selection = new Set(), selectionSerie = new Set(),
        unite = 'éléments', onClic = null, onClicSerie = null, onMenu = null,
        onMenuSegment = null, couleurs = true, couleurPour = null,
    } = options;

    const teinteSerie = v => couleurs
        ? ((couleurPour ? couleurPour(v) : couleurDe(v)))
        : couleur('--encre', '#16232B');

    const hauteurBarre = 22, espace = 6, margeHaut = 26, margeBas = 4;
    const largeurLibelle = Math.min(240, Math.max(120, Math.round(largeur * 0.22)));
    const largeurValeur = 46;
    const largeurPiste = Math.max(60, largeur - largeurLibelle - largeurValeur - 16);
    const hauteur = margeHaut + margeBas + lignes.length * (hauteurBarre + espace);

    const svg = el('svg', {
        viewBox: `0 0 ${largeur} ${hauteur}`, width: '100%', height: hauteur,
        role: 'img', class: 'figure',
    });

    /* Même règle d'échelle que les barres simples : un regroupement cumulé
       ne doit pas écraser les valeurs réelles. */
    const max = maximumUtile(lignes);

    const encre = couleur('--encre', '#16232B');
    const gris  = couleur('--encre-3', '#7C8B93');
    const doux  = couleur('--filet-doux', '#EAEEEC');
    const filet = couleur('--filet', '#D9DFDD');
    const signal = couleur('--signal', '#0B6E5F');
    const carte = couleur('--carte', '#FFFFFF');

    /* Axe gradué en haut : sans repère chiffré, un empilement ne se lit
       qu'au survol, segment par segment. */
    /* Le pas doit produire quelques repères quel que soit l'ordre de grandeur :
       un pas fixe ne donne qu'une seule graduation sur un petit maximum, et en
       donne trop sur un grand. */
    const pas = max <= 5 ? 1 : max <= 12 ? 2 : max <= 30 ? 5
              : max <= 60 ? 10 : max <= 150 ? 25 : max <= 400 ? 50 : 100;
    for (let v = 0; v <= max; v += pas) {
        const x = largeurLibelle + (v / max) * largeurPiste;
        svg.appendChild(el('line', {
            x1: x, x2: x, y1: margeHaut - 6, y2: hauteur - margeBas,
            stroke: filet, 'stroke-width': v === 0 ? 1 : 0.5,
            'stroke-opacity': v === 0 ? 1 : 0.6,
        }));
        svg.appendChild(texte(v, {
            x, y: margeHaut - 12, 'text-anchor': 'middle',
            class: 'figure-axe', fill: gris,
        }));
    }

    lignes.forEach((ligne, i) => {
        const y = margeHaut + i * (hauteurBarre + espace);
        const choisie = selection.has(ligne.valeur);
        const absente = estAbsence(ligne.valeur);

        const groupe = el('g', { class: 'barre', tabindex: '0', role: 'button' });
        const titre = el('title');
        titre.textContent = `${ligne.valeur} — ${ligne.effectif} ${unite}`;
        groupe.appendChild(titre);

        groupe.appendChild(el('rect', {
            x: 0, y: y - espace / 2, width: largeur, height: hauteurBarre + espace,
            fill: 'transparent', class: 'barre-zone',
        }));

        groupe.appendChild(texte(ajuster(ligne.valeur, largeurLibelle - 8, 12.5), {
            x: largeurLibelle - 8, y: y + hauteurBarre / 2 + 4,
            'text-anchor': 'end', class: 'figure-libelle',
            'font-style': ligne.autres ? 'italic' : null,
            fill: (ligne.autres || absente) ? gris : (choisie ? signal : encre),
        }));

        groupe.appendChild(el('rect', {
            x: largeurLibelle, y, width: largeurPiste, height: hauteurBarre,
            fill: doux, rx: 2,
        }));

        groupe.appendChild(texte(ligne.effectif, {
            x: largeurLibelle + largeurPiste + 8, y: y + hauteurBarre / 2 + 4,
            class: 'figure-valeur', fill: gris,
        }));

        if (ligne.effectif > max) {
            const bord = largeurLibelle + largeurPiste;
            groupe.appendChild(el('path', {
                d: `M ${bord - 9} ${y + 3} l 5 ${hauteurBarre / 2 - 3} l -5 ${hauteurBarre / 2 - 3} `
                 + `M ${bord - 4} ${y + 3} l 5 ${hauteurBarre / 2 - 3} l -5 ${hauteurBarre / 2 - 3}`,
                fill: 'none', stroke: carte, 'stroke-width': 1.6,
                'stroke-linecap': 'round', 'pointer-events': 'none',
            }));
        }

        if (onClic && !ligne.autres) {
            const agir = () => onClic(ligne.valeur);
            groupe.addEventListener('click', agir);
            groupe.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); agir(); }
            });
            onMenu?.(groupe, ligne.valeur);
        }
        svg.appendChild(groupe);

        /* Segments : empilés dans l'ordre des séries, identique d'une ligne à
           l'autre — sans quoi on ne pourrait comparer deux lignes du regard.
           Une ligne qui n'est pas une valeur — un regroupement, une absence —
           voit ses segments virés au gris. En mode simple, sa barre est grise ;
           décomposée, elle reprenait les teintes des séries et son plus gros
           segment portait la couleur du statut dominant, comme si la ligne
           était une valeur comme les autres. Sa composition reste lisible,
           les nuances distinguant les segments, mais la ligne cesse de se
           confondre avec celles qu'on peut comparer. */
        const ligneNeutre = horsEchelle(ligne.valeur, ligne);
        /* Une ligne dépassant l'échelle voit ses segments comprimés pour
           occuper exactement la piste, plutôt que tronqués après le premier.
           Elle est déjà signalée comme non comparable — gris et chevrons —,
           mais ses proportions internes restent lisibles, ce qui est tout ce
           qu'on peut encore en tirer. */
        const compression = ligne.effectif > max ? max / ligne.effectif : 1;
        let cumul = 0;
        series.forEach((serie, indexSerie) => {
            const v = ligne.segments?.[serie] || 0;
            if (!v) return;
            const part = v * compression;
            const x = largeurLibelle + (cumul / max) * largeurPiste;
            const l = Math.max(1, (part / max) * largeurPiste);
            cumul += part;

            const actif = selectionSerie.has(serie);
            const segment = el('rect', {
                x, y, width: l, height: hauteurBarre,
                fill: (ligneNeutre || horsEchelle(serie)) ? gris : teinteSerie(serie),
                'fill-opacity': ligneNeutre
                                  /* Nuances alternées : sans elles, les
                                     segments d'une ligne neutre se fondraient
                                     en un seul bloc gris. */
                                  ? (0.5 - (indexSerie % 3) * 0.11)
                              : estAbsence(serie) ? 0.3
                              : estRegroupement(serie) ? 0.5
                              : (actif ? 1 : 0.88),
                stroke: actif ? signal : carte, 'stroke-width': actif ? 1.5 : 0.5,
                class: 'segment-empile',
            });
            decrire(segment, `${ligne.valeur} · ${serie} — ${v} ${unite}`);

            /* L'infobulle décrit la portion pointée, non la ligne entière.
               Lister tous les segments obligeait à retrouver des yeux celui
               qu'on désigne — l'inverse de ce qu'on attend d'un survol. Le
               total de la ligne demeure, en second, pour situer la part. */
            segment.addEventListener('mousemove', evt => {
                const part = ligne.effectif
                    ? Math.round((v / ligne.effectif) * 100) : 0;
                montrerInfobulle(contenuInfobulle({
                    titre: `${serie} — ${v} ${unite}`,
                    precision: `${ligne.valeur} · ${part} % de ses `
                             + `${ligne.effectif} ${unite}`,
                }), evt.clientX, evt.clientY);
            });
            segment.addEventListener('mouseleave', cacherInfobulle);

            if (onClicSerie && !estAbsence(serie)) {
                segment.style.cursor = 'pointer';
                segment.addEventListener('click', e => {
                    e.stopPropagation();
                    onClicSerie(serie);
                });
            }
            onMenuSegment?.(segment, serie, ligne.valeur, v);
            svg.appendChild(segment);
        });
    });

    return svg;
}

/* ─────────────────────────────────────────────────────────────────────────
   Nuage de mots
───────────────────────────────────────────────────────────────────────── */

/**
 * Convient aux vocabulaires libres — les mots-clés en sont un.
 *
 * Un histogramme de mots-clés est trompeur : il impose un classement là où
 * l'écart entre le vingtième et le trentième terme ne signifie rien, et son
 * axe donne une précision que des étiquettes saisies à la main ne portent pas.
 * Le nuage renonce au classement pour montrer ce que le corpus a de saillant,
 * ce qui est la question qu'on lui pose.
 *
 * Il ne remplace pas les barres pour autant : lire un effectif exact y est
 * malaisé, d'où le mode qui permet d'y revenir.
 *
 * Le placement suit une spirale depuis le centre, chaque mot étant posé au
 * premier emplacement libre. Déterministe : deux affichages des mêmes données
 * donnent la même image.
 */
export function nuageMots(options) {
    const {
        lignes = [], largeur = 760, hauteur = 380,
        selection = new Set(), unite = 'éléments',
        onClic = null, onMenu = null, couleurs = true, couleurPour = null,
    } = options;

    const svg = el('svg', {
        viewBox: `0 0 ${largeur} ${hauteur}`, width: '100%', height: hauteur,
        role: 'img', class: 'figure figure-nuage',
    });

    if (!lignes.length) return svg;

    const encre  = couleur('--encre', '#16232B');
    const gris   = couleur('--encre-3', '#7C8B93');
    const signal = couleur('--signal', '#0B6E5F');
    const teinteDe = v => couleurs
        ? ((couleurPour ? couleurPour(v) : couleurDe(v)) || encre)
        : encre;

    const max = maximumUtile(lignes);
    const min = Math.min(...lignes.map(l => l.effectif));

    /* La taille suit la racine de l'effectif : proportionnelle à la hauteur,
       un terme deux fois plus fréquent occuperait quatre fois la surface et
       paraîtrait bien plus dominant qu'il ne l'est. */
    let tailleMin = 11, tailleMax = Math.min(46, hauteur * 0.13);
    const echelle = e => {
        if (max === min) return (tailleMin + tailleMax) / 2;
        /* La part est bornée à un : un terme écarté du calcul du maximum le
           dépasse par construction, et sa taille sortirait de l'échelle. */
        const part = Math.min(1, Math.sqrt((e - min) / (max - min)));
        return tailleMin + part * (tailleMax - tailleMin);
    };

    /* Ajustement à la place disponible.
       Une échelle fixe fait déborder les grands termes dès que le vocabulaire
       s'étoffe, et la moitié du nuage se retrouve sans place. Plutôt que
       d'estimer une taille plausible — l'estimation tombe toujours à côté, je
       l'ai vérifié —, on mesure l'aire que les mots occuperaient réellement et
       on ramène l'ensemble à un taux de remplissage tenable. Le seuil tient
       compte de ce qu'un empilement de rectangles ne remplit jamais
       complètement son cadre. */
    const aireVoulue = lignes.reduce((total, l) => {
        const t = echelle(l.effectif);
        return total + (largeurApprox(l.valeur, t) + 10) * (t * 1.25);
    }, 0);
    const aireOfferte = largeur * hauteur * 0.4;
    if (aireVoulue > aireOfferte) {
        const facteur = Math.sqrt(aireOfferte / aireVoulue);
        tailleMax = Math.max(12, tailleMax * facteur);
        tailleMin = Math.max(8, tailleMin * facteur);
    }

    const taillePour = e => echelle(e);

    /* Les plus fréquents sont posés d'abord, au centre : les poser après les
       laisserait en périphérie, où leur importance ne se lirait plus. */
    const ordonnees = lignes.slice()
        .sort((a, b) => b.effectif - a.effectif
            || String(a.valeur).localeCompare(String(b.valeur), 'fr'));

    /* Les emplacements occupés sont rangés dans une grille : sans elle,
       chaque essai de la spirale compare le mot à tous ceux déjà posés, soit
       des dizaines de millions de comparaisons sur un vocabulaire fourni. */
    const maille = 40;
    const casiers = new Map();
    const cases = (x, y, l, h) => {
        const liste = [];
        for (let i = Math.floor(x / maille); i <= Math.floor((x + l) / maille); i++) {
            for (let j = Math.floor(y / maille); j <= Math.floor((y + h) / maille); j++) {
                liste.push(i + ',' + j);
            }
        }
        return liste;
    };
    const chevauche = (x, y, l, h) => cases(x, y, l, h).some(cle =>
        (casiers.get(cle) || []).some(p =>
            x < p.x + p.l && x + l > p.x && y < p.y + p.h && y + h > p.y));
    const enregistrer = pose => cases(pose.x, pose.y, pose.l, pose.h).forEach(cle => {
        if (!casiers.has(cle)) casiers.set(cle, []);
        casiers.get(cle).push(pose);
    });

    const cx = largeur / 2, cy = hauteur / 2;
    let horsCadre = 0;
    let depart = 0;

    ordonnees.forEach((ligne, index) => {
        const taille = taillePour(ligne.effectif);
        const l = largeurApprox(ligne.valeur, taille) + 10;
        const h = taille * 1.25;

        /* Spirale d'Archimède, parcourue finement.
           Un pas trop large laisse des vides que les mots suivants ne peuvent
           plus occuper : la spirale les survole sans jamais y tomber. Le pas
           angulaire est donc resserré, et l'ellipse aplatie suit la forme du
           cadre, plus large que haut. */
        const aplatissement = largeur / Math.max(hauteur, 1);
        const rayonMax = Math.hypot(largeur, hauteur) / 2;
        /* La spirale reprend là où le mot précédent s'est posé : le centre est
           déjà occupé, le réexplorer depuis le début à chaque mot ne trouve
           rien et coûte l'essentiel du temps de calcul. */
        let pose = null;
        for (let t = depart; t < depart + 20000 && !pose; t++) {
            const angle = t * 0.12;
            const rayon = 0.55 * angle;
            if (rayon > rayonMax) break;   // la spirale a quitté le cadre
            const x = cx + Math.cos(angle) * rayon * aplatissement - l / 2;
            const y = cy + Math.sin(angle) * rayon - h / 2;
            if (x < 2 || y < 2 || x + l > largeur - 2 || y + h > hauteur - 2) continue;
            if (chevauche(x, y, l, h)) continue;
            pose = { x, y, l, h };
            /* Un léger retour en arrière laisse une chance aux interstices
               que le mot précédent, plus grand, avait dû sauter. */
            depart = Math.max(0, t - 220);
        }
        if (!pose) { horsCadre++; return; }
        enregistrer(pose);

        const choisi = selection.has(ligne.valeur);
        const neutre = horsEchelle(ligne.valeur, ligne);

        const groupe = el('g', { class: 'mot', tabindex: '0', role: 'button' });
        decrire(groupe, `${ligne.valeur} — ${ligne.effectif} ${unite}`);

        groupe.appendChild(el('rect', {
            x: pose.x, y: pose.y, width: l, height: h,
            fill: 'transparent', class: 'mot-zone',
        }));

        groupe.appendChild(texte(ligne.valeur, {
            x: pose.x + l / 2, y: pose.y + h * 0.74,
            'text-anchor': 'middle',
            'font-size': taille,
            'font-family': "var(--corps)",
            'font-weight': taille > 22 ? '600' : '500',
            fill: choisi ? signal : neutre ? gris : teinteDe(ligne.valeur),
            'fill-opacity': neutre ? 0.5 : 0.95,
            class: 'mot-texte',
        }));

        groupe.addEventListener('mousemove', evt => {
            montrerInfobulle(contenuInfobulle({
                titre: ligne.valeur,
                precision: `${ligne.effectif} ${unite}`,
            }), evt.clientX, evt.clientY);
        });
        groupe.addEventListener('mouseleave', cacherInfobulle);

        if (onClic && !neutre) {
            const agir = () => onClic(ligne.valeur);
            groupe.addEventListener('click', agir);
            groupe.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); agir(); }
            });
            onMenu?.(groupe, ligne.valeur);
        }
        svg.appendChild(groupe);
    });

    /* Les termes que le cadre n'a pas pu accueillir sont comptés : les taire
       laisserait croire le nuage exhaustif. */
    svg._horsCadre = horsCadre;
    return svg;
}
