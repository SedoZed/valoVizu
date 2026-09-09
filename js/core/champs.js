/**
 * core/champs.js
 * Registre des champs, par tableau de bord.
 *
 * Un champ décrit comment lire une valeur sur un enregistrement, comment
 * l'appeler, et ce qu'on affiche quand elle manque. Tout le reste de
 * l'application — facettes, compteurs, graphiques, légende, export — lit
 * ce registre et ne connaît pas la structure des enregistrements.
 *
 *   cle        identifiant stable, utilisé dans les réglages enregistrés
 *   libelle    nom au singulier
 *   pluriel    formulation « tous / toutes … » pour la légende
 *   valeurs    (rec) → tableau de valeurs (toujours un tableau)
 *   multiple   un enregistrement peut porter plusieurs valeurs
 *   nature     'nominal' | 'temporel'
 *   absent     libellé employé quand le champ n'est pas renseigné
 *
 * Champs dérivés d'une entité liée
 * --------------------------------
 * Le type et l'activité d'un partenaire ne sont pas des propriétés de
 * l'opération : ce sont celles du partenaire. Un champ peut donc déclarer
 * l'entité dont il dérive :
 *
 *   entite     nom du tableau porté par l'enregistrement ('partenaires')
 *   identite   (entree) → valeur identifiant l'entité (le nom du partenaire)
 *   extrait    (entree) → valeur du champ pour cette entité
 *
 * Sans cette déclaration, masquer « Université Paris 8 » retirait le
 * partenaire des comptages de partenaires, mais laissait sa contribution au
 * décompte des types : la catégorie « Université » restait gonflée par un
 * partenaire qu'on venait pourtant de mettre hors périmètre.
 */

const SANS = {
    labo:       'Laboratoire non renseigné',
    statut:     'Statut non renseigné',
    domaine:    'Domaine non renseigné',
    cnu:        'Section non renseignée',
    motcle:     'Sans mot-clé',
    chercheur:  'Nom non renseigné',
    annee:      'Année inconnue',
    duree:      'Durée non renseignée',
    partenaire: 'Partenaire non renseigné',
    type:       'Type non renseigné',
    contrat:    'Type de contrat non renseigné',
    naf:        'Code NAF non renseigné',
    ec:         'Aucun EC associé',
};

/** Une valeur signale-t-elle une absence d'information ? */
export function estAbsence(valeur) {
    return Object.values(SANS).includes(valeur);
}

/* Renvoie les valeurs non vides, ou le libellé d'absence si tout est vide. */
const ouSans = (liste, absent) => {
    const propres = (liste || []).map(v => String(v).trim()).filter(Boolean);
    return propres.length ? propres : [absent];
};

export const CHAMPS = {
    ec: [
        { cle: 'chercheur', libelle: 'Chercheur',     pluriel: 'tous chercheurs',
          nature: 'nominal', multiple: false, absent: SANS.chercheur,
          valeurs: r => ouSans([r.nomComplet], SANS.chercheur) },

        { cle: 'labo',    libelle: 'Laboratoire',     pluriel: 'tous laboratoires',
          nature: 'nominal', multiple: false, absent: SANS.labo,
          valeurs: r => ouSans([r.labo], SANS.labo) },

        { cle: 'statut',  libelle: 'Statut',          pluriel: 'tous statuts',
          nature: 'nominal', multiple: false, absent: SANS.statut,
          valeurs: r => ouSans([r.statut], SANS.statut) },

        { cle: 'domaine', libelle: 'Domaine HCERES',  pluriel: 'tous domaines',
          nature: 'nominal', multiple: true, absent: SANS.domaine,
          valeurs: r => ouSans(r.domaines, SANS.domaine) },

        { cle: 'cnu',     libelle: 'Section CNU',     pluriel: 'toutes sections',
          nature: 'nominal', multiple: true, absent: SANS.cnu,
          valeurs: r => ouSans(r.cnu, SANS.cnu) },

        { cle: 'motcle',  libelle: 'Mot-clé',         pluriel: 'tous mots-clés',
          nature: 'nominal', multiple: true, absent: SANS.motcle,
          valeurs: r => ouSans(r.motscles, SANS.motcle) },
    ],

    ope: [
        { cle: 'annee',   libelle: 'Année',           pluriel: 'toutes années',
          nature: 'temporel', multiple: false, absent: SANS.annee,
          valeurs: r => ouSans([r.annee], SANS.annee) },

        { cle: 'contrat', libelle: 'Type de contrat', pluriel: 'tous types de contrat',
          nature: 'nominal', multiple: false, absent: SANS.contrat,
          valeurs: r => ouSans([r.typeContrat], SANS.contrat) },

        { cle: 'duree',   libelle: 'Durée',           pluriel: 'toutes durées',
          nature: 'nominal', multiple: false, absent: SANS.duree,
          /* Tranches calculées au chargement à partir des dates de début et
             de fin ; l'ordre d'affichage est celui des tranches, pas celui
             des effectifs, sans quoi la lecture n'aurait aucun sens. */
          ordre: ['Moins de 6 mois', 'De 6 à 12 mois', 'De 1 à 2 ans',
                  'De 2 à 4 ans', 'Plus de 4 ans', SANS.duree],
          valeurs: r => ouSans([r.duree], SANS.duree) },

        { cle: 'type',    libelle: 'Type de partenaire', pluriel: 'tous types de partenaires',
          nature: 'nominal', multiple: true, absent: SANS.type,
          entite: 'partenaires', identite: p => p.nom, extrait: p => p.type,
          valeurs: r => ouSans(r.partenaires.map(p => p.type), SANS.type) },

        { cle: 'partenaire', libelle: 'Partenaire',   pluriel: 'tous partenaires',
          nature: 'nominal', multiple: true, absent: SANS.partenaire,
          entite: 'partenaires', identite: p => p.nom, extrait: p => p.nom,
          valeurs: r => ouSans(r.partenaires.map(p => p.nom), SANS.partenaire) },

        /* Le code NAF qualifie l'activité du partenaire, pas l'opération.
           Son libellé le dit, faute de quoi on cherche en vain le rapport
           entre un contrat et un code d'activité économique. */
        { cle: 'naf',     libelle: 'Activité du partenaire', pluriel: 'toutes activités de partenaires',
          nature: 'nominal', multiple: true, absent: SANS.naf,
          entite: 'partenaires', identite: p => p.nom, extrait: p => p.naf,
          valeurs: r => ouSans(r.partenaires.map(p => p.naf), SANS.naf) },

        { cle: 'labo',    libelle: 'Laboratoire',     pluriel: 'tous laboratoires',
          nature: 'nominal', multiple: true, absent: SANS.labo,
          valeurs: r => ouSans(r.labos, SANS.labo) },

        { cle: 'ec',      libelle: 'EC impliqué',     pluriel: 'tous EC',
          nature: 'nominal', multiple: true, absent: SANS.ec,
          valeurs: r => ouSans(r.ecs, SANS.ec) },
    ],
};

/** Champs proposés comme facettes de filtrage, par tableau de bord.
    Les autres restent disponibles pour les graphiques et l'atelier.
    Les mots-clés en sont volontairement absents : plusieurs milliers de
    valeurs distinctes, que la recherche libre sert bien mieux qu'une liste. */
export const FACETTES = {
    ec:  ['labo', 'statut', 'domaine', 'cnu'],
    ope: ['annee', 'contrat', 'duree', 'type', 'partenaire', 'labo', 'naf'],
};

export const UNITE = {
    ec:  { singulier: 'enseignant-chercheur', pluriel: 'enseignants-chercheurs', court: 'EC' },
    ope: { singulier: 'opération',            pluriel: 'opérations',             court: 'OPE' },
};

export const TITRES = {
    ec:  'Enseignants-chercheurs',
    ope: 'Opérations de partenariat',
};

export function champ(source, cle) {
    return CHAMPS[source]?.find(c => c.cle === cle) || null;
}

/** Valeurs d'un enregistrement pour un champ, toujours sous forme de tableau. */
export function valeursDe(rec, source, cle) {
    const c = champ(source, cle);
    return c ? c.valeurs(rec) : [];
}


/* ─────────────────────────────────────────────────────────────────────────
   Masquages appliqués d'office
───────────────────────────────────────────────────────────────────────── */

/**
 * Valeurs mises hors périmètre au premier chargement.
 *
 * L'établissement porteur figure comme partenaire dans la plupart des
 * opérations, ce qui est exact mais sans intérêt pour la lecture : il écrase
 * l'échelle des figures, gonfle le type « Université » et masque les
 * partenaires extérieurs, qui sont le sujet. Le masquer d'office donne
 * d'emblée la lecture attendue.
 *
 * Le masquage reste réversible d'un clic, apparaît dans le panneau des
 * valeurs masquées et dans la légende : rien n'est écarté en silence.
 *
 * La reconnaissance se fait sur une forme réduite, les intitulés variant
 * d'une saisie à l'autre — accents, ponctuation, chiffres romains.
 */
const MOTIFS_MASQUES = {
    ope: [/^universit[ée]?paris(8|viii)$/],
    ec:  [],
};

const reduire = texte => String(texte ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');

/** Les valeurs d'un jeu de données qui doivent être masquées d'office. */
export function masquagesParDefaut(records, source) {
    const motifs = MOTIFS_MASQUES[source] || [];
    if (!motifs.length) return [];

    const trouvees = new Set();
    (CHAMPS[source] || []).forEach(def => {
        records.forEach(rec => {
            def.valeurs(rec).forEach(v => {
                if (motifs.some(m => m.test(reduire(v)))) trouvees.add(v);
            });
        });
    });
    return [...trouvees];
}
