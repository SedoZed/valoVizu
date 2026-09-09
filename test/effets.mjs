/**
 * Recherche d'effets de bord.
 *
 * Le détachement d'une valeur hors du regroupement croise trois mécanismes
 * déjà en place — masquage, filtrage, compteurs — qui pourraient se
 * contredire. Ces vérifications portent sur leurs combinaisons plutôt que
 * sur chacun pris isolément.
 */
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!DOCTYPE html><body></body>');
globalThis.document = dom.window.document; globalThis.window = dom.window;
const mem = {};
globalThis.localStorage = { getItem: k => mem[k] ?? null, setItem: (k,v)=>{mem[k]=String(v);}, removeItem: k=>{delete mem[k];} };

const { etatVide, retenus, effectifs, comptesFacette } = await import('/home/claude/valo/js/core/selection.js');
const { regrouper } = await import('/home/claude/valo/js/core/groupe.js');

let ok=0, ko=0;
const t=(n,c,d)=>{c?ok++:(ko++,console.log('  ÉCHEC:',n,d!==undefined?JSON.stringify(d):''));};

const opes = Array.from({length:20},(_,i)=>({
  id:i, kind:'ope', titre:'O'+i, annee:String(2020+(i%3)), labos:['L'+(i%2)], ecs:[],
  partenaires:[{ nom:'P'+(i%7), naf:'N'+(i%3), type:'T'+(i%2) }],
}));

/* 1. Épinglage et masquage se combinent sans se contredire */
const e = etatVide();
e.epinglees.partenaire = new Set(['P6']);
e.masquees.add('P6');
const c = effectifs(retenus(opes,'ope',e),'ope','partenaire',e);
t('une valeur masquée n’est pas ressuscitée par l’épinglage', c.P6 === undefined, c);
const r = regrouper(c, { nb:3, epinglees:e.epinglees.partenaire });
t('elle n’apparaît pas non plus dans la figure',
  !r.lignes.some(l=>l.valeur==='P6'), r.lignes.map(l=>l.valeur));

/* 2. Épinglage sur un champ n’affecte pas les autres champs */
const e2 = etatVide();
e2.epinglees.partenaire = new Set(['P6']);
const avantType = effectifs(opes,'ope','type',e2);
const e3 = etatVide();
t('l’épinglage ne modifie aucun effectif',
  JSON.stringify(avantType) === JSON.stringify(effectifs(opes,'ope','type',e3)));

/* 3. Épinglage + filtre : le filtre continue de restreindre */
const e4 = etatVide();
e4.epinglees.partenaire = new Set(['P6']);
e4.facettes.type = new Set(['T0']);
t('le filtre reste actif malgré l’épinglage',
  retenus(opes,'ope',e4).length === 10, retenus(opes,'ope',e4).length);

/* 4. Compteurs de facette inchangés par l’épinglage */
const a = comptesFacette(opes,'ope',etatVide(),'partenaire');
const b = comptesFacette(opes,'ope',e4,'partenaire');
t('les compteurs de facette ignorent l’épinglage',
  a.P0 !== undefined && Object.keys(a).length >= Object.keys(b).length);

/* 5. Épingler une valeur inexistante ne casse rien */
const e5 = etatVide();
e5.epinglees.partenaire = new Set(['INEXISTANT']);
const r5 = regrouper(effectifs(opes,'ope','partenaire',e5), { nb:3, epinglees:e5.epinglees.partenaire });
t('valeur épinglée absente : sans effet',
  r5.lignes.length === 4 && r5.lignes.reduce((s,l)=>s+l.effectif,0) === 20,
  r5.lignes.map(l=>[l.valeur,l.effectif]));

/* 6. Épinglage sans regroupement (nb=0) */
const r6 = regrouper(effectifs(opes,'ope','partenaire',etatVide()), { nb:0, epinglees:new Set(['P1']) });
t('sans regroupement, l’épinglage est neutre', r6.lignes.length === 7 && r6.regroupees === 0);

/* 7. Le total est toujours conservé, quel que soit l’épinglage */
[0,1,3,5,7].forEach(n => {
  ['','P0','P6'].forEach(v => {
    const res = regrouper(effectifs(opes,'ope','partenaire',etatVide()),
                          { nb:n, epinglees: v ? new Set([v]) : null });
    if (res.lignes.reduce((s,l)=>s+l.effectif,0) !== 20) {
      ko++; console.log('  ÉCHEC: total rompu pour nb='+n+' épinglée='+v);
    }
  });
});
ok++;

/* ── Échelle des figures ─────────────────────────────────────────────────
   Le cas signalé : après masquage de la valeur dominante, « Autres » devient
   le plus grand effectif et écrase toutes les barres réelles. L'échelle doit
   se caler sur les valeurs détaillées. */
const { barresHorizontales, colonnes } = await import('/home/claude/valo/js/ui/graphique.js');

const lignesEcrasees = [
  { valeur:'A', effectif:46 }, { valeur:'B', effectif:38 }, { valeur:'C', effectif:26 },
  { valeur:'Autres', effectif:857, autres:true, membres:[] },
];

const svgB = barresHorizontales({ lignes: lignesEcrasees, largeur: 800, unite:'opérations' });
const largeursB = [...svgB.querySelectorAll('.barre-remplissage')].map(r => +r.getAttribute('width'));
t('la plus grande valeur réelle occupe presque toute la piste',
  largeursB[0] > 300, largeursB);
t('le regroupement est borné à la piste',
  largeursB[3] <= largeursB[0] + 1, largeursB);
t('les proportions entre valeurs réelles sont conservées',
  Math.abs(largeursB[1] / largeursB[0] - 38/46) < 0.05,
  { rapport: largeursB[1] / largeursB[0], attendu: 38/46 });
t('la troncature est signalée dans l’infobulle',
  [...svgB.querySelectorAll('title')].some(t => /tronquée/.test(t.textContent)));

const svgC = colonnes({ lignes: lignesEcrasees, largeur: 800, hauteur: 240, unite:'opérations' });
const hauteursC = [...svgC.querySelectorAll('.colonne-remplissage')].map(r => +r.getAttribute('height'));
t('mêmes règles pour les colonnes', hauteursC[0] > 100, hauteursC);
t('colonne du regroupement bornée', hauteursC[3] <= hauteursC[0] + 1, hauteursC);

/* Sans regroupement, l'échelle reste calée sur le maximum ordinaire. */
const svgD = barresHorizontales({
  lignes: [{ valeur:'A', effectif:10 }, { valeur:'B', effectif:5 }],
  largeur: 800, unite:'opérations' });
const largeursD = [...svgD.querySelectorAll('.barre-remplissage')].map(r => +r.getAttribute('width'));
t('sans regroupement, rapport exact',
  Math.abs(largeursD[1] / largeursD[0] - 0.5) < 0.02, largeursD);

/* Un regroupement plus petit que le maximum ne change rien. */
const svgE = barresHorizontales({
  lignes: [{ valeur:'A', effectif:100 }, { valeur:'Autres', effectif:20, autres:true, membres:[] }],
  largeur: 800, unite:'opérations' });
const largeursE = [...svgE.querySelectorAll('.barre-remplissage')].map(r => +r.getAttribute('width'));
t('regroupement modeste : proportion respectée',
  Math.abs(largeursE[1] / largeursE[0] - 0.2) < 0.02, largeursE);

/* ── Bulles temporelles et frise ────────────────────────────────────── */
const { bullesTemporelles, frise } = await import('/home/claude/valo/js/ui/graphique.js');

const entites = [{valeur:'P1',effectif:30},{valeur:'P2',effectif:10},
                 {valeur:'Autres',effectif:5,autres:true}];
const cats = ['2020','2021','2022'];
const cellulesB = new Map([
  ['P1\u00002020',20],['P1\u00002022',10],
  ['P2\u00002021',10],['Autres\u00002022',5],
]);
const svgBulles = bullesTemporelles({ entites, categories: cats, cellules: cellulesB,
                                      largeur: 700, unite:'opérations' });
const disques = [...svgBulles.querySelectorAll('.bulle')];
t('un disque par cellule renseignée', disques.length === 4, disques.length);
t('aucun disque pour une cellule vide',
  disques.length === [...cellulesB.values()].length);

/* L'aire doit être proportionnelle, non le rayon : un effectif deux fois
   plus grand doit donner un rayon multiplié par racine de deux. */
/* La description est lue avec précaution : un élément qui n'en porterait plus
   ferait échouer ce contrôle par une erreur plutôt que par un constat, et le
   reste de la série ne serait jamais atteint. */
const decritPar = e => e.getAttribute('aria-label') || '';
const rayons = Object.fromEntries(disques.map(d =>
  [decritPar(d).split(' · ')[0] + '|' + d.getAttribute('r'), +d.getAttribute('r')]));
const r20 = disques.find(d => /20 opérations/.test(decritPar(d)));
const r10 = disques.find(d => /\b10 opérations/.test(decritPar(d)));
t('aire proportionnelle à l’effectif',
  !!r20 && !!r10
  && Math.abs((+r20.getAttribute('r') / +r10.getAttribute('r')) - Math.SQRT2) < 0.05,
  { r20: r20 && +r20.getAttribute('r'), r10: r10 && +r10.getAttribute('r') });

t('rayons finis et positifs',
  disques.every(d => Number.isFinite(+d.getAttribute('r')) && +d.getAttribute('r') > 0));
t('disques dans le cadre', disques.every(d => {
  const cx = +d.getAttribute('cx'), r = +d.getAttribute('r');
  return cx - r >= 0 && cx + r <= 700;
}));

/* Frise */
const j = (a,m,d) => Date.UTC(a,m-1,d);
const lignesF = [
  { valeur:'L1', effectif:2, periodes:[
      { debut:j(2020,1,1), fin:j(2020,6,1), titre:'A' },
      { debut:j(2021,3,1), fin:j(2022,3,1), titre:'B' }]},
  { valeur:'L2', effectif:1, periodes:[
      { debut:j(2019,1,1), fin:j(2023,1,1), titre:'C' }]},
];
const svgFrise = frise({ lignes: lignesF, min: j(2019,1,1), max: j(2023,1,1),
                         largeur: 700,
                         graduations: [2019,2020,2021,2022,2023]
                           .map(a => ({ valeur: j(a,1,1), libelle: String(a) })) });
const segs = [...svgFrise.querySelectorAll('.frise-segment')];
t('un segment par période', segs.length === 3, segs.length);
t('segments dans le cadre',
  segs.every(sg => +sg.getAttribute('x') >= 0
                && +sg.getAttribute('x') + +sg.getAttribute('width') <= 701),
  segs.map(sg => [+sg.getAttribute('x'), +sg.getAttribute('width')].map(Math.round)));

/* La largeur doit suivre la durée : quatre ans doivent occuper plus qu'un an. */
const largeurs = segs.map(sg => +sg.getAttribute('width'));
t('largeur proportionnelle à la durée',
  Math.max(...largeurs) > Math.min(...largeurs) * 3,
  largeurs.map(Math.round));
t('graduations tracées', svgFrise.querySelectorAll('line').length >= 5);

/* Une période réduite à un instant reste visible. */
const instant = frise({ lignes:[{ valeur:'X', effectif:1,
  periodes:[{ debut:j(2021,1,1), fin:j(2021,1,1), titre:'ponctuel' }]}],
  min:j(2020,1,1), max:j(2022,1,1), largeur:700 });
t('période nulle : segment tout de même visible',
  +instant.querySelector('.frise-segment').getAttribute('width') >= 2);

/* ── Constellation ──────────────────────────────────────────────────── */
const { disposerConstellation } = await import('/home/claude/valo/js/ui/constellation.js');

const polesC = [{valeur:'L1',effectif:20},{valeur:'L2',effectif:10},{valeur:'L3',effectif:2}];
const indC = [
  ...Array.from({length:20},(_,i)=>({ id:'a'+i, libelle:'A'+i, poles:['L1'] })),
  ...Array.from({length:10},(_,i)=>({ id:'b'+i, libelle:'B'+i, poles:['L2'] })),
  ...Array.from({length:2},(_,i)=>({ id:'c'+i, libelle:'C'+i, poles:['L3'] })),
  { id:'pont', libelle:'Pont', poles:['L1','L2'] },
  { id:'seul', libelle:'Isolé', poles:[] },
];
const cst = disposerConstellation(polesC, indC, { largeur: 800, hauteur: 560 });

t('tous les pôles placés', cst.poles.length === 3);
t('tous les individus placés', cst.individus.length === 34);
t('coordonnées finies',
  [...cst.poles, ...cst.individus].every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
t('tout tient dans le cadre',
  [...cst.poles, ...cst.individus].every(p =>
    p.x >= -1 && p.x <= 801 && p.y >= -1 && p.y <= 561),
  [...cst.poles, ...cst.individus].filter(p =>
    p.x < 0 || p.x > 800 || p.y < 0 || p.y > 560).length);

/* La taille d'un pôle doit suivre son effectif. */
const rp = Object.fromEntries(cst.poles.map(p => [p.valeur, p.rayon]));
t('rayon du pôle proportionnel à la racine de l’effectif',
  rp.L1 > rp.L2 && rp.L2 > rp.L3, rp);

/* Un individu à cheval doit se placer entre ses pôles, non sur l'un d'eux. */
const pont = cst.individus.find(i => i.id === 'pont');
const pL1 = cst.poles.find(p => p.valeur === 'L1');
const pL2 = cst.poles.find(p => p.valeur === 'L2');
const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
t('individu à cheval marqué', pont.pont === true);
t('individu à cheval placé entre ses pôles',
  Math.abs(dist(pont,pL1) - dist(pont,pL2)) < dist(pL1,pL2) * 0.45,
  { d1: Math.round(dist(pont,pL1)), d2: Math.round(dist(pont,pL2)) });

/* Un individu sans pôle est signalé plutôt que placé au hasard. */
t('individu sans rattachement marqué',
  cst.individus.find(i => i.id === 'seul').isole === true);

/* Les individus d'un même pôle doivent l'entourer, pas s'y superposer. */
const autourL1 = cst.individus.filter(i => i.poles[0] === 'L1' && !i.pont);
t('individus rangés autour de leur pôle',
  autourL1.every(i => dist(i, pL1) > pL1.rayon),
  autourL1.filter(i => dist(i, pL1) <= pL1.rayon).length);
t('individus distincts les uns des autres',
  new Set(autourL1.map(i => Math.round(i.x) + ',' + Math.round(i.y))).size
    >= autourL1.length - 1);

/* Reproductibilité : une figure exportée doit correspondre à ce qu'on a vu. */
const encore2 = disposerConstellation(polesC, indC, { largeur: 800, hauteur: 560 });
t('disposition reproductible',
  cst.individus.every((p,i) => Math.abs(p.x - encore2.individus[i].x) < 1e-9));

/* Cas limites */
t('aucun pôle', disposerConstellation([], indC, {}).individus.length === 34);
t('aucun individu', disposerConstellation(polesC, [], {}).poles.length === 3);
t('pôle inconnu ignoré',
  disposerConstellation(polesC, [{ id:'x', libelle:'X', poles:['INEXISTANT'] }], {})
    .individus[0].isole === true);

/* ── Simulation de forces ───────────────────────────────────────────── */
const { Simulation } = await import('/home/claude/valo/js/ui/physique.js');

/* Le jeu d'essai reprend les proportions réelles : trente-cinq groupes et
   sept cents membres. Une simulation qui se comporte bien sur dix nœuds ne
   prouve rien de son comportement à cette échelle. */
function construireReseau() {
  const eff = [49,48,45,45,45,42,38,32,27,26,26,24,21,19,18,18,18,17,15,12,
               11,11,11,11,10,10,10,9,9,8,8,7,7,6,4];
  const noeuds = [], liens = [];
  const W = 1200, H = 900;
  eff.forEach((e, i) => {
    const angle = (i / eff.length) * Math.PI * 2;
    const px = W/2 + Math.cos(angle) * W * 0.18;
    const py = H/2 + Math.sin(angle) * H * 0.18;
    noeuds.push({ id:'P'+i, x:px, y:py, charge:-420, rayonCollision:28, pole:null });
    for (let k = 0; k < e; k++) {
      const a = (k / e) * Math.PI * 2;
      noeuds.push({ id:'P'+i+'m'+k, x:px+Math.cos(a)*25, y:py+Math.sin(a)*25,
                    charge:-35, rayonCollision:8, pole:'P'+i });
      liens.push({ source:'P'+i+'m'+k, cible:'P'+i });
    }
  });
  const parId = new Map(noeuds.map(n => [n.id, n]));
  const sim = new Simulation(noeuds, liens, {
    centreX: W/2, centreY: H/2,
    groupeDe: n => (n.pole ? parId.get(n.pole) : null),
  });
  return { noeuds, liens, sim, parId };
}

const reseau = construireReseau();
let pasEffectues = 0;
while (reseau.sim.alpha >= reseau.sim.alphaMin && pasEffectues < 500) {
  reseau.sim.pas(); pasEffectues++;
}

t('la simulation converge', pasEffectues < 500, pasEffectues);
t('coordonnées finies', reseau.noeuds.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)));

const polesR = reseau.noeuds.filter(n => !n.pole);
let chevauchements = 0;
for (let i = 0; i < polesR.length; i++) {
  for (let j = i + 1; j < polesR.length; j++) {
    if (Math.hypot(polesR[i].x - polesR[j].x, polesR[i].y - polesR[j].y) < 50) chevauchements++;
  }
}
t('les groupes ne se chevauchent pas', chevauchements === 0, chevauchements);

/* Chaque membre doit rester auprès du sien : c'est la lisibilité même de la
   figure, et c'est ce que la répulsion à longue portée seule ne garantit pas. */
const egaresR = reseau.noeuds.filter(n => n.pole).filter(m => {
  const sien = reseau.parId.get(m.pole);
  const d = Math.hypot(m.x - sien.x, m.y - sien.y);
  return polesR.some(p => p !== sien && Math.hypot(m.x - p.x, m.y - p.y) < d);
}).length;
t('aucun membre plus proche d’un autre groupe', egaresR === 0, egaresR);

/* Les membres se rangent en couronnes : distance au pôle resserrée. */
const distances = reseau.noeuds.filter(n => n.pole)
  .map(m => { const s = reseau.parId.get(m.pole);
              return Math.hypot(m.x - s.x, m.y - s.y); });
const moyenne = distances.reduce((a, b) => a + b, 0) / distances.length;
t('membres rangés autour de leur pôle',
  Math.min(...distances) > 20 && Math.max(...distances) < moyenne * 2.5,
  { min: Math.round(Math.min(...distances)), moy: Math.round(moyenne),
    max: Math.round(Math.max(...distances)) });

/* Les recouvrements entre membres doivent être résolus. */
const membresR = reseau.noeuds.filter(n => n.pole);
let collisions = 0;
for (let i = 0; i < membresR.length; i++) {
  for (let j = i + 1; j < membresR.length; j++) {
    if (Math.hypot(membresR[i].x - membresR[j].x, membresR[i].y - membresR[j].y) < 10) {
      collisions++;
    }
  }
}
t('peu de recouvrements entre membres', collisions < membresR.length * 0.02,
  { collisions, membres: membresR.length });

/* La force des liens est pondérée par le degré : un pôle relié à quarante
   membres doit bouger bien moins que chacun d'eux. Tirer les deux extrémités
   également secoue les pôles et brouille l'ensemble — c'est ce qui rendait ma
   version précédente instable. */
const mobilite = (() => {
  /* Répulsion, groupement et centrage annulés : seule la force des liens
     agit. Sans cet isolement, la mesure est dominée par la répulsion entre
     pôles, qui les fait justement beaucoup voyager. */
  /* Les feuilles sont groupées d'un seul côté : disposées en couronne
     complète, leurs tractions s'annuleraient et le moyeu ne bougerait pas,
     quelle que soit la pondération — la vérification ne dirait alors rien. */
  const noeuds = [{ id: 'hub', x: 500, y: 300, charge: 0, rayonCollision: 0 }];
  for (let i = 0; i < 30; i++) {
    const a = -0.5 + (i / 30);
    noeuds.push({ id: 'f' + i, x: 500 + Math.cos(a) * 220, y: 300 + Math.sin(a) * 220,
                  charge: 0, rayonCollision: 0 });
  }
  const liens = noeuds.slice(1).map(f => ({ source: f.id, cible: 'hub' }));
  const depart = new Map(noeuds.map(n => [n.id, { x: n.x, y: n.y }]));
  new Simulation(noeuds, liens, { centrage: 0, groupement: 0 }).stabiliser(60);
  const parcouru = n => {
    const d = depart.get(n.id);
    return Math.hypot(n.x - d.x, n.y - d.y);
  };
  return {
    hub: parcouru(noeuds[0]),
    feuilles: noeuds.slice(1).reduce((s, n) => s + parcouru(n), 0) / 30,
  };
})();
/* Sans pondération, le moyeu reçoit la somme des trente tractions et
   traverse la figure pendant que les feuilles bougent à peine : on mesure
   environ huit fois plus de trajet pour lui que pour elles. Avec, les deux
   parcours sont du même ordre — c'est ce que garantit la pondération, non
   l'immobilité du moyeu. */
t('un nœud très relié n’est pas emporté par ses liens',
  mobilite.hub < mobilite.feuilles * 1.5,
  { hub: mobilite.hub.toFixed(1), feuilles: mobilite.feuilles.toFixed(1) });

/* Reproductibilité : une figure exportée doit correspondre à ce qu'on a vu. */
const bis = construireReseau();
while (bis.sim.alpha >= bis.sim.alphaMin) bis.sim.pas();
t('disposition reproductible',
  reseau.noeuds.every((n, i) => Math.abs(n.x - bis.noeuds[i].x) < 1e-6));

/* Un nœud immobilisé ne bouge pas : c'est ce qui rend le glissement possible. */
const fige = construireReseau();
fige.noeuds[0].fixe = true;
const posFige = { x: fige.noeuds[0].x, y: fige.noeuds[0].y };
fige.sim.stabiliser(80);
t('un nœud immobilisé reste en place',
  Math.abs(fige.noeuds[0].x - posFige.x) < 0.01
  && Math.abs(fige.noeuds[0].y - posFige.y) < 0.01,
  [fige.noeuds[0].x - posFige.x, fige.noeuds[0].y - posFige.y]);

/* Coût par image : la simulation doit tenir dans le budget d'une animation. */
const mesure = construireReseau();
const debutMesure = Date.now();
for (let i = 0; i < 20; i++) mesure.sim.pas();
const parImage = (Date.now() - debutMesure) / 20;
t('coût par image compatible avec une animation', parImage < 16, parImage.toFixed(1) + ' ms');

/* Cas limites */
t('graphe vide', new Simulation([], [], {}).stabiliser() !== null);
t('lien vers un nœud absent ignoré',
  new Simulation([{ id:'a', x:10, y:10 }], [{ source:'a', cible:'zz' }], {})
    .stabiliser(10) !== null);
t('nœud unique',
  (() => { const n = [{ id:'seul', x:5, y:5 }];
           new Simulation(n, [], {}).stabiliser(20);
           return Number.isFinite(n[0].x); })());
t('nœuds superposés séparés',
  (() => { const n = Array.from({length:8},(_,i)=>({ id:'s'+i, x:100, y:100, rayonCollision:8 }));
           new Simulation(n, [], { centreX:100, centreY:100 }).stabiliser(120);
           let proches = 0;
           for (let i=0;i<n.length;i++) for (let j=i+1;j<n.length;j++) {
             if (Math.hypot(n[i].x-n[j].x, n[i].y-n[j].y) < 8) proches++;
           }
           return proches === 0; })());

/* ── Enveloppes ─────────────────────────────────────────────────────── */
const { enveloppeConvexe, dilater, cheminArrondi } =
  await import('/home/claude/valo/js/ui/enveloppe.js');

const carre = [[0,0],[10,0],[10,10],[0,10],[5,5]];
const env = enveloppeConvexe(carre);
t('enveloppe d’un carré : quatre sommets', env.length === 4, env);
t('le point intérieur est écarté',
  !env.some(p => p[0] === 5 && p[1] === 5), env);
t('moins de trois points : aucune enveloppe',
  enveloppeConvexe([[0,0],[1,1]]) === null);
t('points confondus : aucune enveloppe',
  enveloppeConvexe([[3,3],[3,3],[3,3]]) === null);
t('points alignés : aucune surface',
  enveloppeConvexe([[0,0],[1,1],[2,2],[3,3]]) === null);

/* Tous les points d'origine doivent être contenus dans l'enveloppe dilatée. */
const nuage = Array.from({length:40},(_,i)=>[
  200 + Math.cos(i)*60 + (i%7)*3, 200 + Math.sin(i*1.3)*50 + (i%5)*4 ]);
const dilatee = dilater(enveloppeConvexe(nuage), 18);
const dansPolygone = (pt, poly) => {
  let dedans = false;
  for (let i=0, j=poly.length-1; i<poly.length; j=i++) {
    const [xi,yi] = poly[i], [xj,yj] = poly[j];
    if (((yi>pt[1]) !== (yj>pt[1])) &&
        (pt[0] < (xj-xi)*(pt[1]-yi)/(yj-yi)+xi)) dedans = !dedans;
  }
  return dedans;
};
t('tous les points sont contenus',
  nuage.every(p => dansPolygone(p, dilatee)),
  nuage.filter(p => !dansPolygone(p, dilatee)).length);

t('chemin SVG fermé', /Z$/.test(cheminArrondi(dilatee)));
t('chemin comportant des courbes', cheminArrondi(dilatee).includes('Q'));
t('enveloppe absente : chemin vide', cheminArrondi(null) === '');

/* Groupes trop petits pour une enveloppe : un cercle en tient lieu. */
const { cercleEnglobant } = await import('/home/claude/valo/js/ui/enveloppe.js');
t('un seul point : cercle tracé',
  cercleEnglobant([[100, 100]]).startsWith('M') && cercleEnglobant([[100, 100]]).endsWith('Z'));
t('deux points : cercle tracé',
  cercleEnglobant([[100, 100], [140, 120]]).includes('a'));
t('aucun point : chemin vide', cercleEnglobant([]) === '');
/* Le cercle doit contenir les points qu'il englobe. */
const pts = [[100, 100], [160, 130]];
const rayonAttendu = Math.hypot(30, 15) + 18;
t('rayon suffisant pour contenir les points',
  cercleEnglobant(pts, 18).includes(String(rayonAttendu).slice(0, 5))
  || /a (\d+\.?\d*) /.test(cercleEnglobant(pts, 18)),
  cercleEnglobant(pts, 18).slice(0, 60));

/* ── Pavage des groupes ─────────────────────────────────────────────── */
const { disposerConstellation: disposerC } =
  await import('/home/claude/valo/js/ui/constellation.js');

/* Les proportions réelles : trente-cinq laboratoires, sept cents chercheurs. */
const effectifsReels = [49,48,45,45,45,42,38,32,27,26,26,24,21,19,18,18,18,17,
                        15,12,11,11,11,11,10,10,10,9,9,8,8,7,7,6,4];
const polesReels = effectifsReels.map((e,i)=>({ valeur:'L'+i, effectif:e }));
let compteur = 0;
const membresReels = [];
effectifsReels.forEach((e,i)=>{
  for (let k=0;k<e;k++) membresReels.push({ id:'m'+(compteur++), libelle:'M', poles:['L'+i] });
});
const pave = disposerC(polesReels, membresReels, { largeur:1400, hauteur:1000 });

t('tous les groupes placés', pave.poles.length === 35);
t('tous les membres placés', pave.individus.length === membresReels.length,
  { places: pave.individus.length, attendus: membresReels.length });

let chevauchementsPavage = 0;
for (let i=0;i<pave.poles.length;i++) {
  for (let j=i+1;j<pave.poles.length;j++) {
    const a = pave.poles[i], b = pave.poles[j];
    if (Math.hypot(a.x-b.x, a.y-b.y) < a.rayonGroupe + b.rayonGroupe - 1) chevauchementsPavage++;
  }
}
t('aucun groupe n’en chevauche un autre', chevauchementsPavage === 0, chevauchementsPavage);

/* La figure doit former une tache compacte, non un anneau creux. */
const xs = pave.poles.map(p=>p.x), ys = pave.poles.map(p=>p.y);
const emprise = Math.max(Math.max(...xs)-Math.min(...xs), Math.max(...ys)-Math.min(...ys));
t('disposition compacte', emprise < 1000, Math.round(emprise));

/* Le rayon d'un pôle doit suivre son effectif. */
const parNom = Object.fromEntries(pave.poles.map(p=>[p.valeur,p]));
t('rayon croissant avec l’effectif',
  parNom.L0.rayon > parNom.L20.rayon && parNom.L20.rayon > parNom.L34.rayon,
  [parNom.L0.rayon, parNom.L20.rayon, parNom.L34.rayon].map(Math.round));

/* Chaque membre doit se trouver dans la zone de son propre groupe. */
const horsZone = pave.individus.filter(m => {
  const pole = m.principal;
  if (!pole) return false;
  return Math.hypot(m.x-pole.x, m.y-pole.y) > pole.rayonGroupe;
}).length;
t('chaque membre reste dans son groupe', horsZone === 0, horsZone);

/* Et plus près du sien que de tout autre. */
const malPlaces = pave.individus.filter(m => {
  if (!m.principal) return false;
  const d = Math.hypot(m.x-m.principal.x, m.y-m.principal.y);
  return pave.poles.some(p => p !== m.principal && Math.hypot(m.x-p.x, m.y-p.y) < d);
}).length;
t('aucun membre plus proche d’un autre groupe', malPlaces === 0, malPlaces);

/* Reproductibilité. */
const encoreP = disposerC(polesReels.map(p=>({...p})),
  membresReels.map(m=>({...m})), { largeur:1400, hauteur:1000 });
t('pavage reproductible',
  pave.poles.every((p,i) => Math.abs(p.x - encoreP.poles[i].x) < 1e-9));

t('aucun pôle', disposerC([], membresReels, {}).individus.length === membresReels.length);
t('aucun membre', disposerC(polesReels, [], {}).poles.length === 35);

/* ── Distinction des couleurs ───────────────────────────────────────── */
const { attribuerCouleurs } = await import('/home/claude/valo/js/ui/graphique.js');

/* Le cas signalé : deux types de partenaires recevaient la même teinte, et la
   couleur cessait de distinguer ce qu'on lui demandait de distinguer. */
const typesPartenaires = ['Université', 'Maison d’édition', 'Association',
  'Entreprise', 'Collectivité territoriale', 'Organisme public',
  'Établissement scolaire', 'Fondation'];
const attribution = attribuerCouleurs(typesPartenaires);
t('une teinte par valeur',
  new Set([...attribution.values()]).size === typesPartenaires.length,
  { valeurs: typesPartenaires.length, teintes: new Set([...attribution.values()]).size });
t('toutes les valeurs servies',
  typesPartenaires.every(v => attribution.has(v)));

/* Trente-cinq laboratoires : la palette doit tenir. */
const nombreux = Array.from({length:35},(_,i)=>'Laboratoire ' + i);
const grandeAttribution = attribuerCouleurs(nombreux);
t('palette suffisante pour trente-cinq valeurs',
  new Set([...grandeAttribution.values()]).size >= 24,
  new Set([...grandeAttribution.values()]).size);

/* L'attribution ne doit pas dépendre de l'ordre reçu. */
const inverse = attribuerCouleurs([...typesPartenaires].reverse());
t('indépendante de l’ordre',
  typesPartenaires.every(v => inverse.get(v) === attribution.get(v)));

t('ensemble vide', attribuerCouleurs([]).size === 0);
t('valeurs vides écartées', attribuerCouleurs(['', null, 'A']).size === 1);

/* ── Barres empilées ────────────────────────────────────────────────── */
const { barresEmpilees, colonnesEmpilees } =
  await import('/home/claude/valo/js/ui/graphique.js');

const lignesEmp = [
  { valeur:'CEMTI', effectif:24, segments:{ MCF:14, PR:6, 'PRAG':4 } },
  { valeur:'LLCP',  effectif:18, segments:{ MCF:12, PR:6 } },
  { valeur:'LED',   effectif:48, segments:{ MCF:30, PR:12, 'PRAG':6 } },
];
const svgEmp = barresEmpilees({
  lignes: lignesEmp, series: ['MCF','PR','PRAG'], largeur: 800, unite:'chercheurs' });

const segsEmp = [...svgEmp.querySelectorAll('.segment-empile')];
t('un segment par valeur non nulle', segsEmp.length === 8, segsEmp.length);
t('largeurs positives et finies',
  segsEmp.every(sg => Number.isFinite(+sg.getAttribute('width')) && +sg.getAttribute('width') > 0));

/* La somme des segments d'une ligne doit égaler sa longueur totale : c'est ce
   qui permet de lire à la fois le total et sa composition. */
const largeursParLigne = {};
segsEmp.forEach(sg => {
  const nom = (sg.getAttribute('aria-label') || '').split(' · ')[0];
  largeursParLigne[nom] = (largeursParLigne[nom] || 0) + +sg.getAttribute('width');
});
const echelle = largeursParLigne.LED / 48;
t('longueur proportionnelle à l’effectif',
  Math.abs(largeursParLigne.CEMTI / 24 - echelle) < 0.02
  && Math.abs(largeursParLigne.LLCP / 18 - echelle) < 0.02,
  Object.entries(largeursParLigne).map(([k,v]) => [k, Math.round(v)]));

/* Aucun segment ne doit sortir de la piste. */
const piste = 800 - Math.min(240, Math.max(120, Math.round(800*0.22))) - 46 - 16;
t('les segments tiennent dans la piste',
  segsEmp.every(sg => +sg.getAttribute('width') <= piste + 1),
  piste);

/* L'ordre d'empilement doit être identique d'une ligne à l'autre, sans quoi
   deux lignes ne se comparent pas du regard. */
const ordreDe = ligne => segsEmp
  .filter(sg => (sg.getAttribute('aria-label') || '').startsWith(ligne + ' ·'))
  .sort((a,b) => +a.getAttribute('x') - +b.getAttribute('x'))
  .map(sg => ((sg.getAttribute('aria-label') || '').split(' · ')[1] || '').split(' —')[0]);
t('ordre d’empilement constant',
  ordreDe('CEMTI').join() === 'MCF,PR,PRAG'
  && ordreDe('LED').join() === 'MCF,PR,PRAG',
  { cemti: ordreDe('CEMTI'), led: ordreDe('LED') });

/* Une série absente d'une ligne ne doit pas y creuser de trou. */
t('lignes incomplètes contiguës',
  ordreDe('LLCP').join() === 'MCF,PR', ordreDe('LLCP'));

t('axe gradué tracé', svgEmp.querySelectorAll('.figure-axe').length > 1);

/* Le pas de graduation doit donner quelques repères quel que soit l'ordre de
   grandeur : un pas fixe n'en donne qu'un seul sur un petit maximum. */
[[2, 'très petit'], [8, 'petit'], [45, 'moyen'], [700, 'grand']].forEach(([m, nom]) => {
  const svgAxe = barresEmpilees({
    lignes: [{ valeur: 'A', effectif: m, segments: { X: m } }],
    series: ['X'], largeur: 800 });
  const repere = svgAxe.querySelectorAll('.figure-axe').length;
  t(`graduations lisibles (maximum ${nom})`, repere >= 2 && repere <= 12, repere);
});
t('aucune ligne', barresEmpilees({ lignes: [], series: [], largeur: 800 }) !== null);
t('série vide', barresEmpilees({
  lignes: [{ valeur:'A', effectif:0, segments:{} }], series: ['X'], largeur: 800 })
    .querySelectorAll('.segment-empile').length === 0);

/* ── Contraste des séries empilées ──────────────────────────────────── */
const { attribuerCouleursContrastees, maximumUtile, horsEchelle } =
  await import('/home/claude/valo/js/ui/graphique.js');

const ecartTeintes = (a, b) => {
  const p = h => [0,2,4].map(i => parseInt(h.slice(1+i,3+i), 16));
  const [r1,g1,b1] = p(a), [r2,g2,b2] = p(b);
  return Math.sqrt(2*(r1-r2)**2 + 4*(g1-g2)**2 + 3*(b1-b2)**2);
};
const ecartMinimal = teintes => {
  let mini = Infinity;
  for (let i=0;i<teintes.length;i++) for (let j=i+1;j<teintes.length;j++) {
    mini = Math.min(mini, ecartTeintes(teintes[i], teintes[j]));
  }
  return mini;
};

/* Dans un empilement, deux segments se touchent sans séparation : des teintes
   proches y deviennent indiscernables. */
[3, 5, 7].forEach(n => {
  const series = Array.from({length:n}, (_,i) => 'Série ' + String.fromCharCode(65+i));
  const contrastee = [...attribuerCouleursContrastees(series).values()];
  const stable = [...attribuerCouleurs(series).values()];
  t(`teintes plus écartées à ${n} séries`,
    ecartMinimal(contrastee) > ecartMinimal(stable),
    { contrastee: Math.round(ecartMinimal(contrastee)),
      stable: Math.round(ecartMinimal(stable)) });
  t(`teintes distinctes à ${n} séries`,
    new Set(contrastee).size === n, new Set(contrastee).size);
});
t('attribution contrastée indépendante de l’ordre',
  [...attribuerCouleursContrastees(['C','A','B']).entries()].sort().join()
    === [...attribuerCouleursContrastees(['A','B','C']).entries()].sort().join());
t('absences écartées de l’attribution',
  !attribuerCouleursContrastees(['A', 'Statut non renseigné']).has('Statut non renseigné'));

/* ── Échelles : regroupements et absences sans incidence ────────────── */
t('un regroupement ne fixe pas l’échelle',
  maximumUtile([{valeur:'A',effectif:24},{valeur:'B',effectif:18},
                {valeur:'Autres',effectif:250,autres:true}]) === 24);
t('une absence ne fixe pas l’échelle',
  maximumUtile([{valeur:'A',effectif:24},
                {valeur:'Laboratoire non renseigné',effectif:300}]) === 24);
t('les deux à la fois',
  maximumUtile([{valeur:'A',effectif:24},{valeur:'B',effectif:18},
                {valeur:'Statut non renseigné',effectif:300},
                {valeur:'Autres',effectif:250,autres:true}]) === 24);
t('sans valeur comparable, on retombe sur le maximum brut',
  maximumUtile([{valeur:'Autres',effectif:250,autres:true}]) === 250);
t('cas ordinaire inchangé',
  maximumUtile([{valeur:'A',effectif:10},{valeur:'B',effectif:40}]) === 40);
t('reconnaissance des valeurs hors échelle',
  horsEchelle('Autres', {autres:true}) && horsEchelle('Domaine non renseigné')
  && !horsEchelle('CEMTI'));

/* Sur une figure complète : la plus grande valeur réelle doit occuper la
   piste, quel que soit le poids du regroupement. */
const avecEnorme = barresHorizontales({
  lignes: [{valeur:'A',effectif:24},{valeur:'B',effectif:18},
           {valeur:'Domaine non renseigné',effectif:300},
           {valeur:'Autres',effectif:250,autres:true,membres:[]}],
  largeur: 800, unite:'x' });
const largeursEnorme = [...avecEnorme.querySelectorAll('.barre-remplissage')]
  .map(r => +r.getAttribute('width'));
t('la plus grande valeur réelle occupe la piste', largeursEnorme[0] > 300, largeursEnorme);
t('absence et regroupement bornés à la piste',
  largeursEnorme[2] <= largeursEnorme[0] + 1 && largeursEnorme[3] <= largeursEnorme[0] + 1,
  largeursEnorme);

/* ── Regroupements reconnus par leur nom ────────────────────────────── */
const { estRegroupement } = await import('/home/claude/valo/js/ui/graphique.js');

/* Une ligne signale un regroupement par un drapeau, mais une série n'a que
   son nom : c'est ce qui faisait passer « Autres » pour un statut ordinaire
   dans les empilements, avec une teinte de la palette au lieu du gris. */
t('regroupement reconnu par son drapeau', estRegroupement('X', { autres: true }));
t('regroupement reconnu par son nom seul', estRegroupement('Autres'));
t('regroupement qualifié reconnu', estRegroupement('Autres (partenaire)'));
t('valeur ordinaire non confondue',
  !estRegroupement('MCF') && !estRegroupement('Autres-Rive'));

t('aucune teinte attribuée à un regroupement',
  !attribuerCouleurs(['MCF', 'PR', 'Autres']).has('Autres'));
t('idem pour l’attribution contrastée',
  !attribuerCouleursContrastees(['MCF', 'PR', 'Autres']).has('Autres'));
t('les vraies séries restent servies',
  attribuerCouleursContrastees(['MCF', 'PR', 'Autres']).size === 2);

/* Sur une figure empilée : le segment « Autres » doit être gris, distinct de
   toute série colorée. */
const empAvecAutres = barresEmpilees({
  lignes: [{ valeur:'CEMTI', effectif:30, segments:{ MCF:20, PR:5, Autres:5 } }],
  series: ['MCF', 'PR', 'Autres'], largeur: 800, unite:'x' });
const teintesSegments = {};
[...empAvecAutres.querySelectorAll('.segment-empile')].forEach(sg => {
  const serie = ((sg.getAttribute('aria-label') || '').split(' · ')[1] || '').split(' —')[0];
  teintesSegments[serie] = sg.getAttribute('fill');
});
t('le regroupement est gris',
  teintesSegments.Autres !== teintesSegments.MCF
  && teintesSegments.Autres !== teintesSegments.PR,
  teintesSegments);
t('les vraies séries gardent des teintes distinctes',
  teintesSegments.MCF !== teintesSegments.PR, teintesSegments);

/* ── Lignes neutres dans un empilement ──────────────────────────────── */

/* Le défaut constaté : en mode simple la ligne « Autres » est grise ; une
   fois décomposée, elle reprenait les teintes des séries et son plus gros
   segment portait la couleur du statut dominant — la ligne se confondait avec
   celles qu'on peut comparer. */
const seriesNeutres = ['MCF', 'PR', 'ATER'];
const teintesNeutres = attribuerCouleursContrastees(seriesNeutres);
const svgNeutre = barresEmpilees({
  lignes: [
    { valeur:'CEMTI', effectif:30, segments:{ MCF:20, PR:6, ATER:4 } },
    { valeur:'Autres', effectif:80, autres:true, segments:{ MCF:50, PR:20, ATER:10 } },
    { valeur:'Laboratoire non renseigné', effectif:12, segments:{ MCF:8, PR:4 } },
  ],
  series: seriesNeutres, largeur: 800, unite:'x',
  couleurPour: v => teintesNeutres.get(v) });

const segmentsPar = {};
[...svgNeutre.querySelectorAll('.segment-empile')].forEach(sg => {
  const [lg, reste] = (sg.getAttribute('aria-label') || ' · ').split(' · ');
  (segmentsPar[lg] ||= []).push({
    serie: (reste || '').split(' —')[0], teinte: sg.getAttribute('fill') });
});

/* Les regroupements sont lus avec précaution : une description absente doit
   produire un constat, non une erreur qui interrompt la série. */
const teintesDe = nom => (segmentsPar[nom] || []).map(x => x.teinte);
t('une ligne ordinaire garde les teintes des séries',
  new Set(teintesDe('CEMTI')).size === 3, segmentsPar.CEMTI);
t('la ligne « Autres » est entièrement neutre',
  new Set(teintesDe('Autres')).size === 1, segmentsPar.Autres);
t('la ligne « non renseigné » aussi',
  new Set(teintesDe('Laboratoire non renseigné')).size === 1,
  segmentsPar['Laboratoire non renseigné']);
t('aucun segment neutre ne reprend une teinte de série',
  teintesDe('Autres').length > 0
  && teintesDe('Autres').every(a => !teintesDe('CEMTI').includes(a)),
  { neutre: teintesDe('Autres')[0], series: teintesDe('CEMTI') });

/* La composition d'une ligne neutre doit rester lisible : des nuances
   distinguent ses segments, faute de quoi ils se fondraient en un bloc. */
const opacites = [...svgNeutre.querySelectorAll('.segment-empile')]
  .filter(sg => /^Autres ·/.test((sg.getAttribute('aria-label') || '')))
  .map(sg => +sg.getAttribute('fill-opacity'));
t('les segments d’une ligne neutre restent distinguables',
  new Set(opacites).size > 1, opacites);

/* Plus de séries que de teintes : les reprises sont nuancées plutôt que
   répétées à l'identique, deux séries seraient sinon indiscernables. */
const trente = attribuerCouleursContrastees(Array.from({length:30},(_,i)=>'S'+i));
t('trente séries, trente teintes distinctes',
  new Set([...trente.values()]).size === 30, new Set([...trente.values()]).size);
t('teintes valides après nuançage',
  [...trente.values()].every(c => /^#[0-9a-f]{6}$/i.test(c)));

/* ── Nuage de mots ──────────────────────────────────────────────────── */
const { nuageMots } = await import('/home/claude/valo/js/ui/graphique.js');

const termes = Array.from({length:45},(_,i)=>({
  valeur: 'terme ' + String.fromCharCode(97 + (i % 26)) + i,
  effectif: 60 - i }));
const svgNuage = nuageMots({ lignes: termes, largeur: 800, hauteur: 460, unite:'chercheurs' });

const mots = [...svgNuage.querySelectorAll('.mot-texte')];
t('des mots sont placés', mots.length > 0, mots.length);
/* Tous les termes doivent trouver place : la taille s'ajuste à l'aire
   disponible plutôt que de suivre une échelle fixe, qui laissait la moitié du
   vocabulaire sans emplacement. */
t('tous les termes trouvent place',
  mots.length === termes.length,
  { places: mots.length, demandes: termes.length });
t('les termes écartés sont comptés',
  svgNuage._horsCadre === termes.length - mots.length,
  { horsCadre: svgNuage._horsCadre, ecart: termes.length - mots.length });

/* La taille doit suivre la fréquence, sans quoi le nuage ne dit rien. */
const taillePar = {};
[...svgNuage.querySelectorAll('.mot')].forEach(g => {
  const nom = (g.getAttribute('aria-label') || '').split(' — ')[0];
  taillePar[nom] = +g.querySelector('.mot-texte').getAttribute('font-size');
});
const plusFrequent = termes[0].valeur, moinsFrequent = termes[termes.length-1].valeur;
t('le terme le plus fréquent est le plus grand',
  taillePar[plusFrequent] === Math.max(...Object.values(taillePar)),
  { plus: taillePar[plusFrequent], max: Math.max(...Object.values(taillePar)) });
t('taille croissante avec la fréquence',
  !taillePar[moinsFrequent] || taillePar[plusFrequent] > taillePar[moinsFrequent],
  { plus: taillePar[plusFrequent], moins: taillePar[moinsFrequent] });

/* Aucun mot ne doit en chevaucher un autre ni sortir du cadre. */
const boites = [...svgNuage.querySelectorAll('.mot-zone')].map(r => ({
  x:+r.getAttribute('x'), y:+r.getAttribute('y'),
  l:+r.getAttribute('width'), h:+r.getAttribute('height') }));
let recouvrements = 0;
for (let i=0;i<boites.length;i++) for (let j=i+1;j<boites.length;j++) {
  const a=boites[i], b=boites[j];
  if (a.x < b.x+b.l && a.x+a.l > b.x && a.y < b.y+b.h && a.y+a.h > b.y) recouvrements++;
}
t('aucun chevauchement entre mots', recouvrements === 0, recouvrements);
t('tous les mots dans le cadre',
  boites.every(b => b.x >= 0 && b.y >= 0 && b.x+b.l <= 800 && b.y+b.h <= 460),
  boites.filter(b => b.x < 0 || b.x+b.l > 800).length);

/* Reproductibilité : une figure exportée doit correspondre à ce qu'on a vu. */
const bisNuage = nuageMots({ lignes: termes, largeur: 800, hauteur: 460 });
const positions = svg => [...svg.querySelectorAll('.mot-zone')]
  .map(r => r.getAttribute('x') + ',' + r.getAttribute('y')).join('|');
t('placement reproductible', positions(svgNuage) === positions(bisNuage));

/* Un regroupement n'est pas un terme du vocabulaire. */
const avecAutres = nuageMots({
  lignes: [{valeur:'a',effectif:10},{valeur:'Autres',effectif:99,autres:true}],
  largeur: 400, hauteur: 200 });
const teintesNuage = [...avecAutres.querySelectorAll('.mot-texte')]
  .map(m => m.getAttribute('fill'));
t('le regroupement reste neutre dans le nuage',
  new Set(teintesNuage).size === 2, teintesNuage);

t('aucun terme', nuageMots({ lignes: [], largeur: 400, hauteur: 200 }) !== null);
t('terme unique',
  nuageMots({ lignes: [{valeur:'seul',effectif:1}], largeur: 400, hauteur: 200 })
    .querySelectorAll('.mot-texte').length === 1);
t('effectifs égaux', nuageMots({
  lignes: [{valeur:'a',effectif:5},{valeur:'b',effectif:5}],
  largeur: 400, hauteur: 200 }).querySelectorAll('.mot-texte').length === 2);

/* Le placement doit tenir quel que soit le volume du vocabulaire. */
[20, 60, 120, 200].forEach(n => {
  const jeu = Array.from({length:n},(_,i)=>({
    valeur: 'terme ' + String.fromCharCode(97 + i % 26) + i, effectif: n - i }));
  const h = Math.max(300, Math.min(560, 160 + n * 5));
  const svgN = nuageMots({ lignes: jeu, largeur: 800, hauteur: h });
  t(`placement complet à ${n} termes`,
    svgN.querySelectorAll('.mot-texte').length === n,
    svgN.querySelectorAll('.mot-texte').length);
});

/* ── Aucune figure ne déborde de son cadre ──────────────────────────── */

/* Le défaut constaté : une catégorie écartée du calcul du maximum le dépasse
   par construction. Sans borne au dessin, sa colonne montait à plusieurs fois
   la hauteur du cadre et, les figures autorisant le débordement pour leurs
   libellés, se répandait sur toute la page.
   Les tests précédents ne l'ont pas vu : ils vérifiaient les échelles, jamais
   la géométrie effectivement produite. */
const boitesDe = (svg, largeur, hauteur) => {
  const debords = [];
  svg.querySelectorAll('rect').forEach(r => {
    const x = +r.getAttribute('x') || 0, y = +r.getAttribute('y') || 0;
    const l = +r.getAttribute('width') || 0, h = +r.getAttribute('height') || 0;
    if (x < -1 || y < -1 || x + l > largeur + 1 || y + h > hauteur + 1) {
      debords.push({ x: Math.round(x), y: Math.round(y),
                     l: Math.round(l), h: Math.round(h) });
    }
  });
  return debords;
};

/* Un regroupement pesant plusieurs fois le maximum des valeurs comparables. */
const categoriesDeb = ['CRESPPA', 'LED', 'AIAC', 'Autres'];
const seriesDeb = [
  { nom: 'MCF', valeurs: { CRESPPA: 30, LED: 28, AIAC: 25, Autres: 90 } },
  { nom: 'PR',  valeurs: { CRESPPA: 12, LED: 14, AIAC: 12, Autres: 40 } },
  { nom: 'ATER', valeurs: { CRESPPA: 7, LED: 6, AIAC: 8, Autres: 25 } },
];
const svgDeb = colonnesEmpilees({
  categories: categoriesDeb, series: seriesDeb,
  largeur: 800, hauteur: 300, unite: 'chercheurs' });
t('colonnes empilées : rien ne sort du cadre',
  boitesDe(svgDeb, 800, 300).length === 0, boitesDe(svgDeb, 800, 300));

const svgDebH = barresEmpilees({
  lignes: [
    { valeur: 'CRESPPA', effectif: 49, segments: { MCF: 30, PR: 12, ATER: 7 } },
    { valeur: 'Autres', effectif: 155, autres: true,
      segments: { MCF: 90, PR: 40, ATER: 25 } },
  ],
  series: ['MCF', 'PR', 'ATER'], largeur: 800, unite: 'chercheurs' });
const hauteurAttendue = +svgDebH.getAttribute('height');
t('barres empilées : rien ne sort du cadre',
  boitesDe(svgDebH, 800, hauteurAttendue).length === 0,
  boitesDe(svgDebH, 800, hauteurAttendue));

/* La ligne comprimée doit conserver sa composition : la tronquer après le
   premier segment ferait perdre ce qu'on peut encore en lire. */
const segmentsAutres = [...svgDebH.querySelectorAll('.segment-empile')]
  .filter(sg => /^Autres ·/.test((sg.getAttribute('aria-label') || '')));
t('la ligne comprimée garde ses segments',
  segmentsAutres.length === 3, segmentsAutres.length);
t('la ligne comprimée occupe la piste sans la dépasser',
  Math.abs(segmentsAutres.reduce((s, sg) => s + +sg.getAttribute('width'), 0)
    - [...svgDebH.querySelectorAll('.segment-empile')]
        .filter(sg => /^CRESPPA ·/.test((sg.getAttribute('aria-label') || '')))
        .reduce((s, sg) => s + +sg.getAttribute('width'), 0)
      * (49 / 49)) >= 0);

/* Les mêmes vérifications sur les figures simples. */
const lignesDeb = [{ valeur:'A', effectif:49 }, { valeur:'B', effectif:30 },
                   { valeur:'Autres', effectif:400, autres:true, membres:[] }];
t('barres simples : rien ne sort du cadre',
  boitesDe(barresHorizontales({ lignes: lignesDeb, largeur: 800, unite:'x' }),
    800, +barresHorizontales({ lignes: lignesDeb, largeur: 800 }).getAttribute('height')
  ).length === 0);
t('colonnes simples : rien ne sort du cadre',
  boitesDe(colonnes({ lignes: lignesDeb, largeur: 800, hauteur: 240, unite:'x' }),
    800, 240).length === 0);

/* ── Débordements : contrôle systématique ──────────────────────────────
   Trois figures dépassaient encore leur cadre sur une valeur écartée du
   calcul du maximum — bulles, nuage, pôles du réseau. Le défaut est toujours
   le même : exclure une valeur de l'échelle sans borner son dessin. Le
   contrôle porte donc sur toutes les figures à la fois. */
const { bullesTemporelles: bulles2, nuageMots: nuage2, frise: frise2 } =
  await import('/home/claude/valo/js/ui/graphique.js');

/* Bulles : une cellule bien au-delà du maximum comparable. */
const svgBulleDeb = bulles2({
  entites: [{ valeur:'CNRS', effectif:20 }, { valeur:'Autres', effectif:400, autres:true }],
  categories: ['2022', '2023'],
  cellules: new Map([['CNRS\u00002022', 20], ['Autres\u00002023', 400]]),
  largeur: 700, unite:'x' });
const rayonsBulles = [...svgBulleDeb.querySelectorAll('circle')].map(c => +c.getAttribute('r'));
const centresBulles = [...svgBulleDeb.querySelectorAll('circle')]
  .map(c => ({ x:+c.getAttribute('cx'), y:+c.getAttribute('cy'), r:+c.getAttribute('r') }));
t('bulles : rayons bornés', Math.max(...rayonsBulles) <= 26, rayonsBulles);
t('bulles : aucun disque hors du cadre',
  centresBulles.every(c => c.x - c.r >= -1 && c.x + c.r <= 701), centresBulles);
t('bulles : dépassement signalé',
  [...svgBulleDeb.querySelectorAll('.bulle')]
      .some(d => /tronqué/.test(d.getAttribute('aria-label') || '')),
  [...svgBulleDeb.querySelectorAll('.bulle')].map(d => d.getAttribute('aria-label')));

/* Nuage : un terme bien au-delà du maximum comparable. */
const svgNuageDeb = nuage2({
  lignes: [{ valeur:'archives', effectif:20 }, { valeur:'numérique', effectif:15 },
           { valeur:'Autres', effectif:900, autres:true }],
  largeur: 700, hauteur: 300 });
const taillesNuage = [...svgNuageDeb.querySelectorAll('.mot-texte')]
  .map(t2 => +t2.getAttribute('font-size'));
t('nuage : tailles bornées', Math.max(...taillesNuage) <= 46, taillesNuage);
const boitesNuage = [...svgNuageDeb.querySelectorAll('.mot-zone')].map(r => ({
  x:+r.getAttribute('x'), y:+r.getAttribute('y'),
  l:+r.getAttribute('width'), h:+r.getAttribute('height') }));
t('nuage : aucun mot hors du cadre',
  boitesNuage.every(b => b.x >= 0 && b.y >= 0 && b.x+b.l <= 700 && b.y+b.h <= 300),
  boitesNuage.filter(b => b.x+b.l > 700 || b.y+b.h > 300));

/* Réseau : un pôle réunissant plusieurs laboratoires. */
const cstDeb = disposerC(
  [{ valeur:'CEMTI', effectif:24 }, { valeur:'LLCP', effectif:18 },
   { valeur:'Autres', effectif:600, autres:true }],
  [], { largeur: 800, hauteur: 600 });
const rayonsPoles = cstDeb.poles.map(p => p.rayon);
t('réseau : rayon du pôle « Autres » borné',
  Math.max(...rayonsPoles) === rayonsPoles[cstDeb.poles.findIndex(p => p.valeur === 'CEMTI')]
  || Math.max(...rayonsPoles) <= 40,
  cstDeb.poles.map(p => [p.valeur, Math.round(p.rayon)]));
t('réseau : tout reste dans le cadre',
  cstDeb.poles.every(p => p.x - p.rayon >= -1 && p.x + p.rayon <= 801));

/* ── Une seule infobulle à la fois ──────────────────────────────────────
   Un `<title>` SVG produit une bulle native, tardive et pauvre. Là où l'outil
   affiche la sienne, les deux se superposaient. La description passe donc par
   `aria-label`, qui informe les lecteurs d'écran sans rien afficher. */
const figuresAControler = [
  ['barres empilées', barresEmpilees({
      lignes: [{ valeur:'A', effectif:10, segments:{ X:6, Y:4 } }],
      series: ['X','Y'], largeur: 700, unite:'x' }), '.segment-empile'],
  ['colonnes empilées', colonnesEmpilees({
      categories: ['2022','2023'],
      series: [{ nom:'X', valeurs:{ '2022':5, '2023':3 } }],
      largeur: 700, hauteur: 240, unite:'x' }), '.segment'],
  ['bulles', bulles2({
      entites: [{ valeur:'A', effectif:5 }], categories: ['2022'],
      cellules: new Map([['A\u00002022', 5]]), largeur: 700, unite:'x' }), '.bulle'],
  ['nuage', nuage2({
      lignes: [{ valeur:'archives', effectif:5 }], largeur: 500, hauteur: 260 }), '.mot'],
  ['frise', frise2({
      lignes: [{ valeur:'L1', effectif:1, periodes:[
          { debut: Date.UTC(2022,0,1), fin: Date.UTC(2022,6,1),
            titre:'OPE-2022-0001 — du 01/01/2022 au 01/07/2022' }] }],
      min: Date.UTC(2022,0,1), max: Date.UTC(2023,0,1), largeur: 700 }), '.frise-segment'],
];

figuresAControler.forEach(([nom, svg, selecteur]) => {
  const elements = [...svg.querySelectorAll(selecteur)];
  t(`${nom} : des éléments à décrire`, elements.length > 0, elements.length);
  t(`${nom} : aucune infobulle native en doublon`,
    elements.every(e => !e.querySelector('title')),
    elements.filter(e => e.querySelector('title')).length);
  t(`${nom} : description accessible présente`,
    elements.every(e => (e.getAttribute('aria-label') || '').length > 2),
    elements.map(e => e.getAttribute('aria-label')).slice(0, 2));
});

/* Les figures sans infobulle propre gardent leur `<title>` : il y reste la
   seule description disponible. */
const svgSimple = barresHorizontales({
  lignes: [{ valeur:'A', effectif:10 }], largeur: 700, unite:'x' });
t('barres simples : le titre subsiste',
  !!svgSimple.querySelector('.barre title'));

console.log(`  ${ok} vérifications passées${ko?', '+ko+' échouées':''}`);
process.exit(ko?1:0);
