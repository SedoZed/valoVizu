/**
 * ui/menu.js
 * Menu contextuel au clic droit sur une valeur.
 *
 * Un clic gauche ne peut porter qu'une action, et c'est le filtrage qui l'a
 * prise. Le clic droit rassemble les autres — isoler, mettre hors périmètre,
 * renommer — au lieu de les disperser dans des commandes éloignées de la
 * valeur qu'elles concernent.
 *
 * Le menu du navigateur reste accessible : maintenir Maj en cliquant droit
 * l'affiche, comme le veut l'usage.
 */

let ouvert = null;

function fermer() {
    if (!ouvert) return;
    ouvert.remove();
    ouvert = null;
    document.removeEventListener('keydown', surTouche, true);
}

function surTouche(e) {
    if (e.key === 'Escape') { e.preventDefault(); fermer(); }
}

/* Un clic ou un défilement ailleurs referme le menu. */
if (typeof document !== 'undefined') {
    document.addEventListener('click', e => {
        if (ouvert && !e.target.closest('.menu-contextuel')) fermer();
    });
    document.addEventListener('contextmenu', e => {
        if (ouvert && !e.target.closest('.menu-contextuel')) fermer();
    }, true);
    window.addEventListener('scroll', fermer, true);
    window.addEventListener('resize', fermer);
}

/**
 * Pose un élément flottant à un point de l'écran, entièrement visible.
 *
 * Deux règles, et c'est tout ce qui fait la différence entre un menu qui
 * fonctionne et un menu qui ne fonctionne pas :
 *
 * 1. **L'élément vit dans le `body`**, pas chez celui qui l'ouvre. Posé dans
 *    le bandeau, il héritait de son `overflow: hidden` : il s'y trouvait
 *    écrêté — on n'en voyait que la première entrée — et sa mise au point
 *    faisait défiler le bandeau, qui paraissait alors sauter de vingt pixels.
 *    Un élément flottant ne doit rien devoir à la boîte qui le déclenche.
 * 2. **Il est mesuré hors écran puis ramené dans le cadre**, pour qu'un menu
 *    ouvert près d'un bord reste entièrement visible.
 *
 * @param x, y  coin haut-gauche souhaité, en coordonnées de la fenêtre
 */
export function poserFlottant(element, x, y, marge = 8) {
    element.style.left = '-9999px';
    element.style.top = '0';
    if (!element.isConnected) document.body.appendChild(element);
    const taille = element.getBoundingClientRect();
    const gauche = Math.min(x, window.innerWidth  - taille.width  - marge);
    const haut   = Math.min(y, window.innerHeight - taille.height - marge);
    element.style.left = Math.max(marge, gauche) + 'px';
    element.style.top  = Math.max(marge, haut) + 'px';
    return element;
}

/**
 * Affiche le menu à l'emplacement du clic.
 * @param entrees [{ libelle, aide?, action, danger?, separateurAvant? }]
 */
export function afficherMenu(x, y, titre, entrees) {
    fermer();

    const menu = document.createElement('div');
    menu.className = 'menu-contextuel';
    menu.setAttribute('role', 'menu');

    if (titre) {
        const t = document.createElement('div');
        t.className = 'menu-titre';
        t.textContent = titre;
        t.title = titre;
        menu.appendChild(t);
    }

    entrees.filter(Boolean).forEach(entree => {
        if (entree.separateurAvant) {
            const s = document.createElement('div');
            s.className = 'menu-separateur';
            menu.appendChild(s);
        }
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.className = 'menu-entree' + (entree.danger ? ' menu-danger' : '');
        bouton.setAttribute('role', 'menuitem');
        const libelle = document.createElement('span');
        libelle.textContent = entree.libelle;
        bouton.appendChild(libelle);
        if (entree.aide) {
            const aide = document.createElement('span');
            aide.className = 'menu-aide';
            aide.textContent = entree.aide;
            bouton.appendChild(aide);
        }
        bouton.addEventListener('click', () => { fermer(); entree.action(); });
        menu.appendChild(bouton);
    });

    poserFlottant(menu, x, y);

    ouvert = menu;
    document.addEventListener('keydown', surTouche, true);
    menu.querySelector('.menu-entree')?.focus();
    return menu;
}

export function fermerMenu() { fermer(); }

/**
 * Attache le menu à un élément portant une valeur.
 * @param options { titre, entrees(valeur) }
 */
export function attacherMenu(element, titre, construireEntrees, { auClic = false } = {}) {
    const ouvrir = (x, y) => afficherMenu(x, y, titre, construireEntrees());

    element.addEventListener('contextmenu', e => {
        if (e.shiftKey) return;        // laisse le menu du navigateur
        e.preventDefault();
        e.stopPropagation();
        ouvrir(e.clientX, e.clientY);
    });

    if (!auClic) return;
    /* Sur une figure de montants, un point ne désigne pas une valeur à
       filtrer mais une opération : le clic gauche n'a rien d'autre à faire
       qu'ouvrir ce même menu. Le réserver au clic droit le rendrait
       introuvable là où c'est la seule action offerte. */
    element.addEventListener('click', e => {
        e.stopPropagation();
        ouvrir(e.clientX, e.clientY);
    });
    element.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        /* Au clavier, il n'y a pas de position de pointeur : le menu s'ouvre
           sur l'élément lui-même. */
        const r = element.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
        ouvrir(r.left + r.width / 2, r.top + r.height / 2);
    });
}
