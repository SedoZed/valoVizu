/**
 * ui/outils.js
 * Menu de navigation entre les outils de l'écosystème.
 *
 * Les liens sont écrits ici, et non réglés par chacun
 * ---------------------------------------------------
 * Ils ont d'abord été des préférences, conservées dans le navigateur. Le motif
 * tenait : une liste en dur désignerait des adresses internes dans un dépôt
 * publié, et imposerait de toucher au code pour ajouter un outil — les deux
 * défauts qu'on venait d'écarter pour l'adresse de l'API.
 *
 * Il tombe pour une raison plus forte : une préférence vit **par poste**. Un
 * collègue qui ouvrait l'outil ne voyait aucun lien, et l'écosystème n'existait
 * que pour celui qui l'avait configuré. Or c'est précisément ce que ce menu
 * doit montrer : que ces applications forment un ensemble.
 *
 * Le motif d'origine est désamorcé par la forme des liens, non par leur place :
 * ils sont **relatifs**. Rien d'interne ne part dans le dépôt publié, et la
 * suite fonctionne où qu'elle soit déployée, pourvu que les dossiers restent
 * voisins. Une adresse absolue réintroduirait le défaut ; il n'y en a pas ici.
 *
 * Une entrée reste déduite plutôt qu'écrite : l'instance Omeka S, dont
 * l'adresse se tire de celle de l'API. Elle change d'un déploiement à l'autre,
 * elle n'a donc rien à faire dans une liste fixe.
 */
import { CONFIG } from '../core/omeka.js';
import { poserFlottant } from './menu.js';

/**
 * Les outils de l'écosystème, dans l'ordre où le menu les présente.
 *
 * C'est la seule liste à tenir à jour. Les chemins sont relatifs à ce dossier
 * et supposent les applications voisines sur le serveur :
 *
 *     .../valo/            ← cet outil
 *     .../validExpertises/
 *     .../validKeyword/
 *
 * `courant: true` marque l'application servie par ce dossier : elle figure
 * dans la liste — sans quoi le menu dirait mal où l'on se trouve — mais ne
 * renvoie nulle part.
 */
export const OUTILS = [
    { nom: 'ValoVizu',        emoji: '📊', courant: true },
    { nom: 'validExpertises', emoji: '✅', chemin: '../validExpertises/index.html' },
    { nom: 'cleanKeywords',   emoji: '🧹', chemin: '../validKeyword/index.html' },
];

/**
 * Version affichée au bas du menu.
 *
 * Les trois outils de la suite présentent la leur au même endroit ; celle-ci
 * ne vivait jusqu'ici que dans le journal des modifications. **À reprendre à
 * chaque entrée du CHANGELOG** : rien ne la vérifie automatiquement.
 */
export const VERSION = '1.0.4';

/** Racine de l'instance, déduite de l'adresse de l'API. */
export function racineOmeka() {
    if (!CONFIG.api) return '';
    return CONFIG.api.replace(/\/+$/, '').replace(/\/api$/, '');
}

/**
 * Liens proposés : les outils de la suite, puis l'instance Omeka S.
 *
 * L'instance vient en dernier et détachée : ce n'est pas un outil de la suite
 * mais la base qu'ils interrogent tous.
 */
export function liensOutils() {
    const liens = OUTILS.map(o => ({ ...o, url: o.courant ? '' : o.chemin }));
    const racine = racineOmeka();
    if (racine) {
        liens.push({ nom: 'Omeka S', emoji: '🗄️', url: racine, aide: 'instance', deduit: true });
    }
    return liens;
}

/* ─────────────────────────────────────────────────────────────────────────
   Affichage
───────────────────────────────────────────────────────────────────────── */

let ouvert = null;

function fermer() {
    if (!ouvert) return;
    ouvert.panneau.remove();
    ouvert.bouton.setAttribute('aria-expanded', 'false');
    ouvert = null;
    document.removeEventListener('keydown', surTouche, true);
    window.removeEventListener('scroll', fermer, true);
    window.removeEventListener('resize', fermer);
}

function surTouche(e) {
    if (e.key === 'Escape') { e.preventDefault(); fermer(); }
}

if (typeof document !== 'undefined') {
    document.addEventListener('click', e => {
        if (ouvert && !e.target.closest('.outils-panneau, .outils-bouton')) fermer();
    });
}

export function fermerOutils() { fermer(); }

/** Branche le bouton d'ouverture. */
export function brancherOutils(bouton) {
    if (!bouton) return;
    bouton.addEventListener('click', e => {
        e.stopPropagation();
        if (ouvert) { fermer(); return; }

        const panneau = document.createElement('div');
        panneau.className = 'outils-panneau';
        panneau.setAttribute('role', 'menu');

        /* En-tête, pastilles et ligne de version : le menu se présente de la
           même façon dans les trois outils de la suite. Ces deux éléments
           portent leurs propres classes — les porter en `.outils-lien` les
           ferait compter comme des entrées. */
        const entete = document.createElement('div');
        entete.className = 'outils-entete';
        entete.textContent = 'Outils';
        panneau.appendChild(entete);

        liensOutils().forEach((lien, i) => {
            /* L'instance est séparée des outils : elle n'appartient pas à la
               suite, elle est ce que la suite interroge. */
            if (lien.deduit && i > 0) {
                const trait = document.createElement('div');
                trait.className = 'menu-separateur';
                panneau.appendChild(trait);
            }

            /* L'application courante n'est pas un lien : un renvoi vers la
               page où l'on se trouve déjà n'a rien à offrir. */
            const entree = document.createElement(lien.courant ? 'div' : 'a');
            entree.className = 'outils-lien' + (lien.courant ? ' outils-lien--courant' : '');
            entree.setAttribute('role', 'menuitem');
            if (!lien.courant) {
                entree.href = lien.url;
                /* Les outils de la suite s'ouvrent à la place de celui-ci :
                   ce sont des pages voisines, pas des références extérieures.
                   L'instance Omeka S, elle, part dans un nouvel onglet — on y
                   va pour vérifier une fiche, pas pour quitter l'outil. */
                if (lien.deduit) {
                    entree.target = '_blank';
                    entree.rel = 'noopener';
                }
                entree.title = lien.url;
            } else {
                entree.setAttribute('aria-current', 'page');
            }

            const pastille = document.createElement('span');
            pastille.className = 'outils-pastille';
            entree.appendChild(pastille);

            const nom = document.createElement('span');
            nom.textContent = (lien.emoji ? lien.emoji + ' ' : '') + lien.nom;
            entree.appendChild(nom);
            if (lien.aide) {
                const note = document.createElement('span');
                note.className = 'outils-note';
                note.textContent = lien.aide;
                entree.appendChild(note);
            }
            panneau.appendChild(entree);
        });

        const ligneVersion = document.createElement('div');
        ligneVersion.className = 'outils-version';
        ligneVersion.textContent = 'v' + VERSION;
        panneau.appendChild(ligneVersion);

        /* Le panneau vit dans le `body`, et non sous le bouton.
           Posé dans le bandeau, il héritait de son `overflow: hidden` : on
           n'en voyait que la première entrée, et la mise au point du premier
           lien — situé hors de la boîte écrêtée — faisait défiler le bandeau,
           qui paraissait sauter de vingt pixels. Un élément flottant ne doit
           rien devoir à la boîte qui le déclenche. C'est la règle que suit
           déjà le menu contextuel, et `poserFlottant` la porte pour les deux. */
        const ancre = bouton.getBoundingClientRect();
        poserFlottant(panneau, ancre.left, ancre.bottom + 6);
        bouton.setAttribute('aria-expanded', 'true');
        ouvert = { panneau, bouton };
        document.addEventListener('keydown', surTouche, true);
        /* Posé en coordonnées de fenêtre, le panneau ne suit pas la page :
           un défilement ou un redimensionnement le laisserait en arrière du
           bouton. Il se referme plutôt que de flotter sans attache. */
        window.addEventListener('scroll', fermer, true);
        window.addEventListener('resize', fermer);
        /* La mise au point ne fait plus défiler quoi que ce soit : le panneau
           est ramené dans le cadre avant d'être montré. */
        panneau.querySelector('a.outils-lien')?.focus();
    });
}
