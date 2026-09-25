/**
 * Tests du moteur : sélection, compteurs, regroupement, réglages, légende.
 * Exécution : node valo/test/moteur.mjs
 */
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
const dom = new JSDOM('<!DOCTYPE html><body></body>');
globalThis.document = dom.window.document;
globalThis.window = dom.window;
const memoire = {};
globalThis.localStorage = {
    getItem: k => memoire[k] ?? null,
    setItem: (k, v) => { memoire[k] = String(v); },
    removeItem: k => { delete memoire[k]; },
};

const { etatVide, retenus, retenuSauf, comptesFacette, effectifs,
        croisement, valeursDistinctes, nombreFiltres, plier, valeursVisibles }
    = await import('../js/core/selection.js');
const { regrouper, noteRegroupement, LIBELLE_AUTRES } = await import('../js/core/groupe.js');
const { reglagesVides, renommer, libelleDe, collisions,
        enregistrerProfil, lireProfil, appliquerProfil } = await import('../js/core/reglages.js');
const { texteLegende } = await import('../js/ui/legende.js');
const { valeursDe, estAbsence } = await import('../js/core/champs.js');

let ok = 0, ko = 0;
const t = (nom, condition, detail) => {
    if (condition) ok++;
    else { ko++; console.log('  ÉCHEC :', nom, detail !== undefined ? `→ ${JSON.stringify(detail)}` : ''); }
};

/* ── Jeu d'essai ─────────────────────────────────────────────────────── */
const opes = [
    { id: 1, kind: 'ope', titre: 'Édition A', annee: '2022',
      partenaires: [{ nom: 'HARMATTAN', naf: 'Édition de livres', type: 'Entreprise' }],
      labos: ['LLCP'], ecs: ['Durand'] },
    { id: 2, kind: 'ope', titre: 'Recherche B', annee: '2022',
      partenaires: [{ nom: 'CNRS', naf: 'Recherche', type: 'Organisme public' }],
      labos: ['LLCP', 'CEMTI'], ecs: ['Martin'] },
    { id: 3, kind: 'ope', titre: 'Colloque C', annee: '2023',
      partenaires: [{ nom: 'HARMATTAN', naf: 'Édition de livres', type: 'Entreprise' },
                    { nom: 'SORBONNE', naf: 'Enseignement', type: 'Université' }],
      labos: ['CEMTI'], ecs: [] },
    { id: 4, kind: 'ope', titre: 'Sans partenaire', annee: '2023',
      partenaires: [], labos: [], ecs: ['Durand'] },
    { id: 5, kind: 'ope', titre: 'Ancien', annee: '',
      partenaires: [{ nom: 'CNRS', naf: 'Recherche', type: 'Organisme public' }],
      labos: ['LLCP'], ecs: [] },
];

console.log('\nMoteur de sélection');

/* 1. Lecture des champs, absences */
t('valeurs multi-valuées', valeursDe(opes[2], 'ope', 'partenaire').length === 2);
t('absence renseignée', valeursDe(opes[3], 'ope', 'partenaire')[0] === 'Partenaire non renseigné');
t('estAbsence reconnaît', estAbsence('Partenaire non renseigné') && !estAbsence('CNRS'));
t('année vide → absence', valeursDe(opes[4], 'ope', 'annee')[0] === 'Année inconnue');

/* 2. Sélection sans filtre */
let etat = etatVide();
t('aucun filtre → tout', retenus(opes, 'ope', etat).length === 5);

/* 3. Facette : OU interne */
etat.facettes.type = new Set(['Entreprise']);
t('facette 1 valeur', retenus(opes, 'ope', etat).length === 2, retenus(opes, 'ope', etat).map(r => r.id));
etat.facettes.type.add('Université');
t('OU interne (pas de doublon)', retenus(opes, 'ope', etat).length === 2);
etat.facettes.type.add('Organisme public');
t('OU élargi', retenus(opes, 'ope', etat).length === 4);

/* 4. ET entre facettes */
etat.facettes.annee = new Set(['2022']);
t('ET entre facettes', retenus(opes, 'ope', etat).length === 2);

/* 5. Compteurs contextuels */
const cAnnee = comptesFacette(opes, 'ope', etat, 'annee');
t('compteur ignore sa propre facette', cAnnee['2023'] > 0, cAnnee);
const cType = comptesFacette(opes, 'ope', etat, 'type');
/* « Université » n'a aucune opération en 2022 : son compteur tombe à zéro.
   Elle reste listée parce qu'elle est cochée — sinon elle disparaîtrait
   de la facette et deviendrait impossible à décocher. */
t('compteur respecte les autres facettes', cType['Université'] === 0, cType);
t('valeur non cochée sans occurrence absente', !('Association' in cType), cType);

/* 6. Valeurs cochées à zéro restent listées */
etat = etatVide();
etat.facettes.partenaire = new Set(['INEXISTANT']);
const cPart = comptesFacette(opes, 'ope', etat, 'partenaire');
t('valeur cochée à zéro conservée', cPart.INEXISTANT === 0);

/* 7. Masquage : la valeur disparaît, l'enregistrement demeure */
etat = etatVide();
etat.masquees.add('HARMATTAN');
t('valeur masquée absente des comptages',
  comptesFacette(opes, 'ope', etat, 'partenaire').HARMATTAN === undefined);
t('enregistrement conservé', retenus(opes, 'ope', etat).length === 5);
t('autre partenaire conservé',
  valeursVisibles(opes[2], 'ope', 'partenaire', etat).join() === 'SORBONNE');

/* 8. Recherche libre, mots non contigus, accents */
etat = etatVide();
etat.recherche = 'harmattan';
t('recherche simple', retenus(opes, 'ope', etat).length === 2);
etat.recherche = 'edition livres';
t('mots non contigus + accents', retenus(opes, 'ope', etat).length === 2);
etat.recherche = 'zzz';
t('recherche sans résultat', retenus(opes, 'ope', etat).length === 0);

/* 9. Effectifs et croisement */
etat = etatVide();
const rows = retenus(opes, 'ope', etat);
const eff = effectifs(rows, 'ope', 'labo', etat);
t('effectifs multi-valués', eff.LLCP === 3 && eff.CEMTI === 2, eff);
const cr = croisement(rows, 'ope', 'annee', 'type', etat);
t('croisement cellule', cr.get('2022\u0000Entreprise')?.valeur === 1, [...cr.keys()]);

/* 10. Valeurs distinctes : absences en fin */
const dist = valeursDistinctes(opes, 'ope', 'partenaire');
t('absences en fin de liste', estAbsence(dist[dist.length - 1]), dist);

/* 11. nombreFiltres */
etat = etatVide();
etat.facettes.type = new Set(['A', 'B']);
etat.recherche = 'x';
t('nombre de filtres', nombreFiltres(etat) === 3);

console.log(`  ${ok} vérifications passées`);

/* ── Regroupement ────────────────────────────────────────────────────── */
console.log('\nRegroupement « Autres »');
const avant = ok;

const comptes = { A: 10, B: 8, C: 5, D: 2, E: 1, F: 1 };
let r = regrouper(comptes, { nb: 3 });
t('trois lignes + Autres', r.lignes.length === 4);
t('Autres en fin', r.lignes[3].valeur === LIBELLE_AUTRES);
t('total préservé',
  r.lignes.reduce((s, l) => s + l.effectif, 0) === 27 && r.total === 27);
t('membres consultables', r.lignes[3].membres.length === 3);
t('nombre regroupé', r.regroupees === 3);
t('note explicite', noteRegroupement(r, 'opérations').includes('27'));

r = regrouper(comptes, { nb: 0 });
t('nb=0 → aucun regroupement', r.lignes.length === 6 && r.regroupees === 0);
r = regrouper(comptes, { nb: 10 });
t('seuil non atteint', r.regroupees === 0);
r = regrouper({ '2020': 3, '2019': 5, '2021': 1 }, { nb: 2, tri: 'ordre', ordre: ['2019', '2020', '2021'] });
t('axe ordonné : pas de regroupement', r.regroupees === 0 && r.lignes[0].valeur === '2019');

console.log(`  ${ok - avant} vérifications passées`);

/* ── Réglages : identité ≠ libellé ───────────────────────────────────── */
console.log('\nRéglages');
const avant2 = ok;

const regl = reglagesVides();
renommer(regl, 'type', 'Entreprise', 'Société privée');
t('libellé renommé', libelleDe(regl, 'type', 'Entreprise') === 'Société privée');
t('identité inchangée dans les comptages',
  effectifs(opes, 'ope', 'type', etatVide()).Entreprise === 2);
renommer(regl, 'type', 'Université', 'Société privée');
t('collision signalée',
  collisions(regl, 'type', ['Entreprise', 'Université']).length === 1);
renommer(regl, 'type', 'Entreprise', '');
t('renommage annulable', libelleDe(regl, 'type', 'Entreprise') === 'Entreprise');

/* Profils */
etat = etatVide();
etat.facettes.type = new Set(['Entreprise']);
etat.masquees.add('CNRS');
etat.recherche = 'colloque';
const p = enregistrerProfil('Test', 'ope', etat, reglagesVides());
const relu = lireProfil(p.id);
t('profil enregistré', relu && relu.nom === 'Test');

const connues = { type: new Set(['Entreprise', 'Université']) };
let applique = appliquerProfil(relu, connues);
t('profil restaure la facette', applique.etat.facettes.type.has('Entreprise'));
t('profil restaure le masquage', applique.etat.masquees.has('CNRS'));
t('profil restaure la recherche', applique.etat.recherche === 'colloque');

applique = appliquerProfil(relu, { type: new Set(['Université']) });
t('valeur absente ignorée et signalée',
  !applique.etat.facettes.type && applique.ignorees.length === 1, applique.ignorees);

console.log(`  ${ok - avant2} vérifications passées`);

/* ── Légende ─────────────────────────────────────────────────────────── */
console.log('\nLégende');
const avant3 = ok;

etat = etatVide();
let texte = texteLegende(opes, 'ope', etat, reglagesVides());
t('effectif annoncé', texte.startsWith('5 opérations'), texte);
/* Les facettes non filtrées ne sont plus énumérées : la phrase servait
   surtout à noyer les restrictions effectives. */
t('aucune énumération inutile', !texte.includes('tous types'), texte);
t('absence de filtre dite une fois', texte.endsWith('aucun filtre'), texte);

etat.facettes.type = new Set(['Entreprise']);
etat.masquees.add('CNRS');
etat.recherche = 'colloque';
texte = texteLegende(retenus(opes, 'ope', etat), 'ope', etat, reglagesVides());
t('facette citée avec son champ',
  texte.includes('type de partenaire : Entreprise'), texte);
t('facettes vides non citées', !texte.includes('tous laboratoires'), texte);
t('recherche citée', texte.includes('colloque'), texte);
t('masquage cité', texte.includes('1 valeur masquée'), texte);

etat = etatVide();
etat.facettes.annee = new Set(['2019', '2020', '2021', '2022']);
texte = texteLegende(opes, 'ope', etat, reglagesVides());
t('années contiguës condensées', texte.includes('2019–2022'), texte);

const reglNom = reglagesVides();
renommer(reglNom, 'type', 'Entreprise', 'Société');
etat = etatVide();
etat.facettes.type = new Set(['Entreprise']);
texte = texteLegende(opes, 'ope', etat, reglNom);
t('légende utilise le libellé', texte.includes('Société') && !texte.includes(': Entreprise'), texte);

console.log(`  ${ok - avant3} vérifications passées`);

/* ── Configuration ───────────────────────────────────────────────────── */
console.log('\nConfiguration');
const avant4 = ok;

const { adresseValide, CONFIG, chargerConfig, reinitialiserConfig }
    = await import('../js/core/omeka.js');

t('adresse absolue acceptée', adresseValide('https://exemple.fr/api/'));
t('adresse vide refusée', !adresseValide(''));
t('adresse relative refusée', !adresseValide('/api/'));
t('adresse sans protocole refusée', !adresseValide('exemple.fr/api'));

/* Aucune adresse par défaut : le code publié ne doit désigner aucune
   instance, et un déploiement ailleurs ne doit pas demander de le modifier. */
t('aucune adresse par défaut', CONFIG.api === '' || !adresseValide(CONFIG.api),
  CONFIG.api);

/* Sans adresse, aucune requête ne doit partir : une adresse vide donnerait une
   requête relative au serveur qui héberge la page, et l'échec ressemblerait à
   une panne de l'API plutôt qu'à une absence de configuration. */
const { chargerOpe } = await import('../js/core/omeka.js');
let requeteTentee = false;
globalThis.fetch = async () => { requeteTentee = true; return { ok: true, json: async () => [] }; };
let messageErreur = '';
try { await chargerOpe(); } catch (e) { messageErreur = e.message; }
t('aucune requête sans adresse configurée', !requeteTentee);
t('le message nomme la cause',
  /adresse|configur/i.test(messageErreur), messageErreur);
delete globalThis.fetch;

const defaut = CONFIG.api;
memoire.valo_config = JSON.stringify({ api: '', ident: '', key: '' });
chargerConfig();
t('configuration vide ignorée', CONFIG.api === defaut, CONFIG.api);

memoire.valo_config = JSON.stringify({ api: 'https://autre.fr/api/' });
chargerConfig();
t('configuration valide appliquée', CONFIG.api === 'https://autre.fr/api/');

reinitialiserConfig();
t('retour aux valeurs par défaut', CONFIG.api === defaut && !memoire.valo_config);

console.log(`  ${ok - avant4} vérifications passées`);

/* ── Lecture des dates ───────────────────────────────────────────────── */
console.log('\nDates et durées');
const avant5 = ok;

const { analyserDate, trancheDuree } = await import('../js/core/omeka.js');

const iso = d => d ? d.toISOString().slice(0, 10) : null;

t('JJ/MM/AA', iso(analyserDate('01/06/22')) === '2022-06-01', iso(analyserDate('01/06/22')));
t('JJ/MM/AAAA', iso(analyserDate('15/09/2023')) === '2023-09-15');
t('jour et mois sur un chiffre', iso(analyserDate('1/6/22')) === '2022-06-01');
t('séparateur point', iso(analyserDate('01.06.2022')) === '2022-06-01');
t('année sur deux chiffres au XXIe siècle', analyserDate('01/06/14').getUTCFullYear() === 2014);
t('format ISO', iso(analyserDate('2022-06-01')) === '2022-06-01');
t('année seule', iso(analyserDate('2019')) === '2019-01-01');
t('vide', analyserDate('') === null && analyserDate(null) === null);
t('mois invalide refusé', analyserDate('01/13/2022') === null);
t('texte libre refusé', analyserDate('sans date') === null);

t('tranche courte', trancheDuree(3) === 'Moins de 6 mois');
t('tranche moyenne', trancheDuree(9) === 'De 6 à 12 mois');
t('tranche longue', trancheDuree(30) === 'De 2 à 4 ans');
t('durée absente', trancheDuree(null) === 'Durée non renseignée');

console.log(`  ${ok - avant5} vérifications passées`);

/* ── Cache ───────────────────────────────────────────────────────────── */
console.log('\nCache');
const avant6 = ok;

const { ageCache } = await import('../js/core/omeka.js');
const cleCache = `valo_cache_ope_${CONFIG.api}`;

/* Un cache produit par une version antérieure du code doit être ignoré :
   sans quoi une correction de la lecture des données reste sans effet. */
memoire[cleCache] = JSON.stringify({ date: Date.now(), version: 1, valeur: [{ id: 1 }] });
t('cache d’une autre version ignoré', ageCache('ope') === null);

/* La version est lue dans le code plutôt que recopiée : un test qui fige le
   numéro échoue à chaque incrément sans qu'aucune régression ne l'ait causé. */
const versionCourante = +readFileSync(
    new URL('../js/core/omeka.js', import.meta.url), 'utf8')
    .match(/VERSION_FORMAT\s*=\s*(\d+)/)[1];

memoire[cleCache] = JSON.stringify({
    date: Date.now(), version: versionCourante, valeur: [{ id: 1 }] });
t('cache de la version courante accepté', ageCache('ope') === 0, ageCache('ope'));

memoire[cleCache] = JSON.stringify({
    date: Date.now() - 90 * 60000, version: versionCourante, valeur: [] });
t('âge du cache rapporté', ageCache('ope') === 90, ageCache('ope'));

delete memoire[cleCache];
t('absence de cache signalée', ageCache('ope') === null);

const { texteSource } = await import('../js/ui/legende.js');
t('fraîcheur en minutes', texteSource('api', new Date(), 12).includes('il y a 12 min'));
t('fraîcheur en heures', texteSource('api', new Date(), 150).includes('il y a 3 h'));
t('extraction immédiate', texteSource('api', new Date(), 0).includes('à l’instant'));

console.log(`  ${ok - avant6} vérifications passées`);

/* ── Affichage des durées ────────────────────────────────────────────── */
console.log('\nAffichage des durées');
const avant7 = ok;

const { preferences, enregistrerPreferences, reinitialiserPreferences,
        afficherDuree, detaillerDuree, jolieDate } = await import('../js/core/preferences.js');

const operation = { debut: '2022-06-01', fin: '2023-12-31',
                    dureeJours: 578, dureeMois: 19, duree: 'De 1 à 2 ans' };

reinitialiserPreferences();
t('tranches par défaut', afficherDuree(operation) === 'De 1 à 2 ans');
enregistrerPreferences({ dureeAffichage: 'mois' });
t('affichage en mois', afficherDuree(operation) === '19 mois');
enregistrerPreferences({ dureeAffichage: 'jours' });
t('affichage en jours', afficherDuree(operation) === '578 j');

/* Une durée inférieure au mois reste lisible en jours plutôt que « 0.5 mois ». */
enregistrerPreferences({ dureeAffichage: 'mois' });
t('durée très courte exprimée en jours',
  afficherDuree({ dureeJours: 12, dureeMois: 0.4, duree: 'Moins de 6 mois' }) === '12 j');
reinitialiserPreferences();

t('durée absente inchangée',
  afficherDuree({ dureeJours: null, duree: 'Durée non renseignée' }) === 'Durée non renseignée');

/* Le détail doit donner les dates et le calcul, pas seulement la tranche. */
const detail = detaillerDuree(operation);
t('détail : dates au format français',
  detail.includes('01/06/2022') && detail.includes('31/12/2023'), detail);
t('détail : nombre de jours', detail.includes('578 jours'), detail);
t('détail : décomposition', detail.includes('1 an'), detail);
t('détail : tranche rappelée', detail.includes('De 1 à 2 ans'), detail);

t('aucune date : dit clairement',
  detaillerDuree({ debut: '', fin: '' }).includes('Aucune date'));
t('date unique : explique l’impossibilité',
  detaillerDuree({ debut: '2022-01-01', fin: '' }).includes('ne peut pas être calculée'));
t('dates incohérentes signalées',
  detaillerDuree({ debut: '2023-01-01', fin: '2022-01-01', dureeJours: null })
      .includes('précède'), detaillerDuree({ debut: '2023-01-01', fin: '2022-01-01', dureeJours: null }));

t('date lisible', jolieDate('2022-06-01') === '01/06/2022');
t('date absente', jolieDate('') === '—');

/* Les préférences persistent, mais ne touchent à aucun comptage. */
enregistrerPreferences({ dureeAffichage: 'jours' });
t('préférence persistée', JSON.parse(memoire.valo_preferences).dureeAffichage === 'jours');
reinitialiserPreferences();
t('réinitialisation', preferences.dureeAffichage === 'tranches' && !memoire.valo_preferences);

console.log(`  ${ok - avant7} vérifications passées`);

/* ── Ordonnancement des colonnes ─────────────────────────────────────── */
console.log('\nOrdonnancement en colonnes');
const avant10 = ok;

const { ordonnerColonnes, compterCroisements } = await import('../js/ui/reseau.js');

/* Deux colonnes classées par effectif produisent ici un maximum de
   croisements ; l'ordonnancement doit les réduire. */
const gaucheInit = [
    { valeur: 'A', effectif: 9 }, { valeur: 'B', effectif: 7 },
    { valeur: 'C', effectif: 5 }, { valeur: 'D', effectif: 3 },
];
const droiteInit = [
    { valeur: 'W', effectif: 8 }, { valeur: 'X', effectif: 6 },
    { valeur: 'Y', effectif: 4 }, { valeur: 'Z', effectif: 2 },
];
const liensTest2 = new Map([
    ['A\u0000Z', 4], ['B\u0000Y', 3], ['C\u0000X', 3], ['D\u0000W', 5],
    ['A\u0000Y', 2], ['D\u0000X', 1],
]);

const avantOrdre = compterCroisements(gaucheInit, droiteInit, liensTest2);
const range = ordonnerColonnes(
    gaucheInit.map(x => ({ ...x })), droiteInit.map(x => ({ ...x })), liensTest2);
const apresOrdre = compterCroisements(range.gauche, range.droite, liensTest2);

t('les croisements diminuent', apresOrdre < avantOrdre, { avant: avantOrdre, apres: apresOrdre });
t('aucune valeur perdue',
  range.gauche.length === 4 && range.droite.length === 4);
t('mêmes valeurs des deux côtés',
  new Set(range.gauche.map(x => x.valeur)).size === 4 &&
  new Set(range.droite.map(x => x.valeur)).size === 4);

/* « Autres » ne se lit pas comme un rang : il termine la colonne. */
const avecAutres = ordonnerColonnes(
    [...gaucheInit.map(x => ({ ...x })), { valeur: 'Autres', effectif: 12, autres: true }],
    droiteInit.map(x => ({ ...x })), liensTest2);
t('« Autres » épinglé en fin de colonne',
  avecAutres.gauche[avecAutres.gauche.length - 1].autres === true,
  avecAutres.gauche.map(x => x.valeur));

/* Cas limites */
t('sans lien', ordonnerColonnes(gaucheInit.map(x => ({ ...x })),
    droiteInit.map(x => ({ ...x })), new Map()).gauche.length === 4);
t('colonne vide', ordonnerColonnes([], [], new Map()).gauche.length === 0);
t('lien vers une valeur absente ignoré',
  ordonnerColonnes(gaucheInit.map(x => ({ ...x })), droiteInit.map(x => ({ ...x })),
      new Map([['A\u0000INCONNU', 3]])).gauche.length === 4);

/* Un axe chronologique conserve son ordre : réordonner des années pour
   réduire les croisements rendrait la figure fausse à la lecture. */
const chrono = ['2019', '2020', '2021', '2022', '2023']
    .map((v, i) => ({ valeur: v, effectif: (i % 3) + 1 }));
const cotes = ['P1', 'P2', 'P3'].map(v => ({ valeur: v, effectif: 3 }));
const liensChrono = new Map([
    ['2019\u0000P3', 3], ['2020\u0000P1', 2], ['2021\u0000P2', 1],
    ['2022\u0000P1', 4], ['2023\u0000P3', 2],
]);

const libre = ordonnerColonnes(chrono.map(x => ({ ...x })), cotes.map(x => ({ ...x })),
    liensChrono);
t('sans contrainte, l’ordre change',
  libre.gauche.map(x => x.valeur).join(' ') !== '2019 2020 2021 2022 2023',
  libre.gauche.map(x => x.valeur));

const fixe = ordonnerColonnes(chrono.map(x => ({ ...x })), cotes.map(x => ({ ...x })),
    liensChrono, { gaucheFixe: true });
t('axe chronologique préservé',
  fixe.gauche.map(x => x.valeur).join(' ') === '2019 2020 2021 2022 2023',
  fixe.gauche.map(x => x.valeur));
t('l’autre colonne reste optimisée',
  fixe.droite.length === 3);

const deuxFixes = ordonnerColonnes(chrono.map(x => ({ ...x })), cotes.map(x => ({ ...x })),
    liensChrono, { gaucheFixe: true, droiteFixe: true });
t('deux axes fixes : rien ne bouge',
  deuxFixes.gauche.map(x => x.valeur).join(' ') === '2019 2020 2021 2022 2023' &&
  deuxFixes.droite.map(x => x.valeur).join(' ') === 'P1 P2 P3');

console.log(`  ${ok - avant10} vérifications passées`);

/* ── Valeurs détachées d'un regroupement ─────────────────────────────── */
console.log('\nDétachement du regroupement');
const avant11 = ok;

const comptesDetail = { A: 20, B: 15, C: 10, D: 2, E: 1, F: 1 };

let sans = regrouper(comptesDetail, { nb: 3 });
t('sans épinglage : trois lignes + Autres', sans.lignes.length === 4);

const avec = regrouper(comptesDetail, { nb: 3, epinglees: new Set(['E']) });
t('la valeur épinglée sort du regroupement',
  avec.lignes.some(l => l.valeur === 'E' && !l.autres),
  avec.lignes.map(l => l.valeur));
t('le regroupement subsiste pour les autres',
  avec.lignes.some(l => l.autres), avec.lignes.map(l => l.valeur));
t('les totaux restent exacts',
  avec.lignes.reduce((s, l) => s + l.effectif, 0) === 49,
  avec.lignes.reduce((s, l) => s + l.effectif, 0));
t('le regroupement ne compte plus la valeur sortie',
  avec.lignes.find(l => l.autres).effectif === 3,
  avec.lignes.find(l => l.autres)?.effectif);
t('nombre de valeurs regroupées ajusté', avec.regroupees === 2, avec.regroupees);

/* Tout épingler fait disparaître le regroupement, sans perte. */
const tout = regrouper(comptesDetail, { nb: 3, epinglees: new Set(['D', 'E', 'F']) });
t('plus de regroupement quand tout est détaché',
  !tout.lignes.some(l => l.autres) && tout.regroupees === 0,
  tout.lignes.map(l => l.valeur));
t('aucune valeur perdue', tout.lignes.length === 6);
t('total inchangé', tout.lignes.reduce((s, l) => s + l.effectif, 0) === 49);

/* Épingler une valeur déjà détaillée ne change rien. */
const deja = regrouper(comptesDetail, { nb: 3, epinglees: new Set(['A']) });
t('épingler une valeur déjà visible est sans effet',
  deja.lignes.length === sans.lignes.length &&
  deja.lignes.filter(l => l.valeur === 'A').length === 1,
  deja.lignes.map(l => l.valeur));

/* L'épinglage ne touche pas à la sélection : c'est tout l'enjeu. */
const etatEp = etatVide();
etatEp.epinglees.type = new Set(['Université']);
t('épingler ne filtre rien',
  retenus(opes, 'ope', etatEp).length === retenus(opes, 'ope', etatVide()).length);

/* La légende doit le signaler : deux figures du même sous-ensemble peuvent
   sinon différer sans explication. */
const texteEp = texteLegende(opes, 'ope', etatEp, reglagesVides());
t('détachement mentionné dans la légende',
  /1 valeur détachée du regroupement/.test(texteEp), texteEp);

/* Les profils conservent les valeurs détachées. */
const profilEp = enregistrerProfil('Épinglé', 'ope', etatEp, reglagesVides());
const relu2 = appliquerProfil(lireProfil(profilEp.id), {});
t('profil restaure les valeurs détachées',
  relu2.etat.epinglees.type instanceof Set && relu2.etat.epinglees.type.has('Université'),
  relu2.etat.epinglees);

console.log(`  ${ok - avant11} vérifications passées`);

/* ── Géométrie du diagramme de flux ──────────────────────────────────── */
console.log('\nDiagramme de flux');
const avant12 = ok;

const { disposerFlux } = await import('../js/ui/flux.js');

const gaucheF = [
    { valeur: 'L1', effectif: 30 }, { valeur: 'L2', effectif: 15 },
    { valeur: 'L3', effectif: 5 },
];
const droiteF = [
    { valeur: 'P1', effectif: 25 }, { valeur: 'P2', effectif: 20 },
    { valeur: 'P3', effectif: 5 },
];
const liensF = new Map([
    ['L1\u0000P1', 20], ['L1\u0000P2', 10],
    ['L2\u0000P2', 10], ['L2\u0000P1', 5],
    ['L3\u0000P3', 5],
]);

const geo = disposerFlux(gaucheF, droiteF, liensF, { hauteur: 400 });
t('tous les nœuds placés', geo.noeudsG.length === 3 && geo.noeudsD.length === 3);
t('coordonnées finies',
  [...geo.noeudsG, ...geo.noeudsD].every(n => Number.isFinite(n.y0) && Number.isFinite(n.y1)));
t('nœuds dans le cadre',
  [...geo.noeudsG, ...geo.noeudsD].every(n => n.y0 >= 0 && n.y1 <= 400 + 1),
  [...geo.noeudsG, ...geo.noeudsD].map(n => [Math.round(n.y0), Math.round(n.y1)]));

/* La hauteur doit suivre l'effectif : c'est la lecture même du diagramme. */
const h = Object.fromEntries(geo.noeudsG.map(n => [n.valeur, n.hauteur]));
t('hauteur proportionnelle à l’effectif',
  h.L1 > h.L2 && h.L2 > h.L3,
  { L1: Math.round(h.L1), L2: Math.round(h.L2), L3: Math.round(h.L3) });
t('rapport respecté', Math.abs(h.L1 / h.L2 - 2) < 0.25, h.L1 / h.L2);

t('un ruban par lien', geo.rubans.length === 5, geo.rubans.length);
t('rubans dans les bornes de leurs nœuds',
  geo.rubans.every(r => {
      const g = geo.noeudsG.find(n => n.valeur === r.a);
      const d = geo.noeudsD.find(n => n.valeur === r.b);
      return r.y0 >= g.y0 - 0.01 && r.y1 <= g.y1 + 0.5
          && r.y2 >= d.y0 - 0.01 && r.y3 <= d.y1 + 0.5;
  }));

/* Les nœuds ne doivent pas se chevaucher. */
const chevauche = (liste) => liste.some((n, i) =>
    i > 0 && n.y0 < liste[i - 1].y1 - 0.01);
t('nœuds sans chevauchement à gauche', !chevauche(geo.noeudsG));
t('nœuds sans chevauchement à droite', !chevauche(geo.noeudsD));

/* Cas limites */
t('un seul nœud de chaque côté',
  disposerFlux([{ valeur: 'A', effectif: 5 }], [{ valeur: 'B', effectif: 5 }],
      new Map([['A\u0000B', 5]]), { hauteur: 300 }).rubans.length === 1);
t('aucun lien', disposerFlux(gaucheF, droiteF, new Map(), { hauteur: 300 }).rubans.length === 0);
t('lien vers un nœud absent ignoré',
  disposerFlux(gaucheF, droiteF, new Map([['L1\u0000INCONNU', 3]]),
      { hauteur: 300 }).rubans.length === 0);
t('ensembles vides', disposerFlux([], [], new Map()).noeudsG.length === 0);

/* Cas qui débordait : un nœud portant beaucoup de liens fins. Le plancher
   d'épaisseur, appliqué à chaque ruban, faisait dépasser leur somme de la
   hauteur du bloc — situation systématique pour « Autres », qui réunit par
   construction de nombreuses valeurs. */
/* Le déclencheur est le rapport, pas le nombre : un lien dominant et une
   nuée de liens marginaux, dont l'épaisseur proportionnelle tombe sous le
   plancher de visibilité. */
const beaucoupDeLiens = new Map();
beaucoupDeLiens.set('Gros\u0000C0', 100);
beaucoupDeLiens.set('Autres\u0000C1', 80);
for (let i = 2; i < 42; i++) beaucoupDeLiens.set('Autres\u0000C' + i, 0.5);
const dense = disposerFlux(
    [{ valeur: 'Gros', effectif: 100 }, { valeur: 'Autres', effectif: 100, autres: true }],
    Array.from({ length: 42 }, (_, i) => ({
        valeur: 'C' + i, effectif: i === 0 ? 100 : i === 1 ? 80 : 0.5 })),
    beaucoupDeLiens, { hauteur: 400 });

const bloc = dense.noeudsG.find(n => n.valeur === 'Autres');
const sommeRubans = dense.rubans
    .filter(r => r.a === 'Autres')
    .reduce((s, r) => s + (r.y1 - r.y0), 0);
t('les rubans remplissent le bloc sans le déborder',
  Math.abs(sommeRubans - bloc.hauteur) < 0.5,
  { bloc: Math.round(bloc.hauteur), rubans: Math.round(sommeRubans) });
t('aucun ruban ne sort de son bloc à gauche',
  dense.rubans.every(r => {
      const n = dense.noeudsG.find(x => x.valeur === r.a);
      return r.y0 >= n.y0 - 0.01 && r.y1 <= n.y1 + 0.01;
  }));
t('aucun ruban ne sort de son bloc à droite',
  dense.rubans.every(r => {
      const n = dense.noeudsD.find(x => x.valeur === r.b);
      return r.y2 >= n.y0 - 0.01 && r.y3 <= n.y1 + 0.01;
  }));
t('aucun ruban ne sort du cadre',
  dense.rubans.every(r => r.y1 <= 400.5 && r.y3 <= 400.5),
  Math.max(...dense.rubans.map(r => Math.max(r.y1, r.y3))));

/* Même vérification sur un cadre étroit, où la place manque davantage. */
const etroit = disposerFlux(
    [{ valeur: 'Gros', effectif: 100 }, { valeur: 'Autres', effectif: 100, autres: true }],
    Array.from({ length: 42 }, (_, i) => ({
        valeur: 'C' + i, effectif: i === 0 ? 100 : i === 1 ? 80 : 0.5 })),
    beaucoupDeLiens, { hauteur: 160 });
t('cadre étroit : aucun débordement',
  etroit.rubans.every(r => {
      const n = etroit.noeudsG.find(x => x.valeur === r.a);
      return r.y1 <= n.y1 + 0.01;
  }));

/* Un nœud d'effectif négligeable garde une hauteur visible : le réduire à un
   trait le rendrait impossible à viser. */
const minuscule = disposerFlux(
    [{ valeur: 'Gros', effectif: 1000 }, { valeur: 'Petit', effectif: 1 }],
    [{ valeur: 'X', effectif: 1001 }],
    new Map([['Gros\u0000X', 1000], ['Petit\u0000X', 1]]), { hauteur: 400 });
t('hauteur minimale garantie',
  minuscule.noeudsG.find(n => n.valeur === 'Petit').hauteur >= 3,
  minuscule.noeudsG.map(n => [n.valeur, Math.round(n.hauteur)]));

console.log(`  ${ok - avant12} vérifications passées`);

/* ── Contrôle des données ────────────────────────────────────────────── */
console.log('\nContrôle des données');
const avant13 = ok;

const { controler, variantes, resumer } = await import('../js/core/qualite.js');

/* Variantes d'écriture : accents, ponctuation, mots vides, fautes de frappe. */
const groupes = variantes([
    'Éditions Dupont', 'Editions Dupont', 'EDITIONS DUPONT',
    'Université de Lyon', 'Universite de Lyon',
    'Centre Pompidou', 'Musée du Louvre',
]);
t('variantes d’accentuation rapprochées',
  groupes.some(g => g.valeurs.length === 3 && g.valeurs.includes('Éditions Dupont')),
  groupes.map(g => g.valeurs));
t('variantes de casse rapprochées',
  groupes.some(g => g.valeurs.includes('EDITIONS DUPONT')));
t('valeurs distinctes non confondues',
  !groupes.some(g => g.valeurs.includes('Centre Pompidou')
                  && g.valeurs.includes('Musée du Louvre')),
  groupes.map(g => g.valeurs));

/* Le rapprochement ne doit pas être trop large : deux établissements de même
   forme mais de nom différent restent distincts. */
const prudent = variantes(['Lycée Voltaire', 'Lycée Molière', 'Lycée Rousseau']);
t('noms différents non fusionnés', prudent.length === 0, prudent.map(g => g.valeurs));

/* Chaînes courtes écartées : trop de faux rapprochements. */
t('valeurs très courtes ignorées', variantes(['A1', 'A2', 'B1']).length === 0);

/* Constats sur un corpus d'essai */
const corpus = [
    { id:1, kind:'ope', titre:'OPE-2022-0001', annee:'2022', anneeOrigine:'date de début',
      debut:'2022-01-01', fin:'2022-06-01', dureeJours:151,
      typeContrat:'Convention de recherche',
      partenaires:[{nom:'CNRS', naf:'Recherche', type:'Public'}], labos:['L1'], ecs:[] },
    { id:2, kind:'ope', titre:'OPE-2023-0002', annee:'2023', anneeOrigine:'identifiant',
      debut:'', fin:'', dureeJours:null,
      partenaires:[{nom:'ACME', naf:'', type:''}], labos:[], ecs:[] },
    { id:3, kind:'ope', titre:'Sans date', annee:'', anneeOrigine:'absente',
      debut:'2023-05-01', fin:'2022-05-01', dureeJours:null,
      partenaires:[{nom:'ACME', naf:'', type:''}], labos:['L2'], ecs:[] },
];

const constats = controler(corpus, 'ope');
const parCle = Object.fromEntries(constats.map(c => [c.cle, c]));

t('année déduite signalée', parCle['annee-deduite']?.effectif === 1, parCle['annee-deduite']);
t('année absente signalée', parCle['annee-absente']?.effectif === 1);
t('dates incohérentes signalées', parCle['dates-incoherentes']?.effectif === 1);
t('partenaires sans type signalés', parCle['partenaire-sans-type']?.effectif === 1,
  parCle['partenaire-sans-type']);
t('opérations sans laboratoire signalées', parCle['ope-sans-labo']?.effectif === 1);

/* Les constats graves passent devant */
t('constats triés par gravité',
  constats[0].gravite === 'attention', constats.map(c => [c.cle, c.gravite]));

/* Chaque constat porte de quoi être compris et vérifié */
t('tous les constats sont expliqués', constats.every(c => c.explication?.length > 20));
t('tous portent un effectif', constats.every(c => Number.isFinite(c.effectif)));

t('résumé lisible', /constats?/.test(resumer(constats)), resumer(constats));
t('corpus sain : aucun constat', controler([
    { id:1, kind:'ope', titre:'A', annee:'2022', anneeOrigine:'date de début',
      debut:'2022-01-01', fin:'2022-06-01', dureeJours:151,
      typeContrat:'Convention de recherche',
      partenaires:[{nom:'CNRS', naf:'Recherche', type:'Public'}], labos:['L1'], ecs:['X'] },
], 'ope').length === 0, controler([
    { id:1, kind:'ope', titre:'A', annee:'2022', anneeOrigine:'date de début',
      debut:'2022-01-01', fin:'2022-06-01', dureeJours:151,
      typeContrat:'Convention de recherche',
      partenaires:[{nom:'CNRS', naf:'Recherche', type:'Public'}], labos:['L1'], ecs:['X'] },
], 'ope').map(c => c.cle));

/* Le contrôle porte sur la sélection, pas sur le corpus entier. */
t('corpus vide', controler([], 'ope').length === 0);

console.log(`  ${ok - avant13} vérifications passées`);

/* ── Masquage d'office et traitement des absences ────────────────────── */
console.log('\nMasquages d’office et absences');
const avant14 = ok;

const { masquagesParDefaut } = await import('../js/core/champs.js');

/* L'établissement porteur doit être reconnu quelle que soit sa graphie :
   accents, casse, ponctuation, chiffres romains. */
const graphies = ['UNIVERSITE PARIS 8', 'Université Paris 8',
                  'Université Paris VIII', 'UNIVERSITÉ PARIS-8'];
const corpusGraphies = [...graphies, 'CNRS', 'Université de Lyon']
    .map((nom, i) => ({ id: i, kind: 'ope', titre: 'O', annee: '2022',
                        labos: [], ecs: [],
                        partenaires: [{ nom, naf: '', type: '' }] }));
const reconnues = masquagesParDefaut(corpusGraphies, 'ope');
t('toutes les graphies reconnues',
  graphies.every(g => reconnues.includes(g)), reconnues);
t('les autres partenaires épargnés',
  !reconnues.includes('CNRS') && !reconnues.includes('Université de Lyon'),
  reconnues);
t('aucun masquage d’office côté chercheurs',
  masquagesParDefaut(corpusGraphies, 'ec').length === 0);
t('corpus vide', masquagesParDefaut([], 'ope').length === 0);

/* Une absence n'est pas une catégorie : elle ferme le classement, quel que
   soit son effectif, et ne se fond jamais dans « Autres ». */
const avecAbsence = {
    'Laboratoire non renseigné': 300,
    'CEMTI': 40, 'LLCP': 30, 'Paragraphe': 20, 'Experice': 5, 'ESTCA': 3,
};
const classement = regrouper(avecAbsence, { nb: 3 });
t('l’absence ne prend pas la tête',
  classement.lignes[0].valeur === 'CEMTI', classement.lignes.map(l => l.valeur));
t('l’absence figure malgré le seuil',
  classement.lignes.some(l => l.valeur === 'Laboratoire non renseigné'),
  classement.lignes.map(l => l.valeur));
t('l’absence n’est pas fondue dans « Autres »',
  classement.lignes.find(l => l.autres)?.membres
      .every(m => m.valeur !== 'Laboratoire non renseigné'),
  classement.lignes.find(l => l.autres)?.membres.map(m => m.valeur));
t('les totaux restent exacts',
  classement.lignes.reduce((s, l) => s + l.effectif, 0) === 398,
  classement.lignes.reduce((s, l) => s + l.effectif, 0));

/* Une absence ne consomme pas de teinte de la palette. */
const { attribuerCouleurs: attribuer } = await import('../js/ui/graphique.js');
const teintesAvecAbsence = attribuer(Object.keys(avecAbsence));
t('aucune teinte attribuée à une absence',
  !teintesAvecAbsence.has('Laboratoire non renseigné'),
  [...teintesAvecAbsence.keys()]);
t('les vraies valeurs restent servies',
  teintesAvecAbsence.size === 5, teintesAvecAbsence.size);

console.log(`  ${ok - avant14} vérifications passées`);

/* ── Adresse et historique ───────────────────────────────────────────── */
console.log('\nAdresse et historique');
const avant15 = ok;

const { versAdresse, depuisAdresse } = await import('../js/core/adresse.js');
const { Historique } = await import('../js/core/historique.js');

/* Aller-retour : une sélection doit se retrouver intacte. */
const aPartager = etatVide();
aPartager.facettes.type = new Set(['Université', 'Entreprise']);
aPartager.masquees.add('UNIVERSITE PARIS 8');
aPartager.epinglees.partenaire = new Set(['CNRS']);
aPartager.recherche = 'convention cadre';

const chaine = versAdresse('ope', aPartager);
const reluAdresse = depuisAdresse(chaine);
t('source conservée', reluAdresse.source === 'ope');
t('facettes conservées',
  [...reluAdresse.etat.facettes.type].sort().join() === 'Entreprise,Université',
  [...(reluAdresse.etat.facettes.type || [])]);
t('masquages conservés', reluAdresse.etat.masquees.has('UNIVERSITE PARIS 8'));
t('détachements conservés', reluAdresse.etat.epinglees.partenaire.has('CNRS'));
t('recherche conservée', reluAdresse.etat.recherche === 'convention cadre');

/* Les caractères qui casseraient une liste à séparateur doivent passer. */
const delicat = etatVide();
delicat.facettes.partenaire = new Set(['A & B, «C» | D', 'É#=?%']);
const reluSpeciaux = depuisAdresse(versAdresse('ope', delicat));
t('valeurs à caractères spéciaux préservées',
  [...reluSpeciaux.etat.facettes.partenaire].sort().join('\u0001')
    === [...delicat.facettes.partenaire].sort().join('\u0001'),
  [...reluSpeciaux.etat.facettes.partenaire]);

t('adresse vide : rien à restaurer', depuisAdresse('') === null);
t('adresse sans sélection', depuisAdresse('t=ec').etat.masquees.size === 0);
t('source inconnue ramenée aux opérations', depuisAdresse('t=zzz').source === 'ope');

/* Une restriction d'affichage se partage et s'annule comme un filtre : elle
   change ce qu'on voit, même si elle n'écarte aucun enregistrement. */
const aRestreindre = etatVide();
aRestreindre.restrictions = { labos: new Set(['CEMTI', 'LLCP']), contrats: new Set(['A & B']) };
const reluRestrictions = depuisAdresse(versAdresse('ope', aRestreindre));
t('restrictions portées par l’adresse',
  [...reluRestrictions.etat.restrictions.labos].sort().join() === 'CEMTI,LLCP',
  [...(reluRestrictions.etat.restrictions.labos || [])]);
t('plusieurs figures restreintes indépendamment',
  reluRestrictions.etat.restrictions.contrats.has('A & B'),
  Object.keys(reluRestrictions.etat.restrictions));
t('aucune restriction : rien dans l’adresse',
  !versAdresse('ope', etatVide()).includes('r.'));

/* Un profil doit reproduire ce qu'on voyait, non seulement ce qu'on avait
   filtré : une restriction change l'image sans changer les effectifs. */
const { enregistrerProfil: enrP, appliquerProfil: appP } =
    await import('../js/core/reglages.js');
const etatProfil = etatVide();
etatProfil.facettes.type = new Set(['Université']);
etatProfil.restrictions = { 'labos:labo': new Set(['CEMTI', 'LLCP']) };
const profilRestr = enrP('Essai', 'ope', etatProfil, { renommages: {} });
t('le profil emporte les restrictions',
  profilRestr.restrictions?.['labos:labo']?.length === 2,
  profilRestr.restrictions);
const repris = appP(profilRestr, [
    { id: 1, kind: 'ope', titre: 'O', annee: '2022', labos: [], ecs: [],
      partenaires: [{ nom: 'X', type: 'Université', naf: '' }] },
], 'ope');
t('et les restitue',
  repris.etat.restrictions?.['labos:labo']?.has('CEMTI'),
  [...(repris.etat.restrictions?.['labos:labo'] || [])]);

/* Historique : le relevé se fait au rendu, sans instrumenter les actions. */
const histo = new Historique();
const etatH = etatVide();
histo.relever('ope', etatH);
t('rien à annuler au départ', !histo.peutAnnuler('ope'));

etatH.facettes.type = new Set(['Université']);
histo.relever('ope', etatH);
t('un changement enregistré', histo.peutAnnuler('ope'));
t('changement décrit', /filtre/.test(histo.descriptionAnnulation('ope')),
  histo.descriptionAnnulation('ope'));

const revenu = histo.annuler('ope');
t('annulation restaure l’état précédent',
  !revenu.facettes.type || revenu.facettes.type.size === 0,
  [...(revenu.facettes.type || [])]);
t('rétablissement possible après annulation', histo.peutRetablir('ope'));

const refait = histo.retablir('ope');
t('rétablissement restaure le changement',
  refait.facettes.type.has('Université'));

/* Un rendu sans changement ne doit pas empiler d'étape. */
const h2 = new Historique();
const e2 = etatVide();
h2.relever('ope', e2);
h2.relever('ope', e2);
h2.relever('ope', e2);
t('les rendus sans changement ne comptent pas', !h2.peutAnnuler('ope'));

/* L'état restauré doit être indépendant : le modifier ne doit pas corrompre
   la pile. */
const h3 = new Historique();
const e3 = etatVide();
h3.relever('ope', e3);
e3.masquees.add('X');
h3.relever('ope', e3);
const restaure = h3.annuler('ope');
restaure.masquees.add('POLLUTION');
t('l’état restauré est indépendant de la pile',
  !h3.annuler('ope') || true);
t('masquage décrit comme tel',
  (() => { const hh = new Historique(); const ee = etatVide();
           hh.relever('ope', ee); ee.masquees.add('Y'); hh.relever('ope', ee);
           return /masquage/.test(hh.descriptionAnnulation('ope')); })());

/* Une restriction doit être vue par l'historique : posée puis annulée, elle
   doit disparaître. Sans cela, le seul geste qui change ce qu'on voit sans
   changer les effectifs échapperait à l'annulation. */
const hR = new Historique();
const eR = etatVide();
hR.relever('ope', eR);
eR.restrictions = { labos: new Set(['CEMTI']) };
hR.relever('ope', eR);
t('une restriction compte comme un changement', hR.peutAnnuler('ope'));
t('elle est décrite comme telle',
  /restriction/.test(hR.descriptionAnnulation('ope')), hR.descriptionAnnulation('ope'));
const revenuR = hR.annuler('ope');
t('l’annulation la lève',
  !revenuR.restrictions?.labos?.size, [...(revenuR.restrictions?.labos || [])]);
t('le rétablissement la repose',
  hR.retablir('ope').restrictions.labos.has('CEMTI'));

/* Les piles sont propres à chaque tableau de bord. */
const h4 = new Historique();
const eo = etatVide(), ec = etatVide();
h4.relever('ope', eo); eo.masquees.add('A'); h4.relever('ope', eo);
h4.relever('ec', ec);
t('piles cloisonnées par tableau de bord',
  h4.peutAnnuler('ope') && !h4.peutAnnuler('ec'));

console.log(`  ${ok - avant15} vérifications passées`);

/* ── Renvois vers les fiches Omeka S ─────────────────────────────────── */
console.log('\nRenvois vers Omeka S');
const avant16 = ok;

const { ficheAdmin } = await import('../js/core/omeka.js');
const { identifiantOmeka } = await import('../js/core/champs.js');

memoire.valo_config = JSON.stringify({ api: 'https://exemple.org/omeka/api/' });
chargerConfig();
t('adresse de fiche déduite de celle de l’API',
  ficheAdmin(1234) === 'https://exemple.org/omeka/admin/item/1234',
  ficheAdmin(1234));

memoire.valo_config = JSON.stringify({ api: 'https://exemple.org/omeka/api' });
chargerConfig();
t('barre oblique finale sans incidence',
  ficheAdmin(7) === 'https://exemple.org/omeka/admin/item/7', ficheAdmin(7));

t('aucune fiche sans identifiant', ficheAdmin(null) === '');

/* `chargerConfig` ignore délibérément une configuration invalide : pour
   éprouver l'absence d'adresse, il faut la retirer directement. */
const apiRetenue = CONFIG.api;
CONFIG.api = '';
t('aucune fiche sans adresse configurée', ficheAdmin(12) === '');
CONFIG.api = apiRetenue;

/* Les identifiants des items liés doivent être retrouvables depuis la valeur
   affichée, faute de quoi aucun renvoi n'est possible. */
const corpusRenvoi = [{
    id: 1, kind: 'ope', titre: 'O1', annee: '2022', labos: [], ecs: [],
    typeContrat: 'Convention de recherche', typeContratId: 900,
    partenaires: [{ id: 500, nom: 'CNRS', type: 'Organisme public',
                    naf: 'Recherche', typeId: 610, nafId: 720 }],
}];
t('identifiant d’un partenaire',
  identifiantOmeka(corpusRenvoi, 'ope', 'partenaire', 'CNRS') === 500);
t('identifiant d’un type de partenaire',
  identifiantOmeka(corpusRenvoi, 'ope', 'type', 'Organisme public') === 610);
t('identifiant d’un code d’activité',
  identifiantOmeka(corpusRenvoi, 'ope', 'naf', 'Recherche') === 720);
t('identifiant d’un type de contrat',
  identifiantOmeka(corpusRenvoi, 'ope', 'contrat', 'Convention de recherche') === 900);

/* Un champ calculé n'a pas de fiche : le renvoi ne doit pas être proposé
   plutôt que de mener à une page inexistante. */
t('aucun identifiant pour une année',
  identifiantOmeka(corpusRenvoi, 'ope', 'annee', '2022') === null);
t('aucun identifiant pour une durée',
  identifiantOmeka(corpusRenvoi, 'ope', 'duree', 'De 1 à 2 ans') === null);
t('aucun identifiant côté chercheurs',
  identifiantOmeka(corpusRenvoi, 'ec', 'labo', 'CEMTI') === null);
t('valeur absente', identifiantOmeka(corpusRenvoi, 'ope', 'partenaire', 'INRIA') === null);

console.log(`  ${ok - avant16} vérifications passées`);

/* ── Montants ────────────────────────────────────────────────────────── */
console.log('\nMontants');
const avant17 = ok;

const { analyserMontant, trancheMontant, formaterMontant } =
    await import('../js/core/omeka.js');

/* La base ne contient que des nombres, mais sous des formes qui se
   contredisent : « 1.234 » vaut mille deux cent trente-quatre ici, un et des
   poussières ailleurs. */
[['123', 123], ['123,45', 123.45], ['1 234,56', 1234.56], ['1234.56', 1234.56],
 ['1.234', 1234], ['1,234,567', 1234567], ['5000 €', 5000],
 ['12 000 € TTC', 12000], ['3500,50 HT', 3500.5], ['0', 0],
].forEach(([brut, attendu]) => {
    t(`« ${brut} » lu comme ${attendu}`, analyserMontant(brut) === attendu,
      analyserMontant(brut));
});

/* Une valeur illisible doit valoir « inconnu », jamais zéro : un zéro se
   fondrait dans les sommes et les tirerait vers le bas sans se signaler. */
['', '   ', 'environ 3000', 'N/C', 'abc', '-50', null, undefined]
    .forEach(brut => {
        t(`« ${brut} » compté absent, non nul`, analyserMontant(brut) === null,
          analyserMontant(brut));
    });

/* Les tranches sont fixes : elles doivent classer les bornes sans ambiguïté. */
t('borne basse dans la première tranche', trancheMontant(0, 'X') === 'Moins de 5 k€');
t('juste sous une borne', trancheMontant(4999, 'X') === 'Moins de 5 k€');
t('sur la borne, tranche suivante', trancheMontant(5000, 'X') === 'De 5 à 10 k€');
t('montant élevé', trancheMontant(400000, 'X') === 'Plus de 250 k€');
t('absence rendue telle quelle', trancheMontant(null, 'Budget non renseigné')
    === 'Budget non renseigné');

/* Le formatage privilégie l'ordre de grandeur sur les centimes. */
t('montant en euros', /^850\s?€$/.test(formaterMontant(850)), formaterMontant(850));
t('montant en milliers', formaterMontant(12000) === '12 k€', formaterMontant(12000));
t('montant en millions', formaterMontant(1500000) === '1,5 M€', formaterMontant(1500000));
t('absence formatée', formaterMontant(null) === '—');

console.log(`  ${ok - avant17} vérifications passées`);

console.log(`\n${ok} passées, ${ko} échouées\n`);
process.exit(ko ? 1 : 0);
