/**
 * core/qualite.js
 * Contrôles portant sur la donnée elle-même, non sur son affichage.
 *
 * Un tableau de bord donne une impression de complétude qu'aucun jeu de
 * données ne mérite : les valeurs manquantes n'y apparaissent pas, les
 * variantes d'écriture y comptent comme des entités distinctes, et rien ne
 * signale qu'une année a été déduite plutôt que saisie. Ces contrôles
 * remettent ces défauts sous les yeux, à côté des chiffres qu'ils affectent.
 *
 * Aucun n'est une erreur en soi : une date manquante est une information sur
 * la saisie, pas une faute. Ils sont donc présentés comme des constats, avec
 * de quoi aller voir les enregistrements concernés.
 */
import { CHAMPS, estAbsence } from './champs.js';
import { plier } from './selection.js';

/* ─────────────────────────────────────────────────────────────────────────
   Rapprochement de libellés
───────────────────────────────────────────────────────────────────────── */

/**
 * Distance d'édition, plafonnée : au-delà du seuil on abandonne le calcul,
 * inutile de savoir si deux chaînes sont très différentes ou extrêmement
 * différentes.
 */
function distance(a, b, plafond = 3) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > plafond) return plafond + 1;

    let precedente = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const courante = [i];
        let minLigne = i;
        for (let j = 1; j <= b.length; j++) {
            const cout = a[i - 1] === b[j - 1] ? 0 : 1;
            courante[j] = Math.min(
                precedente[j] + 1,
                courante[j - 1] + 1,
                precedente[j - 1] + cout,
            );
            if (courante[j] < minLigne) minLigne = courante[j];
        }
        if (minLigne > plafond) return plafond + 1;
        precedente = courante;
    }
    return precedente[b.length];
}

/** Forme réduite d'un libellé : sert à rapprocher les variantes d'écriture. */
function empreinte(valeur) {
    return plier(valeur)
        .replace(/\b(l|d|de|du|des|la|le|les|et|en)\b/g, ' ')
        .replace(/[^a-z0-9]+/g, '');
}

/**
 * Groupes de valeurs qui pourraient désigner la même chose.
 *
 * Le rapprochement est indicatif : « Éditions Dupont » et « Editions Dupond »
 * sont probablement une même entité, mais « Lycée Voltaire » et « Lycée
 * Molière » ne le sont pas malgré leur ressemblance. L'outil signale, il ne
 * fusionne pas — une fusion automatique modifierait les comptages sur une
 * simple présomption.
 */
export function variantes(valeurs, seuil = 2) {
    const restantes = valeurs
        .filter(v => v && !estAbsence(v))
        .map(v => ({ valeur: v, empreinte: empreinte(v), plie: plier(v) }))
        .filter(v => v.plie.length >= 4);

    const groupes = [];
    const vus = new Set();

    /* Empreintes identiques : accents, ponctuation, mots vides. */
    const parEmpreinte = new Map();
    restantes.forEach(v => {
        if (!parEmpreinte.has(v.empreinte)) parEmpreinte.set(v.empreinte, []);
        parEmpreinte.get(v.empreinte).push(v.valeur);
    });
    parEmpreinte.forEach(liste => {
        if (liste.length > 1) {
            liste.forEach(v => vus.add(v));
            groupes.push({ valeurs: liste, motif: 'écriture' });
        }
    });

    /* Distance d'édition faible sur le reste. */
    const seuls = restantes.filter(v => !vus.has(v.valeur));
    for (let i = 0; i < seuls.length; i++) {
        if (vus.has(seuls[i].valeur)) continue;
        const proches = [seuls[i].valeur];
        for (let j = i + 1; j < seuls.length; j++) {
            if (vus.has(seuls[j].valeur)) continue;
            const d = distance(seuls[i].plie, seuls[j].plie, seuil);
            if (d <= seuil) { proches.push(seuls[j].valeur); vus.add(seuls[j].valeur); }
        }
        if (proches.length > 1) {
            vus.add(seuls[i].valeur);
            groupes.push({ valeurs: proches, motif: 'orthographe' });
        }
    }

    return groupes.sort((a, b) => b.valeurs.length - a.valeurs.length);
}

/* ─────────────────────────────────────────────────────────────────────────
   Constats
───────────────────────────────────────────────────────────────────────── */

/**
 * @returns [{ cle, titre, effectif, part, explication, gravite,
 *             valeurs?, groupes?, filtre? }]
 *   gravite : 'information' | 'attention'
 *   filtre  : { cle, valeur } pour aller voir les enregistrements concernés
 */
export function controler(records, source) {
    const constats = [];
    const total = records.length || 1;

    /* ── Champs non renseignés ── */
    CHAMPS[source].forEach(def => {
        const manquants = records.filter(r => def.valeurs(r).every(estAbsence));
        if (!manquants.length) return;
        const part = manquants.length / total;
        constats.push({
            cle: `absent-${def.cle}`,
            titre: `${def.libelle} non renseigné`,
            effectif: manquants.length,
            part,
            gravite: part > 0.3 ? 'attention' : 'information',
            explication: part > 0.3
                ? `Plus de ${Math.round(part * 100)} % des enregistrements n’ont pas cette `
                + `information. Toute lecture par ${def.libelle.toLowerCase()} porte donc sur `
                + `une part seulement du corpus.`
                : `Ces enregistrements n’apparaissent dans aucune répartition par `
                + `${def.libelle.toLowerCase()}, sauf à afficher les non-renseignés.`,
            filtre: { cle: def.cle, valeur: def.absent },
        });
    });

    /* ── Variantes d'écriture ── */
    CHAMPS[source].filter(d => d.nature !== 'temporel').forEach(def => {
        const distinctes = new Set();
        records.forEach(r => def.valeurs(r).forEach(v => distinctes.add(v)));
        if (distinctes.size < 3) return;
        const groupes = variantes([...distinctes]);
        if (!groupes.length) return;
        const concernees = groupes.reduce((s, g) => s + g.valeurs.length, 0);
        constats.push({
            cle: `variantes-${def.cle}`,
            titre: `Variantes d’écriture — ${def.libelle.toLowerCase()}`,
            effectif: concernees,
            gravite: 'attention',
            explication: `${groupes.length} groupe(s) de libellés très proches, comptés `
                + `séparément. Chaque variante forme une entrée distincte dans les `
                + `figures et divise d’autant les effectifs. Le rapprochement est `
                + `indicatif : à vérifier avant toute correction en base.`,
            groupes,
            champ: def.cle,
        });
    });

    if (source === 'ope') constats.push(...controlerOpe(records, total));
    return constats.sort((a, b) =>
        (a.gravite === b.gravite ? 0 : a.gravite === 'attention' ? -1 : 1)
        || (b.effectif - a.effectif));
}

function controlerOpe(records, total) {
    const constats = [];

    /* Années déduites de l'identifiant plutôt que saisies */
    const deduites = records.filter(r => r.anneeOrigine === 'identifiant');
    if (deduites.length) {
        constats.push({
            cle: 'annee-deduite',
            titre: 'Années déduites de l’identifiant',
            effectif: deduites.length,
            part: deduites.length / total,
            gravite: 'information',
            explication: 'Aucune date n’était renseignée : l’année provient du code de '
                + 'l’opération, de forme OPE-AAAA-nnnn. Elle est vraisemblable mais '
                + 'n’a pas été saisie comme telle.',
            exemples: deduites.slice(0, 6).map(r => r.titre),
        });
    }

    /* Aucune année exploitable */
    const sansAnnee = records.filter(r => !r.annee);
    if (sansAnnee.length) {
        constats.push({
            cle: 'annee-absente',
            titre: 'Aucune année exploitable',
            effectif: sansAnnee.length,
            part: sansAnnee.length / total,
            gravite: 'attention',
            explication: 'Ni date de début, ni propriété de date, ni année dans '
                + 'l’identifiant. Ces opérations sont absentes de toute lecture '
                + 'chronologique.',
            exemples: sansAnnee.slice(0, 6).map(r => r.titre),
        });
    }

    /* Dates incohérentes */
    const incoherentes = records.filter(r => r.debut && r.fin && r.fin < r.debut);
    if (incoherentes.length) {
        constats.push({
            cle: 'dates-incoherentes',
            titre: 'Date de fin antérieure au début',
            effectif: incoherentes.length,
            gravite: 'attention',
            explication: 'Aucune durée n’est calculée pour ces opérations, plutôt que '
                + 'd’en produire une négative. Une inversion de saisie est probable.',
            exemples: incoherentes.slice(0, 6).map(r => `${r.titre} (${r.debut} → ${r.fin})`),
        });
    }

    /* Durée manquante faute d'une des deux dates */
    const uneSeuleDate = records.filter(r => (r.debut && !r.fin) || (!r.debut && r.fin));
    if (uneSeuleDate.length) {
        constats.push({
            cle: 'date-unique',
            titre: 'Une seule des deux dates renseignée',
            effectif: uneSeuleDate.length,
            part: uneSeuleDate.length / total,
            gravite: 'information',
            explication: 'La durée ne peut pas être calculée. Ces opérations sont '
                + 'rangées sous « Durée non renseignée ».',
            exemples: uneSeuleDate.slice(0, 6).map(r => r.titre),
        });
    }

    /* Durées invraisemblables */
    const tresLongues = records.filter(r => r.dureeJours > 365 * 12);
    if (tresLongues.length) {
        constats.push({
            cle: 'duree-longue',
            titre: 'Durées supérieures à douze ans',
            effectif: tresLongues.length,
            gravite: 'attention',
            explication: 'Durée peu vraisemblable pour une opération de partenariat : '
                + 'une date mal saisie, ou une année sur deux chiffres mal interprétée, '
                + 'produit ce type d’écart.',
            exemples: tresLongues.slice(0, 6)
                .map(r => `${r.titre} (${r.debut} → ${r.fin}, ${Math.round(r.dureeJours / 365)} ans)`),
        });
    }

    /* Partenaires sans type ni activité */
    const partenaires = new Map();
    records.forEach(r => (r.partenaires || []).forEach(p => {
        if (p.nom && !partenaires.has(p.nom)) partenaires.set(p.nom, p);
    }));
    const sansType = [...partenaires.values()].filter(p => !p.type);
    if (sansType.length) {
        constats.push({
            cle: 'partenaire-sans-type',
            titre: 'Partenaires sans type renseigné',
            effectif: sansType.length,
            part: sansType.length / Math.max(partenaires.size, 1),
            gravite: sansType.length > partenaires.size * 0.3 ? 'attention' : 'information',
            explication: `Sur ${partenaires.size} partenaires distincts. Toute répartition `
                + `par type de partenaire laisse ceux-ci de côté.`,
            exemples: sansType.slice(0, 8).map(p => p.nom),
        });
    }

    /* Montants illisibles.
       Une valeur présente mais non interprétable est plus grave qu'une
       absence : elle donne l'impression que le montant est connu, alors
       qu'aucune somme ne le compte. */
    const montantsIllisibles = records.filter(r => r.budgetBrut || r.montantBrut);
    if (montantsIllisibles.length) {
        constats.push({
            cle: 'montant-illisible',
            titre: 'Montants non interprétables',
            effectif: montantsIllisibles.length,
            part: montantsIllisibles.length / total,
            gravite: 'attention',
            explication: 'Ces opérations portent un montant que l’outil n’a pas su '
                + 'lire — unité, texte libre ou séparateur inattendu. Elles sont '
                + 'comptées comme non renseignées et n’entrent dans aucune somme.',
            exemples: montantsIllisibles.slice(0, 6)
                .map(r => `${r.titre} : « ${r.budgetBrut || r.montantBrut} »`),
        });
    }

    /* Budget supérieur au montant global.
       Le budget de l'opération est une part du montant total : le dépasser
       trahit une inversion des deux champs ou une erreur de saisie. */
    const budgetsIncoherents = records.filter(r =>
        typeof r.budget === 'number' && typeof r.montant === 'number'
        && r.budget > r.montant);
    if (budgetsIncoherents.length) {
        constats.push({
            cle: 'budget-superieur',
            titre: 'Budget supérieur au montant global',
            effectif: budgetsIncoherents.length,
            part: budgetsIncoherents.length / total,
            gravite: 'attention',
            explication: 'Le budget de l’opération est une part du montant total : '
                + 'le dépasser trahit une inversion des deux champs ou une erreur '
                + 'de saisie.',
            exemples: budgetsIncoherents.slice(0, 6).map(r => r.titre),
        });
    }

    /* Budget manquant */
    const sansBudget = records.filter(r => r.budget === null && !r.budgetBrut);
    if (sansBudget.length) {
        constats.push({
            cle: 'budget-absent',
            titre: 'Budget non renseigné',
            effectif: sansBudget.length,
            part: sansBudget.length / total,
            gravite: sansBudget.length > total * 0.5 ? 'attention' : 'information',
            explication: 'Ces opérations n’entrent dans aucun cumul financier. '
                + 'Les sommes affichées ne portent que sur les opérations '
                + 'dont le budget est connu.',
            exemples: sansBudget.slice(0, 6).map(r => r.titre),
        });
    }

    /* Type de contrat manquant */
    const sansContrat = records.filter(r => !r.typeContrat);
    if (sansContrat.length) {
        constats.push({
            cle: 'contrat-absent',
            titre: 'Type de contrat non renseigné',
            effectif: sansContrat.length,
            part: sansContrat.length / total,
            gravite: sansContrat.length > total * 0.3 ? 'attention' : 'information',
            explication: 'Ces opérations n’apparaissent dans aucune répartition par '
                + 'type de contrat, ni dans les croisements qui en dépendent.',
            exemples: sansContrat.slice(0, 6).map(r => r.titre),
        });
    }

    /* Opérations sans laboratoire */
    const sansLabo = records.filter(r => !(r.labos || []).length);
    if (sansLabo.length) {
        constats.push({
            cle: 'ope-sans-labo',
            titre: 'Opérations sans laboratoire',
            effectif: sansLabo.length,
            part: sansLabo.length / total,
            gravite: 'information',
            explication: 'Aucun laboratoire n’est associé : ces opérations n’apparaissent '
                + 'pas dans les croisements laboratoire × partenaire.',
            exemples: sansLabo.slice(0, 6).map(r => r.titre),
        });
    }

    return constats;
}

/** Résumé chiffré, pour l'en-tête du panneau. */
export function resumer(constats) {
    const attention = constats.filter(c => c.gravite === 'attention').length;
    if (!constats.length) return 'Aucun constat sur ce corpus.';
    return `${constats.length} constat${constats.length > 1 ? 's' : ''}`
         + (attention ? `, dont ${attention} à examiner` : '');
}
