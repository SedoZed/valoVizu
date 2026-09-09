/**
 * panels/reseau.js
 * Le réseau des chercheurs autour de leurs pôles de rattachement.
 *
 * Cette figure répond à des questions que ni un histogramme ni une matrice ne
 * traitent : quels pôles pèsent le plus, lesquels sont voisins, et surtout qui
 * relève de plusieurs d'entre eux. Ces chercheurs à cheval sont les liens
 * entre groupes ; un tableau les compte, une figure les montre.
 *
 * Elle n'a de sens qu'en présence d'individus identifiables — d'où sa présence
 * côté chercheurs seulement. Côté opérations, chaque enregistrement porte
 * plusieurs partenaires et plusieurs laboratoires : la structure n'est plus en
 * étoiles, et c'est le diagramme de flux qui convient.
 */
import { champ, UNITE } from '../core/champs.js';
import { preferences } from '../core/preferences.js';
import { attribuerCouleurs } from '../ui/graphique.js';
import { valeursVisibles, effectifs } from '../core/selection.js';
import { regrouper, LIBELLE_AUTRES } from '../core/groupe.js';
import { disposerConstellation, dessinerConstellation, majPositions,
         activerZoom, ajusterNoms, ajusterVue } from '../ui/constellation.js';
import { Simulation, rendreDeplacable } from '../ui/physique.js';

/* Champs pouvant servir de pôle : ceux qui regroupent, non ceux qui
   identifient. Grouper les chercheurs par leur propre nom n'aurait aucun sens. */
const POLES = ['labo', 'domaine', 'cnu', 'statut'];

export class Reseau {
    constructor(hote, options) {
        this.hote = hote;
        this.o = options;
        this.pole = 'labo';
        /* Tous les pôles par défaut : les regrouper d'emblée masque
           justement ce que la figure sert à montrer, la répartition entre
           laboratoires. Le réglage reste disponible si l'image se charge. */
        this.detail = 0;
        this.surbrillance = null;
        this._echelleMonde = 1;
        /* Deux dispositions. « Libre » relaxe le placement par des forces et
           laisse déplacer les nœuds ; « rangée » s'en tient au placement
           calculé, immobile et strictement reproductible — préférable pour
           une figure destinée à être exportée. */
        /* Le pavage place déjà les groupes sans chevauchement et range les
           membres en couronnes régulières : la simulation n'a plus rien à
           corriger et brouillerait cet ordre. Elle reste offerte pour qui
           veut déplacer les groupes à la main. */
        this.disposition = 'libre';
        this.simulation = null;
    }

    /** Arrête toute animation en cours : le panneau peut être redessiné à
        chaque changement de filtre, et deux simulations concurrentes se
        disputeraient les mêmes nœuds. */
    arreter() {
        this.simulation?.arreter();
        this.simulation = null;
    }

    rendre(rows) {
        const source = this.o.source();
        const etat = this.o.etat();
        this.arreter();
        this.hote.innerHTML = '';

        if (source !== 'ec') return;

        const tete = document.createElement('div');
        tete.className = 'panneau-tete';
        const h = document.createElement('h2');
        h.textContent = 'Réseau des chercheurs';
        tete.appendChild(h);
        tete.appendChild(this._reglages(rows));
        this.hote.appendChild(tete);

        const explication = document.createElement('p');
        explication.className = 'note';
        explication.textContent = 'Chaque point est un chercheur, rangé autour de son pôle '
            + 'de rattachement. Les points colorés relèvent de plusieurs pôles et se '
            + 'placent entre eux : ce sont les liens entre groupes. Cliquez un pôle '
            + 'pour filtrer le tableau de bord.';
        this.hote.appendChild(explication);

        const corps = document.createElement('div');
        corps.className = 'figure-corps';
        this.hote.appendChild(corps);

        if (!rows.length) {
            corps.innerHTML = '<p class="note">Aucun chercheur dans la sélection.</p>';
            return;
        }

        const def = champ(source, this.pole);
        const comptes = effectifs(rows, source, this.pole, etat);
        if (!Object.keys(comptes).length) {
            corps.innerHTML = '<p class="note">Aucune valeur renseignée pour ce pôle.</p>';
            return;
        }

        const groupes = regrouper(comptes, {
            nb: this.detail, epinglees: etat.epinglees?.[this.pole],
        });
        const retenus = new Set(groupes.lignes.filter(l => !l.autres).map(l => l.valeur));

        /* Les chercheurs des pôles regroupés sont rattachés à « Autres » :
           les retirer de la figure fausserait les effectifs affichés. */
        const poles = groupes.lignes.map(l => ({ valeur: l.valeur, effectif: l.effectif }));

        const individus = rows.map(rec => {
            const brutes = valeursVisibles(rec, source, this.pole, etat);
            const attaches = [...new Set(brutes.map(v =>
                retenus.has(v) ? v : (groupes.regroupees ? LIBELLE_AUTRES : v)))];
            return {
                id: String(rec.id),
                libelle: rec.nomComplet || rec.titre || `#${rec.id}`,
                poles: attaches.filter(v => poles.some(p => p.valeur === v)),
                record: rec,
            };
        });

        const largeur = Math.max(520, this.hote.clientWidth || 900);
        /* Le cadre doit laisser respirer les groupes : trop serré, les
           enveloppes se chevauchent et la figure devient un magma. La hauteur
           suit donc le nombre de pôles et l'effectif total, avec un plancher
           nettement plus haut qu'un panneau ordinaire. */
        /* Surface nécessaire au pavage : chaque groupe occupe un disque dont
           le rayon croît avec son effectif. On dimensionne d'après la somme
           de leurs aires plutôt que d'après leur nombre, un petit nombre de
           gros groupes demandant autant de place que beaucoup de petits. */
        /* La disposition est à peu près carrée : un cadre bas force le
           cadrage automatique à réduire l'ensemble, et les points tombent
           sous la taille où on les distingue. La hauteur suit donc la
           largeur, dans les limites d'un panneau lisible sans défilement
           excessif. */
        const hauteur = Math.max(620, Math.min(920, Math.round(largeur * 0.9)));

        const place = disposerConstellation(poles, individus, { largeur, hauteur });

        /* Une teinte distincte par pôle : sans cette attribution, deux
           laboratoires voisins peuvent tomber sur la même case de la palette
           et la couleur cesse de les distinguer. */
        const teintes = attribuerCouleurs(poles.map(p => p.valeur));

        const svg = dessinerConstellation({
            poles: place.poles, individus: place.individus, largeur, hauteur,
            couleurPour: v => teintes.get(v) || undefined,
            selection: etat.facettes[this.pole] || new Set(),
            unite: UNITE[source].pluriel,
            couleurs: preferences.couleurs,
            surbrillance: this.surbrillance,
            onClicPole: valeur => {
                if (valeur === LIBELLE_AUTRES) {
                    this.detail = 0;
                    this.o.onRafraichir();
                    return;
                }
                this.o.onFiltrer(this.pole, valeur);
            },
            onMenuPole: (element, valeur) => {
                if (valeur === LIBELLE_AUTRES) {
                    this.o.onMenuAutres?.(element, this.pole,
                        groupes.lignes.find(l => l.autres)?.membres || []);
                    return;
                }
                const maintenu = this.surbrillance === valeur;
                this.o.onMenu?.(element, this.pole, valeur, () => [{
                    libelle: maintenu
                        ? 'Ne plus maintenir la mise en avant'
                        : 'Maintenir la mise en avant',
                    aide: maintenu ? null : 'ce pôle seul',
                    action: () => {
                        this.surbrillance = maintenu ? null : valeur;
                        this.o.onRafraichir();
                    },
                }]);
            },
        });
        corps.appendChild(svg);

        /* Zoom et déplacement : la figure est dense, l'examen d'un groupe
           suppose de pouvoir s'en approcher. */
        /* Le zoom agit aussi sur la simulation : dézoomer donne de la place
           aux groupes, zoomer cesse de les comprimer pour que les noms
           restent lisibles. L'échelle appliquée est bornée des deux côtés —
           sans borne haute, un dézoom prononcé disperserait les groupes au
           point de rompre la lecture d'ensemble. */
        /* Dès que l'utilisateur zoome, déplace la vue ou saisit un nœud, le
           cadrage automatique cesse : sans cela, il continuerait à recadrer
           sous les doigts pendant qu'on manipule la figure. */
        this._vueFigee = false;
        this.vue = activerZoom(svg, {
            auChangement: k => { this._vueFigee = true; ajusterNoms(svg, k); },
        });
        corps.appendChild(this._commandesVue(svg));

        this._recadrer = () => {
            this._vueFigee = false;
            ajusterNoms(svg, ajusterVue(svg, place.poles, place.individus, largeur, hauteur));
        };

        if (this.disposition === 'libre') this._animer(svg, place, largeur, hauteur);
        else {
            majPositions(place.poles, place.individus);
            ajusterNoms(svg, ajusterVue(svg, place.poles, place.individus, largeur, hauteur));
        }

        /* Ce que la figure montre, chiffré : une image se lit mieux quand on
           sait ce qu'on y cherche. */
        const ponts = place.individus.filter(i => i.poles.length > 1).length;
        const isoles = place.individus.filter(i => !i.poles.length).length;
        const resume = document.createElement('p');
        resume.className = 'note';
        const morceaux = [`${poles.length} ${(def?.libelle || this.pole).toLowerCase()}s`];
        if (ponts) morceaux.push(`${ponts} chercheur${ponts > 1 ? 's' : ''} relevant de plusieurs`);
        if (isoles) morceaux.push(`${isoles} sans rattachement`);
        resume.textContent = morceaux.join(' · ') + '.';
        corps.appendChild(resume);

        if (this.surbrillance) {
            const rappel = document.createElement('div');
            rappel.className = 'relations-surbrillance';
            const etiq = document.createElement('span');
            etiq.className = 'note';
            etiq.textContent = 'Mise en avant maintenue :';
            const val = document.createElement('span');
            val.className = 'surbrillance-actuelle';
            val.textContent = this.surbrillance;
            const retirer = document.createElement('button');
            retirer.type = 'button'; retirer.className = 'lien';
            retirer.textContent = 'retirer';
            retirer.addEventListener('click', () => {
                this.surbrillance = null;
                this.o.onRafraichir();
            });
            rappel.append(etiq, val, retirer);
            corps.appendChild(rappel);
        }
    }

    /**
     * Relaxe la disposition par des forces et rend les nœuds déplaçables.
     * Le placement calculé sert de départ : la simulation n'a plus qu'à
     * défaire les chevauchements, ce qu'elle fait en quelques dizaines
     * d'images au lieu de plusieurs centaines depuis une position aléatoire.
     */
    /** Commandes de zoom : la molette ne va pas de soi sur pavé tactile, et
        rien n'indiquerait autrement que la figure est explorable. */
    _commandesVue(svg) {
        const boite = document.createElement('div');
        boite.className = 'vue-commandes';
        const bouton = (libelle, aide, action) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-petit';
            b.textContent = libelle;
            b.title = aide;
            b.addEventListener('click', action);
            return b;
        };
        boite.append(
            bouton('\u2212', 'Réduire',
                () => { this.vue?.zoomer(1 / 1.4); ajusterNoms(svg, this.vue.vue.k); }),
            bouton('+', 'Agrandir',
                () => { this.vue?.zoomer(1.4); ajusterNoms(svg, this.vue.vue.k); }),
            bouton('Ajuster', 'Recadrer sur l\u2019ensemble de la figure',
                () => { this._recadrer?.(); }),
        );
        const aide = document.createElement('span');
        aide.className = 'note';
        aide.textContent = 'Molette pour zoomer, glisser le fond pour déplacer. '
                         + 'Les noms des chercheurs apparaissent en zoomant.';
        boite.appendChild(aide);
        return boite;
    }

    _animer(svg, place, largeur, hauteur) {
        const noeuds = [
            ...place.poles.map(p => ({
                id: 'P:' + p.valeur, ref: p, x: p.x, y: p.y,
                charge: -180, rayonCollision: Math.max(22, p.rayon + 4),
            })),
            ...place.individus.map(i => ({
                id: 'I:' + i.id, ref: i, x: i.x, y: i.y,
                charge: -16, rayonCollision: 6,
            })),
        ];
        const liens = [];
        place.individus.forEach(i => i.poles.forEach(v => {
            liens.push({ source: 'I:' + i.id, cible: 'P:' + v });
        }));

        /* Réglages repris de la première version : un pôle repousse beaucoup
           plus qu'un membre, et un rappel vers le pôle empêche les groupes de
           se déliter au fil des images. */
        const noeudParRef = new Map(noeuds.map(n => [n.ref, n]));
        /* Réglages de la première version, éprouvés sur les données réelles. */
        /* Réglages resserrés par rapport à ceux de la première version.
           Celle-ci disposait d'une fenêtre bien plus large : à résolution
           réduite, une répulsion de longue portée étale la figure sur près de
           treize cents points, que le cadrage doit ensuite réduire de moitié —
           les chercheurs deviennent alors des poussières de deux pixels.
           Une portée plus courte ramène l'emprise à huit cents points et
           double la taille apparente des points, sans qu'aucun chercheur ne
           se retrouve plus près d'un autre groupe que du sien. */
        this.simulation = new Simulation(noeuds, liens, {
            centreX: largeur / 2, centreY: hauteur / 2,
            distanceLien: 26, intensiteLien: 0.45,
            porteeRepulsion: 90, centrage: 0.08, groupement: 0.28,
            groupeDe: n => (n.ref?.principal ? noeudParRef.get(n.ref.principal) : null),
        });

        /* Les nœuds de la simulation et ceux de la figure sont distincts :
           on recopie les coordonnées à chaque image. */
        let images = 0;
        const reporter = () => {
            noeuds.forEach(n => { n.ref.x = n.x; n.ref.y = n.y; });
            majPositions(place.poles, place.individus);
            /* La vue se recadre pendant que la disposition s'étend, mais pas à
               chaque image : le contenu paraîtrait alors respirer. */
            if (!this._vueFigee && images++ % 6 === 0) {
                ajusterNoms(svg, ajusterVue(svg, place.poles, place.individus, largeur, hauteur));
            }
        };

        this.simulation
            .surTick(reporter)
            .surRepos(() => {
                if (this._vueFigee) return;
                ajusterNoms(svg, ajusterVue(svg, place.poles, place.individus, largeur, hauteur));
            })
            .demarrer();

        /* Seuls les pôles se déplacent : saisir un point de deux pixels serait
           pénible, et les individus suivent leur pôle. */
        place.poles.forEach(p => {
            const noeud = noeuds.find(n => n.id === 'P:' + p.valeur);
            if (p._groupe && noeud) {
                p._groupe.addEventListener('pointerdown', () => { this._vueFigee = true; });
                rendreDeplacable(p._groupe, noeud, svg, this.simulation);
            }
        });
    }

    _reglages(rows) {
        const boite = document.createElement('div');
        boite.className = 'reseau-reglages';
        const source = this.o.source();

        const menu = (etiquette, valeur, options, appliquer) => {
            const bloc = document.createElement('div');
            bloc.className = 'reglage-detail';
            const lab = document.createElement('label');
            lab.className = 'etiquette-champ';
            lab.textContent = etiquette;
            const select = document.createElement('select');
            options.forEach(o => {
                const opt = document.createElement('option');
                opt.value = o.valeur; opt.textContent = o.libelle;
                if (o.valeur === valeur) opt.selected = true;
                select.appendChild(opt);
            });
            select.addEventListener('change', () => {
                appliquer(select.value);
                this.surbrillance = null;
                this.o.onRafraichir();
            });
            bloc.append(lab, select);
            return bloc;
        };

        boite.appendChild(menu('Regroupés par', this.pole,
            POLES.map(c => champ(source, c)).filter(Boolean)
                .map(c => ({ valeur: c.cle, libelle: c.libelle })),
            v => { this.pole = v; }));

        boite.appendChild(menu('Disposition', this.disposition, [
            { valeur: 'libre',  libelle: 'Libre (physique)' },
            { valeur: 'rangee', libelle: 'Rangée (fixe)' },
        ], v => { this.disposition = v; }));

        boite.appendChild(menu('Pôles détaillés', String(this.detail),
            ['0', '6', '10', '12', '20', '30'].map(n => ({
                valeur: n, libelle: n === '0' ? 'Tous' : n })),
            v => { this.detail = +v; }));

        return boite;
    }
}
