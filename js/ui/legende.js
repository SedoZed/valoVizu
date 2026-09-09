/**
 * ui/legende.js
 * La phrase qui décrit la sélection affichée.
 *
 * L'outil sert à alimenter un document : cette phrase est exactement ce qu'on
 * colle sous une figure. Elle évite la figure orpheline dont plus personne ne
 * sait, trois semaines plus tard, sur quel sous-ensemble elle portait.
 *
 * Règle qui en découle et qui vaut partout : **toute mise à l'écart y
 * apparaît**. Valeurs masquées, recherche active, regroupements. Rien ne
 * disparaît en silence.
 */
import { FACETTES, champ, UNITE } from '../core/champs.js';
import { libelleDe } from '../core/reglages.js';

/** Résume une facette : soit les valeurs, soit leur nombre, soit « tous … ». */
function resumer(source, cle, etat, reglages) {
    const def = champ(source, cle);
    if (!def) return '';
    const choix = etat.facettes[cle];
    if (!choix || !choix.size) return '';

    const libelles = [...choix]
        .map(v => libelleDe(reglages, cle, v))
        .sort((a, b) => String(a).localeCompare(String(b), 'fr'));

    /* Années contiguës : « 2016–2025 » plutôt que la liste complète. */
    if (def.nature === 'temporel' && libelles.length > 2) {
        const nums = libelles.map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
        if (nums.length === libelles.length &&
            nums[nums.length - 1] - nums[0] === nums.length - 1) {
            return `${nums[0]}–${nums[nums.length - 1]}`;
        }
    }
    if (libelles.length > 3) {
        return `${libelles.length} ${def.libelle.toLowerCase()}s sélectionnés`;
    }
    /* Le champ est nommé : hors contexte, « 2022, 2023 » ou « CNRS » ne dit
       pas sur quoi porte la restriction. */
    return `${def.libelle.toLowerCase()} : ${libelles.join(', ')}`;
}

/** Étendue temporelle réelle des enregistrements retenus. */
function etendue(rows, source) {
    if (source !== 'ope') return '';
    const annees = rows.map(r => r.annee).filter(Boolean).map(Number).filter(n => !isNaN(n));
    if (!annees.length) return '';
    const min = Math.min(...annees), max = Math.max(...annees);
    return min === max ? String(min) : `${min}–${max}`;
}

export function texteLegende(rows, source, etat, reglages) {
    const u = UNITE[source];
    const parts = [`${rows.length} ${rows.length > 1 ? u.pluriel : u.singulier}`];

    /* Étendue temporelle si aucune année n'est explicitement sélectionnée */
    if (source === 'ope' && !(etat.facettes.annee?.size)) {
        const span = etendue(rows, source);
        if (span) parts.push(span);
    }

    /* Seules les facettes réellement filtrées sont citées.
       Énumérer « tous partenaires · tous laboratoires · toutes activités »
       allongeait la phrase de mentions qui n'apprennent rien, et noyait les
       restrictions effectives — celles que la légende doit précisément faire
       ressortir. L'absence de restriction est dite une fois, à la fin. */
    const filtrees = FACETTES[source]
        .filter(cle => etat.facettes[cle]?.size)
        .map(cle => resumer(source, cle, etat, reglages))
        .filter(Boolean);
    parts.push(...filtrees);

    if (etat.recherche.trim()) parts.push(`recherche : « ${etat.recherche.trim()} »`);

    if (etat.masquees.size) {
        const n = etat.masquees.size;
        parts.push(`${n} valeur${n > 1 ? 's' : ''} masquée${n > 1 ? 's' : ''}`);
    }

    /* Les valeurs détachées d'un regroupement modifient ce que montrent les
       figures sans rien retirer : la légende le mentionne, faute de quoi deux
       figures du même sous-ensemble pourraient différer sans explication. */
    const detachees = Object.values(etat.epinglees || {})
        .reduce((s, v) => s + (v?.size || 0), 0);
    if (detachees) {
        parts.push(`${detachees} valeur${detachees > 1 ? 's' : ''} `
                 + `détachée${detachees > 1 ? 's' : ''} du regroupement`);
    }

    if (!filtrees.length && !etat.recherche.trim() && !etat.masquees.size && !detachees) {
        parts.push('aucun filtre');
    }

    return parts.join(' · ');
}

/**
 * Ligne de provenance. L'âge des données y figure : l'outil sert un cache de
 * plusieurs heures, et rien ne distinguerait sinon une extraction du jour
 * d'une extraction de la veille.
 */
export function texteSource(nomSource, date, ageMinutes) {
    const d = (date || new Date()).toLocaleDateString('fr-FR',
        { day: 'numeric', month: 'long', year: 'numeric' });
    let fraicheur = '';
    if (ageMinutes !== null && ageMinutes !== undefined) {
        if (ageMinutes < 2)        fraicheur = ' (à l’instant)';
        else if (ageMinutes < 60)  fraicheur = ` (il y a ${ageMinutes} min)`;
        else                       fraicheur = ` (il y a ${Math.round(ageMinutes / 60)} h)`;
    }
    return `Source : ${nomSource}, extraction du ${d}${fraicheur}.`;
}

export function rendreLegende(elTexte, elSource, rows, source, etat, reglages,
                              nomSource, date, ageMinutes) {
    elTexte.textContent  = texteLegende(rows, source, etat, reglages);
    elSource.textContent = texteSource(nomSource, date, ageMinutes);
}

export function brancherCopie(bouton, elTexte, elSource) {
    if (!bouton || bouton._branche) return;
    bouton._branche = true;
    bouton.addEventListener('click', async () => {
        const texte = `${elTexte.textContent} ${elSource.textContent}`;
        try {
            await navigator.clipboard.writeText(texte);
            bouton.textContent = 'Légende copiée';
        } catch {
            bouton.textContent = 'Copie impossible';
        }
        setTimeout(() => { bouton.textContent = 'Copier la légende'; }, 1800);
    });
}
