/**
 * ui/infobulle.js
 * Infobulle suivant le pointeur.
 *
 * L'attribut `title` du navigateur ne convient pas partout : il tarde à
 * paraître, ne se met pas à jour quand la souris se déplace à l'intérieur du
 * même élément, et n'accepte qu'un texte brut. Or c'est précisément ce qu'il
 * faudrait sur une frise, où l'information dépend de l'endroit exact où l'on
 * pointe et où plusieurs éléments se recouvrent.
 *
 * Une seule infobulle vit à la fois : la déplacer coûte moins qu'en créer et
 * en détruire à chaque mouvement.
 */

let boite = null;

function creer() {
    if (boite) return boite;
    boite = document.createElement('div');
    boite.className = 'infobulle';
    boite.setAttribute('role', 'tooltip');
    boite.hidden = true;
    document.body.appendChild(boite);
    return boite;
}

/**
 * @param contenu  chaîne, ou élément DOM déjà construit
 * @param x, y     position du pointeur, en coordonnées de fenêtre
 */
export function montrerInfobulle(contenu, x, y) {
    const b = creer();
    b.innerHTML = '';
    if (typeof contenu === 'string') b.textContent = contenu;
    else b.appendChild(contenu);
    b.hidden = false;
    deplacerInfobulle(x, y);
    return b;
}

export function deplacerInfobulle(x, y) {
    if (!boite || boite.hidden) return;
    const marge = 14;
    const taille = boite.getBoundingClientRect();
    /* L'infobulle bascule d'un côté ou de l'autre du pointeur selon la place
       disponible : près d'un bord, elle sortirait autrement de l'écran. */
    let gauche = x + marge;
    if (gauche + taille.width > window.innerWidth - 8) gauche = x - taille.width - marge;
    let haut = y + marge;
    if (haut + taille.height > window.innerHeight - 8) haut = y - taille.height - marge;
    boite.style.left = Math.max(8, gauche) + 'px';
    boite.style.top  = Math.max(8, haut) + 'px';
}

export function cacherInfobulle() {
    if (boite) boite.hidden = true;
}

/** Construit un contenu structuré : un titre, une précision, une liste. */
export function contenuInfobulle({ titre, precision, elements = [], reste = 0 }) {
    const frag = document.createDocumentFragment();

    if (titre) {
        const t = document.createElement('div');
        t.className = 'infobulle-titre';
        t.textContent = titre;
        frag.appendChild(t);
    }
    if (precision) {
        const p = document.createElement('div');
        p.className = 'infobulle-precision';
        p.textContent = precision;
        frag.appendChild(p);
    }
    if (elements.length) {
        const ul = document.createElement('ul');
        ul.className = 'infobulle-liste';
        elements.forEach(e => {
            const li = document.createElement('li');
            if (typeof e === 'string') {
                li.textContent = e;
            } else {
                const principal = document.createElement('span');
                principal.textContent = e.principal;
                li.appendChild(principal);
                if (e.secondaire) {
                    const sec = document.createElement('span');
                    sec.className = 'infobulle-secondaire';
                    sec.textContent = e.secondaire;
                    li.appendChild(sec);
                }
            }
            ul.appendChild(li);
        });
        frag.appendChild(ul);
        if (reste > 0) {
            const p = document.createElement('div');
            p.className = 'infobulle-precision';
            p.textContent = `… et ${reste} autre${reste > 1 ? 's' : ''}`;
            frag.appendChild(p);
        }
    }
    return frag;
}
