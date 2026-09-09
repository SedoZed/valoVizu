/**
 * ui/physique.js
 * Simulation de forces, reprise de celle de la première version de l'outil.
 *
 * Celle-ci s'appuyait sur d3-force. Les réglages sont repris tels quels — ils
 * avaient été éprouvés sur les données réelles :
 *
 *   liens        distance 50, intensité 0.45
 *   répulsion    -35 par chercheur, -420 par pôle, portée 180
 *   centrage     0.08
 *   collision    rayon 8 par chercheur, 28 par pôle
 *   groupement   0.28 vers le pôle principal
 *   refroidissement 0.025, freinage 0.4
 *
 * Deux choix de d3 méritent d'être signalés, parce que c'est leur absence qui
 * rendait ma version précédente inférieure.
 *
 * La **répulsion porte entre tous les nœuds**, un arbre quaternaire ramenant
 * le coût à une valeur praticable. Une grille de voisinage, comme j'en avais
 * employé une, ne fait travailler que les nœuds proches : deux groupes
 * éloignés ne se repoussent alors pas du tout et ne trouvent jamais leur place
 * l'un par rapport à l'autre.
 *
 * La **force des liens est pondérée par le degré**. Un pôle relié à quarante
 * chercheurs bouge quarante fois moins que chacun d'eux, ce qui donne des
 * groupes stables autour de pôles fermes. Tirer les deux extrémités également,
 * comme je le faisais, secoue les pôles et brouille l'ensemble.
 *
 * Rien ne confine les nœuds dans un cadre. Le confinement que j'avais ajouté
 * plaquait les nœuds contre les bords dès que la disposition s'étendait ; la
 * vue s'ajuste au contenu, ce qui est le bon niveau pour traiter la question.
 */
import { construireArbre, accumuler, parcourir } from './quadtree.js';

/* Écart infime appliqué à deux nœuds exactement superposés : sans direction
   de séparation, aucune force ne peut les écarter. Déterministe, pour que la
   simulation reste reproductible. */
let _tirage = 1;
function frisson() {
    _tirage = (_tirage * 1103515245 + 12345) % 2147483648;
    return (_tirage / 2147483648 - 0.5) * 1e-6;
}
/* Le générateur est remis à zéro à chaque simulation : partagé entre
   plusieurs, il ferait dépendre chaque disposition de celles calculées
   auparavant, et deux affichages des mêmes données différeraient. */
function reinitialiserFrisson() { _tirage = 1; }

const THETA2 = 0.81;            // 0.9² : seuil d'approximation de Barnes-Hut
const DISTANCE_MIN2 = 1;

export class Simulation {
    /**
     * @param noeuds [{ id, x, y, charge?, rayonCollision?, fixe? }]
     * @param liens  [{ source, cible }] — identifiants
     */
    constructor(noeuds, liens, options = {}) {
        const {
            centreX = 400, centreY = 300,
            distanceLien = 50, intensiteLien = 0.45,
            porteeRepulsion = 180,
            centrage = 0.08,
            intensiteCollision = 0.7,
            groupement = 0.28, groupeDe = null,
            refroidissement = 0.025, freinage = 0.4,
            alphaMin = 0.001,
        } = options;

        this.noeuds = noeuds;
        this.index = new Map(noeuds.map(n => [n.id, n]));
        this.liens = liens
            .map(l => ({ source: this.index.get(l.source), cible: this.index.get(l.cible) }))
            .filter(l => l.source && l.cible);

        Object.assign(this, {
            centreX, centreY, distanceLien, intensiteLien, centrage,
            intensiteCollision, groupement, groupeDe,
            refroidissement, alphaMin,
            porteeRepulsion2: porteeRepulsion * porteeRepulsion,
            freinage: 1 - freinage,
        });

        this.noeuds.forEach(n => {
            n.vx = n.vx || 0;
            n.vy = n.vy || 0;
            n.charge = n.charge ?? -35;
            n.rayonCollision = n.rayonCollision ?? 8;
        });

        /* Pondération des liens par le degré.
           Un lien tire d'autant moins un nœud que celui-ci en porte d'autres :
           c'est ce qui rend les pôles fermes et les membres mobiles. */
        const degre = new Map(noeuds.map(n => [n, 0]));
        this.liens.forEach(l => {
            degre.set(l.source, degre.get(l.source) + 1);
            degre.set(l.cible, degre.get(l.cible) + 1);
        });
        this.liens.forEach(l => {
            const ds = degre.get(l.source), dc = degre.get(l.cible);
            l.biais = ds / (ds + dc);
        });

        reinitialiserFrisson();
        this.alpha = 1;
        this.alphaCible = 0;
        this.enCours = false;
        this._image = null;
        this._surTick = null;
        this._surRepos = null;
    }

    surTick(fn) { this._surTick = fn; return this; }
    surRepos(fn) { this._surRepos = fn; return this; }

    /* ── Forces ─────────────────────────────────────────────────────── */

    /** Répulsion entre tous les nœuds, approchée par quadrants. */
    _repulsion(alpha) {
        const arbre = construireArbre(this.noeuds);
        if (!arbre) return;
        accumuler(arbre, n => n.charge);

        this.noeuds.forEach(noeud => {
            parcourir(arbre, quadrant => {
                if (!quadrant.valeur) return true;
                let dx = quadrant.cx - noeud.x;
                let dy = quadrant.cy - noeud.y;
                const largeur = quadrant.x1 - quadrant.x0;
                let l = dx * dx + dy * dy;

                /* Quadrant assez lointain au regard de sa taille : il est
                   traité comme un point unique, sans descendre plus bas. */
                if (largeur * largeur / THETA2 < l) {
                    if (l < this.porteeRepulsion2) {
                        if (dx === 0) { dx = frisson(); l += dx * dx; }
                        if (dy === 0) { dy = frisson(); l += dy * dy; }
                        if (l < DISTANCE_MIN2) l = Math.sqrt(DISTANCE_MIN2 * l);
                        noeud.vx += dx * quadrant.valeur * alpha / l;
                        noeud.vy += dy * quadrant.valeur * alpha / l;
                    }
                    return true;
                }

                /* Quadrant proche : on descend, sauf s'il est déjà une
                   feuille, auquel cas on applique nœud par nœud. */
                if (quadrant.enfants || l >= this.porteeRepulsion2) return false;

                quadrant.feuille?.forEach(autre => {
                    if (autre === noeud) return;
                    let ax = autre.x - noeud.x, ay = autre.y - noeud.y;
                    let al = ax * ax + ay * ay;
                    if (ax === 0) { ax = frisson(); al += ax * ax; }
                    if (ay === 0) { ay = frisson(); al += ay * ay; }
                    if (al < DISTANCE_MIN2) al = Math.sqrt(DISTANCE_MIN2 * al);
                    noeud.vx += ax * autre.charge * alpha / al;
                    noeud.vy += ay * autre.charge * alpha / al;
                });
                return true;
            });
        });
    }

    /** Ressorts, appliqués sur les positions anticipées. */
    _liens(alpha) {
        this.liens.forEach(({ source, cible, biais }) => {
            let dx = cible.x + cible.vx - source.x - source.vx;
            let dy = cible.y + cible.vy - source.y - source.vy;
            if (dx === 0) dx = frisson();
            if (dy === 0) dy = frisson();
            const d = Math.sqrt(dx * dx + dy * dy);
            const l = (d - this.distanceLien) / d * alpha * this.intensiteLien;
            dx *= l; dy *= l;
            cible.vx -= dx * biais;
            cible.vy -= dy * biais;
            source.vx += dx * (1 - biais);
            source.vy += dy * (1 - biais);
        });
    }

    /** Résolution des recouvrements, sur les positions anticipées. */
    _collisions() {
        const anticipe = this.noeuds.map(n => ({
            n, x: n.x + n.vx, y: n.y + n.vy, r: n.rayonCollision,
        }));
        const arbre = construireArbre(anticipe, p => p.x, p => p.y);
        if (!arbre) return;

        anticipe.forEach(a => {
            const ri = a.r;
            const portee = ri + 40;   // rayon maximal plausible d'un voisin
            parcourir(arbre, quadrant => {
                /* Quadrant hors de portée : inutile d'y descendre. */
                if (a.x + portee < quadrant.x0 || a.x - portee > quadrant.x1
                 || a.y + portee < quadrant.y0 || a.y - portee > quadrant.y1) return true;
                if (!quadrant.feuille) return false;

                quadrant.feuille.forEach(b => {
                    if (b === a || b.n === a.n) return;
                    let dx = a.x - b.x, dy = a.y - b.y;
                    let l = dx * dx + dy * dy;
                    const r = ri + b.r;
                    if (l >= r * r) return;
                    if (dx === 0) { dx = frisson(); l += dx * dx; }
                    if (dy === 0) { dy = frisson(); l += dy * dy; }
                    const d = Math.sqrt(l);
                    const correction = (r - d) / d * this.intensiteCollision;
                    /* La correction se répartit en raison inverse des aires :
                       un gros nœud cède moins qu'un petit. */
                    const partA = (b.r * b.r) / (ri * ri + b.r * b.r);
                    a.n.vx += (dx * correction) * partA;
                    a.n.vy += (dy * correction) * partA;
                    b.n.vx -= (dx * correction) * (1 - partA);
                    b.n.vy -= (dy * correction) * (1 - partA);
                });
                return true;
            });
        });
    }

    /** Recentrage : agit sur les positions, non sur les vitesses. */
    _centrage() {
        if (!this.centrage || !this.noeuds.length) return;
        let sx = 0, sy = 0;
        this.noeuds.forEach(n => { sx += n.x; sy += n.y; });
        sx = (sx / this.noeuds.length - this.centreX) * this.centrage;
        sy = (sy / this.noeuds.length - this.centreY) * this.centrage;
        this.noeuds.forEach(n => { n.x -= sx; n.y -= sy; });
    }

    /** Rappel de chaque membre vers son pôle. */
    _groupement(alpha) {
        if (!this.groupement || !this.groupeDe) return;
        const k = alpha * this.groupement;
        this.noeuds.forEach(n => {
            const pole = this.groupeDe(n);
            if (!pole || pole === n) return;
            n.vx += (pole.x - n.x) * k;
            n.vy += (pole.y - n.y) * k;
        });
    }

    /* ── Boucle ─────────────────────────────────────────────────────── */

    pas() {
        this.alpha += (this.alphaCible - this.alpha) * this.refroidissement;

        this._repulsion(this.alpha);
        this._liens(this.alpha);
        this._groupement(this.alpha);
        this._collisions();

        /* Le recentrage agit sur les positions, y compris celles des nœuds
           immobilisés : ceux-ci dériveraient donc sous le doigt qui les
           tient. On les remet en place après coup. */
        const figes = this.noeuds.filter(n => n.fixe).map(n => ({ n, x: n.x, y: n.y }));
        this._centrage();
        figes.forEach(({ n, x, y }) => { n.x = x; n.y = y; });

        let deplacement = 0;
        this.noeuds.forEach(n => {
            if (n.fixe) { n.vx = 0; n.vy = 0; return; }
            n.vx *= this.freinage;
            n.vy *= this.freinage;
            n.x += n.vx;
            n.y += n.vy;
            deplacement += Math.abs(n.vx) + Math.abs(n.vy);
        });
        return deplacement / Math.max(this.noeuds.length, 1);
    }

    demarrer() {
        if (this.enCours) return this;
        if (typeof requestAnimationFrame !== 'function') {
            this.stabiliser();
            this._surTick?.();
            this._surRepos?.();
            return this;
        }
        this.enCours = true;
        const boucle = () => {
            if (!this.enCours) return;
            this.pas();
            this._surTick?.();
            if (this.alpha < this.alphaMin) {
                this.arreter();
                this._surRepos?.();
                return;
            }
            this._image = requestAnimationFrame(boucle);
        };
        this._image = requestAnimationFrame(boucle);
        return this;
    }

    arreter() {
        this.enCours = false;
        if (this._image && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this._image);
        }
        this._image = null;
    }

    /** Relance le mouvement après une intervention de l'utilisateur. */
    reveiller(alpha = 0.3) {
        this.alpha = Math.max(this.alpha, alpha);
        if (!this.enCours && typeof requestAnimationFrame === 'function') this.demarrer();
    }

    /** Déroule la simulation sans animation. */
    stabiliser(maximum = 300) {
        for (let i = 0; i < maximum && this.alpha >= this.alphaMin; i++) this.pas();
        return this;
    }

    /** Déplace le point de rappel du centrage. */
    recentrer(x, y) {
        this.centreX = x;
        this.centreY = y;
        return this;
    }
}

/* ─────────────────────────────────────────────────────────────────────────
   Déplacement à la souris
───────────────────────────────────────────────────────────────────────── */

export function rendreDeplacable(element, noeud, svg, simulation) {
    if (typeof svg.createSVGPoint !== 'function') return;   // hors navigateur
    let actif = false;
    /* Un déplacement se termine par un clic, que le navigateur émet quoi
       qu'il arrive. Sans précaution, relâcher un pôle après l'avoir traîné
       déclencherait le filtrage : le geste de rangement se confondrait avec
       celui de sélection. */
    let depart = null;
    let deplace = false;
    const seuil = 4;

    /* La conversion doit passer par la matrice du groupe transformé, non par
       celle du <svg>. Les nœuds vivent dans ce groupe, que le zoom et le
       cadrage automatique déplacent et redimensionnent : convertir au niveau
       du <svg> revient à ignorer cette transformation, et le nœud saisi saute
       vers le centre au lieu de suivre le curseur. */
    const versSvg = evenement => {
        const point = svg.createSVGPoint();
        point.x = evenement.clientX;
        point.y = evenement.clientY;
        const repere = svg._racine || svg;
        const matrice = repere.getScreenCTM?.() || svg.getScreenCTM();
        return matrice ? point.matrixTransform(matrice.inverse()) : { x: 0, y: 0 };
    };

    element.style.cursor = 'grab';

    element.addEventListener('pointerdown', e => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        actif = true;
        deplace = false;
        depart = { x: e.clientX, y: e.clientY };
        noeud.fixe = true;
        try { element.setPointerCapture?.(e.pointerId); } catch { /* sans capture */ }
        element.style.cursor = 'grabbing';
        simulation.reveiller();
        e.preventDefault();
    });

    element.addEventListener('pointermove', e => {
        if (!actif) return;
        if (depart && Math.hypot(e.clientX - depart.x, e.clientY - depart.y) > seuil) {
            deplace = true;
        }
        const p = versSvg(e);
        noeud.x = p.x; noeud.y = p.y;
        noeud.vx = 0; noeud.vy = 0;
        simulation.reveiller(0.2);
    });

    const relacher = e => {
        if (!actif) return;
        actif = false;
        noeud.fixe = false;
        element.style.cursor = 'grab';
        try { element.releasePointerCapture(e.pointerId); } catch { /* déjà relâché */ }
        simulation.reveiller(0.2);

        /* Le clic qui suit est signalé par un drapeau plutôt que par une
           interception : `stopPropagation` ne suspend pas les autres
           écouteurs du même élément, et l'ordre d'appel dépend de l'ordre
           d'enregistrement. */
        if (deplace) {
            element.__glissement = true;
            setTimeout(() => { element.__glissement = false; }, 0);
        }
        deplace = false;
        depart = null;
    };
    element.addEventListener('pointerup', relacher);
    element.addEventListener('pointercancel', relacher);
}

/** Un clic vient-il d'être précédé d'un glissement ? */
export function issuDunGlissement(element) {
    return !!element?.__glissement;
}
