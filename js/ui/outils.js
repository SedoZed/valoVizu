/**
 * ui/outils.js
 * Menu de redirection vers d'autres outils.
 *
 * Les liens sont réglés par l'utilisateur et conservés dans le navigateur,
 * non inscrits dans le code. Une liste codée en dur désignerait des adresses
 * internes dans un dépôt publié, et imposerait de modifier le code pour
 * ajouter un outil — les deux défauts qu'on vient d'écarter pour l'adresse
 * de l'API.
 *
 * Une entrée est déduite, non réglée : l'instance Omeka S elle-même, dont
 * l'adresse se tire de celle de l'API. La proposer d'office évite à chacun
 * de la saisir alors qu'elle est déjà connue.
 */
import { preferences, enregistrerPreferences } from '../core/preferences.js';
import { CONFIG } from '../core/omeka.js';

/** Racine de l'instance, déduite de l'adresse de l'API. */
export function racineOmeka() {
    if (!CONFIG.api) return '';
    return CONFIG.api.replace(/\/+$/, '').replace(/\/api$/, '');
}

/** Liens proposés : l'instance déduite, puis ceux qu'a réglés l'utilisateur. */
export function liensOutils() {
    const liens = [];
    const racine = racineOmeka();
    if (racine) {
        liens.push({ nom: 'Omeka S', url: racine, deduit: true });
    }
    (preferences.outils || []).forEach(o => {
        if (o?.nom && o?.url) liens.push({ ...o, deduit: false });
    });
    return liens;
}

export function ajouterOutil(nom, url) {
    const outils = [...(preferences.outils || []), { nom: String(nom).trim(), url: String(url).trim() }];
    enregistrerPreferences({ outils });
    return outils;
}

export function retirerOutil(indice) {
    const outils = (preferences.outils || []).filter((_, i) => i !== indice);
    enregistrerPreferences({ outils });
    return outils;
}

/** Une adresse d'outil doit être absolue : une relative viserait cette page. */
export function adresseOutilValide(url) {
    try {
        const u = new URL(String(url || '').trim());
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch { return false; }
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

/**
 * Branche le bouton d'ouverture.
 * @param onConfigurer  appelé pour ouvrir l'écran de réglage des liens
 */
export function brancherOutils(bouton, onConfigurer = null) {
    if (!bouton) return;
    bouton.addEventListener('click', e => {
        e.stopPropagation();
        if (ouvert) { fermer(); return; }

        const panneau = document.createElement('div');
        panneau.className = 'outils-panneau';
        panneau.setAttribute('role', 'menu');

        const liens = liensOutils();
        if (!liens.length) {
            const vide = document.createElement('p');
            vide.className = 'note';
            vide.textContent = 'Aucun outil enregistré.';
            panneau.appendChild(vide);
        }

        liens.forEach(lien => {
            const a = document.createElement('a');
            a.className = 'outils-lien';
            a.href = lien.url;
            a.target = '_blank';
            a.rel = 'noopener';
            a.setAttribute('role', 'menuitem');
            const nom = document.createElement('span');
            nom.textContent = lien.nom;
            a.appendChild(nom);
            if (lien.deduit) {
                const note = document.createElement('span');
                note.className = 'outils-note';
                note.textContent = 'instance';
                a.appendChild(note);
            }
            a.title = lien.url;
            panneau.appendChild(a);
        });

        if (onConfigurer) {
            const separateur = document.createElement('div');
            separateur.className = 'menu-separateur';
            panneau.appendChild(separateur);
            const regler = document.createElement('button');
            regler.type = 'button';
            regler.className = 'outils-lien outils-regler';
            regler.textContent = 'Gérer les liens…';
            regler.addEventListener('click', () => { fermer(); onConfigurer(); });
            panneau.appendChild(regler);
        }

        bouton.parentElement.appendChild(panneau);
        bouton.setAttribute('aria-expanded', 'true');
        ouvert = { panneau, bouton };
        document.addEventListener('keydown', surTouche, true);
        panneau.querySelector('a, button')?.focus();
    });
}
