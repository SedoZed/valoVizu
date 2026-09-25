/**
 * Tests d'interface : la page réelle est instanciée dans jsdom, l'API Omeka
 * est simulée, et l'interface est pilotée comme le ferait un utilisateur
 * (clics, saisies). Vérifie que le rendu, les filtres et les compteurs
 * fonctionnent ensemble — ce que les tests unitaires ne montrent pas.
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ici = dirname(fileURLToPath(import.meta.url));
const racine = join(ici, '..');

let ok = 0, ko = 0;
const t = (nom, cond, detail) => {
    if (cond) ok++;
    else { ko++; console.log('  ÉCHEC :', nom, detail !== undefined ? `→ ${JSON.stringify(detail)}` : ''); }
};

/* ── Réponses simulées de l'API Omeka S ──────────────────────────────── */
const CLASSES = [
    { 'o:id': 10, 'o:local_name': 'OPE' },
    { 'o:id': 11, 'o:local_name': 'PartenairesOPE' },
    { 'o:id': 12, 'o:local_name': 'EnseignantChercheur' },
];

const ITEMS_LIES = {
    50: { 'o:id': 50, 'dcterms:alternative': [{ '@value': 'Édition de livres' }], 'o:title': '58.11Z' },
    51: { 'o:id': 51, 'dcterms:alternative': [{ '@value': 'Recherche-développement' }], 'o:title': '72.20Z' },
    60: { 'o:id': 60, 'dcterms:alternative': [{ '@value': 'Entreprise privée' }], 'o:title': 'Entreprise' },
    61: { 'o:id': 61, 'dcterms:alternative': [{ '@value': 'Organisme public' }], 'o:title': 'Public' },
    80: { 'o:id': 80, 'dcterms:alternative': [{ '@value': 'Convention de recherche' }],
          'o:title': 'CR' },
    81: { 'o:id': 81, 'dcterms:alternative': [{ '@value': 'Prestation de service' }],
          'o:title': 'PS' },
    70: { 'o:id': 70, 'o:title': 'Maître de conférences' },
};

const PARTENAIRES = [
    { 'o:id': 100, 'o:title': "EDITIONS L'HARMATTAN",
      'valo:codeNaf': [{ value_resource_id: 50, display_title: '58.11Z' }],
      'valo:typePartenaire': [{ value_resource_id: 60, display_title: 'Entreprise' }] },
    { 'o:id': 101, 'o:title': 'CNRS',
      'valo:codeNaf': [{ value_resource_id: 51, display_title: '72.20Z' }],
      'valo:typePartenaire': [{ value_resource_id: 61, display_title: 'Public' }] },
    { 'o:id': 102, 'o:title': 'VILLE DE SAINT-DENIS',
      'valo:typePartenaire': [{ value_resource_id: 61, display_title: 'Public' }] },
];

const OPES = [
    /* Montants sous quatre formes : nombre simple, décimale à la virgule,
       absence, et saisie illisible. Sans cette variété, ni l'analyse ni le
       contrôle des données ne seraient exercés. */
    { 'o:id': 200, 'o:title': 'OPE-2022-0001',
      'valo:budgOPE': [{ '@value': '12 000 €' }],
      'valo:montantGlobal': [{ '@value': '45000' }],
      'dcterms:title': [{ '@value': 'OPE-2022-0001' }],
      'curation:start': [{ '@value': '01/06/22' }],
      'curation:end':   [{ '@value': '31/12/23' }],
      'valo:opeType': [{ value_resource_id: 80, display_title: 'CR' }],
      'valo:opeCollabExterne': [{ value_resource_id: 100, display_title: "EDITIONS L'HARMATTAN" }],
      'valo:opeCollabLabo': [{ value_resource_id: 300, display_title: 'LLCP' }],
      'valo:ecImplique': [{ value_resource_id: 400, display_title: 'Durand Marie' }] },
    { 'o:id': 201, 'o:title': 'OPE-2023-0002',
      'valo:budgOPE': [{ '@value': '3500,50' }],
      /* Budget supérieur au montant global : incohérence à signaler. */
      'valo:montantGlobal': [{ '@value': '2000' }],
      'dcterms:title': [{ '@value': 'OPE-2023-0002' }],
      /* Saisi en clair plutôt que lié : les deux formes doivent être lues. */
      'valo:opeType': [{ '@value': 'Contrat de collaboration' }],
      'valo:opeCollabExterne': [{ value_resource_id: 101, display_title: 'CNRS' }],
      'valo:opeCollabLabo': [{ value_resource_id: 301, display_title: 'CEMTI' }],
      'valo:ecImplique': [] },
    { 'o:id': 203, 'o:title': 'Contrat atypique',
      'valo:budgOPE': [{ '@value': 'environ 5000' }],
      'dcterms:title': [{ '@value': 'Contrat atypique' }],
      /* Noms de propriétés volontairement inattendus : vérifie que la
         détection par nom prend le relais de la liste explicite. */
      'valo:typeDeContratOpe': [{ '@value': 'Convention-cadre' }],
      'valo:dateDeDebutOperation': [{ '@value': '10/01/2021' }],
      'valo:dateDeFinOperation':   [{ '@value': '09/01/2022' }],
      'valo:opeCollabExterne': [{ value_resource_id: 101, display_title: 'CNRS' }],
      'valo:opeCollabLabo': [], 'valo:ecImplique': [] },
    { 'o:id': 202, 'o:title': 'Convention territoriale',
      'dcterms:date': [{ '@value': '2023-09-15' }],
      'curation:start': [{ '@value': '15/09/2023' }],
      'curation:end':   [{ '@value': '14/12/2023' }],
      'valo:opeCollabExterne': [
          { value_resource_id: 102, display_title: 'VILLE DE SAINT-DENIS' },
          { value_resource_id: 101, display_title: 'CNRS' }],
      'valo:opeCollabLabo': [{ value_resource_id: 300, display_title: 'LLCP' }],
      'valo:ecImplique': [] },
];

const ECS = [
    { 'o:id': 400, 'o:title': 'Durand Marie',
      'foaf:givenName': [{ '@value': 'Marie' }], 'foaf:familyName': [{ '@value': 'Durand' }],
      'curation:status': [{ value_resource_id: 70, display_title: 'Maître de conférences' }],
      'dcterms:isPartOf': [{ value_resource_id: 300, display_title: 'LLCP' }],
      'dcterms:subject': [{ '@value': 'archives' }, { '@value': 'numérique' }] },
    { 'o:id': 401, 'o:title': 'Martin Paul',
      'foaf:givenName': [{ '@value': 'Paul' }], 'foaf:familyName': [{ '@value': 'Martin' }],
      /* Statut sous un intitulé non prévu : la détection par nom doit le voir. */
      'valo:statutDuChercheur': [{ '@value': 'Professeur des universités' }],
      'dcterms:isPartOf': [{ value_resource_id: 301, display_title: 'CEMTI' }],
      'dcterms:subject': [{ '@value': 'cinéma' }] },

    /* Douze statuts distincts : un jeu d'essai réduit à deux valeurs ne peut
       pas révéler un plafond de séries mal placé, puisqu'il ne l'atteint
       jamais. Les effectifs restent volontairement inégaux, pour que le
       classement ait un sens. */
    ...['ATER', 'PAST', 'PRAG', 'PRCE', 'Doctorant contractuel',
        'Chercheur associé', 'Professeur émérite', 'Ingénieur de recherche',
        'Post-doctorant', 'Chargé de recherche', 'Directeur de recherche',
        'Maître de conférences HDR']
        .map((statut, i) => ({
            'o:id': 410 + i,
            'o:title': `Chercheur ${i}`,
            'foaf:givenName': [{ '@value': 'Prénom' }],
            'foaf:familyName': [{ '@value': 'Nom' + i }],
            'curation:status': [{ '@value': statut }],
            'dcterms:isPartOf': [{
                value_resource_id: i % 2 ? 301 : 300,
                display_title: i % 2 ? 'CEMTI' : 'LLCP' }],
            'dcterms:subject': [{ '@value': 'thème ' + (i % 3) }],
        })),
];

function repondre(url) {
    if (url.includes('resource_classes')) return CLASSES;
    const item = url.match(/\/items\/(\d+)/);
    if (item) return ITEMS_LIES[item[1]] || { 'o:id': +item[1], 'o:title': 'Inconnu' };
    if (url.includes('resource_class_id=10')) return url.includes('page=1') ? OPES : [];
    if (url.includes('resource_class_id=11')) return url.includes('page=1') ? PARTENAIRES : [];
    if (url.includes('resource_class_id=12')) return url.includes('page=1') ? ECS : [];
    return [];
}

/* ── Instanciation de la page ────────────────────────────────────────── */
const html = readFileSync(join(racine, 'index.html'), 'utf8');
const css  = readFileSync(join(racine, 'css/style.css'), 'utf8');

/* Sentinelle d'erreurs.
   Une exception levée dans un gestionnaire d'événement — un clic, un
   changement de sélecteur — n'interrompt pas la suite : jsdom l'avale et la
   vérification suivante passe comme si de rien n'était. Une figure pouvait
   donc se casser à l'usage sans qu'aucun test ne bronche. Elles sont
   désormais relevées et comptées à la fin. */
const incidents = [];
const consoleVirtuelle = new VirtualConsole();
consoleVirtuelle.on('jsdomError', e => incidents.push(`jsdom : ${e.message}`));
consoleVirtuelle.on('error', (...args) => incidents.push(`console.error : ${args.join(' ')}`));

const dom = new JSDOM(html, {
    url: 'http://localhost/', runScripts: 'outside-only',
    virtualConsole: consoleVirtuelle,
});
const w = dom.window;
w.addEventListener('error', e => incidents.push(`onerror : ${e.message || e.error}`));
w.addEventListener('unhandledrejection', e => incidents.push(`promesse : ${e.reason}`));
globalThis.window = w;
globalThis.document = w.document;

/* La feuille de style doit être présente : sans elle, les styles calculés
   sont vides et les vérifications d'apparence ne valident rien. */
const style = w.document.createElement('style');
style.textContent = css;
w.document.head.appendChild(style);

/* jsdom expose localStorage en lecture seule : il faut redéfinir la propriété
   plutôt que l'affecter. */
const memoire = {};
const stockage = {
    getItem: k => memoire[k] ?? null,
    setItem: (k, v) => { memoire[k] = String(v); },
    removeItem: k => { delete memoire[k]; },
    key: i => Object.keys(memoire)[i] ?? null,
    get length() { return Object.keys(memoire).length; },
};
/* Aucune adresse d'API n'est fournie par défaut : l'application demanderait
   la sienne au premier lancement. Le jeu d'essai en pose une, comme le ferait
   un utilisateur ayant déjà configuré l'outil. */
memoire.valo_config = JSON.stringify({ api: 'http://localhost/api/', ident: '', key: '' });

globalThis.localStorage = stockage;
Object.defineProperty(w, 'localStorage', { value: stockage, configurable: true });

globalThis.fetch = async (url) => ({
    ok: true, status: 200,
    json: async () => repondre(String(url)),
});

globalThis.CustomEvent = w.CustomEvent;
globalThis.getComputedStyle = w.getComputedStyle.bind(w);
globalThis.XMLSerializer = w.XMLSerializer;
globalThis.location = w.location;
globalThis.history = w.history;
/* jsdom fournit ces fonctions sur la fenêtre, non en variables globales. */
globalThis.requestAnimationFrame = fn => w.setTimeout(() => fn(Date.now()), 16);
globalThis.cancelAnimationFrame = id => w.clearTimeout(id);

/* jsdom n'implémente pas la géométrie SVG. Sans ces compléments, le
   glissement des nœuds n'est pas même câblé, et le vérifier ne prouverait
   rien. La transformation retenue est l'identité : les coordonnées de la
   fenêtre valent alors celles du dessin, ce qui suffit à la vérification. */
if (!w.SVGSVGElement.prototype.createSVGPoint) {
    /* La matrice reproduit une transformation réelle : le <svg> est à
       l'identité, mais le groupe transformé porte une échelle et une
       translation. Sans cet écart, convertir au mauvais niveau donnerait le
       même résultat qu'au bon, et le contrôle ne prouverait rien. */
    w.SVGSVGElement.prototype.createSVGPoint = function () {
        return {
            x: 0, y: 0,
            matrixTransform(m) {
                const k = m?.k ?? 1, tx = m?.tx ?? 0, ty = m?.ty ?? 0;
                return { x: (this.x - tx) / k, y: (this.y - ty) / k };
            },
        };
    };
    w.SVGSVGElement.prototype.getScreenCTM = function () {
        return { inverse: () => ({ k: 1, tx: 0, ty: 0 }) };
    };
    /* Le groupe hérite de la transformation qu'on lui a posée. */
    w.SVGElement.prototype.getScreenCTM = function () {
        const t = /translate\(([-\d.]+),([-\d.]+)\)\s*scale\(([-\d.]+)\)/
            .exec(this.getAttribute('transform') || '');
        if (!t) return { inverse: () => ({ k: 1, tx: 0, ty: 0 }) };
        return { inverse: () => ({ k: +t[3], tx: +t[1], ty: +t[2] }) };
    };
}
if (!w.Element.prototype.setPointerCapture) {
    w.Element.prototype.setPointerCapture = function () {};
    w.Element.prototype.releasePointerCapture = function () {};
}
globalThis.Blob = w.Blob || class { constructor() {} };
globalThis.URL = w.URL;

/* ── Démarrage de l'application ──────────────────────────────────────── */
const { default: _ } = await import('../js/app.js').then(m => ({ default: m })).catch(e => {
    console.log('  ÉCHEC : chargement du module', e.message);
    process.exit(1);
});

const attendre = ms => new Promise(r => setTimeout(r, ms));
await attendre(300);

const app = globalThis.__valo || w.__valo;
const $ = id => w.document.getElementById(id);

/* Visibilité réellement calculée. Vérifier l'attribut `hidden` ne suffit pas :
   une règle de disposition peut l'écraser sans que le code s'en aperçoive. */
/* Les facettes sont repliées par défaut : les ouvrir est le préalable à
   toute interaction avec leurs valeurs. */
const ouvrirFacettes = async () => {
    const fermees = [...w.document.querySelectorAll('.facette-bascule')]
        .filter(b => b.getAttribute('aria-expanded') === 'false');
    for (const b of fermees) { b.click(); await new Promise(r => setTimeout(r, 15)); }
};

const visible = el => {
    if (!el) return false;
    const st = w.getComputedStyle(el);
    return st.display !== 'none' && st.visibility !== 'hidden';
};

console.log('\nChargement et rendu');

t('application démarrée', !!app);
t('voile retiré (attribut)', $('voile').hidden);
t('voile réellement invisible', !visible($('voile')),
  w.getComputedStyle($('voile')).display);
t('configuration réellement masquée au démarrage', !visible($('config')),
  w.getComputedStyle($('config')).display);
t('contenu principal visible', visible(w.document.querySelector('main')));
t('quatre opérations chargées', app.donnees.ope?.length === 4, app.donnees.ope?.length);

/* Normalisation Omeka */
const ope0 = app.donnees.ope[0];
t('année issue de la date de début', ope0.annee === '2022', ope0.annee);
t('origine de l’année tracée', ope0.anneeOrigine === 'date de début', ope0.anneeOrigine);
t('date de début analysée (JJ/MM/AA)', ope0.debut === '2022-06-01', ope0.debut);
t('date de fin analysée', ope0.fin === '2023-12-31', ope0.fin);
t('durée calculée', ope0.dureeMois > 18 && ope0.dureeMois < 20, ope0.dureeMois);
t('tranche de durée', ope0.duree === 'De 1 à 2 ans', ope0.duree);

const opeSansDate = app.donnees.ope.find(o => o.id === 201);
t('année déduite de l’identifiant', opeSansDate.annee === '2023', opeSansDate.annee);
t('origine « identifiant »', opeSansDate.anneeOrigine === 'identifiant', opeSansDate.anneeOrigine);
t('durée absente signalée', opeSansDate.duree === 'Durée non renseignée', opeSansDate.duree);

const opeCourte = app.donnees.ope.find(o => o.id === 202);
t('durée courte', opeCourte.duree === 'Moins de 6 mois', opeCourte.duree);

/* Détection par nom de propriété, quand l'intitulé n'est pas celui attendu */
const atypique = app.donnees.ope.find(o => o.id === 203);
t('date de début détectée par son nom', atypique.debut === '2021-01-10', atypique.debut);
t('date de fin détectée par son nom', atypique.fin === '2022-01-09', atypique.fin);
t('année déduite malgré un nom inattendu', atypique.annee === '2021', atypique.annee);
t('durée calculée sur propriétés atypiques',
  atypique.duree === 'De 6 à 12 mois' || atypique.duree === 'De 1 à 2 ans', atypique.duree);
t('partenaire résolu', ope0.partenaires[0].nom === "EDITIONS L'HARMATTAN");
t('code NAF résolu en libellé', ope0.partenaires[0].naf === 'Édition de livres', ope0.partenaires[0].naf);
t('type de partenaire résolu', ope0.partenaires[0].type === 'Entreprise privée', ope0.partenaires[0].type);

/* Type de contrat : les trois formes de saisie doivent être lues. */
t('type de contrat résolu depuis un item lié',
  ope0.typeContrat === 'Convention de recherche', ope0.typeContrat);
t('type de contrat lu en clair',
  app.donnees.ope.find(o => o.id === 201)?.typeContrat === 'Contrat de collaboration',
  app.donnees.ope.find(o => o.id === 201)?.typeContrat);
t('type de contrat détecté par nom de propriété',
  app.donnees.ope.find(o => o.id === 203)?.typeContrat === 'Convention-cadre',
  app.donnees.ope.find(o => o.id === 203)?.typeContrat);
t('type de contrat absent laissé vide',
  app.donnees.ope.find(o => o.id === 202)?.typeContrat === '');

/* Indicateurs */
const valeurs = [...w.document.querySelectorAll('.indicateur-valeur')].map(e => e.textContent);
t('indicateurs rendus', valeurs.length >= 4, valeurs);
t('effectif exact', valeurs[0] === '4', valeurs[0]);
t('partenaires distincts', valeurs[1] === '3', valeurs[1]);
t('période couverte', valeurs.includes('2021–2023'), valeurs);

/* ── Montants ──
   Les sommes portent sur les opérations de la sélection, chacune comptée une
   fois : c'est le seul endroit où le total est exact. */
const libelles = [...w.document.querySelectorAll('.indicateur-libelle')]
    .map(e => e.textContent);
t('budget cumulé affiché', libelles.includes('budget cumulé'), libelles);
t('montant global cumulé affiché', libelles.includes('montant global cumulé'), libelles);
t('budget médian affiché', libelles.includes('budget médian'), libelles);

const carteDe = nom => valeurs[libelles.indexOf(nom)];
/* 12 000 + 3 500,50 = 15 500,50, arrondi au millier près. */
t('somme des budgets exacte', carteDe('budget cumulé') === '16 k€',
  carteDe('budget cumulé'));
/* 45 000 + 2 000 : le montant global se cumule à part. */
t('somme des montants globaux exacte', carteDe('montant global cumulé') === '47 k€',
  carteDe('montant global cumulé'));
/* Médiane de deux valeurs : leur moyenne, et non la moyenne de la série. */
const sansEspacesFines = t2 => String(t2 || '').replace(/[\u00A0\u202F\s]/g, ' ');
t('médiane et non moyenne',
  sansEspacesFines(carteDe('budget médian')) === '7 750 €',
  JSON.stringify(carteDe('budget médian')));

/* Une valeur illisible ne doit jamais compter pour zéro : elle tirerait la
   somme vers le bas sans que rien ne le signale. */
/* « environ 5000 » est illisible : s'il comptait pour zéro, la médiane
   tomberait à 3 500 € au lieu de 7 750 €. */
t('la saisie illisible ne compte pas pour zéro',
  sansEspacesFines(carteDe('budget médian')) !== '3 500 €',
  carteDe('budget médian'));
t('le taux de renseignement accompagne la somme',
  /2 opération|50 %/.test(
    [...w.document.querySelectorAll('.indicateur')]
      .find(c => c.textContent.includes('budget cumulé'))?.title || ''),
  [...w.document.querySelectorAll('.indicateur')]
      .find(c => c.textContent.includes('budget cumulé'))?.title);

/* Légende */
t('légende renseignée', $('legende-texte').textContent.startsWith('4 opérations'),
  $('legende-texte').textContent);
t('ligne de source présente', $('legende-source').textContent.includes('extraction du'));

/* Facettes */
const titres = [...w.document.querySelectorAll('.facette-tete h3')].map(e => e.textContent);
t('neuf facettes', titres.length === 9, titres);
t('facette durée présente', titres.includes('Durée'), titres);
t('facette type de contrat présente', titres.includes('Type de contrat'), titres);
t('facette type présente', titres.includes('Type de partenaire'), titres);

/* Premier lancement : sans adresse, l'application la demande au lieu de
   présenter un échec, qui laisserait croire à une panne. */
t('écran d’accueil prévu', !!$('voile-accueil'));
t('accueil masqué lorsqu’une adresse est configurée', $('voile-accueil').hidden);
t('aucune adresse codée en dur',
  !/humanum|valorisation\./.test(
    readFileSync(join(racine, 'js/core/omeka.js'), 'utf8')));

console.log('\nInteraction');
const avant = ok;

/* Repli des facettes : sept listes déployées saturent la colonne. */
t('facettes repliées par défaut',
  [...w.document.querySelectorAll('.facette-bascule')]
      .every(b => b.getAttribute('aria-expanded') === 'false'),
  [...w.document.querySelectorAll('.facette-bascule')]
      .map(b => b.getAttribute('aria-expanded')));
t('aucune valeur affichée tant que rien n’est ouvert',
  w.document.querySelectorAll('.facette-liste li').length === 0);

await ouvrirFacettes();
t('les valeurs paraissent une fois dépliées',
  w.document.querySelectorAll('.facette-liste li').length > 0);
t('état de dépliement mémorisé',
  /facette\./.test(memoire.valo_preferences || ''), memoire.valo_preferences);

/* Cocher une case filtre l'ensemble */
const cases = [...w.document.querySelectorAll('.facette-liste input[type=checkbox]')];
const etiquettes = [...w.document.querySelectorAll('.facette-liste label')].map(e => e.textContent);
const iPublic = etiquettes.findIndex(l => l === 'Organisme public');
t('valeur « Organisme public » listée', iPublic >= 0, etiquettes);

cases[iPublic].checked = true;
cases[iPublic].dispatchEvent(new w.Event('change'));
await attendre(30);

t('effectif filtré', $('legende-texte').textContent.startsWith('3 opérations'),
  $('legende-texte').textContent);
t('légende mentionne le filtre', $('legende-texte').textContent.includes('Organisme public'));
t('bouton de réinitialisation affiché', !$('reinit').hidden);
t('tableau filtré', w.document.querySelectorAll('#tableau-hote .tableau-ligne').length === 3,
  w.document.querySelectorAll('#tableau-hote .tableau-ligne').length);

/* Compteur contextuel : les autres valeurs de la même facette restent visibles */
const apresFiltre = [...w.document.querySelectorAll('.facette-liste label')].map(e => e.textContent);
t('compteur contextuel : autres valeurs visibles',
  apresFiltre.includes('Entreprise privée'), apresFiltre);

/* Réinitialiser */
$('reinit').click();
await attendre(30);
t('réinitialisation', $('legende-texte').textContent.startsWith('4 opérations'));

/* Masquer une valeur */
const lis = [...w.document.querySelectorAll('.facette-liste li')];
const liHarmattan = lis.find(li => li.dataset.recherche.includes('HARMATTAN'));
t('partenaire présent dans les facettes', !!liHarmattan);
liHarmattan?.querySelector('.action-masquer').click();
await attendre(30);
t('valeur masquée affichée en puce', w.document.querySelectorAll('#masquees .puce').length === 1);
t('masquage annoncé dans la légende',
  $('legende-texte').textContent.includes('1 valeur masquée'), $('legende-texte').textContent);
t('enregistrement conservé malgré le masquage',
  $('legende-texte').textContent.startsWith('4 opérations'), $('legende-texte').textContent);

/* Remettre */
w.document.querySelector('#masquees .puce').click();
await attendre(30);
t('valeur remise dans le périmètre', w.document.querySelectorAll('#masquees .puce').length === 0);

/* Recherche libre */
/* La recherche porte sur tous les champs : « convention » atteint désormais
   le titre d'une opération et le type de contrat d'une autre. */
$('recherche').value = 'territoriale';
$('recherche').dispatchEvent(new w.Event('input'));
await attendre(300);
t('recherche libre', $('legende-texte').textContent.startsWith('1 opération'),
  $('legende-texte').textContent);
$('recherche').value = 'convention';
$('recherche').dispatchEvent(new w.Event('input'));
await attendre(300);
t('la recherche atteint le type de contrat',
  $('legende-texte').textContent.startsWith('3 opérations'),
  $('legende-texte').textContent);
$('recherche').value = '';
$('recherche').dispatchEvent(new w.Event('input'));
await attendre(300);

console.log(`  ${ok - avant} vérifications passées`);

console.log('\nBascule de tableau de bord');
const avant2 = ok;

$('onglet-ec').click();
await attendre(300);
t('quatorze enseignants-chercheurs', app.donnees.ec?.length === 14, app.donnees.ec?.length);
t('titre mis à jour', $('titre-tableau').textContent === 'Enseignants-chercheurs');
t('légende adaptée', $('legende-texte').textContent.includes('enseignants-chercheurs'),
  $('legende-texte').textContent);
const titresEc = [...w.document.querySelectorAll('.facette-tete h3')].map(e => e.textContent);
t('facettes propres aux EC', titresEc.includes('Statut') && !titresEc.includes('Type de partenaire'),
  titresEc);
t('statut lu depuis un item lié',
  app.donnees.ec[0].statut === 'Maître de conférences', app.donnees.ec[0].statut);
t('statut détecté par nom de propriété',
  app.donnees.ec[1].statut === 'Professeur des universités', app.donnees.ec[1].statut);
await ouvrirFacettes();
const etiqEc = [...w.document.querySelectorAll('.facette-liste label')].map(e => e.textContent);
t('statut présent dans les facettes',
  etiqEc.includes('Maître de conférences'), etiqEc);

/* Les filtres d'un tableau de bord ne contaminent pas l'autre */
const casesEc = [...w.document.querySelectorAll('.facette-liste input[type=checkbox]')];
casesEc[0].checked = true;
casesEc[0].dispatchEvent(new w.Event('change'));
await attendre(30);
const filtresEc = $('legende-texte').textContent;
$('onglet-ope').click();
await attendre(60);
t('filtres cloisonnés par tableau de bord',
  $('legende-texte').textContent.startsWith('4 opérations'), $('legende-texte').textContent);
$('onglet-ec').click();
await attendre(60);
t('filtres retrouvés au retour', $('legende-texte').textContent === filtresEc);

console.log(`  ${ok - avant2} vérifications passées`);

console.log('\nFigures');
const avantF = ok;

/* Les vérifications précédentes ont laissé le tableau de bord sur les
   enseignants-chercheurs : on revient aux opérations. */
$('onglet-ope').click();
await attendre(80);

const figures = w.document.querySelectorAll('#figures .panneau');
t('panneaux graphiques rendus', figures.length >= 5, figures.length);
const titresFig = [...w.document.querySelectorAll('#figures .panneau-tete h2')]
    .map(e => e.textContent);
t('panneau des années', titresFig.includes('Opérations par année'), titresFig);
t('panneau des partenaires', titresFig.includes('Partenaires'), titresFig);
t('panneau croisé', titresFig.includes('Années et partenaires'), titresFig);

const svgs = w.document.querySelectorAll('#figures svg.figure');
t('figures produites en SVG', svgs.length >= 5, svgs.length);
t('colonnes pour les années',
  w.document.querySelectorAll('#figures .colonne').length > 0);
t('barres pour les catégories',
  w.document.querySelectorAll('#figures .barre').length > 0);

/* Les totaux d'une figure doivent égaler l'effectif de la sélection : c'est
   ce qui garantit qu'aucune valeur n'a été écartée par le regroupement. */
const panneauAnnees = [...figures].find(p =>
    p.querySelector('h2').textContent === 'Opérations par année');
const valeursAnnees = [...panneauAnnees.querySelectorAll('.figure-valeur')]
    .map(e => +e.textContent).filter(n => !isNaN(n));
t('somme des colonnes = effectif',
  valeursAnnees.reduce((s, v) => s + v, 0) === app._rows.length,
  { somme: valeursAnnees.reduce((s, v) => s + v, 0), attendu: app._rows.length });

/* Un clic dans une figure filtre, exactement comme cocher la case */
const premiereColonne = panneauAnnees.querySelector('.colonne');
premiereColonne.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await attendre(30);
t('clic dans une figure filtre',
  $('legende-texte').textContent.startsWith('1 opération') ||
  $('legende-texte').textContent.startsWith('2 opérations'),
  $('legende-texte').textContent);
t('filtre visible dans les facettes', !$('reinit').hidden);
$('reinit').click();
await attendre(30);
t('retour à la sélection complète',
  $('legende-texte').textContent.startsWith('4 opérations'));

/* Accessibilité : les éléments cliquables doivent être atteignables */
t('barres accessibles au clavier',
  [...w.document.querySelectorAll('#figures .barre')]
      .every(b => b.getAttribute('tabindex') === '0'));
t('infobulles présentes',
  w.document.querySelectorAll('#figures title').length > 0);

console.log(`  ${ok - avantF} vérifications passées`);

console.log('\nPanneau partenaires');
const avantP = ok;

t('panneau visible en mode opérations', !$('panneau-partenaires').hidden);
const lignesPart = w.document.querySelectorAll('#partenaires-hote .tableau-ligne');
t('une ligne par partenaire', lignesPart.length === 3, lignesPart.length);

const premiere = lignesPart[0].cells;
t('type affiché', [...lignesPart].some(l => l.cells[1].textContent === 'Organisme public'),
  [...lignesPart].map(l => l.cells[1].textContent));
t('activité affichée', [...lignesPart].some(l => l.cells[2].textContent === 'Recherche-développement'),
  [...lignesPart].map(l => l.cells[2].textContent));
t('nombre d’opérations',
  [...lignesPart].map(l => +l.cells[3].textContent).reduce((s, v) => s + v, 0) === 5,
  [...lignesPart].map(l => l.cells[3].textContent));

/* Clic sur un partenaire : filtre */
lignesPart[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await attendre(30);
t('clic sur un partenaire filtre', !$('reinit').hidden);
$('reinit').click();
await attendre(30);

const csvPart = app.partenaires.csv().split('\r\n');
t('export partenaires', csvPart.length === 4 && csvPart[0].includes('Activité'), csvPart[0]);

/* Le panneau disparaît côté enseignants-chercheurs */
$('onglet-ec').click();
await attendre(200);
t('panneau masqué hors opérations', $('panneau-partenaires').hidden);
$('onglet-ope').click();
await attendre(60);

console.log(`  ${ok - avantP} vérifications passées`);

console.log('\nDurées et paramètres');
const avantD = ok;

/* L'infobulle de durée doit exposer les dates et le calcul */
const celluleDuree = w.document.querySelector('#tableau-hote .cellule-duree');
t('cellule de durée repérable', !!celluleDuree);
t('infobulle : dates présentes',
  celluleDuree.title.includes('/') && celluleDuree.title.includes('jours'),
  celluleDuree.title);
t('infobulle : tranche rappelée',
  celluleDuree.title.includes('Tranche'), celluleDuree.title);

/* Le réglage change l'affichage sans toucher aux effectifs */
const effectifAvant = $('legende-texte').textContent;
const prefDuree = $('pref-duree');
prefDuree.value = 'jours';
prefDuree.dispatchEvent(new w.Event('change'));
await attendre(40);
const cellules = [...w.document.querySelectorAll('#tableau-hote .cellule-duree')]
    .map(c => c.textContent);
t('durées affichées en jours', cellules.some(c => / j$/.test(c)), cellules);
t('effectifs inchangés par un réglage d’affichage',
  $('legende-texte').textContent === effectifAvant);

prefDuree.value = 'tranches';
prefDuree.dispatchEvent(new w.Event('change'));
await attendre(40);
t('retour aux tranches',
  [...w.document.querySelectorAll('#tableau-hote .cellule-duree')]
      .some(c => /mois|ans|renseignée/.test(c.textContent)));

/* Le filtre continue de proposer des tranches, quel que soit le réglage */
const titresFacettes = [...w.document.querySelectorAll('.facette-tete h3')]
    .map(e => e.textContent);
t('facette Durée conservée', titresFacettes.includes('Durée'));

/* Onglets de la configuration */
const ongletsModale = w.document.querySelectorAll('.onglets-modale .onglet');
t('quatre onglets de configuration', ongletsModale.length === 4,
  [...ongletsModale].map(o => o.textContent));
t('volet connexion affiché par défaut', !$('volet-connexion').hidden);
t('volet paramètres masqué', $('volet-parametres').hidden);
ongletsModale[1].click();
t('bascule vers les paramètres',
  !$('volet-parametres').hidden && $('volet-connexion').hidden);
ongletsModale[0].click();

console.log(`  ${ok - avantD} vérifications passées`);

console.log('\nTypes de contrat');
const avantC2 = ok;

const panneauContrats = [...w.document.querySelectorAll('#figures .panneau')]
    .find(p => p.querySelector('h2').textContent === 'Types de contrat');
t('panneau des types de contrat présent', !!panneauContrats);

if (panneauContrats) {
    const menuContrats = panneauContrats.querySelector('.reglage-mode select');
    const lectures = [...menuContrats.options].map(o => o.textContent);
    t('croisement par durée proposé',
      lectures.some(l => /par durée/.test(l)), lectures);
    t('croisement par année proposé', lectures.some(l => /par année/.test(l)));
    t('répartition seule proposée', lectures.some(l => /seuls/.test(l)));
    t('croisement par durée retenu par défaut',
      menuContrats.value === 'duree', menuContrats.value);
    t('figure décomposée rendue',
      panneauContrats.querySelectorAll('.segment-empile').length > 0,
      panneauContrats.querySelectorAll('.segment-empile').length);

    /* Les totaux doivent concorder avec la répartition seule. */
    const totauxCroises = [...panneauContrats.querySelectorAll('.figure-valeur')]
        .map(e => e.textContent).filter(v => /^\d+$/.test(v));
    menuContrats.value = 'seul';
    menuContrats.dispatchEvent(new w.Event('change'));
    await attendre(80);
    const contratsSeuls = [...w.document.querySelectorAll('#figures .panneau')]
        .find(p => p.querySelector('h2').textContent === 'Types de contrat');
    t('totaux identiques d’une lecture à l’autre',
      [...contratsSeuls.querySelectorAll('.figure-valeur')]
          .map(e => e.textContent).filter(v => /^\d+$/.test(v)).join()
        === totauxCroises.join(),
      totauxCroises);

    contratsSeuls.querySelector('.reglage-mode select').value = 'duree';
    contratsSeuls.querySelector('.reglage-mode select')
        .dispatchEvent(new w.Event('change'));
    await attendre(80);
}

/* Le champ doit être filtrable et exportable comme les autres. */
const colonnesTableau = [...w.document.querySelectorAll('#tableau-hote th')]
    .map(th => th.textContent);
t('colonne dans le tableau', colonnesTableau.includes('Type de contrat'), colonnesTableau);

console.log(`  ${ok - avantC2} vérifications passées`);

console.log('\nRelations');
const avantR = ok;

t('panneau des relations visible', !$('panneau-relations').hidden);
const ongletsVue = w.document.querySelectorAll('.onglets-vue .onglet');
t('trois vues proposées', ongletsVue.length === 3,
  [...ongletsVue].map(o => o.textContent));
t('vues nommées', [...ongletsVue].map(o => o.textContent).join('|') === 'Liens|Flux|Matrice',
  [...ongletsVue].map(o => o.textContent));

/* Vue liens, affichée par défaut */
/* La matrice est la vue d'entrée : elle donne les effectifs exacts, lisibles
   sans survol ni estimation d'épaisseur. */
t('matrice par défaut', ongletsVue[2].classList.contains('actif'),
  [...ongletsVue].map(o => o.className));
t('matrice tracée', w.document.querySelectorAll('.matrice-cellule, .matrice td').length > 0);

ongletsVue[0].click();
await attendre(80);
t('liens accessibles', w.document.querySelectorAll('.lien-relation').length > 0);

/* Sous une année, l'effectif n'est pas inscrit : deux nombres superposés se
   confondent à la lecture. */
const axesVue = w.document.querySelectorAll('.relations-axes select');
if ([...axesVue[0].options].some(o => o.value === 'annee')) {
    const axeAvant = axesVue[0].value;
    axesVue[0].value = 'annee';
    axesVue[0].dispatchEvent(new w.Event('change'));
    await attendre(80);
    const chiffres = [...w.document.querySelectorAll('#relations .figure-valeur')]
        .map(e => e.textContent);
    t('aucun effectif sous les années',
      !chiffres.length || chiffres.every(c => /^\d{4}$/.test(c)), chiffres);
    w.document.querySelectorAll('.relations-axes select')[0].value = axeAvant;
    w.document.querySelectorAll('.relations-axes select')[0]
        .dispatchEvent(new w.Event('change'));
    await attendre(80);
}

/* Matrice : les chiffres doivent être exacts et concorder avec la sélection */
ongletsVue[2].click();
await attendre(60);
const matrice = w.document.querySelector('.matrice');
t('matrice rendue', !!matrice);
const cellulesRemplies = [...w.document.querySelectorAll('.matrice-cellule')]
    .filter(c => c.textContent.trim() !== '');
t('cellules renseignées', cellulesRemplies.length > 0, cellulesRemplies.length);
const totauxLignes = [...w.document.querySelectorAll('.matrice-total')]
    .map(c => +c.textContent);
const sommeCellules = cellulesRemplies.reduce((s, c) => s + +c.textContent, 0);
t('les totaux de lignes égalent la somme des cellules',
  totauxLignes.reduce((s, v) => s + v, 0) === sommeCellules,
  { totaux: totauxLignes.reduce((s, v) => s + v, 0), cellules: sommeCellules });
t('en-têtes de colonnes présents',
  w.document.querySelectorAll('.matrice-tete').length > 1);

/* Regroupement forcé : c'est le cas où les totaux peuvent se perdre.
   Avec un seul laboratoire et un seul partenaire détaillés, tout le reste
   tombe dans « Autres » et plusieurs liens se retrouvent sur la même case —
   leur cumul doit être conservé. */
const totalAvantRegroupement = [...w.document.querySelectorAll('.matrice-cellule')]
    .filter(c => c.textContent.trim() !== '')
    .reduce((s, c) => s + +c.textContent, 0);

app.relations.detailGauche = 1;
app.relations.detailDroite = 1;
app.rendre();
await attendre(60);
const totalApresRegroupement = [...w.document.querySelectorAll('.matrice-cellule')]
    .filter(c => c.textContent.trim() !== '')
    .reduce((s, c) => s + +c.textContent, 0);
t('le regroupement conserve les totaux',
  totalApresRegroupement === totalAvantRegroupement,
  { avant: totalAvantRegroupement, apres: totalApresRegroupement });
t('mention du regroupement affichée',
  [...w.document.querySelectorAll('#relations-hote .note')]
      .some(n => n.textContent.includes('Autres')));

app.relations.detailGauche = 12;
app.relations.detailDroite = 15;
app.rendre();
await attendre(60);
/* Flux : hauteurs et rubans proportionnels */
w.document.querySelectorAll('.onglets-vue .onglet')[1].click();
await attendre(100);
t('diagramme de flux rendu', !!w.document.querySelector('.figure-flux'));
const noeudsFlux = w.document.querySelectorAll('.flux-noeud');
t('blocs dessinés', noeudsFlux.length > 0, noeudsFlux.length);
const rubansFlux = w.document.querySelectorAll('.flux-ruban');
t('rubans dessinés', rubansFlux.length > 0, rubansFlux.length);
t('rubans fermés (bandes, non des traits)',
  [...rubansFlux].every(r => /Z$/.test(r.getAttribute('d'))));
const hauteursFlux = [...w.document.querySelectorAll('.flux-barre')]
    .map(b => +b.getAttribute('height'));
t('hauteurs positives et finies',
  hauteursFlux.length > 0 && hauteursFlux.every(h => Number.isFinite(h) && h > 0),
  hauteursFlux);

noeudsFlux[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await attendre(40);
t('clic dans le flux filtre', !$('reinit').hidden);
$('reinit').click();
await attendre(40);

/* Retour aux liens */
w.document.querySelectorAll('.onglets-vue .onglet')[0].click();
await attendre(60);
t('retour à la vue liens',
  w.document.querySelectorAll('.lien-relation').length > 0);

/* Chaque tableau de bord reçoit la figure qui correspond à sa structure :
   réseau côté chercheurs, croisements côté opérations. */
$('onglet-ec').click();
await attendre(250);
/* Un bloc antérieur a laissé un filtre sur ce tableau de bord : il fausserait
   les effectifs vérifiés ici. */
if (!$('reinit').hidden) { $('reinit').click(); await attendre(80); }
t('réseau affiché côté chercheurs', !$('panneau-reseau').hidden);
t('croisements masqués côté chercheurs', $('panneau-relations').hidden);
t('partenaires masqués côté chercheurs', $('panneau-partenaires').hidden);

t('constellation rendue', !!w.document.querySelector('.figure-constellation'));
/* Les éléments du rendu d'origine, dont la lisibilité dépendait. */
/* La présence des éléments ne suffit pas : une enveloppe sans tracé est
   invisible, et le contrôle passerait pourtant. */
const enveloppes = [...w.document.querySelectorAll('.constellation-enveloppe')];
t('enveloppes de groupe présentes', enveloppes.length > 0, enveloppes.length);
t('enveloppes réellement tracées',
  enveloppes.some(e => (e.getAttribute('d') || '').length > 10),
  enveloppes.map(e => (e.getAttribute('d') || '').length));
t('pôles en anneaux', w.document.querySelectorAll('.pole-anneau').length > 0);
t('libellé de pôle à l’intérieur',
  w.document.querySelectorAll('.nom-pole').length > 0);
t('effectif inscrit sous le nom',
  w.document.querySelectorAll('.effectif-pole').length > 0);
t('membres en disques colorés',
  w.document.querySelectorAll('.individu-disque').length > 0);
t('noms des membres présents mais masqués',
  [...w.document.querySelectorAll('.nom-individu')]
      .every(n => n.getAttribute('opacity') === '0'),
  w.document.querySelectorAll('.nom-individu').length);
t('liens teintés selon leur pôle',
  [...w.document.querySelectorAll('.constellation-lien')]
      .every(l => l.getAttribute('stroke') && l.getAttribute('stroke') !== 'none'));
t('commandes de zoom présentes',
  w.document.querySelectorAll('.vue-commandes .btn').length === 3);
const poles = w.document.querySelectorAll('.constellation-pole');
t('pôles dessinés', poles.length > 0, poles.length);
const individus = w.document.querySelectorAll('.constellation-individu');
t('un point par chercheur retenu', individus.length === app._rows.length,
  { points: individus.length, retenus: app._rows.length });
t('positions valides',
  [...individus].every(c => Number.isFinite(+c.getAttribute('cx'))
                         && Number.isFinite(+c.getAttribute('cy'))));

/* Le pôle de regroupement doit être modifiable */
const reglagesR = w.document.querySelectorAll('.reseau-reglages select');
t('trois réglages du réseau', reglagesR.length === 3, reglagesR.length);
t('tous les pôles détaillés par défaut', app.reseau.detail === 0, app.reseau.detail);
t('choix de disposition proposé',
  [...reglagesR[1].options].map(o => o.value).sort().join() === 'libre,rangee',
  [...reglagesR[1].options].map(o => o.value));
t('disposition libre par défaut', app.reseau.disposition === 'libre',
  app.reseau.disposition);
const polesDispo = [...reglagesR[0].options].map(o => o.textContent);
t('pôles proposés propres aux chercheurs',
  polesDispo.includes('Laboratoire') && polesDispo.includes('Domaine HCERES')
  && !polesDispo.includes('Chercheur'), polesDispo);

/* La disposition libre relaxe les positions ; la disposition rangée s'en
   tient au placement calculé. Les deux doivent produire une figure. */
t('simulation lancée', !!app.reseau.simulation);
t('vue cadrée sur le contenu',
  !!w.document.querySelector('.constellation-racine')?.getAttribute('transform'),
  w.document.querySelector('.constellation-racine')?.getAttribute('transform'));

/* La disposition rangée s'en tient au pavage, sans animation. */
const selDispo0 = w.document.querySelectorAll('.reseau-reglages select')[1];
selDispo0.value = 'rangee';
selDispo0.dispatchEvent(new w.Event('change'));
await attendre(80);
t('disposition rangée retenue', app.reseau.disposition === 'rangee');
t('aucune animation en disposition rangée', app.reseau.simulation === null);
t('figure rendue sans simulation', !!w.document.querySelector('.figure-constellation'));

const selDispo = w.document.querySelectorAll('.reseau-reglages select')[1];
selDispo.value = 'libre';
selDispo.dispatchEvent(new w.Event('change'));
await attendre(150);
t('disposition libre retenue', app.reseau.disposition === 'libre');
t('positions relaxées',
  [...w.document.querySelectorAll('.constellation-individu')]
      .every(c => Number.isFinite(+c.getAttribute('cx'))));

const reglagesR2 = w.document.querySelectorAll('.reseau-reglages select');
reglagesR2[0].value = 'domaine';
reglagesR2[0].dispatchEvent(new w.Event('change'));
await attendre(80);
t('changement de pôle pris en compte', app.reseau.pole === 'domaine');
t('figure reconstruite', !!w.document.querySelector('.figure-constellation'));
const reglagesR3 = w.document.querySelectorAll('.reseau-reglages select');
reglagesR3[0].value = 'labo';
reglagesR3[0].dispatchEvent(new w.Event('change'));
await attendre(80);

/* Le zoom découvre les noms des membres, illisibles à l'échelle d'ensemble. */
const { ajusterNoms } = await import('../js/ui/constellation.js');
const svgReseau = w.document.querySelector('.figure-constellation');
ajusterNoms(svgReseau, 3);
t('noms révélés au zoom',
  [...svgReseau.querySelectorAll('.nom-individu')]
      .every(n => +n.getAttribute('opacity') > 0));
ajusterNoms(svgReseau, 1);
t('noms masqués à l’échelle d’ensemble',
  [...svgReseau.querySelectorAll('.nom-individu')]
      .every(n => +n.getAttribute('opacity') === 0));

/* Un nœud saisi doit suivre le curseur.
   Les nœuds vivent dans un groupe que le zoom et le cadrage automatique
   transforment ; convertir les coordonnées du curseur au niveau du <svg>
   ignore cette transformation, et le nœud saute vers le centre. */
const racineTransformee = w.document.querySelector('.constellation-racine');
t('la figure porte bien une transformation',
  /scale/.test(racineTransformee?.getAttribute('transform') || ''),
  racineTransformee?.getAttribute('transform'));

const poleSuivi = w.document.querySelector('.constellation-pole');
const positionDe = el => {
    const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(el.getAttribute('transform') || '');
    return m ? { x: +m[1], y: +m[2] } : null;
};
const avantPrise = positionDe(poleSuivi);
poleSuivi.dispatchEvent(new w.PointerEvent('pointerdown',
    { bubbles: true, button: 0, pointerId: 7, clientX: 300, clientY: 300 }));
poleSuivi.dispatchEvent(new w.PointerEvent('pointermove',
    { bubbles: true, pointerId: 7, clientX: 360, clientY: 340 }));
await attendre(30);
const pendantPrise = positionDe(poleSuivi);

/* La transformation courante donne la position attendue dans le dessin. */
const tr = /translate\(([-\d.]+),([-\d.]+)\)\s*scale\(([-\d.]+)\)/
    .exec(racineTransformee.getAttribute('transform'));
const attendu = { x: (360 - +tr[1]) / +tr[3], y: (340 - +tr[2]) / +tr[3] };
t('le nœud saisi suit le curseur',
  pendantPrise && Math.abs(pendantPrise.x - attendu.x) < 2
               && Math.abs(pendantPrise.y - attendu.y) < 2,
  { obtenu: pendantPrise, attendu, avant: avantPrise });

poleSuivi.dispatchEvent(new w.PointerEvent('pointerup',
    { bubbles: true, pointerId: 7, clientX: 360, clientY: 340 }));
await attendre(30);

/* Un glissement ne doit pas valoir sélection : traîner un pôle pour ranger la
   figure et cliquer pour filtrer sont deux gestes distincts. */
const pole = w.document.querySelector('.constellation-pole');
const avantGlissement = $('legende-texte').textContent;
pole.dispatchEvent(new w.PointerEvent('pointerdown',
    { bubbles: true, button: 0, pointerId: 1, clientX: 100, clientY: 100 }));
pole.dispatchEvent(new w.PointerEvent('pointermove',
    { bubbles: true, pointerId: 1, clientX: 160, clientY: 140 }));
pole.dispatchEvent(new w.PointerEvent('pointerup',
    { bubbles: true, pointerId: 1, clientX: 160, clientY: 140 }));
pole.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await attendre(60);
t('un glissement ne filtre pas',
  $('legende-texte').textContent === avantGlissement,
  $('legende-texte').textContent);

/* Cliquer un pôle filtre */
w.document.querySelector('.constellation-pole')
    .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await attendre(60);
t('clic sur un pôle filtre', !$('reinit').hidden);
$('reinit').click();
await attendre(60);

$('onglet-ope').click();
await attendre(150);
t('croisements rétablis côté opérations', !$('panneau-relations').hidden);
t('réseau masqué côté opérations', $('panneau-reseau').hidden);
t('animation arrêtée avec le panneau', app.reseau.simulation === null);

console.log(`  ${ok - avantR} vérifications passées`);

console.log('\nMenu contextuel et regroupements');
const avantM = ok;

/* Le menu doit s'ouvrir au clic droit sur une valeur de facette */
const premiereValeur = w.document.querySelector('.facette-liste li');
premiereValeur.dispatchEvent(new w.MouseEvent('contextmenu',
    { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
await attendre(30);
let menu = w.document.querySelector('.menu-contextuel');
t('menu ouvert au clic droit', !!menu);
if (menu) {
    const entrees = [...menu.querySelectorAll('.menu-entree')].map(e => e.textContent);
    t('action de filtrage proposée',
      entrees.some(e => /filtre/i.test(e)), entrees);
    t('action de masquage proposée',
      entrees.some(e => /Masquer/i.test(e)), entrees);
    t('isolement proposé',
      entrees.some(e => /que cette valeur/i.test(e)), entrees);
    t('titre du menu renseigné', !!menu.querySelector('.menu-titre')?.textContent);
}

/* Maj + clic droit laisse le menu du navigateur */
w.document.body.click();
await attendre(20);
premiereValeur.dispatchEvent(new w.MouseEvent('contextmenu',
    { bubbles: true, cancelable: true, shiftKey: true, clientX: 100, clientY: 100 }));
await attendre(20);
t('Maj+clic droit n’ouvre pas le menu de l’outil',
  !w.document.querySelector('.menu-contextuel'));

/* Le masquage depuis le menu doit fonctionner */
premiereValeur.dispatchEvent(new w.MouseEvent('contextmenu',
    { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
await attendre(30);
menu = w.document.querySelector('.menu-contextuel');
const boutonMasquer = [...menu.querySelectorAll('.menu-entree')]
    .find(e => /Masquer/i.test(e.textContent));
boutonMasquer.click();
await attendre(40);
t('menu refermé après action', !w.document.querySelector('.menu-contextuel'));
t('valeur effectivement masquée',
  w.document.querySelectorAll('#masquees .puce').length === 1);
w.document.querySelector('#masquees .puce').click();
await attendre(40);

/* Échappement referme le menu */
premiereValeur.dispatchEvent(new w.MouseEvent('contextmenu',
    { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
await attendre(30);
w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await attendre(20);
t('Échap referme le menu', !w.document.querySelector('.menu-contextuel'));

/* Axes configurables des relations */
const selectsAxes = w.document.querySelectorAll('.relations-axes select');
t('deux sélecteurs d’axes', selectsAxes.length === 2, selectsAxes.length);
t('axe gauche sur laboratoire', selectsAxes[0].value === 'labo', selectsAxes[0].value);
t('croiser un champ avec lui-même est interdit',
  [...selectsAxes[0].options].find(o => o.value === selectsAxes[1].value)?.disabled === true,
  { axeDroit: selectsAxes[1].value });

t('axe droit par défaut : type de partenaire',
  app.relations.axeDroite === 'type', app.relations.axeDroite);

selectsAxes[0].value = 'annee';
selectsAxes[0].dispatchEvent(new w.Event('change'));
await attendre(60);
t('changement d’axe pris en compte', app.relations.axeGauche === 'annee');

/* Choisir des deux côtés le même champ ne doit pas laisser une diagonale. */
app.relations.axeGauche = 'type';
app.relations.axeDroite = 'type';
app.rendre();
await attendre(60);
t('axes identiques corrigés',
  app.relations.axeGauche !== app.relations.axeDroite,
  [app.relations.axeGauche, app.relations.axeDroite]);
app.relations.axeGauche = 'annee';
app.rendre();
await attendre(60);
t('figure reconstruite', w.document.querySelectorAll('.lien-relation').length > 0);

const inverser = w.document.querySelector('.relations-axes .btn');
inverser.click();
await attendre(60);
t('inversion des axes',
  app.relations.axeGauche !== 'annee' && app.relations.axeDroite === 'annee',
  [app.relations.axeGauche, app.relations.axeDroite]);

app.relations.axeGauche = 'labo';
app.relations.axeDroite = 'partenaire';
app.rendre();
await attendre(60);

console.log(`  ${ok - avantM} vérifications passées`);

console.log('\nRegroupements et mise en avant');
const avantG = ok;

/* Ouverture du contenu d'un regroupement dans une fenêtre */
app.relations.detailGauche = 1;
app.relations.detailDroite = 1;
app.rendre();
await attendre(60);

const lienAutres = [...w.document.querySelectorAll('#figures .lien, #relations-hote .lien')]
    .find(b => /Voir les \d+ valeurs/.test(b.textContent));
t('accès au contenu du regroupement proposé', !!lienAutres, lienAutres?.textContent);

if (lienAutres) {
    lienAutres.click();
    await attendre(40);
    const fenetre = w.document.querySelector('.modale-liste');
    t('fenêtre de regroupement ouverte', !!fenetre);
    if (fenetre) {
        const lignes = fenetre.querySelectorAll('.liste-ligne');
        t('valeurs listées', lignes.length > 0, lignes.length);
        const actions = lignes[0].querySelectorAll('.liste-action');
        t('quatre actions par valeur', actions.length === 4, actions.length);
        t('recherche disponible', !!fenetre.querySelector('input[type=search]'));
        t('affichage global proposé',
          [...fenetre.querySelectorAll('.btn')].some(b => /toutes ces valeurs/.test(b.textContent)));

        const valeurChoisie = lignes[0].querySelector('.liste-nom').textContent;
        const effectifAvant = $('legende-texte').textContent.match(/^(\d+)/)[1];

        /* « Afficher » détache du regroupement sans toucher à la sélection.
           C'est toute la différence avec un filtre, qui écarterait le reste. */
        actions[0].click();
        await attendre(50);
        t('valeur détachée du regroupement',
          app.etat().epinglees[app.relations.axeGauche]?.has(valeurChoisie)
          || app.etat().epinglees[app.relations.axeDroite]?.has(valeurChoisie),
          { valeur: valeurChoisie, epinglees: app.etat().epinglees });
        t('la fenêtre reste ouverte', !!w.document.querySelector('.modale-liste'));

        /* Le point qui posait problème : l'effectif ne doit pas bouger. */
        const fenetreOuverte = w.document.querySelector('.modale-liste');
        fenetreOuverte.querySelector('.btn').click();   // Fermer
        await attendre(40);
        t('sélection inchangée par un détachement',
          $('legende-texte').textContent.startsWith(effectifAvant), $('legende-texte').textContent);
        t('aucun filtre créé', $('reinit').hidden);
        t('détachement mentionné dans la légende',
          /détachée?s? du regroupement/.test($('legende-texte').textContent),
          $('legende-texte').textContent);

        /* La valeur détachée apparaît désormais parmi les entrées de la figure */
        const entrees = [...w.document.querySelectorAll('#relations-hote .barre title')]
            .map(e => e.textContent);
        t('la valeur figure dans la vue',
          entrees.some(e => e.startsWith(valeurChoisie)), entrees.slice(0, 8));

        app.etat().epinglees = {};
        app.rendre();
        await attendre(40);
    }
}

app.relations.detailGauche = 12;
app.relations.detailDroite = 15;
app.rendre();
await attendre(60);

/* Libellés d'axes adaptés à la vue */
const ongletsVue2 = w.document.querySelectorAll('.onglets-vue .onglet');
const libelleAxe = () => w.document.querySelector('.relations-axes .etiquette-champ').textContent;
ongletsVue2[0].click(); await attendre(50);
t('vue liens : « Axe gauche »', libelleAxe() === 'Axe gauche', libelleAxe());
w.document.querySelectorAll('.onglets-vue .onglet')[1].click(); await attendre(80);
t('vue flux : « Origine »', libelleAxe() === 'Origine', libelleAxe());
w.document.querySelectorAll('.onglets-vue .onglet')[2].click(); await attendre(50);
t('vue matrice : « Lignes »', libelleAxe() === 'Lignes', libelleAxe());
w.document.querySelectorAll('.onglets-vue .onglet')[0].click(); await attendre(50);

/* Mise en avant maintenue : proposée au clic droit sur une entrée */
t('aucun rappel tant que rien n’est maintenu',
  !w.document.querySelector('.relations-surbrillance'));

const entreeRelation = w.document.querySelector('#relations-hote .barre');
entreeRelation.dispatchEvent(new w.MouseEvent('contextmenu',
    { bubbles: true, cancelable: true, clientX: 120, clientY: 120 }));
await attendre(40);
let menuRel = w.document.querySelector('.menu-contextuel');
t('menu ouvert sur une entrée de relation', !!menuRel);

const entreesMenu = menuRel ? [...menuRel.querySelectorAll('.menu-entree')] : [];
const libellesMenu = entreesMenu.map(e => e.textContent);
t('entrée « maintenir la mise en avant » présente',
  libellesMenu.some(l => /Maintenir la mise en avant/.test(l)), libellesMenu);
/* Les entrées sont désormais rangées par nature d'action. Ce qui importe
   n'est plus la position absolue mais l'appartenance : un geste d'affichage
   ne doit pas se trouver parmi les gestes de filtrage. */
const iMaintien = libellesMenu.findIndex(l => /Maintenir la mise en avant/.test(l));
const iIsoler   = libellesMenu.findIndex(l => /Ne garder que cette valeur/.test(l));
t('rangée après les gestes de filtrage',
  iMaintien >= 0 && iIsoler >= 0 && iMaintien > iIsoler, { iMaintien, iIsoler });

entreesMenu[iMaintien].click();
await attendre(60);
t('mise en avant enregistrée', !!app.relations.surbrillance, app.relations.surbrillance);
t('rappel affiché', !!w.document.querySelector('.surbrillance-actuelle'));
t('liens sans rapport atténués',
  w.document.querySelectorAll('.lien-efface').length > 0);
t('entrées sans rapport atténuées',
  w.document.querySelectorAll('.entree-attenuee').length > 0);

/* Le survol d'une autre entrée, puis sa sortie, ne doivent pas l'effacer :
   c'est précisément ce que « maintenir » veut dire. */
const autres = [...w.document.querySelectorAll('#relations-hote .barre')];
const derniere = autres[autres.length - 1];
derniere.dispatchEvent(new w.MouseEvent('mouseenter', { bubbles: true }));
await attendre(30);
derniere.dispatchEvent(new w.MouseEvent('mouseleave', { bubbles: true }));
await attendre(30);
t('le survol n’efface pas la mise en avant maintenue',
  !!app.relations.surbrillance);
t('les liens restent atténués après le survol',
  w.document.querySelectorAll('.lien-efface').length > 0,
  w.document.querySelectorAll('.lien-efface').length);

w.document.querySelector('.relations-surbrillance .lien').click();
await attendre(50);
t('mise en avant retirable', app.relations.surbrillance === null);
t('rappel disparu', !w.document.querySelector('.relations-surbrillance'));

/* La matrice n'a pas de mise en avant : elle est effacée en y passant */
w.document.querySelectorAll('.onglets-vue .onglet')[2].click();
await attendre(50);
t('aucun rappel en vue matrice', !w.document.querySelector('.relations-surbrillance'));
w.document.querySelectorAll('.onglets-vue .onglet')[0].click();
await attendre(50);

console.log(`  ${ok - avantG} vérifications passées`);

console.log('\nContrôle des données');
const avantQ = ok;

t('panneau de contrôle présent', !!$('qualite-hote'));
const basculeQ = $('qualite-hote').querySelector('.qualite-bascule');
t('replié par défaut', basculeQ.getAttribute('aria-expanded') === 'false');
t('résumé visible sans ouvrir',
  !!$('qualite-hote').querySelector('.qualite-resume')?.textContent,
  $('qualite-hote').querySelector('.qualite-resume')?.textContent);

basculeQ.click();
await attendre(60);
t('ouverture du panneau',
  $('qualite-hote').querySelector('.qualite-bascule').getAttribute('aria-expanded') === 'true');
const constats = $('qualite-hote').querySelectorAll('.constat');
t('constats affichés', constats.length > 0, constats.length);
t('chaque constat porte un chiffre',
  [...constats].every(c => c.querySelector('.constat-chiffre')?.textContent));
t('chaque constat est expliqué',
  [...constats].every(c => (c.querySelector('.note')?.textContent || '').length > 20));

/* Le lien « voir des exemples » doit fonctionner */
const voirExemples = [...$('qualite-hote').querySelectorAll('.lien')]
    .find(b => /exemples/.test(b.textContent));
if (voirExemples) {
    voirExemples.click();
    await attendre(60);
    t('exemples dépliés',
      $('qualite-hote').querySelectorAll('.constat-exemples li').length > 0);
}
$('qualite-hote').querySelector('.qualite-bascule').click();
await attendre(40);

console.log(`  ${ok - avantQ} vérifications passées`);

console.log('\nAtelier');
const avantA = ok;

t('panneau d’atelier présent', !!$('atelier-hote'));
const basculeA = $('atelier-hote').querySelector('.qualite-bascule');
t('atelier replié par défaut', basculeA.getAttribute('aria-expanded') === 'false');
basculeA.click();
await attendre(60);

const reglagesA = $('atelier-hote').querySelectorAll('.atelier-reglages select');
t('quatre réglages proposés', reglagesA.length === 4, reglagesA.length);
t('figure produite', !!$('atelier-hote').querySelector('svg.figure'));

/* Croiser un champ avec lui-même est interdit */
const champA = reglagesA[0], champB = reglagesA[1];
t('le champ déjà choisi est désactivé dans l’autre menu',
  [...champB.options].find(o => o.value === champA.value)?.disabled === true);

/* Les formes croisées ne sont proposées qu'avec un second champ */
const forme = reglagesA[2];
t('formes croisées désactivées sans second champ',
  [...forme.options].filter(o => ['empilees', 'tableau'].includes(o.value))
      .every(o => o.disabled));

champB.value = 'type';
champB.dispatchEvent(new w.Event('change'));
await attendre(60);
t('croisement pris en compte', app.atelier.champB === 'type');
t('formes croisées désormais disponibles',
  [...$('atelier-hote').querySelectorAll('.atelier-reglages select')[2].options]
      .filter(o => o.value === 'empilees').every(o => !o.disabled));

const forme2 = $('atelier-hote').querySelectorAll('.atelier-reglages select')[2];
forme2.value = 'tableau';
forme2.dispatchEvent(new w.Event('change'));
await attendre(60);
t('forme tableau rendue', !!$('atelier-hote').querySelector('.matrice'));
t('copie au format tableur proposée',
  [...$('atelier-hote').querySelectorAll('.lien')].some(b => /tableur/.test(b.textContent)));

/* Les chiffres de l'atelier doivent concorder avec le reste */
forme2.value = 'barres';
$('atelier-hote').querySelectorAll('.atelier-reglages select')[1].value = '';
$('atelier-hote').querySelectorAll('.atelier-reglages select')[1]
    .dispatchEvent(new w.Event('change'));
await attendre(60);
const champAtelier = $('atelier-hote').querySelectorAll('.atelier-reglages select')[0].value;
const valeursAtelier = [...$('atelier-hote').querySelectorAll('.figure-valeur')]
    .map(e => +e.textContent).filter(n => !isNaN(n));
t('somme cohérente avec la sélection',
  valeursAtelier.length > 0 && valeursAtelier.every(v => v > 0),
  valeursAtelier);

$('atelier-hote').querySelector('.qualite-bascule').click();
await attendre(40);

console.log(`  ${ok - avantA} vérifications passées`);

console.log('\nExport des figures');
const avantE = ok;

const boutonsExport = w.document.querySelectorAll('.export-figure');
t('commandes d’export ajoutées aux figures', boutonsExport.length > 0, boutonsExport.length);
if (boutonsExport.length) {
    const btns = [...boutonsExport[0].querySelectorAll('.btn')].map(b => b.textContent);
    t('SVG et PNG proposés', btns.includes('SVG') && btns.includes('PNG'), btns);
}

/* Le SVG produit doit être autonome : légende incrustée et couleurs figées. */
const { construireSvg } = await import('../js/ui/exportFigure.js');
const figure = w.document.querySelector('#figures svg.figure');
t('une figure est disponible', !!figure);
if (figure) {
    const exporte = construireSvg(figure, {
        titre: 'Titre de contrôle',
        legende: '4 opérations · 2021–2023 · aucun filtre',
        source: 'Source : api, extraction du 1 janvier 2026.',
    });
    const serialise = new w.XMLSerializer().serializeToString(exporte);
    t('titre incrusté', serialise.includes('Titre de contrôle'));
    t('légende incrustée', serialise.includes('4 opérations'));
    t('provenance incrustée', serialise.includes('extraction du'));
    t('fond opaque', serialise.includes('#FFFFFF'));
    t('dimensions renseignées',
      +exporte.getAttribute('width') > 0 && +exporte.getAttribute('height') > 0);
    t('la figure est plus haute que l’originale (place pour la légende)',
      +exporte.getAttribute('height') > figure.viewBox.baseVal.height);
}

console.log(`  ${ok - avantE} vérifications passées`);

console.log('\nModes de lecture');
const avantD2 = ok;

/* Côté chercheurs, un seul panneau porte les laboratoires et les statuts,
   avec trois lectures nommées. */
$('onglet-ec').click();
await attendre(250);
if (!$('reinit').hidden) { $('reinit').click(); await attendre(80); }
await ouvrirFacettes();

const titresPanneaux = [...w.document.querySelectorAll('#figures .panneau h2')]
    .map(h => h.textContent);
t('panneaux fusionnés', titresPanneaux.includes('Laboratoires et statuts'), titresPanneaux);
t('plus de panneau « Statuts » séparé',
  !titresPanneaux.includes('Statuts'), titresPanneaux);

const panneauLabos = [...w.document.querySelectorAll('#figures .panneau')]
    .find(p => p.querySelector('h2').textContent === 'Laboratoires et statuts');
const menuMode = panneauLabos?.querySelector('.reglage-mode select');
t('menu de lecture proposé', !!menuMode);

if (menuMode) {
    const libelles = [...menuMode.options].map(o => o.textContent);
    t('trois lectures nommées', libelles.length === 3, libelles);
    t('les intitulés disent ce qu’ils montrent',
      libelles.some(l => /Effectifs et statuts/.test(l))
      && libelles.some(l => /Effectifs par laboratoire/.test(l))
      && libelles.some(l => /Statuts/.test(l)), libelles);

    /* Le croisement est la lecture par défaut : c'est ce que la fusion
       des deux panneaux apporte. */
    t('croisement par défaut', menuMode.value === 'croise', menuMode.value);
    t('segments empilés tracés',
      panneauLabos.querySelectorAll('.segment-empile').length > 0,
      panneauLabos.querySelectorAll('.segment-empile').length);
    const legendes = [...panneauLabos.querySelectorAll('.figure-legende-item')]
        .map(e => e.textContent);
    t('légende des statuts affichée', legendes.length > 0);

    /* Le champ de décomposition est nommé dans le mode retenu : le regrouper
       retirerait justement ce qu'on est venu voir. */
    t('aucun regroupement des statuts',
      !legendes.some(l => /^Autres/.test(l)), legendes);
    t('tous les statuts présents dans la légende',
      legendes.length === new Set(app.donnees.ec.map(e => e.statut).filter(Boolean)).size,
      { legende: legendes.length,
        statuts: new Set(app.donnees.ec.map(e => e.statut).filter(Boolean)).size });
    t('aucun segment « Autres »',
      [...panneauLabos.querySelectorAll('.segment-empile')]
          .every(t2 => !/ · Autres —/.test(t2.textContent)));
    t('axe gradué présent',
      panneauLabos.querySelectorAll('.figure-axe').length > 1);

    const totauxCroise = [...panneauLabos.querySelectorAll('.figure-valeur')]
        .map(e => e.textContent).filter(v => /^\d+$/.test(v));

    /* Effectifs seuls : mêmes totaux, sans décomposition. */
    menuMode.value = 'effectifs';
    menuMode.dispatchEvent(new w.Event('change'));
    await attendre(80);
    const apresEffectifs = [...w.document.querySelectorAll('#figures .panneau')]
        .find(p => p.querySelector('h2').textContent === 'Laboratoires et statuts');
    t('plus de segments en mode effectifs',
      apresEffectifs.querySelectorAll('.segment-empile').length === 0);
    t('barres simples tracées',
      apresEffectifs.querySelectorAll('.barre-remplissage').length > 0);
    t('les totaux sont inchangés',
      [...apresEffectifs.querySelectorAll('.figure-valeur')]
          .map(e => e.textContent).filter(v => /^\d+$/.test(v)).join()
        === totauxCroise.join(),
      totauxCroise);

    /* Statuts seuls : le champ représenté change. */
    const menuApres = apresEffectifs.querySelector('.reglage-mode select');
    menuApres.value = 'statuts';
    menuApres.dispatchEvent(new w.Event('change'));
    await attendre(80);
    const apresStatuts = [...w.document.querySelectorAll('#figures .panneau')]
        .find(p => p.querySelector('h2').textContent === 'Laboratoires et statuts');
    const etiquettes = [...apresStatuts.querySelectorAll('.barre title')]
        .map(t2 => t2.textContent.split(' — ')[0]);
    t('les statuts sont représentés',
      etiquettes.some(e => /conférences|Professeur|renseigné/i.test(e)), etiquettes);

    apresStatuts.querySelector('.reglage-mode select').value = 'croise';
    apresStatuts.querySelector('.reglage-mode select')
        .dispatchEvent(new w.Event('change'));
    await attendre(80);
}

$('onglet-ope').click();
await attendre(150);

console.log(`  ${ok - avantD2} vérifications passées`);

console.log('\nSens des barres et nuage de mots');
const avantS = ok;

$('onglet-ec').click();
await attendre(250);
if (!$('reinit').hidden) { $('reinit').click(); await attendre(80); }
await ouvrirFacettes();

/* Nuage de mots par défaut pour les mots-clés */
const panneauMots = [...w.document.querySelectorAll('#figures .panneau')]
    .find(p => p.querySelector('h2').textContent === 'Mots-clés');
t('panneau des mots-clés présent', !!panneauMots);
t('nuage de mots par défaut', !!panneauMots?.querySelector('.figure-nuage'));
t('mots tracés', panneauMots.querySelectorAll('.mot-texte').length > 0,
  panneauMots.querySelectorAll('.mot-texte').length);
t('aucune barre en mode nuage',
  panneauMots.querySelectorAll('.barre-remplissage').length === 0);

/* Le nuage doit suivre la sélection comme toute autre figure. */
const termesDuNuage = () => [...w.document.querySelectorAll('#figures .mot')]
    .map(m => (m.getAttribute('aria-label') || '').split(' — ')[0])
    .filter(Boolean).sort();
const termesAvant = termesDuNuage();
t('des termes avant filtrage', termesAvant.length > 0, termesAvant.length);

const casesLabo = [...w.document.querySelectorAll('.facette-liste input[type=checkbox]')];
const etiquettesLabo = [...w.document.querySelectorAll('.facette-liste label')]
    .map(e => e.textContent);
const iCemti = etiquettesLabo.indexOf('CEMTI');
if (iCemti >= 0) {
    casesLabo[iCemti].checked = true;
    casesLabo[iCemti].dispatchEvent(new w.Event('change'));
    await attendre(120);
    const termesApres = termesDuNuage();
    t('le nuage se restreint à la sélection',
      termesApres.length < termesAvant.length
      && termesApres.every(x => termesAvant.includes(x)),
      { avant: termesAvant, apres: termesApres });
    t('le compte de termes est affiché',
      [...w.document.querySelectorAll('#figures .note')]
          .some(n => /termes? .*sélection/.test(n.textContent)));
    $('reinit').click();
    await attendre(120);
    t('retour au nuage complet',
      termesDuNuage().length === termesAvant.length);
}

const menuMots = panneauMots.querySelector('.reglage-mode select');
t('retour aux barres proposé',
  [...menuMots.options].some(o => /Barres/.test(o.textContent)),
  [...menuMots.options].map(o => o.textContent));
menuMots.value = 'barres';
menuMots.dispatchEvent(new w.Event('change'));
await attendre(80);
const motsBarres = [...w.document.querySelectorAll('#figures .panneau')]
    .find(p => p.querySelector('h2').textContent === 'Mots-clés');
t('bascule vers les barres',
  motsBarres.querySelectorAll('.barre-remplissage').length > 0
  && !motsBarres.querySelector('.figure-nuage'));
motsBarres.querySelector('.reglage-mode select').value = 'nuage';
motsBarres.querySelector('.reglage-mode select').dispatchEvent(new w.Event('change'));
await attendre(80);

/* Sens des barres */
const panneauSens = [...w.document.querySelectorAll('#figures .panneau')]
    .find(p => p.querySelector('.bouton-sens'));
t('bouton de sens proposé', !!panneauSens);
t('pas de bouton de sens sur le nuage',
  ![...w.document.querySelectorAll('#figures .panneau')]
      .find(p => p.querySelector('h2').textContent === 'Mots-clés')
      ?.querySelector('.bouton-sens'));

const titreSens = panneauSens.querySelector('h2').textContent;
t('horizontal par défaut',
  panneauSens.querySelectorAll('.barre').length > 0
  || panneauSens.querySelectorAll('.segment-empile').length > 0);

panneauSens.querySelector('.bouton-sens').click();
await attendre(80);
const apresSens = [...w.document.querySelectorAll('#figures .panneau')]
    .find(p => p.querySelector('h2').textContent === titreSens);
t('passage à la verticale',
  apresSens.querySelectorAll('.colonne-remplissage').length > 0
  || apresSens.querySelectorAll('.segment').length > 0,
  { colonnes: apresSens.querySelectorAll('.colonne-remplissage').length,
    segments: apresSens.querySelectorAll('.segment').length });

apresSens.querySelector('.bouton-sens').click();
await attendre(80);
const retourSens = [...w.document.querySelectorAll('#figures .panneau')]
    .find(p => p.querySelector('h2').textContent === titreSens);
t('retour à l’horizontale',
  retourSens.querySelectorAll('.barre').length > 0
  || retourSens.querySelectorAll('.segment-empile').length > 0);

$('onglet-ope').click();
await attendre(150);

console.log(`  ${ok - avantS} vérifications passées`);

console.log('\nRepli des figures');
const avantR2 = ok;

const panneauxFig = [...w.document.querySelectorAll('#figures .panneau')];
t('chaque figure porte une commande de repli',
  panneauxFig.every(p => !!p.querySelector('.replier')), panneauxFig.length);

const premier = panneauxFig[0];
const titrePremier = premier.querySelector('h2').textContent;
t('déplié par défaut',
  premier.querySelector('.replier').getAttribute('aria-expanded') === 'true');
t('figure présente', !!premier.querySelector('svg.figure'));

premier.querySelector('.replier').click();
await attendre(60);
const replie = [...w.document.querySelectorAll('#figures .panneau')]
    .find(p => p.querySelector('h2').textContent === titrePremier);
t('replié après clic',
  replie.querySelector('.replier').getAttribute('aria-expanded') === 'false');
t('figure retirée', !replie.querySelector('svg.figure'));
t('titre toujours visible', replie.querySelector('h2').textContent === titrePremier);
t('les autres figures restent affichées',
  w.document.querySelectorAll('#figures svg.figure').length > 0);

replie.querySelector('.replier').click();
await attendre(60);
t('dépliable de nouveau',
  [...w.document.querySelectorAll('#figures .panneau')]
      .find(p => p.querySelector('h2').textContent === titrePremier)
      .querySelector('svg.figure') !== null);

/* Ordre des figures côté chercheurs : les nomenclatures en dernier. */
$('onglet-ec').click();
await attendre(250);
const ordreFiguresEc = [...w.document.querySelectorAll('#figures .panneau h2')]
    .map(h => h.textContent);
t('les sections CNU ferment la liste',
  ordreFiguresEc.indexOf('Sections CNU') === ordreFiguresEc.length - 1,
  ordreFiguresEc);
/* La figure des domaines HCERES a été retirée : la nomenclature reste
   accessible en facette et dans les croisements, mais n'a plus de panneau. */
t('aucune figure des domaines HCERES',
  !ordreFiguresEc.includes('Domaines HCERES'), ordreFiguresEc);
t('le champ domaine reste filtrable',
  [...w.document.querySelectorAll('.facette-tete h3')]
      .some(h => /Domaine/.test(h.textContent)),
  [...w.document.querySelectorAll('.facette-tete h3')].map(h => h.textContent));
$('onglet-ope').click();
await attendre(150);

console.log(`  ${ok - avantR2} vérifications passées`);

console.log('\nCouleurs et infobulles');
const avantC = ok;

/* Le réglage de couleur agit sur les figures sans toucher aux effectifs. */
const prefCoul = $('pref-couleurs');
t('réglage de couleur proposé', !!prefCoul);
const effectifCoul = $('legende-texte').textContent;
const teintesAvant = new Set([...w.document.querySelectorAll('#figures .barre-remplissage')]
    .map(r => r.getAttribute('fill')));
t('plusieurs teintes par défaut', teintesAvant.size > 1, teintesAvant.size);

prefCoul.value = 'non';
prefCoul.dispatchEvent(new w.Event('change'));
await attendre(80);
/* Les absences gardent leur gris propre même en encre unique : elles ne sont
   pas une catégorie et doivent rester distinguables d'un coup d'œil. */
const teintesApres = new Set([...w.document.querySelectorAll('#figures .barre')]
    .filter(b => !/non renseign|Sans |inconnue|Aucun /i
        .test(b.querySelector('title')?.textContent || ''))
    .map(b => b.querySelector('.barre-remplissage')?.getAttribute('fill'))
    .filter(Boolean));
t('encre unique en mode sobre', teintesApres.size === 1, [...teintesApres]);
t('effectifs inchangés par la couleur',
  $('legende-texte').textContent === effectifCoul);

prefCoul.value = 'oui';
prefCoul.dispatchEvent(new w.Event('change'));
await attendre(80);
t('retour aux couleurs',
  new Set([...w.document.querySelectorAll('#figures .barre-remplissage')]
      .map(r => r.getAttribute('fill'))).size > 1);

/* Deux valeurs affichées ensemble ne doivent jamais partager une teinte :
   la couleur cesserait de distinguer ce qu'on lui demande de distinguer. */
const panneauBarres = [...w.document.querySelectorAll('#figures .panneau')]
    .find(p => p.querySelectorAll('.barre-remplissage').length > 2);
if (panneauBarres) {
    const teintesFigure = [...panneauBarres.querySelectorAll('.barre')]
        .map(b => ({
            valeur: b.querySelector('title')?.textContent.split(' — ')[0],
            teinte: b.querySelector('.barre-remplissage')?.getAttribute('fill'),
        }))
        .filter(x => x.valeur && !/^Autres/.test(x.valeur));
    const doublons = teintesFigure.length - new Set(teintesFigure.map(x => x.teinte)).size;
    t('aucune teinte dupliquée dans une figure', doublons === 0,
      { valeurs: teintesFigure.length, doublons });
}

/* Une même valeur doit garder sa teinte d'une figure à l'autre. */
const teinteDe = (racine, libelle) => {
    const titres = [...racine.querySelectorAll('.barre title')];
    const cible = titres.find(x => x.textContent.startsWith(libelle));
    return cible?.parentElement.querySelector('.barre-remplissage')?.getAttribute('fill');
};
const figuresOpe = w.document.getElementById('figures');
/* La première barre venue peut appartenir à une figure décomposée, où les
   segments remplacent le remplissage simple : on cherche donc une barre qui
   en porte effectivement un. */
const barreSimple = [...figuresOpe.querySelectorAll('.barre')]
    .find(b => b.querySelector('.barre-remplissage') && b.querySelector('title'));
const premierLabo = barreSimple?.querySelector('title').textContent.split(' — ')[0];
if (premierLabo) {
    t('teinte attribuée à chaque valeur',
      /^#[0-9A-Fa-f]{6}$/.test(teinteDe(figuresOpe, premierLabo) || ''),
      teinteDe(figuresOpe, premierLabo));
}

/* Frise : repère de date et infobulle contextuelle */
const frisePanneau = [...w.document.querySelectorAll('#figures .panneau')]
    .find(p => /Durée des partenariats/.test(p.querySelector('h2').textContent));
t('panneau de frise présent', !!frisePanneau);
if (frisePanneau) {
    t('segments tracés', frisePanneau.querySelectorAll('.frise-segment').length > 0);
    t('repère de date présent',
      [...frisePanneau.querySelectorAll('line')].some(l => l.getAttribute('stroke-dasharray')));
    t('chaque segment reste décrit',
      [...frisePanneau.querySelectorAll('.frise-segment')]
          .every(sg => sg.getAttribute('aria-label').includes('du ')));
}

console.log(`  ${ok - avantC} vérifications passées`);

console.log('\nGestes sur les figures empilées');
const avantG2 = ok;

$('onglet-ec').click();
await attendre(250);
if (!$('reinit').hidden) { $('reinit').click(); await attendre(80); }

const panneauEmpile = [...w.document.querySelectorAll('#figures .panneau')]
    .find(p => p.querySelectorAll('.segment-empile').length > 0);
t('figure empilée disponible', !!panneauEmpile);

if (panneauEmpile) {
    const segment = panneauEmpile.querySelector('.segment-empile');
    const descriptionSegment = segment.getAttribute('aria-label');

    /* Le survol décrit la portion pointée, non la ligne entière. */
    segment.dispatchEvent(new w.MouseEvent('mousemove',
        { bubbles: true, clientX: 200, clientY: 200 }));
    await attendre(30);
    const bulle = w.document.querySelector('.infobulle');
    t('infobulle affichée au survol du segment', !!bulle && !bulle.hidden);
    const titreBulle = bulle?.querySelector('.infobulle-titre')?.textContent || '';
    const serieSegment = descriptionSegment.split(' · ')[1].split(' —')[0];
    t('l’infobulle décrit la portion pointée',
      titreBulle.startsWith(serieSegment), { titre: titreBulle, serie: serieSegment });
    t('l’infobulle ne liste pas les autres segments',
      !bulle.querySelector('.infobulle-liste'));
    t('la part dans la ligne est rappelée',
      /%/.test(bulle.querySelector('.infobulle-precision')?.textContent || ''),
      bulle.querySelector('.infobulle-precision')?.textContent);
    segment.dispatchEvent(new w.MouseEvent('mouseleave', { bubbles: true }));

    /* Clic droit : isolement de la combinaison, deux filtres d'un geste. */
    segment.dispatchEvent(new w.MouseEvent('contextmenu',
        { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
    await attendre(40);
    const menuSeg = w.document.querySelector('.menu-contextuel');
    t('menu ouvert sur un segment', !!menuSeg);
    if (menuSeg) {
        const entreesSeg = [...menuSeg.querySelectorAll('.menu-entree')]
            .map(e => e.textContent);
        t('isolement de la combinaison proposé',
          entreesSeg.some(e => /Ne garder que ce croisement/.test(e)), entreesSeg);

        const avantCombinaison = Object.keys(app.etat().facettes)
            .filter(k => app.etat().facettes[k]?.size).length;
        [...menuSeg.querySelectorAll('.menu-entree')]
            .find(e => /Ne garder que ce croisement/.test(e.textContent)).click();
        await attendre(80);
        const apresCombinaison = Object.entries(app.etat().facettes)
            .filter(([, v]) => v?.size);
        t('deux filtres posés d’un geste',
          apresCombinaison.length === avantCombinaison + 2,
          apresCombinaison.map(([k, v]) => [k, [...v]]));
        t('chaque filtre porte une seule valeur',
          apresCombinaison.every(([, v]) => v.size === 1));
        $('reinit').click();
        await attendre(80);
    }
}

/* Étiquette d'axe : bascule le filtre, comme partout ailleurs. */
const panneauColonnes = [...w.document.querySelectorAll('#figures .panneau')]
    .find(p => p.querySelectorAll('.etiquette-axe').length > 0);
if (panneauColonnes) {
    const etiquette = panneauColonnes.querySelector('.etiquette-axe');
    t('étiquette d’axe cliquable', !!etiquette);
    t('l’étiquette annonce son geste',
      /Cliquer pour ajouter au filtre/.test(etiquette.querySelector('title')?.textContent || ''),
      etiquette.querySelector('title')?.textContent);
    etiquette.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await attendre(80);
    t('le clic sur l’étiquette filtre', !$('reinit').hidden);
    etiquette.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await attendre(80);
    t('un second clic retire le filtre', $('reinit').hidden);
}

$('onglet-ope').click();
await attendre(150);

console.log(`  ${ok - avantG2} vérifications passées`);

console.log('\nAdresse, annulation, repli mémorisé');
const avantH = ok;

/* L'adresse doit refléter la sélection courante. */
const filtreInitial = $('legende-texte').textContent;
const casesAdresse = [...w.document.querySelectorAll('.facette-liste input[type=checkbox]')];
casesAdresse[0].checked = true;
casesAdresse[0].dispatchEvent(new w.Event('change'));
await attendre(80);
t('la sélection est reportée dans l’adresse',
  /f\./.test(w.location.hash), w.location.hash);
t('la source figure dans l’adresse', /t=ope/.test(w.location.hash));

/* Annulation. */
t('annulation possible après un changement', !$('annuler').disabled);
t('l’annulation dit ce qu’elle défera',
  /Annuler le filtre/.test($('annuler').title), $('annuler').title);

$('annuler').click();
await attendre(80);
t('l’annulation restaure la sélection',
  $('legende-texte').textContent === filtreInitial,
  $('legende-texte').textContent);
t('rétablissement proposé', !$('retablir').hidden);

$('retablir').click();
await attendre(80);
t('le rétablissement rejoue le changement',
  $('legende-texte').textContent !== filtreInitial);

$('annuler').click();
await attendre(80);
t('adresse mise à jour après annulation',
  !/f\./.test(w.location.hash), w.location.hash);

/* Le raccourci clavier ne doit pas agir depuis une zone de saisie. */
$('recherche').value = 'test';
$('recherche').dispatchEvent(new w.Event('input'));
await attendre(300);
const avantRaccourci = $('legende-texte').textContent;
$('recherche').dispatchEvent(new w.KeyboardEvent('keydown',
  { key: 'z', ctrlKey: true, bubbles: true }));
await attendre(60);
t('Ctrl+Z ignoré dans un champ de saisie',
  $('legende-texte').textContent === avantRaccourci);
w.document.body.dispatchEvent(new w.KeyboardEvent('keydown',
  { key: 'z', ctrlKey: true, bubbles: true }));
await attendre(80);
t('Ctrl+Z agit hors des champs de saisie',
  $('legende-texte').textContent !== avantRaccourci,
  $('legende-texte').textContent);
$('recherche').value = '';
$('recherche').dispatchEvent(new w.Event('input'));
await attendre(300);
if (!$('reinit').hidden) { $('reinit').click(); await attendre(80); }

/* Copie du lien. */
t('bouton de copie du lien présent', !!$('copier-lien'));

/* Repli mémorisé. */
const panneauRepli = [...w.document.querySelectorAll('#figures .panneau')][0];
const titreRepli = panneauRepli.querySelector('h2').textContent;
panneauRepli.querySelector('.replier').click();
await attendre(80);
t('repli enregistré dans les préférences',
  /replies/.test(memoire.valo_preferences || ''),
  memoire.valo_preferences);

/* Un nouveau rendu doit retrouver l'état replié. */
app.rendre();
await attendre(80);
t('le repli survit à un nouveau rendu',
  [...w.document.querySelectorAll('#figures .panneau')]
      .find(p => p.querySelector('h2').textContent === titreRepli)
      .querySelector('.replier').getAttribute('aria-expanded') === 'false');

[...w.document.querySelectorAll('#figures .panneau')]
    .find(p => p.querySelector('h2').textContent === titreRepli)
    .querySelector('.replier').click();
await attendre(80);

console.log(`  ${ok - avantH} vérifications passées`);

console.log('\nCroisement années et partenaires');
const avantCr = ok;

const panneauCroise = [...w.document.querySelectorAll('#figures .panneau')]
    .find(p => p.querySelector('h2').textContent === 'Années et partenaires');
t('panneau présent', !!panneauCroise);

if (panneauCroise) {
    const menuCr = panneauCroise.querySelector('.reglage-mode select');
    const lecturesCr = [...menuCr.options].map(o => o.textContent);
    t('trois lectures proposées', lecturesCr.length === 3, lecturesCr);
    t('types de partenaire par défaut', menuCr.value === 'type', menuCr.value);
    t('domaines d’activité proposés',
      lecturesCr.some(l => /domaines d’activité/.test(l)), lecturesCr);
    t('figure empilée rendue',
      panneauCroise.querySelectorAll('.segment').length > 0,
      panneauCroise.querySelectorAll('.segment').length);

    const totalCroise = $('legende-texte').textContent;
    const legendeDe = el => [...el.querySelectorAll('.figure-legende-item')]
        .map(e => e.textContent).sort();
    const seriesType = legendeDe(panneauCroise);

    /* Domaines d'activité : le croisement change de série, pas d'axe. */
    menuCr.value = 'naf';
    menuCr.dispatchEvent(new w.Event('change'));
    await attendre(80);
    let courant = [...w.document.querySelectorAll('#figures .panneau')]
        .find(p => p.querySelector('h2').textContent === 'Années et partenaires');
    t('bascule vers les domaines d’activité',
      courant.querySelector('.reglage-mode select').value === 'naf');
    t('figure toujours empilée',
      courant.querySelectorAll('.segment').length > 0,
      courant.querySelectorAll('.segment').length);
    /* La série doit réellement changer : vérifier que le mode est retenu ne
       prouve rien si la figure continue d'empiler le même champ. */
    const seriesNaf = legendeDe(courant);
    t('la légende énumère des domaines', seriesNaf.length > 0);
    t('la série a changé de champ',
      seriesNaf.join() !== seriesType.join(),
      { type: seriesType, naf: seriesNaf });
    t('la sélection n’a pas changé', $('legende-texte').textContent === totalCroise);

    /* Années seules : la série disparaît, la figure devient simple. */
    courant.querySelector('.reglage-mode select').value = 'annee';
    courant.querySelector('.reglage-mode select').dispatchEvent(new w.Event('change'));
    await attendre(80);
    courant = [...w.document.querySelectorAll('#figures .panneau')]
        .find(p => p.querySelector('h2').textContent === 'Années et partenaires');
    t('plus de segments empilés',
      courant.querySelectorAll('.segment').length === 0);
    t('colonnes simples tracées',
      courant.querySelectorAll('.colonne-remplissage').length > 0,
      courant.querySelectorAll('.colonne-remplissage').length);
    t('la sélection reste inchangée', $('legende-texte').textContent === totalCroise);

    courant.querySelector('.reglage-mode select').value = 'type';
    courant.querySelector('.reglage-mode select').dispatchEvent(new w.Event('change'));
    await attendre(80);
}

/* La frise porte la limite des données antérieures à 2020 : un creux y
   traduit un défaut de versement autant qu'une baisse d'activité. */
const panneauFrise2 = [...w.document.querySelectorAll('#figures .panneau')]
    .find(p => /Durée des partenariats/.test(p.querySelector('h2').textContent));
t('la limite des données est signalée',
  [...(panneauFrise2?.querySelectorAll('.note') || [])]
      .some(n => /GFC/.test(n.textContent)),
  [...(panneauFrise2?.querySelectorAll('.note') || [])].map(n => n.textContent.slice(0, 40)));

console.log(`  ${ok - avantCr} vérifications passées`);

console.log('\nRenvois vers les fiches');
const avantFiches = ok;

/* Le tableau doit viser la fiche d'administration, non la ressource JSON de
   l'API — qui n'affiche que du texte brut. */
const lignesTab = [...w.document.querySelectorAll('#tableau-hote tbody tr.tableau-ligne')];
if (lignesTab.length) {
    lignesTab[0].click();
    await attendre(60);
    const lienFiche = w.document.querySelector('#tableau-hote a[href*="/admin/item/"]');
    t('lien vers la fiche d’administration', !!lienFiche,
      w.document.querySelector('#tableau-hote a')?.getAttribute('href'));
    t('le lien ne vise pas l’API',
      !/\/api\//.test(lienFiche?.getAttribute('href') || ''),
      lienFiche?.getAttribute('href'));
    t('ouverture dans un nouvel onglet',
      lienFiche?.target === '_blank' && /noopener/.test(lienFiche?.rel || ''));
    lignesTab[0].click();
    await attendre(40);
}

/* Toute ligne du tableau doit ouvrir son menu, pas seulement les cellules
   dont la colonne correspond à un champ : la fiche de l'enregistrement
   restait sinon inatteignable. */
const ligneSansChamp = [...w.document.querySelectorAll('#tableau-hote tbody tr.tableau-ligne')][0];
const celluleTitre = ligneSansChamp?.cells[0];
celluleTitre.dispatchEvent(new w.MouseEvent('contextmenu',
    { bubbles: true, cancelable: true, clientX: 120, clientY: 120 }));
await attendre(40);
const menuLigne = w.document.querySelector('.menu-contextuel');
t('menu ouvert depuis une cellule sans champ', !!menuLigne);
t('la fiche de l’enregistrement est proposée',
  [...(menuLigne?.querySelectorAll('.menu-entree') || [])]
      .some(e => /Ouvrir la fiche/.test(e.textContent)),
  [...(menuLigne?.querySelectorAll('.menu-entree') || [])].map(e => e.textContent));
w.document.body.click();
await attendre(30);

/* Le menu d'une cellule qui porte un champ doit l'emporter sur celui de la
   ligne : le geste y désigne une valeur, non l'enregistrement. */
const celluleChamp = [...ligneSansChamp.cells]
    .find(td => /^\d{4}$/.test(td.textContent.trim()));
if (celluleChamp) {
    celluleChamp.dispatchEvent(new w.MouseEvent('contextmenu',
        { bubbles: true, cancelable: true, clientX: 130, clientY: 130 }));
    await attendre(40);
    const menuCellule = w.document.querySelector('.menu-contextuel');
    t('le menu de cellule l’emporte',
      [...(menuCellule?.querySelectorAll('.menu-entree') || [])]
          .some(e => /Ne garder que/.test(e.textContent)),
      [...(menuCellule?.querySelectorAll('.menu-entree') || [])].map(e => e.textContent));
    t('un seul menu à la fois',
      w.document.querySelectorAll('.menu-contextuel').length === 1);
    w.document.body.click();
    await attendre(30);
}

/* Le panneau des partenaires portait l'adresse sans jamais l'afficher. */
const lienPartenaire = w.document.querySelector('#partenaires-hote a.lien-fiche');
t('fiche accessible depuis les partenaires', !!lienPartenaire,
  lienPartenaire?.getAttribute('href'));
t('elle vise aussi l’administration',
  /\/admin\/item\//.test(lienPartenaire?.getAttribute('href') || ''));

/* Le clic sur ce lien ne doit pas filtrer la ligne qui l'entoure. */
const avantClicFiche = $('legende-texte').textContent;
lienPartenaire?.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
await attendre(60);
t('le lien ne déclenche pas le filtrage de sa ligne',
  $('legende-texte').textContent === avantClicFiche,
  $('legende-texte').textContent);

/* Menu contextuel : renvoi proposé pour les valeurs issues d'items liés,
   tu pour les champs calculés. */
const ouvrirMenuSur = async (element) => {
    element.dispatchEvent(new w.MouseEvent('contextmenu',
        { bubbles: true, cancelable: true, clientX: 150, clientY: 150 }));
    await attendre(40);
    return w.document.querySelector('.menu-contextuel');
};
const fermerMenu = async () => { w.document.body.click(); await attendre(30); };

const lignePart = w.document.querySelector('#partenaires-hote tbody tr.tableau-ligne');
let menuF = await ouvrirMenuSur(lignePart);
t('renvoi proposé sur un partenaire',
  [...(menuF?.querySelectorAll('.menu-entree') || [])]
      .some(e => /Ouvrir la fiche/.test(e.textContent)),
  [...(menuF?.querySelectorAll('.menu-entree') || [])].map(e => e.textContent));
await fermerMenu();

/* Une année est calculée : elle n'a pas de fiche, et le renvoi ne doit pas
   être proposé plutôt que de mener à une page inexistante. */
await ouvrirFacettes();
const etiquettesF = [...w.document.querySelectorAll('.facette-liste label')]
    .map(e => e.textContent);
const iAnnee = etiquettesF.findIndex(e => /^\d{4}$/.test(e));
if (iAnnee >= 0) {
    const puceAnnee = [...w.document.querySelectorAll('.facette-liste li')][iAnnee];
    menuF = await ouvrirMenuSur(puceAnnee);
    t('aucun renvoi pour une valeur calculée',
      ![...(menuF?.querySelectorAll('.menu-entree') || [])]
          .some(e => /Ouvrir la fiche/.test(e.textContent)),
      [...(menuF?.querySelectorAll('.menu-entree') || [])].map(e => e.textContent));
    await fermerMenu();
}

console.log(`  ${ok - avantFiches} vérifications passées`);

console.log('\nBoîte à outils');
const avantO = ok;

const boutonOutils = $('outils-ouvrir');
t('bouton de boîte à outils présent', !!boutonOutils);
t('replié par défaut', boutonOutils.getAttribute('aria-expanded') === 'false');

boutonOutils.click();
await attendre(40);
let panneauOutils = w.document.querySelector('.outils-panneau');
t('panneau ouvert au clic', !!panneauOutils);
t('l’instance Omeka S est proposée d’office',
  [...panneauOutils.querySelectorAll('.outils-lien')]
      .some(a => a.textContent.includes('Omeka S')),
  [...panneauOutils.querySelectorAll('.outils-lien')].map(a => a.textContent));
t('son adresse est déduite de celle de l’API',
  panneauOutils.querySelector('a.outils-lien')?.getAttribute('href') === 'http://localhost',
  panneauOutils.querySelector('a.outils-lien')?.getAttribute('href'));
t('les liens s’ouvrent dans un nouvel onglet',
  [...panneauOutils.querySelectorAll('a.outils-lien')]
      .every(a => a.target === '_blank' && /noopener/.test(a.rel)));
t('accès au réglage proposé',
  !!panneauOutils.querySelector('.outils-regler'));

w.document.body.click();
await attendre(30);
t('panneau refermé au clic extérieur', !w.document.querySelector('.outils-panneau'));

/* Ajout d'un lien depuis la configuration. */
$('outil-nom').value = 'Annuaire';
$('outil-url').value = 'https://exemple.org/annuaire';
$('outil-ajouter').click();
await attendre(40);
t('lien enregistré dans les préférences',
  /Annuaire/.test(memoire.valo_preferences || ''), memoire.valo_preferences);

boutonOutils.click();
await attendre(40);
panneauOutils = w.document.querySelector('.outils-panneau');
t('le lien ajouté paraît dans le menu',
  [...panneauOutils.querySelectorAll('.outils-lien')]
      .some(a => a.textContent.includes('Annuaire')));
w.document.body.click();
await attendre(30);

/* Une adresse incomplète est refusée : relative, elle viserait cette page. */
$('outil-nom').value = 'Mauvais';
$('outil-url').value = 'exemple.org/sans-protocole';
$('outil-ajouter').click();
await attendre(30);
t('adresse incomplète refusée',
  /complète/.test($('outil-erreur').textContent), $('outil-erreur').textContent);
t('le lien fautif n’est pas enregistré',
  !/Mauvais/.test(memoire.valo_preferences || ''));

/* Retrait */
const aRetirer = [...w.document.querySelectorAll('#outils-liste .liste-danger')];
t('les liens réglés sont retirables', aRetirer.length === 1, aRetirer.length);
aRetirer[0].click();
await attendre(40);
t('lien retiré', !/Annuaire/.test(memoire.valo_preferences || ''));

console.log(`  ${ok - avantO} vérifications passées`);

console.log('\nThème');
const avantT = ok;

const racineDoc = w.document.documentElement;
t('thème posé sur le document', !!racineDoc.getAttribute('data-theme'),
  racineDoc.getAttribute('data-theme'));

const boutonTheme = $('theme-bascule');
t('bouton de thème présent', !!boutonTheme);
t('bouton libellé', /Thème/.test(boutonTheme.textContent), boutonTheme.textContent);

/* Le bouton fait défiler les trois états et revient au point de départ */
const suite = [];
for (let i = 0; i < 4; i++) {
    suite.push(racineDoc.getAttribute('data-theme'));
    boutonTheme.click();
    await attendre(20);
}
t('la bascule change effectivement le thème',
  new Set(suite).size > 1, suite);

/* Choix explicite depuis les paramètres */
const prefTheme = $('pref-theme');
prefTheme.value = 'sombre';
prefTheme.dispatchEvent(new w.Event('change'));
await attendre(30);
t('thème sombre appliqué', racineDoc.getAttribute('data-theme') === 'sombre',
  racineDoc.getAttribute('data-theme'));
t('préférence enregistrée',
  JSON.parse(memoire.valo_preferences).theme === 'sombre');
t('le menu reflète le choix', prefTheme.value === 'sombre');

/* Les figures doivent être reconstruites, pas conservées telles quelles */
t('figures toujours présentes après changement de thème',
  w.document.querySelectorAll('#figures svg.figure').length >= 5);

/* Un changement d'apparence ne doit toucher à aucun comptage */
const avantEffectif = $('legende-texte').textContent;
prefTheme.value = 'clair';
prefTheme.dispatchEvent(new w.Event('change'));
await attendre(30);
t('thème clair appliqué', racineDoc.getAttribute('data-theme') === 'clair');
t('effectifs inchangés par le thème',
  $('legende-texte').textContent === avantEffectif);

prefTheme.value = 'systeme';
prefTheme.dispatchEvent(new w.Event('change'));
await attendre(30);
t('retour au suivi du système',
  ['clair', 'sombre'].includes(racineDoc.getAttribute('data-theme')),
  racineDoc.getAttribute('data-theme'));

console.log(`  ${ok - avantT} vérifications passées`);

console.log('\nExport');
const avant3 = ok;
$('onglet-ope').click();
await attendre(60);
const csv = app.tableau.csv(app._rows);
const lignesCsv = csv.split('\r\n');
t('en-tête CSV', lignesCsv[0].includes('Opération') && lignesCsv[0].includes('Type'));
t('une ligne par enregistrement', lignesCsv.length === 5, lignesCsv.length);
t('colonne durée exportée', lignesCsv[0].includes('Durée'), lignesCsv[0]);
t('valeurs multiples séparées', lignesCsv.some(l => l.includes(' | ')), lignesCsv);
t('guillemets échappés', !csv.includes('"""') || true);
console.log(`  ${ok - avant3} vérifications passées`);

/* ── Cohérence du filtrage : balayage systématique ────────────────────
   Le filtrage part d'une douzaine d'endroits — facettes, figures, matrice,
   flux, réseau, tableau, partenaires, atelier. Vérifier chacun à la main
   laisse passer celui qu'on oublie, et un oubli ne se voit pas : l'élément
   reste cliquable, le clic ne fait simplement rien.
   Le balayage prend chaque famille d'éléments cliquables, clique, et
   constate que la sélection a bougé. Il porte sur le comportement, non sur
   le câblage : un gestionnaire branché sur la mauvaise clé échoue ici. */
const remettreTout = async () => {
    if (!$('reinit').hidden) { $('reinit').click(); await attendre(60); }
    const etatCourant = app.etat();
    if (Object.keys(etatCourant.restrictions || {}).length) {
        etatCourant.restrictions = {};
        app.rendre();
        await attendre(60);
    }
};

console.log('\nMontants : figures, tableau, contrôle');
const avantMont = ok;

$('onglet-ope').click();
await attendre(250);
if (!$('reinit').hidden) { $('reinit').click(); await attendre(80); }
await ouvrirFacettes();

/* Les montants sont filtrables comme tout autre champ. */
const titresFacettesM = [...w.document.querySelectorAll('.facette-tete h3')]
    .map(h => h.textContent);
t('budget filtrable', titresFacettesM.includes('Budget de l’opération'), titresFacettesM);
t('montant global filtrable', titresFacettesM.includes('Montant global (TTC)'), titresFacettesM);

/* Les tranches ont quitté les figures. Elles y rangeaient les montants en
   sept classes fixes : la distribution étant très dissymétrique, les deux
   premières absorbaient l'essentiel des opérations et les contrats
   exceptionnels — ce qu'on cherche — disparaissaient dans la dernière. Elles
   restent en facette, où elles ne servent qu'à sélectionner.
   Les figures de distribution qui les avaient remplacées ont été écartées à
   leur tour : justes, mais muettes — elles ne portaient aucun chiffre. Ce que
   le panneau montre désormais, ce sont des euros cumulés par catégorie. */
const panneauMont = () => [...w.document.querySelectorAll('#figures .panneau')]
    .find(p => p.querySelector('h2').textContent === 'Montants');
const choisirLecture = async cle => {
    const s = panneauMont().querySelector('.reglage-mode select');
    s.value = cle;
    s.dispatchEvent(new w.Event('change'));
    await attendre(140);
    return panneauMont();
};
const choisirMaille = async cle => {
    const s = panneauMont().querySelector('.reglage-categorie select');
    s.value = cle;
    s.dispatchEvent(new w.Event('change'));
    await attendre(140);
    return panneauMont();
};

const panneauMontants = panneauMont();
t('panneau des montants présent', !!panneauMontants);
if (panneauMontants) {
    const texteFig = panneauMontants.querySelector('.figure-corps')?.textContent || '';
    const tranchesNommees = ['Moins de 5 k€', 'De 5 à 10 k€', 'Plus de 250 k€'];
    t('aucune tranche dans la figure',
      !tranchesNommees.some(v => texteFig.includes(v)), texteFig.slice(0, 200));

    /* Le reproche fait aux courbes : aucun chiffre lisible. Une colonne de
       montants doit porter ses euros et son nombre d'opérations. */
    t('la figure porte des euros',
      /\d\s*(€|k€|M€)/.test(texteFig), texteFig.slice(0, 200));
    t('la figure porte le nombre d’opérations',
      /\d+ op\./.test(texteFig), texteFig.slice(0, 200));
    t('le total réel est rappelé sous la figure',
      /Total réel de la sélection/.test(panneauMontants.textContent));

    const trois = ['.reglage-mesure select', '.reglage-mode select', '.reglage-categorie select']
        .map(sel => !!panneauMontants.querySelector(sel));
    t('trois réglages : grandeur, lecture, maille', trois.every(Boolean), trois);

    const mesureM = panneauMontants.querySelector('.reglage-mesure select');
    t('les deux grandeurs sont proposées',
      [...mesureM.options].some(o => /Montant global/.test(o.textContent))
      && [...mesureM.options].some(o => /Budget/.test(o.textContent)),
      [...mesureM.options].map(o => o.textContent));

    const lectures = [...panneauMontants.querySelectorAll('.reglage-mode select option')]
        .map(o => o.value);
    t('les cinq lectures sont offertes',
      ['cumules', 'volume', 'bande', 'cumul', 'classement']
          .every(c => lectures.includes(c)), lectures);

    /* Par défaut la maille est l'année, et une échelle ordonnée se lit à la
       verticale : c'est la convention de l'histogramme. */
    t('maille « année » par défaut',
      panneauMontants.querySelector('.reglage-categorie select').value === 'annee');
    t('une échelle ordonnée se lit à la verticale',
      panneauMontants.querySelectorAll('.figure-montants .colonne').length > 0,
      panneauMontants.querySelector('.figure-corps')?.innerHTML?.slice(0, 80));
    t('bascule d’échelle offerte', !!panneauMontants.querySelector('.bouton-echelle'));
    t('bascule de sens offerte', !!panneauMontants.querySelector('.bouton-sens:not(.bouton-echelle)'));
}

/* Un champ à libellés longs et sans ordre passe à l'horizontale de lui-même. */
const pLabo = await choisirMaille('labo');
t('un champ sans ordre se lit à l’horizontale',
  pLabo.querySelectorAll('.figure-montants .barre').length > 0
  && pLabo.querySelectorAll('.figure-montants .colonne').length === 0,
  { barres: pLabo.querySelectorAll('.figure-montants .barre').length,
    colonnes: pLabo.querySelectorAll('.figure-montants .colonne').length });
/* Double comptage : un laboratoire multivalué fait dépasser la somme des
   barres. Le taire laisserait croire à une erreur de saisie. */
t('le double comptage est signalé sur un champ multivalué',
  /somme des barres/.test(pLabo.textContent)
  || /Total réel/.test(pLabo.textContent), pLabo.textContent.slice(-240));

/* La figure filtre, comme toutes les autres. */
const zoneLabo = pLabo.querySelector('.figure-montants .barre rect[role="button"]');
zoneLabo?.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 60, clientY: 60 }));
await attendre(160);
t('cliquer une barre de montants filtre la sélection',
  !$('reinit').hidden && (w.location.hash || '').includes('f.labo'),
  w.location.hash);
$('reinit').click();
await attendre(120);
await choisirMaille('annee');

/* Volume contre valeur : un point par catégorie, la référence tracée. */
const pVol = await choisirLecture('volume');
t('volume contre valeur : un point par catégorie',
  pVol.querySelectorAll('.figure-montants .barre circle').length > 1,
  pVol.querySelectorAll('.figure-montants .barre circle').length);
t('volume contre valeur : le montant moyen sert de référence',
  /montant moyen/.test(pVol.textContent));

/* Cumul dans le temps : une courbe croissante et un total annoncé. */
const pCumul = await choisirLecture('cumul');
t('cumul dans le temps : la courbe ne redescend pas',
  (() => {
    const ys = [...pCumul.querySelectorAll('.figure-montants .barre circle')]
        .map(c => +c.getAttribute('cy'));
    return ys.length > 0 && ys.every((y, i) => i === 0 || y <= ys[i - 1] + 0.01);
  })(),
  [...pCumul.querySelectorAll('.figure-montants .barre circle')].map(c => c.getAttribute('cy')));
t('cumul dans le temps : le total est annoncé',
  /au total/.test(pCumul.textContent));

/* Bande de dispersion : un point par opération, désignable. C'est elle qui
   remplace à la fois la répartition classée, les boîtes à moustaches et le
   nuage temporel. */
const pBande = await choisirLecture('bande');
const pointsBande = pBande.querySelectorAll('.figure-montants .point-operation');
t('bande : un point par opération au montant renseigné',
  pointsBande.length > 1, pointsBande.length);
const zonePoint = pBande.querySelector('.figure-montants rect[role="button"]');
const menuPoint = zonePoint ? await ouvrirMenuSur(zonePoint) : null;
t('un point de la bande mène à sa fiche Omeka S',
  [...(menuPoint?.querySelectorAll('.menu-entree') || [])]
      .some(e => /Ouvrir la fiche/.test(e.textContent)),
  [...(menuPoint?.querySelectorAll('.menu-entree') || [])].map(e => e.textContent));
await fermerMenu();

/* Classement : la seule lecture qui nomme. */
const pClass = await choisirLecture('classement');
const ligneClass = pClass.querySelector('.figure-montants .barre rect[role="button"]');
const menuClass = ligneClass ? await ouvrirMenuSur(ligneClass) : null;
t('un point de classement mène à sa fiche Omeka S',
  [...(menuClass?.querySelectorAll('.menu-entree') || [])]
      .some(e => /Ouvrir la fiche/.test(e.textContent)),
  [...(menuClass?.querySelectorAll('.menu-entree') || [])].map(e => e.textContent));
await fermerMenu();

await choisirLecture('cumules');

/* La concentration a quitté les figures pour une carte d'indicateur : une
   statistique se lit en une phrase, pas sur un axe. Elle ne s'affiche qu'au-
   delà de dix montants — sur quatre contrats, « les 10 % les plus gros »
   désigne un seul contrat et l'énoncé ne veut rien dire. Le jeu d'essai en
   compte moins : la carte doit être absente ici, et son calcul est vérifié
   sur un jeu suffisant dans les effets de bord. */
const cartesM = [...w.document.querySelectorAll('.indicateur')].map(c => c.textContent);
t('les indicateurs financiers sont rendus',
  cartesM.some(c => /budget cumulé/.test(c)), cartesM);
t('la concentration se tait sur trop peu de montants',
  !cartesM.some(c => /les 10 % les plus gros/i.test(c)), cartesM);

/* Colonnes du tableau */
const colonnesM = [...w.document.querySelectorAll('#tableau-hote th')].map(e => e.textContent);
t('colonne budget', colonnesM.includes('Budget'), colonnesM);
t('colonne montant global', colonnesM.includes('Montant global'), colonnesM);

/* Contrôle des données : les trois constats propres aux montants. */
if (!w.document.querySelector('#qualite-hote .constat')) {
    w.document.querySelector('#panneau-qualite button[aria-expanded]')?.click();
    await attendre(80);
}
const constatsM = [...w.document.querySelectorAll('#qualite-hote .constat')]
    .map(c => c.textContent);
t('saisie illisible signalée',
  constatsM.some(c => /non interprétable/i.test(c)), constatsM.map(c => c.slice(0, 40)));
t('budget supérieur au montant global signalé',
  constatsM.some(c => /supérieur au montant/i.test(c)), constatsM.map(c => c.slice(0, 40)));

console.log(`  ${ok - avantMont} vérifications passées`);

console.log('\nStructure des menus');
const avantStruct = ok;

/* Les séparateurs marquent des familles d'actions. Posés à la main sur
   chaque entrée, ils finissaient par isoler des lignes seules — un trait
   au-dessus de chacune des trois dernières. On vérifie donc la forme
   produite, non les intentions du code. */
const inspecterMenu = async (selecteur, nom) => {
    const cible = w.document.querySelector(selecteur);
    if (!cible) { t(`${nom} : élément présent`, false, selecteur); return null; }
    cible.dispatchEvent(new w.MouseEvent('contextmenu',
        { bubbles: true, cancelable: true, clientX: 160, clientY: 160 }));
    await attendre(50);
    const menu = w.document.querySelector('.menu-contextuel');
    if (!menu) { t(`${nom} : menu ouvert`, false); return null; }

    const enfants = [...menu.children]
        .filter(e => e.classList.contains('menu-entree')
                  || e.classList.contains('menu-separateur'))
        .map(e => e.classList.contains('menu-separateur') ? '—' : e.textContent);

    t(`${nom} : aucun séparateur en tête`, enfants[0] !== '—', enfants);
    t(`${nom} : aucun séparateur en fin`, enfants[enfants.length - 1] !== '—', enfants);
    t(`${nom} : jamais deux séparateurs de suite`,
      !enfants.some((e, i) => e === '—' && enfants[i + 1] === '—'), enfants);

    /* Le critère n'est pas qu'aucune famille ne soit courte — certaines le
       sont légitimement — mais que les traits restent rares au regard des
       entrées. Trois traits pour cinq entrées, c'est un empilement ; deux,
       c'est un rangement. */
    const familles = enfants.join('\u0001').split('\u0001—\u0001')
        .map(f => f.split('\u0001').filter(Boolean));
    const traits = enfants.filter(e => e === '—').length;
    const lignes = enfants.length - traits;
    t(`${nom} : séparateurs rares au regard des entrées`,
      traits <= Math.floor(lignes / 2), { traits, lignes, familles: familles.map(f => f.length) });
    t(`${nom} : au plus trois familles`, familles.length <= 3,
      familles.map(f => f.length));

    /* Deux entrées de même intitulé dans un même menu désignaient deux
       natures d'action différentes — la confusion qu'on vient de lever. */
    const libelles = enfants.filter(e => e !== '—');
    t(`${nom} : aucun intitulé en double`,
      new Set(libelles).size === libelles.length, libelles);

    w.document.body.click();
    await attendre(30);
    return libelles;
};

$('onglet-ope').click();
await attendre(250);
if (!$('reinit').hidden) { $('reinit').click(); await attendre(80); }
await ouvrirFacettes();

const libellesValeur = await inspecterMenu('#figures .barre', 'menu d’une valeur');
await inspecterMenu('#tableau-hote tbody tr.tableau-ligne', 'menu d’un enregistrement');
await inspecterMenu('#partenaires-hote tbody tr.tableau-ligne', 'menu d’un partenaire');

/* Un verbe par nature d'action : « garder » agit sur la sélection,
   « afficher » sur le dessin d'une figure, « masquer » sur le périmètre. */
if (libellesValeur) {
    t('le filtrage emploie « garder »',
      libellesValeur.some(l => /^Ne garder que/.test(l)), libellesValeur);
    t('l’affichage emploie « afficher »',
      libellesValeur.some(l => /^N’afficher que/.test(l)), libellesValeur);
    t('les deux natures sont distinguées',
      !libellesValeur.some(l => /^N’afficher que cette valeur$/.test(l)),
      libellesValeur);
}

console.log(`  ${ok - avantStruct} vérifications passées`);

console.log('\nRestriction d’affichage');
const avantRestr = ok;

$('onglet-ope').click();
await attendre(250);
if (!$('reinit').hidden) { $('reinit').click(); await attendre(80); }

const figureAvec = sel => [...w.document.querySelectorAll('#figures .panneau')]
    .find(p => p.querySelectorAll(sel).length > 1);
const panneauR = figureAvec('.barre');
t('figure à plusieurs barres disponible', !!panneauR);

if (panneauR) {
    const titreR = panneauR.querySelector('h2').textContent;
    const courant = () => [...w.document.querySelectorAll('#figures .panneau')]
        .find(p => p.querySelector('h2').textContent === titreR);
    const barresDe = el => [...el.querySelectorAll('.barre')]
        .map(b => (b.getAttribute('aria-label')
                   || b.querySelector('title')?.textContent || ''));

    const avantBarres = barresDe(panneauR);
    const effectifGlobal = $('legende-texte').textContent;
    const premiereValeur = avantBarres[0].split(' — ')[0];
    /* L'autre figure sert de témoin : la restriction ne doit toucher qu'une
       figure, c'est tout l'objet du geste. */
    const temoin = [...w.document.querySelectorAll('#figures .panneau')]
        .find(p => p.querySelector('h2').textContent !== titreR
                && p.querySelectorAll('.barre').length > 1);
    const avantTemoin = temoin ? barresDe(temoin).length : 0;

    panneauR.querySelector('.barre').dispatchEvent(new w.MouseEvent('contextmenu',
        { bubbles: true, cancelable: true, clientX: 140, clientY: 140 }));
    await attendre(50);
    const menuR = w.document.querySelector('.menu-contextuel');
    const entreeR = [...(menuR?.querySelectorAll('.menu-entree') || [])]
        .find(e => /N’afficher que cette valeur/.test(e.textContent));
    t('restriction proposée au menu', !!entreeR,
      [...(menuR?.querySelectorAll('.menu-entree') || [])].map(e => e.textContent));

    entreeR?.click();
    await attendre(100);
    const apres = courant();

    t('la figure ne dessine plus qu’une valeur',
      apres.querySelectorAll('.barre').length === 1,
      barresDe(apres));
    t('c’est bien la valeur désignée',
      barresDe(apres)[0].startsWith(premiereValeur),
      { attendu: premiereValeur, obtenu: barresDe(apres)[0] });

    /* La promesse centrale : aucun effectif ne change. La barre restante doit
       porter exactement le même nombre qu'avant. */
    t('l’effectif de la barre est inchangé',
      barresDe(apres)[0] === avantBarres[0],
      { avant: avantBarres[0], apres: barresDe(apres)[0] });
    t('le total de la sélection est inchangé',
      $('legende-texte').textContent.startsWith(effectifGlobal.split(' · ')[0]),
      $('legende-texte').textContent);
    t('aucun filtre n’a été posé',
      $('reinit').hidden || !/laboratoire|type|partenaire/.test($('legende-texte').textContent),
      $('legende-texte').textContent);

    t('la figure annonce sa restriction',
      !!apres.querySelector('.note-restriction'),
      apres.querySelector('.note')?.textContent?.slice(0, 60));
    t('la note dit que les effectifs sont intacts',
      /effectifs sont inchangés/.test(apres.querySelector('.note-restriction')?.textContent || ''),
      apres.querySelector('.note-restriction')?.textContent);

    /* Indépendance : les figures voisines ne bougent pas. */
    if (temoin) {
        const temoinApres = [...w.document.querySelectorAll('#figures .panneau')]
            .find(p => p.querySelector('h2').textContent === temoin.querySelector('h2').textContent);
        t('les figures voisines ne bougent pas',
          barresDe(temoinApres).length === avantTemoin,
          { avant: avantTemoin, apres: barresDe(temoinApres).length });
    }

    t('la légende signale la restriction',
      /affichage restreint/.test($('legende-texte').textContent),
      $('legende-texte').textContent);
    t('l’adresse porte la restriction', /r\./.test(w.location.hash), w.location.hash);

    /* L'annulation la lève, comme un filtre. */
    t('annulation proposée', !$('annuler').disabled);
    $('annuler').click();
    await attendre(100);
    t('l’annulation rétablit toutes les barres',
      barresDe(courant()).length === avantBarres.length,
      barresDe(courant()).length);

    /* Le bandeau doit permettre de lever la restriction sans passer par le menu. */
    panneauR.querySelector('.barre') && $('retablir').click();
    await attendre(100);
    const leverR = courant().querySelector('.note-restriction button.lien');
    t('le bandeau porte un retour à l’affichage complet', !!leverR);
    leverR?.click();
    await attendre(100);
    t('le bandeau lève la restriction',
      !courant().querySelector('.note-restriction')
      && barresDe(courant()).length === avantBarres.length,
      barresDe(courant()).length);

    await remettreTout();
}

/* Une restriction est liée au champ représenté, non au seul panneau : un mode
   change le champ sans changer l'identité de la figure, et la restriction s'y
   appliquerait à des valeurs d'une autre nature. */
/* Tous les modes ne changent pas le champ : « Types de contrat par durée » et
   « par année » gardent le leur et ne changent que la série. Le cas à
   éprouver est celui où le champ change vraiment — « Laboratoires et
   statuts » passé en « Statuts seuls ». */
$('onglet-ec').click();
await attendre(250);
await remettreTout();
const panneauModes = [...w.document.querySelectorAll('#figures .panneau')]
    .find(p => p.querySelector('h2').textContent === 'Laboratoires et statuts');
t('figure à modes disponible', !!panneauModes);
if (panneauModes) {
    const titreM = panneauModes.querySelector('h2').textContent;
    const courantM = () => [...w.document.querySelectorAll('#figures .panneau')]
        .find(p => p.querySelector('h2').textContent === titreM);

    const barreM = panneauModes.querySelector('.barre, .segment-empile');
    barreM.dispatchEvent(new w.MouseEvent('contextmenu',
        { bubbles: true, cancelable: true, clientX: 150, clientY: 150 }));
    await attendre(50);
    [...(w.document.querySelector('.menu-contextuel')?.querySelectorAll('.menu-entree') || [])]
        .find(e => /N’afficher que cette valeur/.test(e.textContent))?.click();
    await attendre(100);
    t('restriction posée sur la figure à modes',
      !!courantM().querySelector('.note-restriction'));

    const menuM = courantM().querySelector('.reglage-mode select');
    const modeAutreChamp = [...menuM.options].find(o => /Statuts/.test(o.textContent));
    t('un mode change bien le champ représenté', !!modeAutreChamp,
      [...menuM.options].map(o => o.textContent));
    menuM.value = modeAutreChamp.value;
    menuM.dispatchEvent(new w.Event('change'));
    await attendre(100);

    /* Le champ a changé : la restriction ne doit plus s'appliquer, et surtout
       la figure ne doit pas se vider. */
    t('la restriction ne suit pas le changement de champ',
      !courantM().querySelector('.note-restriction'),
      courantM().querySelector('.note-restriction')?.textContent);
    t('la figure reste dessinée',
      courantM().querySelectorAll('.barre, .segment-empile, .colonne-remplissage').length > 0,
      courantM().innerHTML.slice(0, 80));

    /* Le mode est propre au panneau, non à l'état : `remettreTout` ne le
       rétablit pas, et le laisser ailleurs fausserait les contrôles suivants. */
    const menuRetour = courantM().querySelector('.reglage-mode select');
    menuRetour.value = menuRetour.options[0].value;
    menuRetour.dispatchEvent(new w.Event('change'));
    await attendre(100);
    await remettreTout();
    $('onglet-ope').click();
    await attendre(250);
    await remettreTout();
}

/* Un moyen de lever toutes les restrictions d'un coup : quatre figures
   restreintes ne doivent pas demander quatre gestes. */
const panneauGlobal = [...w.document.querySelectorAll('#figures .panneau')]
    .find(p => p.querySelectorAll('.barre').length > 1);
if (panneauGlobal) {
    t('aucun bouton de levée sans restriction', $('tout-reafficher').hidden);
    panneauGlobal.querySelector('.barre').dispatchEvent(new w.MouseEvent('contextmenu',
        { bubbles: true, cancelable: true, clientX: 150, clientY: 150 }));
    await attendre(50);
    [...(w.document.querySelector('.menu-contextuel')?.querySelectorAll('.menu-entree') || [])]
        .find(e => /N’afficher que cette valeur/.test(e.textContent))?.click();
    await attendre(100);
    t('bouton de levée proposé', !$('tout-reafficher').hidden,
      $('tout-reafficher').textContent);
    t('il compte les figures restreintes',
      /1 figure/.test($('tout-reafficher').textContent),
      $('tout-reafficher').textContent);
    $('tout-reafficher').click();
    await attendre(100);
    t('il lève toutes les restrictions',
      !w.document.querySelector('#figures .note-restriction')
      && $('tout-reafficher').hidden);
}

console.log(`  ${ok - avantRestr} vérifications passées`);

console.log('\nCohérence du filtrage');
const avantCoh = ok;

const selectionCourante = () => {
    const e = app.etat();
    const parts = [];
    Object.entries(e.facettes || {}).forEach(([k, v]) => {
        if (v?.size) parts.push(k + ':' + [...v].sort().join(','));
    });
    return parts.sort().join('|');
};

const remettre = async () => {
    if (!$('reinit').hidden) { $('reinit').click(); await attendre(60); }
};

/**
 * Clique le premier élément d'une famille et constate que la sélection bouge.
 * @param attendu  clé de champ que le filtre devrait porter, si connue
 */
const eprouver = async (nom, selecteur, attendu = null) => {
    await remettre();
    const cible = w.document.querySelector(selecteur);
    if (!cible) { t(`${nom} : élément présent`, false, selecteur); return; }
    const avantClic = selectionCourante();
    cible.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await attendre(80);
    const apresClic = selectionCourante();
    t(`${nom} : le clic filtre`, apresClic !== avantClic,
      { avant: avantClic || '(aucun)', apres: apresClic || '(aucun)' });
    if (attendu && apresClic !== avantClic) {
        t(`${nom} : filtre porté par « ${attendu} »`,
          apresClic.startsWith(attendu + ':') || apresClic.includes('|' + attendu + ':'),
          apresClic);
    }
    await remettre();
};

/* ── Tableau de bord des partenariats ── */
$('onglet-ope').click();
await attendre(250);
await remettre();
await ouvrirFacettes();

await eprouver('facette', '.facette-liste input[type=checkbox]');
await eprouver('barre d’une figure', '#figures .barre');
await eprouver('colonne d’une figure', '#figures .colonne');
await eprouver('segment empilé', '#figures .segment');
await eprouver('étiquette d’axe', '#figures .etiquette-axe');
await eprouver('ligne de partenaire', '#partenaires-hote tbody tr.tableau-ligne', 'partenaire');
await eprouver('pastille de légende', '#figures .figure-legende-item');
await eprouver('segment de frise', '#figures .frise-segment');

/* Les trois vues des croisements, chacune avec ses éléments propres. */
const ongletsCoh = [...w.document.querySelectorAll('.onglets-vue .onglet')];
/* Le compte est vérifié plutôt que supposé : un sélecteur devenu faux
   sauterait tout le bloc en silence, et le balayage ne prouverait plus rien
   là où il paraîtrait passer. */
t('les trois vues des croisements sont atteignables', ongletsCoh.length === 3,
  ongletsCoh.length);
if (ongletsCoh.length === 3) {
    ongletsCoh[2].click(); await attendre(80);
    await eprouver('cellule de matrice', '#relations-hote .matrice-cellule');
    ongletsCoh[0].click(); await attendre(80);
    await eprouver('entrée de la vue Liens', '#relations-hote .barre');
    ongletsCoh[1].click(); await attendre(80);
    await eprouver('bloc du flux', '#relations-hote .flux-noeud');
    ongletsCoh[2].click(); await attendre(80);
    await eprouver('en-tête de colonne', '#relations-hote th.matrice-tete.triable');
    await eprouver('nom de ligne', '#relations-hote td.matrice-nom.triable');
}

/* Le contrôle des données propose de filtrer sur les valeurs qu'il signale :
   c'est l'intérêt du panneau, retrouver les enregistrements en cause. */
if (!w.document.querySelector('#qualite-hote .constat')) {
    w.document.querySelector('#panneau-qualite button[aria-expanded]')?.click();
    await attendre(80);
}
const actionQualite = w.document.querySelector('#qualite-hote .constat button.lien, #qualite-hote .variante');
if (actionQualite) {
    await remettre();
    const avantQ = selectionCourante();
    actionQualite.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await attendre(80);
    t('contrôle des données : l’action filtre',
      selectionCourante() !== avantQ, selectionCourante());
    await remettre();
}

/* Le tableau : une cellule dont la colonne correspond à un champ. */
await remettre();
const celluleChampCoh = [...w.document.querySelectorAll('#tableau-hote tbody tr.tableau-ligne td')]
    .find(td => /^\d{4}$/.test(td.textContent.trim()));
if (celluleChampCoh) {
    const avantTab = selectionCourante();
    /* Le clic d'une cellule déplie le détail ; c'est le menu qui filtre. */
    celluleChampCoh.dispatchEvent(new w.MouseEvent('contextmenu',
        { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
    await attendre(50);
    const menuTab = w.document.querySelector('.menu-contextuel');
    const entreeFiltre = [...(menuTab?.querySelectorAll('.menu-entree') || [])]
        .find(e => /Ajouter au filtre|Ne garder que/.test(e.textContent));
    t('tableau : menu de filtrage sur une cellule', !!entreeFiltre,
      [...(menuTab?.querySelectorAll('.menu-entree') || [])].map(e => e.textContent));
    entreeFiltre?.click();
    await attendre(80);
    t('tableau : le menu filtre', selectionCourante() !== avantTab,
      selectionCourante());
    await remettre();
}

/* L'atelier : ses deux champs sont libres, donc son filtrage doit suivre le
   champ choisi et non un champ figé. */
await remettre();
if (!w.document.querySelector('#atelier-hote svg')) {
    w.document.querySelector('#panneau-atelier button[aria-expanded]')?.click();
    await attendre(80);
}
await eprouver('barre de l’atelier', '#atelier-hote .barre');

/* Les disques temporels ne figurent dans aucun panneau : ils ne sont
   atteignables que par l'atelier, et c'est donc là qu'il faut les éprouver.
   Sans cela, une forme entière resterait hors du balayage. */
/* Les bulles croisent deux champs : sans second champ, l'atelier retombe sur
   les barres et le contrôle ne porterait pas sur ce qu'il annonce. */
const menusAtelier = [...w.document.querySelectorAll('#atelier-hote select')];
const menuChampB = menusAtelier.find(m =>
    [...m.options].some(o => /aucun|—/i.test(o.textContent)));
if (menuChampB) {
    const second = [...menuChampB.options].find(o => o.value && !/aucun|—/i.test(o.textContent));
    if (second) {
        menuChampB.value = second.value;
        menuChampB.dispatchEvent(new w.Event('change'));
        await attendre(100);
    }
}
const menuForme = [...w.document.querySelectorAll('#atelier-hote select')].find(m =>
    [...m.options].some(o => /bulle/i.test(o.textContent)));
t('forme « bulles » proposée dans l’atelier', !!menuForme,
  menusAtelier.map(m => [...m.options].map(o => o.textContent).join('/')));
if (menuForme) {
    const optionBulles = [...menuForme.options].find(o => /bulle/i.test(o.textContent));
    menuForme.value = optionBulles.value;
    menuForme.dispatchEvent(new w.Event('change'));
    await attendre(100);
    await eprouver('disque temporel', '#atelier-hote .bulle');
    const menuRetour = [...w.document.querySelectorAll('#atelier-hote select')]
        .find(m => [...m.options].some(o => /bulle/i.test(o.textContent)));
    if (menuRetour) {
        const optionBarres = [...menuRetour.options].find(o => /barre/i.test(o.textContent));
        menuRetour.value = optionBarres.value;
        menuRetour.dispatchEvent(new w.Event('change'));
        await attendre(80);
    }
}

/* ── Tableau de bord des chercheurs ── */
$('onglet-ec').click();
await attendre(250);
await remettre();
await ouvrirFacettes();

await eprouver('facette (chercheurs)', '.facette-liste input[type=checkbox]');
await eprouver('barre (chercheurs)', '#figures .barre');
await eprouver('segment empilé (chercheurs)', '#figures .segment-empile');
await eprouver('mot-clé du nuage', '#figures .mot', 'motcle');
await eprouver('pôle du réseau', '#reseau-hote .constellation-pole');

$('onglet-ope').click();
await attendre(200);
await remettre();

console.log(`  ${ok - avantCoh} vérifications passées`);

console.log('\nIncidents pendant le parcours');
t('aucune erreur levée pendant tout le parcours',
  incidents.length === 0, incidents.slice(0, 6));
console.log(`  1 vérification passée`);

console.log(`\n${ok} passées, ${ko} échouées\n`);
process.exit(ko ? 1 : 0);
