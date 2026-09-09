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

    /* Placé hors écran le temps d'être mesuré, puis ramené dans le cadre :
       un menu ouvert près d'un bord doit rester entièrement visible. */
    menu.style.left = '-9999px';
    menu.style.top = '0';
    document.body.appendChild(menu);
    const taille = menu.getBoundingClientRect();
    const marge = 8;
    const gauche = Math.min(x, window.innerWidth  - taille.width  - marge);
    const haut   = Math.min(y, window.innerHeight - taille.height - marge);
    menu.style.left = Math.max(marge, gauche) + 'px';
    menu.style.top  = Math.max(marge, haut) + 'px';

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
export function attacherMenu(element, titre, construireEntrees) {
    element.addEventListener('contextmenu', e => {
        if (e.shiftKey) return;        // laisse le menu du navigateur
        e.preventDefault();
        e.stopPropagation();
        afficherMenu(e.clientX, e.clientY, titre, construireEntrees());
    });
}
