/**
 * core/omeka.js
 * Chargement depuis l'API Omeka S et normalisation en enregistrements plats.
 *
 * Sortie : deux jeux d'enregistrements homogènes, un par tableau de bord.
 *   ec  : { id, kind:'ec', nom, prenom, nomComplet, statut, labo, domaines[], cnu[], motscles[], url }
 *   ope : { id, kind:'ope', titre, annee, partenaires[], labos[], ecs[], url }
 *
 * Rien d'autre dans l'application ne parle le JSON-LD d'Omeka : tout part d'ici.
 */

export const CONFIG = {
    /* Aucune adresse par défaut.
       Une adresse codée en dur se retrouve dans le code publié, y désigne une
       instance qui ne regarde personne d'autre, et impose de modifier le code
       pour déployer ailleurs. L'application demande donc l'adresse au premier
       lancement et la retient dans le navigateur. */
    api:            '',
    classeEc:       'EnseignantChercheur',
    classeOpe:      'OPE',
    classePartenaire: 'PartenairesOPE',
    ident: '',
    key:   '',
};

/** Valeurs par défaut, conservées pour pouvoir revenir en arrière. */
const DEFAUTS = { ...CONFIG };

/** Une adresse d'API doit être absolue : une adresse relative ferait porter
    les requêtes sur le serveur qui héberge la page, pas sur Omeka S. */
export function adresseValide(url) {
    try {
        const u = new URL(String(url || '').trim());
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch { return false; }
}

/* Surcharge éventuelle depuis localStorage (écran de configuration).
   Une valeur vide ou invalide est ignorée plutôt qu'appliquée : sans quoi
   une configuration enregistrée par mégarde rendrait l'outil inutilisable
   sans message compréhensible. */
export function chargerConfig() {
    let stocke = {};
    try { stocke = JSON.parse(localStorage.getItem('valo_config') || '{}'); }
    catch { stocke = {}; }

    if (adresseValide(stocke.api)) CONFIG.api = stocke.api;
    if (typeof stocke.ident === 'string') CONFIG.ident = stocke.ident;
    if (typeof stocke.key === 'string')   CONFIG.key   = stocke.key;

    return CONFIG;
}

export function enregistrerConfig(patch) {
    if (patch.api !== undefined && !adresseValide(patch.api)) {
        throw new Error('L’adresse de l’API doit être complète, par exemple '
                      + 'https://exemple.org/omeka/api/');
    }
    Object.assign(CONFIG, patch);
    localStorage.setItem('valo_config', JSON.stringify({
        api: CONFIG.api, ident: CONFIG.ident, key: CONFIG.key,
    }));
}

/** Revenir à l'adresse d'origine. */
export function reinitialiserConfig() {
    localStorage.removeItem('valo_config');
    Object.assign(CONFIG, DEFAUTS);
}

/* ─────────────────────────────────────────────────────────────────────────
   Cache : évite de recharger l'intégralité de la base à chaque ouverture.
   Une entrée périmée est ignorée plutôt que supprimée, pour rester utilisable
   en secours si l'API est injoignable.
───────────────────────────────────────────────────────────────────────── */
const DUREE_CACHE = 6 * 60 * 60 * 1000;   // 6 heures

/**
 * Version du format des enregistrements. À incrémenter dès que la
 * normalisation change — nouvelle propriété lue, règle de date modifiée,
 * champ ajouté.
 *
 * Sans ce marqueur, une correction apportée à la lecture des données reste
 * sans effet visible tant que le cache n'a pas expiré : l'application relit
 * des enregistrements produits par la version précédente du code. On croit
 * alors le correctif inopérant, et on cherche l'erreur là où elle n'est pas.
 */
const VERSION_FORMAT = 5;

function lireCache(cle) {
    try {
        const brut = localStorage.getItem(cle);
        if (!brut) return null;
        const { date, valeur, version } = JSON.parse(brut);
        /* Un cache produit par une autre version du code est inutilisable :
           mieux vaut recharger que d'afficher des données mal normalisées. */
        if (version !== VERSION_FORMAT) return null;
        return { perime: Date.now() - date > DUREE_CACHE, valeur, date };
    } catch { return null; }
}

function ecrireCache(cle, valeur) {
    try {
        localStorage.setItem(cle, JSON.stringify({
            date: Date.now(), version: VERSION_FORMAT, valeur,
        }));
    } catch { /* quota dépassé : le cache est un confort, pas une nécessité */ }
}

/** Âge du cache d'une source, en minutes, ou null s'il n'y en a pas. */
export function ageCache(source) {
    const c = lireCache(`valo_cache_${source}_${CONFIG.api}`);
    return c ? Math.round((Date.now() - c.date) / 60000) : null;
}

export function viderCache() {
    Object.keys(localStorage)
        .filter(k => k.startsWith('valo_cache_'))
        .forEach(k => localStorage.removeItem(k));
}

/* ─────────────────────────────────────────────────────────────────────────
   Accès HTTP
───────────────────────────────────────────────────────────────────────── */
function suffixeAuth() {
    return CONFIG.ident ? `&key_identity=${CONFIG.ident}&key_credential=${CONFIG.key}` : '';
}

function base() {
    if (!adresseValide(CONFIG.api)) {
        throw new Error('Aucune adresse d’API valide n’est configurée. '
                      + 'Ouvrez la configuration pour la renseigner.');
    }
    return CONFIG.api.replace(/\/+$/, '') + '/';
}

async function json(url) {
    let r;
    try {
        r = await fetch(url, { headers: { Accept: 'application/json' } });
    } catch (err) {
        /* Un échec réseau ici est presque toujours un refus CORS : le
           navigateur ne dit pas lequel, mais l'origine de la page est la
           piste à donner. */
        throw new Error(`Requête bloquée vers ${new URL(url).origin}. `
                      + `Vérifiez que cette API autorise l’origine ${location.origin} (CORS).`);
    }
    if (!r.ok) throw new Error(`Réponse ${r.status} de l’API pour ${new URL(url).pathname}`);
    return r.json();
}

/** Toutes les pages d'une classe. Le plafond évite une boucle infinie
    si l'API renvoie indéfiniment des pages pleines. */
async function toutesLesPages(classeId, progres, libelle) {
    const items = [];
    for (let page = 1; page <= 40; page++) {
        progres?.(`${libelle} — ${items.length} éléments chargés…`);
        const lot = await json(`${base()}items?resource_class_id=${classeId}&page=${page}&per_page=100${suffixeAuth()}`);
        items.push(...lot);
        if (lot.length < 100) break;
    }
    return items;
}

async function idsDesClasses() {
    const classes = await json(`${base()}resource_classes?per_page=500${suffixeAuth()}`);
    const trouver = nom => classes.find(c =>
        c['o:local_name'] === nom || c['o:label'] === nom)?.['o:id'];
    return {
        ec:         trouver(CONFIG.classeEc),
        ope:        trouver(CONFIG.classeOpe),
        partenaire: trouver(CONFIG.classePartenaire),
    };
}

/** Résout des items liés en libellés lisibles.
    `dcterms:alternative` est le libellé rédigé ; `o:title` sert de repli. */
async function resoudreLibelles(ids, progres) {
    const resultat = {};
    const liste = [...ids];
    if (!liste.length) return resultat;
    for (let i = 0; i < liste.length; i += 8) {
        progres?.(`Résolution des libellés — ${i} / ${liste.length}…`);
        await Promise.allSettled(liste.slice(i, i + 8).map(async id => {
            try {
                const item = await json(`${base()}items/${id}${suffixeAuth().replace(/^&/, '?')}`);
                const alt   = item['dcterms:alternative']?.[0]?.['@value'];
                const titre = item['dcterms:title']?.[0]?.['@value'] || item['o:title'];
                resultat[id] = { libelle: alt || titre || String(id), titre: titre || '' };
            } catch { /* un libellé manquant n'empêche pas le reste de charger */ }
        }));
    }
    return resultat;
}

/* ─────────────────────────────────────────────────────────────────────────
   Lecture des propriétés JSON-LD
───────────────────────────────────────────────────────────────────────── */
const valeur  = (item, prop) => item[prop]?.[0]?.['@value'] ?? null;

/** Première valeur d'une propriété, qu'elle soit littérale ou liée à un item.
    Omeka permet les deux formes pour une même propriété selon la saisie ;
    ne lire que `@value` fait silencieusement disparaître les valeurs liées. */
const texteOuLien = (item, prop) => {
    const v = item[prop]?.[0];
    if (!v) return null;
    return v['@value'] ?? v.display_title ?? null;
};

/**
 * Cherche une propriété dont le nom local contient l'un des mots donnés.
 *
 * Les intitulés varient d'une installation d'Omeka à l'autre, et une liste
 * figée de noms candidats se révèle fausse dès qu'on change de base — ce qui
 * vide le champ sans provoquer la moindre erreur. On repère donc la propriété
 * par son nom, et le diagnostic ci-dessous permet de vérifier ce qui a été
 * retenu.
 */
function chercherPropriete(item, mots) {
    const cles = Object.keys(item).filter(k => k.includes(':') && !k.startsWith('o:'));
    for (const mot of mots) {
        const trouve = cles.find(k => {
            const local = k.split(':')[1].toLowerCase();
            return local.includes(mot);
        });
        if (trouve) {
            const v = item[trouve]?.[0];
            const texte = v?.['@value'] ?? v?.display_title ?? null;
            if (texte) return { propriete: trouve, valeur: texte };
        }
    }
    return null;
}

/** Première valeur trouvée parmi plusieurs propriétés candidates.
    Les intitulés de propriétés varient d'une base à l'autre ; plutôt que de
    n'en essayer qu'un et rendre un champ vide, on les parcourt dans l'ordre. */
const premiereDe = (item, props) => {
    for (const p of props) {
        const v = texteOuLien(item, p);
        if (v) return v;
    }
    return null;
};
const valeurs = (item, prop) => (item[prop] || [])
    .map(v => v['@value'] ?? v.display_title ?? '')
    .filter(Boolean);
const liens   = (item, prop) => (item[prop] || [])
    .filter(v => v.value_resource_id)
    .map(v => ({ id: v.value_resource_id, titre: v.display_title || '' }));

/* ─────────────────────────────────────────────────────────────────────────
   Enseignants-chercheurs
───────────────────────────────────────────────────────────────────────── */
function normaliserEc(brut, libelles) {
    return brut.map(item => {
        const prenom = valeur(item, 'foaf:givenName') || valeur(item, 'foaf:firstName') || '';
        const nom    = valeur(item, 'foaf:familyName') || '';
        const alt    = valeur(item, 'dcterms:alternative') || '';
        const titre  = valeur(item, 'dcterms:title') || item['o:title'] || `EC ${item['o:id']}`;

        const parLiens = (prop) => {
            const l = liens(item, prop);
            return l.length
                ? l.map(x => libelles[x.id]?.libelle || x.titre || String(x.id))
                : valeurs(item, prop);
        };

        const labo = liens(item, 'dcterms:isPartOf')[0];

        return {
            id:         item['o:id'],
            kind:       'ec',
            nom, prenom,
            nomComplet: alt || [prenom, nom].filter(Boolean).join(' ') || titre,
            statut: (premiereDe(item, ['curation:status', 'valo:statut', 'valo:statutEC'])
                     || chercherPropriete(item, ['status', 'statut', 'corps', 'grade'])?.valeur
                     || ''),
            labo:       labo ? (labo.titre || libelles[labo.id]?.libelle || '') : '',
            domaines:   parLiens('valo:domaineHceres'),
            cnu:        parLiens('valo:cnu'),
            motscles:   valeurs(item, 'dcterms:subject'),
            url:        item['@id'] || '',
        };
    });
}

export async function chargerEc(progres) {
    const cle = `valo_cache_ec_${CONFIG.api}`;
    const cache = lireCache(cle);
    if (cache && !cache.perime) return cache.valeur;

    try {
        const classes = await idsDesClasses();
        if (!classes.ec) throw new Error(`Classe « ${CONFIG.classeEc} » introuvable dans l'API.`);
        const brut = await toutesLesPages(classes.ec, progres, 'Enseignants-chercheurs');

        const aResoudre = new Set();
        brut.forEach(item => ['valo:domaineHceres', 'valo:cnu']
            .forEach(p => liens(item, p).forEach(l => aResoudre.add(l.id))));
        const libelles = await resoudreLibelles(aResoudre, progres);

        const records = normaliserEc(brut, libelles);
        ecrireCache(cle, records);
        return records;
    } catch (err) {
        if (cache) return cache.valeur;   // secours : cache périmé plutôt que rien
        throw err;
    }
}

/* ─────────────────────────────────────────────────────────────────────────
   Opérations de partenariat externe
───────────────────────────────────────────────────────────────────────── */
/**
 * Analyse une date saisie à la main. Les formats rencontrés dans la base sont
 * JJ/MM/AA et JJ/MM/AAAA, parfois séparés par des tirets ou des points ;
 * l'ISO apparaît aussi. Renvoie un objet Date ou null.
 *
 * Une année sur deux chiffres est ramenée au XXIe siècle : les opérations
 * couvrent les années 2010-2020, « 22 » ne peut pas désigner 1922.
 */
export function analyserDate(texte) {
    const brut = String(texte || '').trim();
    if (!brut) return null;

    /* JJ/MM/AA(AA) — le jour vient en premier, convention française. */
    const fr = brut.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (fr) {
        const jour = +fr[1], mois = +fr[2];
        let annee = +fr[3];
        if (annee < 100) annee += 2000;
        if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
        const d = new Date(Date.UTC(annee, mois - 1, jour));
        return isNaN(d) ? null : d;
    }

    /* AAAA-MM-JJ ou AAAA */
    const iso = brut.match(/^(\d{4})(?:[-\/](\d{1,2}))?(?:[-\/](\d{1,2}))?/);
    if (iso) {
        const d = new Date(Date.UTC(+iso[1], (+iso[2] || 1) - 1, +iso[3] || 1));
        return isNaN(d) ? null : d;
    }
    return null;
}

/** Année portée par un texte quelconque. */
function anneeDepuis(texte) {
    const m = String(texte || '').match(/\b(19|20)\d{2}\b/);
    return m ? m[0] : '';
}

/**
 * Année d'une opération, par ordre de fiabilité décroissante :
 *   1. date de début renseignée
 *   2. propriété de date générique
 *   3. année inscrite dans l'identifiant (OPE-AAAA-nnnn)
 *
 * Le repli sur le titre couvre les opérations dont les dates n'ont pas été
 * saisies, qui sont nombreuses : sans lui elles disparaîtraient de toute
 * lecture chronologique.
 */
function anneeOperation(debut, dateGenerique, titre) {
    if (debut) return String(debut.getUTCFullYear());
    const parDate = anneeDepuis(dateGenerique);
    if (parDate) return parDate;
    const parTitre = String(titre || '').match(/^[A-Za-z]+[-_\s]((?:19|20)\d{2})/);
    return parTitre ? parTitre[1] : '';
}

/** Durée en jours entre deux dates. */
function dureeEnJours(debut, fin) {
    if (!debut || !fin) return null;
    const jours = Math.round((fin - debut) / 86400000);
    if (jours < 0) return null;          // saisie incohérente : on n'invente pas
    return jours;
}

/** La même durée en mois, arrondie au dixième. */
function moisDepuisJours(jours) {
    return jours === null ? null : Math.round((jours / 30.44) * 10) / 10;
}

/** Tranche de durée, pour le filtrage et les graphiques. */
export function trancheDuree(mois) {
    if (mois === null || mois === undefined) return 'Durée non renseignée';
    if (mois < 6)  return 'Moins de 6 mois';
    if (mois < 12) return 'De 6 à 12 mois';
    if (mois < 24) return 'De 1 à 2 ans';
    if (mois < 48) return 'De 2 à 4 ans';
    return 'Plus de 4 ans';
}

function normaliserOpe(brut, partenaires, libelles = {}) {
    return brut.map(item => {
        const listePartenaires = liens(item, 'valo:opeCollabExterne').map(l =>
            partenaires[l.id] || {
                id: l.id, nom: l.titre || `Partenaire ${l.id}`,
                naf: '', type: '', url: '',
            });

        const titre = valeur(item, 'dcterms:title') || item['o:title'] || `OPE ${item['o:id']}`;
        const debut = analyserDate(
            premiereDe(item, ['curation:start', 'valo:dateDebut'])
            || chercherPropriete(item, ['start', 'debut', 'début'])?.valeur);
        const fin = analyserDate(
            premiereDe(item, ['curation:end', 'valo:dateFin'])
            || chercherPropriete(item, ['end', 'fin', 'echeance', 'échéance'])?.valeur);
        const dateGenerique = premiereDe(item, ['dcterms:date'])
            || chercherPropriete(item, ['date'])?.valeur;
        const jours = dureeEnJours(debut, fin);
        const mois  = moisDepuisJours(jours);

        /* Type de contrat : item lié le plus souvent, mais parfois saisi en
           clair. Les deux formes sont lues, comme pour le statut d'un
           chercheur — n'en lire qu'une vide le champ sans le signaler. */
        const lienType = liens(item, 'valo:opeType')[0];
        const typeContrat = lienType
            ? (libelles[lienType.id]?.libelle || lienType.titre || '')
            : (premiereDe(item, ['valo:opeType'])
               /* « contrat » figure en dernier : il est plus large que les
                  précédents et ne doit servir qu'à défaut. */
               || chercherPropriete(item, ['opetype', 'typeope', 'contrat'])?.valeur
               || '');

        return {
            id:    item['o:id'],
            kind:  'ope',
            titre,
            typeContrat,
            annee: anneeOperation(debut, dateGenerique, titre),
            /* Origine de l'année : sert au panneau de contrôle des données,
               pour distinguer ce qui est saisi de ce qui est déduit. */
            anneeOrigine: debut ? 'date de début'
                        : (anneeDepuis(dateGenerique) ? 'propriété de date'
                        : (anneeOperation(null, null, titre) ? 'identifiant' : 'absente')),
            /* Conservées en texte : le cache passe par JSON, où un objet Date
               deviendrait une chaîne à la relecture — donc autant l'assumer. */
            debut: debut ? debut.toISOString().slice(0, 10) : '',
            fin:   fin   ? fin.toISOString().slice(0, 10)   : '',
            dureeJours: jours,
            dureeMois: mois,
            duree: trancheDuree(mois),
            partenaires: listePartenaires,
            labos: liens(item, 'valo:opeCollabLabo').map(l => l.titre || String(l.id)),
            ecs:   liens(item, 'valo:ecImplique').map(l => l.titre || String(l.id)),
            url:   item['@id'] || '',
        };
    });
}

export async function chargerOpe(progres) {
    const cle = `valo_cache_ope_${CONFIG.api}`;
    const cache = lireCache(cle);
    if (cache && !cache.perime) return cache.valeur;

    try {
        const classes = await idsDesClasses();
        if (!classes.ope) throw new Error(`Classe « ${CONFIG.classeOpe} » introuvable dans l'API.`);

        const [opeBrut, partBrut] = await Promise.all([
            toutesLesPages(classes.ope, progres, 'Opérations'),
            classes.partenaire
                ? toutesLesPages(classes.partenaire, progres, 'Partenaires')
                : Promise.resolve([]),
        ]);

        /* Code NAF, type de partenaire et type de contrat sont des items liés :
           il faut les résoudre. Les deux premiers sont portés par le
           partenaire, le troisième par l'opération. */
        const aResoudre = new Set();
        partBrut.forEach(p => ['valo:codeNaf', 'valo:typePartenaire']
            .forEach(prop => liens(p, prop).forEach(l => aResoudre.add(l.id))));
        opeBrut.forEach(o => ['valo:opeType']
            .forEach(prop => liens(o, prop).forEach(l => aResoudre.add(l.id))));
        const libelles = await resoudreLibelles(aResoudre, progres);

        const partenaires = {};
        partBrut.forEach(p => {
            const lienNaf  = liens(p, 'valo:codeNaf')[0];
            const lienType = liens(p, 'valo:typePartenaire')[0];
            partenaires[p['o:id']] = {
                id:   p['o:id'],
                nom:  p['o:title'] || `Partenaire ${p['o:id']}`,
                naf:  lienNaf  ? (libelles[lienNaf.id]?.libelle  || lienNaf.titre  || '') : '',
                type: lienType ? (libelles[lienType.id]?.libelle || lienType.titre || '') : '',
                url:  p['@id'] || '',
            };
        });

        const records = normaliserOpe(opeBrut, partenaires, libelles);
        ecrireCache(cle, records);
        return records;
    } catch (err) {
        if (cache) return cache.valeur;
        throw err;
    }
}

/** Date de la dernière extraction réussie, pour la ligne de source. */
export function dateExtraction(source) {
    const c = lireCache(`valo_cache_${source}_${CONFIG.api}`);
    return c ? new Date(c.date) : new Date();
}


/* ─────────────────────────────────────────────────────────────────────────
   Diagnostic
   Deviner le nom d'une propriété est la principale source d'erreur
   silencieuse : le champ ressort vide et rien ne le signale. Cette fonction
   rapporte ce que contient réellement la base, propriété par propriété.
───────────────────────────────────────────────────────────────────────── */
export async function diagnostiquer(nomClasse, nb = 3) {
    const classes = await json(`${base()}resource_classes?per_page=500${suffixeAuth()}`);
    const classe = classes.find(c =>
        c['o:local_name'] === nomClasse || c['o:label'] === nomClasse);
    if (!classe) {
        return { erreur: `Classe « ${nomClasse} » introuvable.`,
                 classes: classes.map(c => c['o:local_name']).sort() };
    }

    const items = await json(
        `${base()}items?resource_class_id=${classe['o:id']}&per_page=${nb}${suffixeAuth()}`);
    if (!items.length) return { erreur: 'Aucun élément dans cette classe.' };

    /* Recense les propriétés sur l'échantillon, avec leur forme et un exemple. */
    const releve = new Map();
    items.forEach(item => {
        Object.keys(item).filter(k => k.includes(':') && !k.startsWith('o:')).forEach(cle => {
            const v = item[cle]?.[0];
            if (!v) return;
            const forme = v['@value'] !== undefined ? 'texte'
                        : v.value_resource_id !== undefined ? 'lien'
                        : 'autre';
            const exemple = v['@value'] ?? v.display_title ?? '';
            if (!releve.has(cle)) releve.set(cle, { propriete: cle, forme, exemple, occurrences: 0 });
            releve.get(cle).occurrences++;
        });
    });

    return {
        classe: classe['o:local_name'],
        echantillon: items.length,
        proprietes: [...releve.values()].sort((a, b) =>
            a.propriete.localeCompare(b.propriete)),
    };
}

/** Ce que l'application a effectivement retenu pour un enregistrement. */
export function expliquerLecture(rec) {
    if (rec.kind === 'ope') {
        return [
            ['Titre', rec.titre],
            ['Année retenue', rec.annee || '—'],
            ['Origine de l’année', rec.anneeOrigine || '—'],
            ['Date de début', rec.debut || '—'],
            ['Date de fin', rec.fin || '—'],
            ['Durée', rec.dureeMois != null ? `${rec.dureeMois} mois` : '—'],
        ];
    }
    return [
        ['Nom', rec.nomComplet],
        ['Statut', rec.statut || '—'],
        ['Laboratoire', rec.labo || '—'],
        ['Domaines', (rec.domaines || []).join(', ') || '—'],
    ];
}
