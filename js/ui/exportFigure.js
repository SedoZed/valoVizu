/**
 * ui/exportFigure.js
 * Export d'une figure en image.
 *
 * La légende est incrustée dans le fichier, non proposée à côté. Une figure
 * exportée quitte l'outil et circule seule : sans la phrase qui décrit son
 * sous-ensemble, plus personne ne saura trois semaines plus tard sur quoi
 * elle portait, ni ce qui en avait été écarté. L'inscrire coûte quelques
 * lignes ; l'omettre produit des figures orphelines.
 *
 * Le SVG est reconstruit avec ses styles convertis en attributs : les
 * variables CSS du document ne le suivent pas dans le fichier, et une figure
 * exportée sans cette étape s'ouvre en noir sur noir.
 */

const NS = 'http://www.w3.org/2000/svg';

/* Propriétés à figer sur chaque élément : celles que la feuille de style
   fournit et qui disparaîtraient hors du document. */
const PROPRIETES = [
    'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity',
    'stroke-dasharray', 'stroke-linecap', 'font-family', 'font-size',
    'font-weight', 'font-style', 'text-anchor', 'opacity', 'paint-order',
];

function figerStyles(origine, copie) {
    /* Hors navigateur, les styles calculés n'existent pas : la figure est
       alors copiée telle quelle plutôt que d'interrompre l'export. */
    if (typeof getComputedStyle !== 'function') return;
    const calcule = getComputedStyle(origine);
    PROPRIETES.forEach(p => {
        const v = calcule.getPropertyValue(p);
        if (v && v !== 'none' && v !== 'normal') copie.setAttribute(p, v.trim());
    });
    /* Les éléments rendus invisibles par une classe ne doivent pas réapparaître. */
    if (calcule.getPropertyValue('display') === 'none') copie.remove();
}

function copierAvecStyles(origine) {
    const copie = origine.cloneNode(false);
    if (origine.nodeType === 1 && origine.namespaceURI === NS) {
        figerStyles(origine, copie);
    }
    origine.childNodes.forEach(enfant => {
        if (enfant.nodeType === 3) {
            copie.appendChild(enfant.cloneNode(true));
            return;
        }
        if (enfant.nodeType !== 1) return;
        const copieEnfant = copierAvecStyles(enfant);
        if (copieEnfant) copie.appendChild(copieEnfant);
    });
    return copie;
}

/** Découpe une phrase en lignes tenant dans la largeur donnée. */
function decouper(texte, largeur, taille) {
    const parCaractere = taille * 0.52;
    const max = Math.max(20, Math.floor(largeur / parCaractere));
    const mots = String(texte).split(/\s+/);
    const lignes = [];
    let courante = '';
    mots.forEach(mot => {
        if ((courante + ' ' + mot).trim().length > max) {
            if (courante) lignes.push(courante);
            courante = mot;
        } else {
            courante = (courante + ' ' + mot).trim();
        }
    });
    if (courante) lignes.push(courante);
    return lignes;
}

/**
 * Construit un SVG autonome : figure, titre et légende.
 * @param options { titre, legende, source, fondClair }
 */
export function construireSvg(svgOrigine, options = {}) {
    const { titre = '', legende = '', source = '', fondClair = true } = options;

    const boite = svgOrigine.viewBox.baseVal;
    const largeur = boite && boite.width ? boite.width : svgOrigine.clientWidth || 800;
    const hauteurFigure = boite && boite.height ? boite.height : svgOrigine.clientHeight || 400;

    const marge = 20;
    const tailleTitre = 15, tailleTexte = 11.5;
    const lignesLegende = legende ? decouper(legende, largeur - marge * 2, tailleTexte) : [];
    const hautTitre = titre ? tailleTitre + 12 : 0;
    const hautPied = (lignesLegende.length * (tailleTexte + 4)) + (source ? tailleTexte + 6 : 0) + 14;

    const hauteur = hautTitre + hauteurFigure + hautPied + marge;
    const largeurTotale = largeur + marge * 2;

    const doc = document.implementation.createDocument(NS, 'svg', null);
    const racine = doc.documentElement;
    racine.setAttribute('xmlns', NS);
    racine.setAttribute('width', largeurTotale);
    racine.setAttribute('height', hauteur);
    racine.setAttribute('viewBox', `0 0 ${largeurTotale} ${hauteur}`);

    const encre = fondClair ? '#16232B' : '#DDE3E5';
    const gris  = fondClair ? '#7C8B93' : '#7B888D';
    const fond  = fondClair ? '#FFFFFF' : '#1C2226';

    const rect = doc.createElementNS(NS, 'rect');
    rect.setAttribute('width', largeurTotale);
    rect.setAttribute('height', hauteur);
    rect.setAttribute('fill', fond);
    racine.appendChild(rect);

    const texte = (contenu, x, y, taille, couleur, gras) => {
        const t = doc.createElementNS(NS, 'text');
        t.setAttribute('x', x); t.setAttribute('y', y);
        t.setAttribute('font-family', "'IBM Plex Sans', system-ui, sans-serif");
        t.setAttribute('font-size', taille);
        t.setAttribute('fill', couleur);
        if (gras) t.setAttribute('font-weight', '600');
        t.textContent = contenu;
        return t;
    };

    if (titre) {
        racine.appendChild(texte(titre, marge, marge + tailleTitre, tailleTitre, encre, true));
    }

    /* La figure elle-même, styles figés. */
    const groupe = doc.createElementNS(NS, 'g');
    groupe.setAttribute('transform', `translate(${marge}, ${hautTitre + marge - 8})`);
    const copie = copierAvecStyles(svgOrigine);
    Array.from(copie.childNodes).forEach(n => groupe.appendChild(doc.importNode(n, true)));
    racine.appendChild(groupe);

    /* Légende et provenance, sous un filet. */
    let y = hautTitre + hauteurFigure + marge + 6;
    const filet = doc.createElementNS(NS, 'line');
    filet.setAttribute('x1', marge); filet.setAttribute('x2', largeurTotale - marge);
    filet.setAttribute('y1', y); filet.setAttribute('y2', y);
    filet.setAttribute('stroke', gris); filet.setAttribute('stroke-width', '0.5');
    racine.appendChild(filet);
    y += tailleTexte + 6;

    lignesLegende.forEach(ligne => {
        racine.appendChild(texte(ligne, marge, y, tailleTexte, encre));
        y += tailleTexte + 4;
    });
    if (source) {
        racine.appendChild(texte(source, marge, y + 2, tailleTexte - 1, gris));
    }

    return racine;
}

function serialiser(racine) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n'
         + new XMLSerializer().serializeToString(racine);
}

function telecharger(contenu, nom, type) {
    const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nom;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function exporterSvg(svgOrigine, nom, options) {
    telecharger(serialiser(construireSvg(svgOrigine, options)),
        nom + '.svg', 'image/svg+xml;charset=utf-8');
}

/**
 * Export en PNG. Le facteur d'agrandissement produit une image utilisable en
 * impression : à l'échelle 1, une figure collée dans un document est floue.
 */
export function exporterPng(svgOrigine, nom, options = {}) {
    const { echelle = 2 } = options;
    const racine = construireSvg(svgOrigine, options);
    const largeur = +racine.getAttribute('width');
    const hauteur = +racine.getAttribute('height');

    const image = new Image();
    const blob = new Blob([serialiser(racine)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    return new Promise((resoudre, rejeter) => {
        image.onload = () => {
            const canevas = document.createElement('canvas');
            canevas.width = largeur * echelle;
            canevas.height = hauteur * echelle;
            const ctx = canevas.getContext('2d');
            ctx.scale(echelle, echelle);
            ctx.drawImage(image, 0, 0);
            URL.revokeObjectURL(url);
            canevas.toBlob(b => {
                if (!b) { rejeter(new Error('Conversion impossible')); return; }
                telecharger(b, nom + '.png', 'image/png');
                resoudre();
            }, 'image/png');
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            rejeter(new Error('Le navigateur n’a pas pu convertir la figure.'));
        };
        image.src = url;
    });
}

/** Nom de fichier lisible et trié chronologiquement. */
export function nomFichier(titre, source) {
    const propre = String(titre)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `${new Date().toISOString().slice(0, 10)}-${source}-${propre}`;
}
