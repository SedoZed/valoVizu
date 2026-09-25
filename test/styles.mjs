/**
 * Vérifications statiques de la feuille de style.
 *
 * Motif de leur existence : jsdom accorde la priorité à l'attribut `hidden`
 * sur les règles de la feuille de style, alors qu'un vrai navigateur fait
 * l'inverse. Une règle comme `.modale { display: flex }` y laisse donc les
 * tests au vert tout en rendant l'application inutilisable dans le navigateur,
 * la fenêtre restant affichée en permanence.
 *
 * Ce fichier vérifie donc la feuille elle-même, sans passer par un moteur de
 * rendu. Ce n'est pas un substitut à l'inspection visuelle, mais cela attrape
 * la catégorie de fautes que le rendu simulé laisse passer.
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(racine, 'index.html'), 'utf8');
const css  = readFileSync(join(racine, 'css/style.css'), 'utf8');

let ok = 0, ko = 0;
const t = (nom, cond, detail) => {
    if (cond) ok++;
    else { ko++; console.log('  ÉCHEC :', nom, detail !== undefined ? `→ ${JSON.stringify(detail)}` : ''); }
};

console.log('\nFeuille de style');

/* ── 1. Les éléments masqués par attribut doivent le rester ──────────── */

/* Éléments portant `hidden` dans le document, avec leur id et leurs classes. */
const masquables = [...html.matchAll(/<(\w+)([^>]*\bhidden\b[^>]*)>/g)].map(m => {
    const attrs = m[2];
    return {
        balise:  m[1],
        id:      attrs.match(/\bid="([^"]+)"/)?.[1] || '',
        classes: (attrs.match(/\bclass="([^"]+)"/)?.[1] || '').split(/\s+/).filter(Boolean),
    };
});

t('des éléments sont masqués par attribut', masquables.length > 0, masquables.length);

/* Règles de la feuille qui imposent un `display`. */
const reglesDisplay = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter(m => /(^|[;\s])display\s*:/.test(m[2]))
    .map(m => ({ selecteur: m[1].trim().replace(/\s+/g, ' '), corps: m[2] }));

/* Une règle entre-t-elle en conflit avec un élément masquable ? */
const conflits = [];
masquables.forEach(el => {
    reglesDisplay.forEach(regle => {
        if (/\[hidden\]/.test(regle.selecteur)) return;      // c'est le garde-fou
        if (/display\s*:\s*none/.test(regle.corps)) return;  // masquer n'entre pas en conflit
        const vise = (el.id && regle.selecteur.includes('#' + el.id))
                  || el.classes.some(c => new RegExp(`\\.${c}(?![\\w-])`).test(regle.selecteur));
        if (vise) conflits.push({ element: el.id || el.balise, regle: regle.selecteur });
    });
});

/* Le garde-fou global rend ces conflits inoffensifs. */
const gardeFou = /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/.test(css);

t('garde-fou [hidden] présent', gardeFou,
  conflits.length ? `sans lui, ${conflits.length} conflit(s) : ${conflits.map(c => c.element + ' ← ' + c.regle).join(', ')}` : '');

if (!gardeFou) {
    t('aucune règle de disposition ne vise un élément masquable', conflits.length === 0, conflits);
}

/* ── 2. Cohérence des variables de couleur ──────────────────────────── */

const declarees = new Set([...css.matchAll(/--([\w-]+)\s*:/g)].map(m => m[1]));
const utilisees = new Set([...css.matchAll(/var\(\s*--([\w-]+)/g)].map(m => m[1]));
const manquantes = [...utilisees].filter(v => !declarees.has(v));
t('toutes les variables employées sont déclarées', manquantes.length === 0, manquantes);

/* ── 3. Les identifiants cités par le script existent dans le document ─ */

const scripts = ['js/app.js', 'js/ui/facettes.js', 'js/ui/legende.js',
                 'js/panels/indicateurs.js', 'js/panels/tableau.js']
    .map(f => readFileSync(join(racine, f), 'utf8')).join('\n');

/* Identifiants passés à $() ou getElementById avec une chaîne littérale. */
const cites = new Set([...scripts.matchAll(/\$\('([\w-]+)'\)|getElementById\('([\w-]+)'\)/g)]
    .map(m => m[1] || m[2]));
/* Ceux construits dynamiquement (gabarits) ne sont pas vérifiables ici. */
const presents = new Set([...html.matchAll(/\bid="([\w-]+)"/g)].map(m => m[1]));
const introuvables = [...cites].filter(id => !presents.has(id));
t('les identifiants employés par le script existent', introuvables.length === 0, introuvables);

/* ── 4. Sécurité : le tableau ne doit pas injecter de HTML non maîtrisé ─ */

/* Une valeur venant de la base ne doit jamais être interprétée comme du HTML.
   Les gabarits interpolés dans innerHTML sont donc proscrits ; on construit
   les nœuds et on affecte textContent. */
const modules = ['js/app.js', 'js/ui/facettes.js', 'js/ui/legende.js',
                 'js/panels/indicateurs.js', 'js/panels/tableau.js'];
const injections = [];
modules.forEach(f => {
    const src = readFileSync(join(racine, f), 'utf8');
    [...src.matchAll(/innerHTML\s*=\s*`[^`]*\$\{/g)]
        .forEach(m => injections.push(`${f} : ${m[0].trim()}`));
});
t('aucune interpolation dans innerHTML', injections.length === 0, injections);

/* ── 5. Thème sombre : variables et contrastes ──────────────────────── */

/* Toute variable de couleur définie pour le thème clair doit l'être aussi
   pour le thème sombre : une seule oubliée et un élément garde sa couleur
   claire sur fond foncé, souvent illisible. */
function variablesDuBloc(selecteur) {
    const m = css.match(new RegExp(`${selecteur}\\s*\\{([^}]*)\\}`));
    if (!m) return null;
    return new Set([...m[1].matchAll(/--([\w-]+)\s*:/g)].map(x => x[1]));
}

const varsClair  = variablesDuBloc(':root');
const varsSombre = variablesDuBloc('\\[data-theme="sombre"\\]');

t('thème sombre déclaré', !!varsSombre);

if (varsClair && varsSombre) {
    /* Les variables de mise en page (espacements, polices, rayons) n'ont pas
       à être redéfinies : seules les couleurs sont concernées. */
    const structure = new Set(['ecart', 'rayon', 'titre', 'corps', 'mono']);
    const couleurs = [...varsClair].filter(v => !structure.has(v));
    const oubliees = couleurs.filter(v => !varsSombre.has(v));
    t('toutes les couleurs redéfinies en sombre', oubliees.length === 0, oubliees);
}

/* Contraste : rapport de luminance entre texte et fond.
   Le seuil de 4,5 est celui du niveau AA pour un texte de taille courante. */
function luminance(hex) {
    const c = hex.replace('#', '');
    const n = c.length === 3 ? c.split('').map(x => x + x) : c.match(/../g);
    const [r, g, b] = n.map(x => {
        const v = parseInt(x, 16) / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a, b) {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function valeurVar(selecteur, nom) {
    const bloc = css.match(new RegExp(`${selecteur}\\s*\\{([^}]*)\\}`));
    if (!bloc) return null;
    const m = bloc[1].match(new RegExp(`--${nom}\\s*:\\s*(#[0-9A-Fa-f]{3,6})`));
    return m ? m[1] : null;
}

[[':root', 'clair'], ['\\[data-theme="sombre"\\]', 'sombre']].forEach(([sel, nom]) => {
    const papier = valeurVar(sel, 'papier');
    const carte  = valeurVar(sel, 'carte');
    const encre  = valeurVar(sel, 'encre');
    const encre2 = valeurVar(sel, 'encre-2');
    const signal = valeurVar(sel, 'signal');
    if (!papier || !carte || !encre) { t(`couleurs de base présentes (${nom})`, false); return; }

    t(`texte lisible sur la carte (${nom})`,
      contraste(encre, carte) >= 4.5, +contraste(encre, carte).toFixed(2));
    t(`texte lisible sur le fond (${nom})`,
      contraste(encre, papier) >= 4.5, +contraste(encre, papier).toFixed(2));
    t(`texte secondaire lisible (${nom})`,
      contraste(encre2, carte) >= 4.5, +contraste(encre2, carte).toFixed(2));
    t(`couleur de signal lisible (${nom})`,
      contraste(signal, carte) >= 3, +contraste(signal, carte).toFixed(2));
});

/* Les couleurs des séries doivent se détacher des deux fonds : elles sont
   communes aux deux thèmes puisque définies dans le module des figures. */
const graphique = readFileSync(join(racine, 'js/ui/graphique.js'), 'utf8');
/* Seules les couleurs de la palette sont concernées : le fichier contient
   aussi des couleurs de repli, employées uniquement hors navigateur. */
const blocPalette = graphique.match(/PALETTE_SERIES\s*=\s*\[([^\]]*)\]/);
const palette = blocPalette
    ? [...blocPalette[1].matchAll(/'(#[0-9A-Fa-f]{6})'/g)].map(m => m[1]) : [];
t('palette de séries définie', palette.length >= 5, palette.length);
['#FFFFFF', '#1C2226'].forEach(fond => {
    const faibles = palette.filter(c => contraste(c, fond) < 2.2);
    t(`palette visible sur ${fond}`, faibles.length === 0, faibles);
});

/* ── 6. Le contenu zoomable doit être découpé ───────────────────────── */

/* Le réseau est zoomable : sans découpe, son contenu agrandi déborderait du
   panneau et recouvrirait le reste de la page. La règle générale des figures
   autorise au contraire le débordement, pour que les libellés dépassent
   légèrement du cadre. */
const regleReseau = css.match(/\.figure-constellation\s*\{([^}]*)\}/);
t('le réseau découpe son contenu',
  regleReseau && /overflow\s*:\s*hidden/.test(regleReseau[1]),
  regleReseau ? regleReseau[1].trim() : 'règle absente');

/* ── 7. Aucune instance désignée dans le code ──────────────────────────
   Une adresse codée en dur se retrouve dans le code publié et y désigne une
   instance qui ne regarde personne d'autre. Les exemples des messages doivent
   eux-mêmes pointer vers un domaine fictif. */
const sources = ['js/core/omeka.js', 'js/app.js', 'index.html']
    .map(f => readFileSync(join(racine, f), 'utf8')).join('\n');
const domaines = [...sources.matchAll(/https?:\/\/([\w.-]+)/g)]
    .map(m => m[1])
    .filter(d => !/^(exemple\.|localhost|fonts\.|www\.w3\.org|cdnjs\.)/.test(d));
t('aucune instance réelle citée dans le code', domaines.length === 0, [...new Set(domaines)]);

/* ── 8. Charte graphique de l'établissement ────────────────────────────
   La charte impose le respect des contrastes d'accessibilité et réserve le
   soulignement aux liens hypertextes. Les couleurs du logotype primaire sont
   celles du document officiel. */
const CHARTE = { Poppy: '#E30F1B', Raspberry: '#AE164E',
                 Purple: '#7B206B', Maroon: '#75151F' };

t('la couleur de signal vient de la charte',
  valeurVar(':root', 'signal')?.toUpperCase() === CHARTE.Raspberry,
  valeurVar(':root', 'signal'));
t('la couleur d’avertissement vient de la charte',
  valeurVar(':root', 'alerte')?.toUpperCase() === CHARTE.Poppy,
  valeurVar(':root', 'alerte'));
t('les teintes de la charte figurent dans la palette des figures',
  [CHARTE.Poppy, CHARTE.Raspberry].every(c => graphique.toUpperCase().includes(c)));
t('la typographie de l’identité est employée',
  /--titre:\s*"Poppins"/.test(css) && /--corps:\s*"Poppins"/.test(css));
t('Poppins est chargée', /family=Poppins/.test(html));

/* Le soulignement est réservé aux liens : aucun autre élément ne doit en
   porter. Les liens de l'outil sont des boutons de classe « lien ». */
const soulignes = [...css.matchAll(/([^{}]+)\{([^}]*text-decoration\s*:\s*underline[^}]*)\}/g)]
    .map(m => m[1].trim().replace(/\s+/g, ' '))
    .filter(sel => !/\.lien|\.mot|a[:.\s]|\ba\b/.test(sel));
t('soulignement réservé aux liens', soulignes.length === 0, soulignes);

console.log(`  ${ok} vérifications passées`);
console.log(`\n${ok} passées, ${ko} échouées\n`);
process.exit(ko ? 1 : 0);
