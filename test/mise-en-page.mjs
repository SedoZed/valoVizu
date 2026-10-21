/**
 * Vérifications de mise en page, dans un vrai navigateur.
 *
 * Pourquoi un fichier à part
 * --------------------------
 * jsdom n'a pas de moteur de rendu : `getBoundingClientRect` y renvoie des
 * zéros. Aucune des vérifications des autres suites ne peut donc voir qu'un
 * élément déborde, est écrêté, ou déplace ses voisins — et c'est exactement
 * ainsi qu'un menu déroulant cassé a pu être livré avec tout au vert : il
 * s'écrêtait dans l'`overflow: hidden` du bandeau, dont il ne laissait voir
 * que la première entrée, et la mise au point de son premier lien faisait
 * défiler le bandeau, qui sautait de vingt pixels.
 *
 * Ces vérifications demandent Playwright, qui n'est pas une dépendance de
 * l'outil. Faute de l'y trouver, le fichier passe son tour en le disant
 * plutôt qu'en échouant : `tout.sh` doit rester exécutable avec Node seul.
 *
 *     npm install --no-save playwright   (puis npx playwright install chromium)
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ── Playwright, ou rien ─────────────────────────────────────────────── */
let chromium = null;
for (const ou of ['playwright', 'playwright-core',
                  '/home/claude/.npm-global/lib/node_modules/playwright/index.js']) {
    try {
        const mod = await import(ou);
        chromium = (mod.chromium || mod.default?.chromium) ?? null;
        if (chromium) break;
    } catch { /* on essaie le suivant */ }
}
if (!chromium) {
    console.log('\nMise en page');
    console.log('  passé — Playwright absent (npm install --no-save playwright)');
    process.exit(0);
}

/* ── Serveur statique minimal ────────────────────────────────────────── */
const TYPES = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml', '.json': 'application/json',
};
const serveur = http.createServer((req, res) => {
    const demande = decodeURIComponent(req.url.split('?')[0]);
    const cible = path.join(RACINE, demande === '/' ? '/index.html' : demande);
    /* Rien hors du dossier de l'outil. */
    if (!cible.startsWith(RACINE) || !fs.existsSync(cible) || fs.statSync(cible).isDirectory()) {
        res.writeHead(404); res.end('non trouvé'); return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(cible)] || 'application/octet-stream' });
    fs.createReadStream(cible).pipe(res);
});
await new Promise(ok => serveur.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${serveur.address().port}`;

let ok = 0, ko = 0;
const t = (nom, cond, detail) => {
    if (cond) ok++;
    else { ko++; console.log('  ÉCHEC :', nom, detail !== undefined ? JSON.stringify(detail) : ''); }
};

const navigateur = await chromium.launch();
const page = await navigateur.newPage({ viewport: { width: 1440, height: 900 } });

await page.addInitScript(() => {
    localStorage.setItem('valo_config', JSON.stringify({ api: 'https://exemple.test/api' }));
    localStorage.setItem('valo_preferences', JSON.stringify({
        outils: [
            { nom: 'validExpertises', url: 'https://exemple.test/validExpertises/' },
            { nom: 'cleanKeywords', url: 'https://exemple.test/validKeyword/' },
        ],
    }));
});
/* L'API n'a pas à répondre : seule la mise en page du bandeau est en cause.
   La requête est coupée net pour que l'écran d'erreur paraisse tout de suite
   au lieu d'arriver au milieu des mesures. */
await page.route('**/exemple.test/**', r => r.abort());
await page.goto(`${base}/index.html`, { waitUntil: 'load' });
await page.waitForSelector('#outils-ouvrir');
await page.waitForTimeout(300);
await page.evaluate(() => { const v = document.getElementById('voile'); if (v) v.hidden = true; });

console.log('\nMise en page');

const positions = () => page.evaluate(() => {
    const inner = document.querySelector('.bandeau-inner');
    return {
        scrollTop: document.querySelector('.bandeau').scrollTop,
        enfants: [...inner.children].map(c => Math.round(c.getBoundingClientRect().y)),
    };
});

const avant = await positions();
await page.click('#outils-ouvrir');
await page.waitForTimeout(150);
const apres = await positions();

/* Le symptôme tel qu'il se voyait : le bandeau sautait de vingt pixels. */
t('ouvrir le menu ne déplace aucun élément du bandeau',
  apres.enfants.every((y, i) => y === avant.enfants[i]),
  { avant: avant.enfants, apres: apres.enfants });
t('ouvrir le menu ne fait pas défiler le bandeau',
  apres.scrollTop === 0, apres.scrollTop);

const panneau = await page.evaluate(() => {
    const p = document.querySelector('.outils-panneau');
    if (!p) return null;
    const entrees = [...p.querySelectorAll('.outils-lien')];
    /* Une entrée écrêtée est encore dans le document mais n'est plus
       cliquable : c'est ce que mesure `elementFromPoint`, et c'est la seule
       mesure qui distingue « présent » de « utilisable ». */
    const atteignables = entrees.filter(e => {
        const r = e.getBoundingClientRect();
        const dessus = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return dessus && (e === dessus || e.contains(dessus));
    });
    const r = p.getBoundingClientRect();
    return {
        parent: p.parentElement.tagName,
        dansLeBandeau: !!p.closest('.bandeau'),
        position: getComputedStyle(p).position,
        entrees: entrees.length, atteignables: atteignables.length,
        dansLeCadre: r.top >= 0 && r.left >= 0
            && r.bottom <= window.innerHeight && r.right <= window.innerWidth,
    };
});

t('le panneau existe une fois ouvert', !!panneau);
if (panneau) {
    t('le panneau vit dans le body, hors du bandeau',
      panneau.parent === 'BODY' && !panneau.dansLeBandeau, panneau);
    t('le panneau est posé en coordonnées de fenêtre',
      panneau.position === 'fixed', panneau.position);
    t('toutes les entrées sont atteignables',
      panneau.entrees > 1 && panneau.atteignables === panneau.entrees, panneau);
    t('le panneau tient entièrement dans le cadre', panneau.dansLeCadre, panneau);
}

/* Posé en coordonnées de fenêtre, le panneau ne suit pas la page : il doit se
   refermer plutôt que de flotter en arrière du bouton. */
const defilement = await page.evaluate(() => {
    /* Sans contenu assez haut, la page ne défile pas et la vérification ne
       vérifierait rien : on lui en donne de quoi défiler. */
    const cale = document.createElement('div');
    cale.style.height = '2000px';
    document.body.appendChild(cale);
    window.scrollBy(0, 300);
    return window.scrollY;
});
await page.waitForTimeout(150);
t('la page a bien défilé pendant l’essai', defilement > 0, defilement);
t('un défilement referme le menu',
  await page.evaluate(() => !document.querySelector('.outils-panneau')));

await navigateur.close();
serveur.close();

console.log(`  ${ok} vérifications passées`);
if (ko) { console.log(`  ${ko} échouées`); process.exit(1); }
