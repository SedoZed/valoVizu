/**
 * core/historique.js
 * Annulation et rétablissement des changements de sélection.
 *
 * Le menu contextuel rend le masquage très accessible — et donc facile à
 * déclencher par mégarde. Or masquer une valeur modifie tous les chiffres de
 * la page. Sans retour en arrière, l'utilisateur qui se trompe doit
 * reconstituer son état de tête.
 *
 * Le relevé se fait au rendu, non à l'action
 * -----------------------------------------
 * Les modifications de la sélection partent d'une douzaine d'endroits :
 * facettes, menu contextuel, clics dans les figures, fenêtre des
 * regroupements, profils. Instrumenter chacun demanderait de n'en oublier
 * aucun, aujourd'hui et à chaque ajout — et un oubli ne se verrait pas.
 *
 * On compare donc l'état à chaque rendu avec le dernier relevé : s'il a
 * changé, le précédent rejoint la pile. Aucun point d'appel à instrumenter,
 * et tout changement est saisi, d'où qu'il vienne.
 */

const PROFONDEUR = 40;

/** Copie d'un état, indépendante de l'original. */
function copier(etat) {
    const facettes = {};
    Object.entries(etat.facettes || {}).forEach(([k, v]) => { facettes[k] = new Set(v); });
    const epinglees = {};
    Object.entries(etat.epinglees || {}).forEach(([k, v]) => { epinglees[k] = new Set(v); });
    return {
        facettes,
        masquees: new Set(etat.masquees || []),
        epinglees,
        recherche: etat.recherche || '',
    };
}

/** Empreinte d'un état, pour détecter un changement sans comparer en détail. */
function empreinte(etat) {
    const facettes = Object.entries(etat.facettes || {})
        .filter(([, v]) => v && v.size)
        .map(([k, v]) => k + ':' + [...v].sort().join('\u0001'))
        .sort().join('\u0002');
    const epinglees = Object.entries(etat.epinglees || {})
        .filter(([, v]) => v && v.size)
        .map(([k, v]) => k + ':' + [...v].sort().join('\u0001'))
        .sort().join('\u0002');
    return [facettes, [...(etat.masquees || [])].sort().join('\u0001'),
            epinglees, etat.recherche || ''].join('\u0003');
}

/**
 * Décrit en quelques mots ce qui distingue deux états.
 * Un bouton « Annuler » sans objet oblige à cliquer pour savoir ce qu'il fait.
 */
function decrire(avant, apres, libelleChamp) {
    const nom = cle => (libelleChamp?.(cle) || cle).toLowerCase();

    for (const cle of new Set([...Object.keys(avant.facettes || {}),
                               ...Object.keys(apres.facettes || {})])) {
        const a = avant.facettes?.[cle]?.size || 0;
        const b = apres.facettes?.[cle]?.size || 0;
        if (a !== b) return `le filtre ${nom(cle)}`;
    }
    const ma = avant.masquees?.size || 0, mb = apres.masquees?.size || 0;
    if (ma !== mb) return mb > ma ? 'un masquage' : 'un démasquage';

    for (const cle of new Set([...Object.keys(avant.epinglees || {}),
                               ...Object.keys(apres.epinglees || {})])) {
        const a = avant.epinglees?.[cle]?.size || 0;
        const b = apres.epinglees?.[cle]?.size || 0;
        if (a !== b) return `un détachement — ${nom(cle)}`;
    }
    if ((avant.recherche || '') !== (apres.recherche || '')) return 'la recherche';
    return 'le dernier changement';
}

export class Historique {
    /** @param libelleChamp (cle) → nom lisible du champ, pour les descriptions */
    constructor(libelleChamp = null) {
        this.libelleChamp = libelleChamp;
        this.piles = {};   // une pile par tableau de bord
    }

    _pile(source) {
        if (!this.piles[source]) {
            this.piles[source] = { passe: [], futur: [], dernier: null, empreinte: null };
        }
        return this.piles[source];
    }

    /**
     * Relève l'état courant. À appeler à chaque rendu.
     * @returns true si un changement a été enregistré
     */
    relever(source, etat) {
        const pile = this._pile(source);
        const marque = empreinte(etat);
        if (marque === pile.empreinte) return false;

        if (pile.dernier && !this._enCours) {
            pile.passe.push(pile.dernier);
            if (pile.passe.length > PROFONDEUR) pile.passe.shift();
            /* Une nouvelle action rend le futur caduc : on ne peut rétablir
               que ce qu'on vient d'annuler, pas une branche abandonnée. */
            pile.futur = [];
        }
        pile.dernier = copier(etat);
        pile.empreinte = marque;
        return true;
    }

    peutAnnuler(source) { return this._pile(source).passe.length > 0; }
    peutRetablir(source) { return this._pile(source).futur.length > 0; }

    /** Ce que l'annulation défera, en quelques mots. */
    descriptionAnnulation(source) {
        const pile = this._pile(source);
        if (!pile.passe.length || !pile.dernier) return '';
        return decrire(pile.passe[pile.passe.length - 1], pile.dernier, this.libelleChamp);
    }

    descriptionRetablissement(source) {
        const pile = this._pile(source);
        if (!pile.futur.length || !pile.dernier) return '';
        return decrire(pile.dernier, pile.futur[pile.futur.length - 1], this.libelleChamp);
    }

    /** @returns l'état à restaurer, ou null */
    annuler(source) {
        const pile = this._pile(source);
        if (!pile.passe.length) return null;
        const precedent = pile.passe.pop();
        if (pile.dernier) pile.futur.push(pile.dernier);
        return this._appliquer(pile, precedent);
    }

    retablir(source) {
        const pile = this._pile(source);
        if (!pile.futur.length) return null;
        const suivant = pile.futur.pop();
        if (pile.dernier) pile.passe.push(pile.dernier);
        return this._appliquer(pile, suivant);
    }

    _appliquer(pile, etat) {
        pile.dernier = copier(etat);
        pile.empreinte = empreinte(etat);
        /* Le relevé qui suivra le rendu ne doit pas prendre ce retour en
           arrière pour une nouvelle action. */
        this._enCours = true;
        setTimeout(() => { this._enCours = false; }, 0);
        return copier(etat);
    }
}
