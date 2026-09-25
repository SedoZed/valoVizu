/**
 * app.js
 * Orchestration : chargement, état des deux tableaux de bord, rendu.
 *
 * Chaque tableau de bord (EC, OPE) a son propre état de filtrage et ses
 * propres réglages. Basculer de l'un à l'autre ne mélange rien : les filtres
 * d'un côté n'ont pas de sens de l'autre.
 */
import { CONFIG, chargerConfig, enregistrerConfig, reinitialiserConfig,
         adresseValide, viderCache, chargerEc, chargerOpe,
         dateExtraction, diagnostiquer, ageCache, ficheAdmin } from './core/omeka.js';
import { TITRES, UNITE, FACETTES, champ, masquagesParDefaut } from './core/champs.js';
import { etatVide, retenus, valeursDistinctes, nombreFiltres } from './core/selection.js';
import { reglagesVides, listerProfils, enregistrerProfil,
         supprimerProfil, lireProfil, appliquerProfil } from './core/reglages.js';
import { preferences, chargerPreferences, enregistrerPreferences,
         reinitialiserPreferences, appliquerTheme, themeEffectif,
         suivreThemeSysteme } from './core/preferences.js';
import { Facettes, rendreReinitialisation } from './ui/facettes.js';
import { rendreIndicateurs } from './panels/indicateurs.js';
import { Tableau } from './panels/tableau.js';
import { Figures } from './panels/figures.js';
import { Partenaires } from './panels/partenaires.js';
import { Relations } from './panels/relations.js';
import { Reseau } from './panels/reseau.js';
import { Qualite } from './panels/qualite.js';
import { Atelier } from './panels/atelier.js';
import { exporterSvg, exporterPng, nomFichier } from './ui/exportFigure.js';
import { rendreLegende, brancherCopie, texteLegende, texteSource } from './ui/legende.js';
import { depuisAdresse, ecrireAdresse, lienCourant } from './core/adresse.js';
import { Historique } from './core/historique.js';
import { brancherOutils, liensOutils, ajouterOutil, retirerOutil,
         adresseOutilValide } from './ui/outils.js';
import { identifiantOmeka } from './core/champs.js';
import { attacherMenu } from './ui/menu.js';
import { ouvrirListe } from './ui/liste.js';

const $ = id => document.getElementById(id);

const app = {
    source: 'ope',
    donnees:  { ec: null, ope: null },
    etats:    { ec: etatVide(), ope: etatVide() },
    reglages: { ec: reglagesVides(), ope: reglagesVides() },
    profilCourant: null,
    _defautsPoses: {},

    records() { return this.donnees[this.source] || []; },
    etat()    { return this.etats[this.source]; },
    regl()    { return this.reglages[this.source]; },

    /* ── Démarrage ── */
    async init() {
        chargerConfig();
        chargerPreferences();

        this.historique = new Historique(cle => champ(this.source, cle)?.libelle || cle);

        /* Une adresse partagée fixe la source et la sélection : elle prime sur
           les valeurs par défaut, mais pas sur les masquages d'office, qui
           sont ajoutés au chargement des données si l'adresse n'en porte pas. */
        const partage = typeof location !== 'undefined'
            ? depuisAdresse(location.hash) : null;
        if (partage) {
            this.source = partage.source;
            this.etats[partage.source] = partage.etat;
            this._defautsPoses[partage.source] = true;
        }
        appliquerTheme();
        /* Les figures lisent les couleurs du thème au moment où elles sont
           dessinées : un changement impose donc de les refaire. */
        suivreThemeSysteme(() => { this._majBoutonTheme(); this.rendre(); });
        this._brancherInterface();

        const acces = {
            records:  () => this.records(),
            source:   () => this.source,
            etat:     () => this.etat(),
            reglages: () => this.regl(),
            onChange: () => this.rendre(),
            onMenu:   (element, cle, valeur, extras) =>
                          this.attacherMenuValeur(element, cle, valeur, extras),
            onMenuAutres: (element, cle, membres) => this.attacherMenuAutres(element, cle, membres),
            onMenuEnregistrement: (element, rec, auClic = false) =>
                this.attacherMenuEnregistrement(element, rec, auClic),
            onMenuCombinaison: (element, cleA, vA, cleB, vB, n) =>
                this.attacherMenuCombinaison(element, cleA, vA, cleB, vB, n),
            /* Une cellule de matrice désigne une intersection, non une valeur :
               « ajouter au filtre » n'y aurait pas de sens — ajouter la ligne
               ou la colonne ? Le seul geste sensé est de retenir les deux. */
            onIsolerCroisement: (cleA, valeurA, cleB, valeurB) => {
                const etat = this.etat();
                etat.facettes[cleA] = new Set([valeurA]);
                etat.facettes[cleB] = new Set([valeurB]);
                this.rendre();
            },
            onOuvrirAutres: (cle, membres) => this.ouvrirRegroupement(cle, membres),
            onExport: (tete, corps, titre) => this.ajouterExport(tete, corps, titre),
            onRafraichir: () => this.rendre(),
        };
        this.facettes = new Facettes($('facettes'), acces);
        this.tableau  = new Tableau($('tableau-hote'), { ...acces, elCompteur: $('tableau-compteur') });
        this.figures  = new Figures($('figures'), {
            ...acces,
            onFiltrer: (cle, valeur) => this.basculerFiltre(cle, valeur),
            onRafraichir: () => this.rendre(),
        });
        this.relations = new Relations($('relations-hote'), {
            ...acces,
            onFiltrer: (cle, valeur) => this.basculerFiltre(cle, valeur),
            onRafraichir: () => this.rendre(),
        });
        this.reseau = new Reseau($('reseau-hote'), {
            ...acces,
            onFiltrer: (cle, valeur) => this.basculerFiltre(cle, valeur),
            onRafraichir: () => this.rendre(),
        });
        this.qualite = new Qualite($('qualite-hote'), {
            ...acces,
            onFiltrer: (cle, valeur) => this.basculerFiltre(cle, valeur),
            onRafraichir: () => this.rendre(),
            onAfficherAbsents: () => { /* les non-renseignés doivent rester visibles */ },
        });
        this.atelier = new Atelier($('atelier-hote'), {
            ...acces,
            onFiltrer: (cle, valeur) => this.basculerFiltre(cle, valeur),
            onRafraichir: () => this.rendre(),
        });
        this.partenaires = new Partenaires($('partenaires-hote'), {
            ...acces,
            onFiltrer: (cle, valeur) => this.basculerFiltre(cle, valeur),
        });

        brancherCopie($('legende-copier'), $('legende-texte'), $('legende-source'));

        /* Sans adresse d'API, il n'y a rien à charger : on la demande plutôt
           que de présenter un échec, qui laisserait croire à une panne. */
        if (!adresseValide(CONFIG.api)) { this._voileAccueil(); return; }

        await this.charger(this.source);
    },

    async charger(source) {
        if (this.donnees[source]) { this.rendre(); return; }
        this._voile(`Chargement — ${TITRES[source]}`);
        try {
            this.donnees[source] = source === 'ec'
                ? await chargerEc(m => this._voile(m))
                : await chargerOpe(m => this._voile(m));

            /* Masquages d'office, posés une seule fois : les réappliquer à
               chaque rendu empêcherait de les lever. */
            if (!this._defautsPoses[source]) {
                this._defautsPoses[source] = true;
                masquagesParDefaut(this.donnees[source], source)
                    .forEach(v => this.etats[source].masquees.add(v));
            }

            this._voile(null);
            this.rendre();
        } catch (err) {
            console.warn('[valo]', err);
            this._voileErreur(err.message);
        }
    },

    /**
     * Ouvre le contenu d'un regroupement « Autres ».
     * Les valeurs réunies restent ainsi accessibles, avec le même jeu de
     * gestes que partout ailleurs.
     */
    ouvrirRegroupement(cle, membres) {
        const def = champ(this.source, cle);
        const etat = this.etat();
        ouvrirListe({
            titre: `Regroupement « Autres » — ${(def?.libelle || cle).toLowerCase()}`,
            sousTitre: `${membres.length} valeurs de faible effectif réunies dans la figure. `
                     + `Elles restent comptées dans les totaux. « Afficher » sort une valeur `
                     + `du regroupement sans modifier la sélection ; « filtre » restreint `
                     + `au contraire les données à cette valeur.`,
            valeurs: membres,
            unite: UNITE[this.source].pluriel,
            selection: etat.facettes[cle] || new Set(),
            epinglees: etat.epinglees[cle] || new Set(),
            onDetailler: valeur => this.basculerEpingle(cle, valeur),
            onFiltrer: valeur => this.basculerFiltre(cle, valeur),
            onIsoler: valeur => { etat.facettes[cle] = new Set([valeur]); this.rendre(); },
            onMasquer: valeur => {
                etat.masquees.add(valeur);
                const restant = new Set(etat.facettes[cle] || []);
                restant.delete(valeur);
                etat.facettes[cle] = restant;
                this.rendre();
            },
            onToutDetailler: () => {
                const epingle = new Set(etat.epinglees[cle] || []);
                membres.forEach(m => epingle.add(m.valeur));
                etat.epinglees[cle] = epingle;
                this.rendre();
            },
        });
    },

    /**
     * Détache une valeur du regroupement « Autres », ou l'y remet.
     * À distinguer du filtre : épingler fait apparaître la valeur à côté des
     * autres barres, filtrer écarterait tout ce qui ne la concerne pas.
     */
    basculerEpingle(cle, valeur) {
        const etat = this.etat();
        const epingle = new Set(etat.epinglees[cle] || []);
        if (epingle.has(valeur)) epingle.delete(valeur); else epingle.add(valeur);
        etat.epinglees[cle] = epingle;
        this.rendre();
    },

    /**
     * Attache le menu contextuel à un élément désignant une valeur.
     * Le même jeu d'actions est disponible partout où une valeur apparaît —
     * facette, figure, matrice, tableau —, plutôt que des gestes différents
     * selon l'endroit.
     */
    /** Menu propre à un regroupement : il n'a pas de valeur à filtrer. */
    attacherMenuAutres(element, cle, membres) {
        const def = champ(this.source, cle);
        attacherMenu(element, `Regroupement — ${def?.libelle || cle}`, () => this._assembler([
            [{
                libelle: `Voir le contenu (${membres.length} valeurs)`,
                action: () => this.ouvrirRegroupement(cle, membres),
            }],
            [{
                libelle: 'Afficher toutes ces valeurs',
                aide: 'sur les figures',
                action: () => {
                    const etat = this.etat();
                    const epingle = new Set(etat.epinglees[cle] || []);
                    membres.forEach(m => epingle.add(m.valeur));
                    etat.epinglees[cle] = epingle;
                    this.rendre();
                },
            }],
        ]));
    },

    /**
     * @param extras  fonction rendant des entrées propres au panneau appelant
     *                (la mise en avant des relations, par exemple), insérées
     *                au milieu du menu pour rester près des gestes voisins.
     */
    /**
     * Menu d'un segment d'empilement, qui désigne deux valeurs à la fois.
     *
     * Isoler la combinaison pose deux filtres exacts. Les filtres portant sur
     * d'autres champs sont conservés : les effacer reviendrait à défaire en
     * silence une sélection construite pas à pas.
     */
    attacherMenuCombinaison(element, cleA, valeurA, cleB, valeurB, effectif) {
        const defA = champ(this.source, cleA), defB = champ(this.source, cleB);
        const titre = `${valeurA} · ${valeurB}`;
        attacherMenu(element, titre, () => {
            const etat = this.etat();
            return this._assembler([
                /* Agir sur la sélection, avec le verbe employé partout. */
                [
                {
                    libelle: 'Ne garder que ce croisement',
                    aide: `${effectif}`,
                    action: () => {
                        etat.facettes[cleA] = new Set([valeurA]);
                        etat.facettes[cleB] = new Set([valeurB]);
                        this.rendre();
                    },
                },
                {
                    libelle: `Ne garder que ${(defA?.libelle || cleA).toLowerCase()} : ${valeurA}`,
                    action: () => { etat.facettes[cleA] = new Set([valeurA]); this.rendre(); },
                },
                {
                    libelle: `Ne garder que ${(defB?.libelle || cleB).toLowerCase()} : ${valeurB}`,
                    action: () => { etat.facettes[cleB] = new Set([valeurB]); this.rendre(); },
                },
                {
                    libelle: 'Ajouter au filtre',
                    aide: (defB?.libelle || cleB).toLowerCase(),
                    action: () => this.basculerFiltre(cleB, valeurB),
                },
                ],

                [{
                    libelle: 'Copier la valeur',
                    action: async () => {
                        try {
                            await navigator.clipboard.writeText(`${valeurA} · ${valeurB}`);
                            this._message('Valeur copiée.');
                        } catch { this._message('Copie impossible dans ce navigateur.'); }
                    },
                }],
            ]);
        });
    },

    /**
     * Menu d'une ligne du tableau, c'est-à-dire d'un enregistrement.
     *
     * Le menu n'était posé que sur les cellules dont la colonne correspond à
     * un champ à valeur unique : ailleurs dans la ligne, le clic droit ne
     * donnait rien, et la fiche de l'opération elle-même restait
     * inatteignable. Le menu de cellule l'emporte toujours, sa propagation
     * étant arrêtée — les deux ne se gênent donc pas.
     */
    attacherMenuEnregistrement(element, rec, auClic = false) {
        const fiche = ficheAdmin(rec.id);
        attacherMenu(element, rec.titre || `Enregistrement ${rec.id}`, () => this._assembler([
            [fiche && {
                libelle: 'Ouvrir la fiche dans Omeka S',
                aide: 'nouvel onglet',
                action: () => window.open(fiche, '_blank', 'noopener'),
            }],
            [
            {
                libelle: 'Copier le titre',
                action: async () => {
                    try {
                        await navigator.clipboard.writeText(rec.titre || '');
                        this._message('Titre copié.');
                    } catch { this._message('Copie impossible dans ce navigateur.'); }
                },
            },
            fiche && {
                libelle: 'Copier le lien de la fiche',
                action: async () => {
                    try {
                        await navigator.clipboard.writeText(fiche);
                        this._message('Lien copié.');
                    } catch { this._message('Copie impossible dans ce navigateur.'); }
                },
            },
            ],
        ]), { auClic });
    },

    /**
     * Assemble des familles d'actions en un menu.
     *
     * Les séparateurs étaient posés à la main sur chaque entrée, si bien
     * qu'ils finissaient par isoler des entrées seules plutôt que par marquer
     * des familles — trois traits pour les trois dernières lignes. Ici une
     * famille vide disparaît sans laisser de trait, et il ne peut y avoir ni
     * séparateur en tête ni deux de suite.
     *
     * Les familles suivent la nature de l'action, et chacune a son verbe :
     * « garder » agit sur la sélection, « afficher » sur le dessin d'une
     * figure, « masquer » sur le périmètre. Employer le même mot pour deux
     * natures différentes — « n'afficher que » pour un filtre et pour une
     * restriction — était la confusion la plus coûteuse.
     */
    _assembler(familles) {
        const entrees = [];
        familles.forEach(famille => {
            const valides = (famille || []).filter(Boolean);
            if (!valides.length) return;
            const ouvre = entrees.length > 0;
            valides.forEach((e, i) => entrees.push({ ...e, separateurAvant: ouvre && i === 0 }));
        });
        return entrees;
    },

    attacherMenuValeur(element, cle, valeur, extras = null) {
        const def = champ(this.source, cle);
        attacherMenu(element, `${def?.libelle || cle} : ${valeur}`, () => {
            const etat = this.etat();
            const choix = etat.facettes[cle] || new Set();
            const dejaChoisie = choix.has(valeur);
            const masquee = etat.masquees.has(valeur);
            const epinglee = etat.epinglees[cle]?.has(valeur);
            const seule = dejaChoisie && choix.size === 1;

            return this._assembler([
                /* Agir sur la sélection : ces gestes changent les effectifs
                   partout dans l'outil. */
                [
                {
                    libelle: dejaChoisie ? 'Retirer du filtre' : 'Ajouter au filtre',
                    aide: dejaChoisie ? null : 'clic',
                    action: () => this.basculerFiltre(cle, valeur),
                },
                !seule && {
                    libelle: 'Ne garder que cette valeur',
                    action: () => {
                        etat.facettes[cle] = new Set([valeur]);
                        this.rendre();
                    },
                },
                /* Vider le filtre n'était offert que sous l'intitulé « retirer
                   les autres valeurs », qui faisait deux choses selon que la
                   valeur pointée y figurait ou non — et redisait alors « ne
                   garder que celle-ci ». */
                choix.size > 0 && {
                    libelle: `Vider ce filtre (${choix.size} valeur${choix.size > 1 ? 's' : ''})`,
                    action: () => {
                        etat.facettes[cle] = new Set();
                        this.rendre();
                    },
                },
                /* Masquer rejoint cette famille : comme les filtres, le geste
                   change les effectifs partout. L'isoler derrière son propre
                   trait produisait une ligne seule, et trois traits pour les
                   trois dernières entrées — l'empilement qu'on corrige. Sa
                   teinte d'avertissement suffit à le distinguer. */
                {
                    libelle: masquee ? 'Remettre dans le périmètre' : 'Masquer cette valeur',
                    aide: masquee ? null : 'partout dans l’outil',
                    danger: !masquee,
                    action: () => {
                        if (masquee) etat.masquees.delete(valeur);
                        else {
                            etat.masquees.add(valeur);
                            const restant = new Set(etat.facettes[cle] || []);
                            restant.delete(valeur);
                            etat.facettes[cle] = restant;
                        }
                        this.rendre();
                    },
                },
                ],

                /* Agir sur le dessin d'une figure : aucun effectif ne change. */
                [
                ...(extras ? extras() : []),
                epinglee && {
                    libelle: 'Remettre dans le regroupement',
                    aide: 'sur les figures',
                    action: () => this.basculerEpingle(cle, valeur),
                },
                ],

                /* Sortir de l'outil : consulter ailleurs, emporter. */
                [
                this._ficheDe(cle, valeur) && {
                    libelle: 'Ouvrir la fiche dans Omeka S',
                    aide: 'nouvel onglet',
                    action: () => window.open(this._ficheDe(cle, valeur), '_blank', 'noopener'),
                },
                {
                    libelle: 'Copier la valeur',
                    action: async () => {
                        try { await navigator.clipboard.writeText(valeur); this._message('Valeur copiée.'); }
                        catch { this._message('Copie impossible dans ce navigateur.'); }
                    },
                },
                ],
            ]);
        });
    },

    /**
     * Ajoute ou retire une valeur d'une facette. C'est le geste déclenché par
     * un clic dans une figure : la même action que cocher la case
     * correspondante dans les filtres, pour que les deux voies mènent au même
     * état plutôt qu'à deux mécanismes parallèles.
     */
    basculerFiltre(cle, valeur) {
        const etat = this.etat();
        const choix = new Set(etat.facettes[cle] || []);
        if (choix.has(valeur)) choix.delete(valeur); else choix.add(valeur);
        etat.facettes[cle] = choix;
        this.rendre();
    },

    /* ── Rendu complet ── */
    rendre() {
        const rows = retenus(this.records(), this.source, this.etat());

        this.facettes.rendre();
        rendreReinitialisation($('reinit'), this.etat(), () => this.rendre());
        this._rendreRestrictions();
        rendreIndicateurs($('indicateurs'), rows, this.source, this.etat());
        this.figures.rendre(rows);
        /* Les croisements valent pour les deux tableaux de bord : laboratoire
           par domaine côté chercheurs, laboratoire par partenaire côté
           opérations. Seul le détail des partenaires reste propre aux
           opérations, faute de partenaire extérieur côté chercheurs. */
        /* Chaque tableau de bord reçoit la figure qui correspond à sa structure.
           Côté chercheurs, un individu appartient à un seul laboratoire : le
           graphe est en étoiles, et c'est le réseau qui le montre. Côté
           opérations, chaque enregistrement porte plusieurs partenaires et
           plusieurs laboratoires : c'est un croisement, et ce sont les flux qui
           le montrent. Croiser laboratoire et domaine côté chercheurs ne ferait
           que redire la composition des laboratoires. */
        const modeOpe = this.source === 'ope';
        $('panneau-relations').hidden = !modeOpe;
        $('panneau-partenaires').hidden = !modeOpe;
        $('panneau-reseau').hidden = modeOpe;

        if (modeOpe) {
            /* L'animation du réseau doit cesser quand son panneau disparaît :
               elle continuerait autrement à consommer le processeur. */
            this.reseau.arreter();
            this.relations.rendre(rows);
            this.partenaires.rendre(rows);
        } else {
            this.reseau.rendre(rows);
        }
        this.tableau.rendre(rows);
        this.qualite.rendre(rows);
        this.atelier.rendre(rows);
        this._rendreMasquees();
        this._rendreProfils();

        rendreLegende(
            $('legende-texte'), $('legende-source'),
            rows, this.source, this.etat(), this.regl(),
            CONFIG.api, dateExtraction(this.source), ageCache(this.source),
        );

        $('titre-tableau').textContent = TITRES[this.source];
        ['ec', 'ope'].forEach(s =>
            $(`onglet-${s}`)?.classList.toggle('actif', this.source === s));

        this._rows = rows;

        /* Le relevé se fait après le rendu : tout changement de sélection,
           d'où qu'il vienne, a déjà été appliqué. */
        this.historique.relever(this.source, this.etat());
        this._rendreHistorique();
        ecrireAdresse(this.source, this.etat());
    },

    /**
     * Lever d'un coup toutes les restrictions d'affichage.
     *
     * Le bouton « Réinitialiser les filtres » ne les touche pas, et c'est
     * juste : une restriction n'écarte aucun enregistrement, elle ne figure
     * donc pas parmi les filtres. Mais rien ne permettait alors de les lever
     * ensemble, et quatre figures restreintes demandaient quatre gestes.
     */
    _rendreRestrictions() {
        const bouton = $('tout-reafficher');
        if (!bouton) return;
        const etat = this.etat();
        const n = Object.values(etat.restrictions || {})
            .filter(v => v?.size).length;
        bouton.hidden = n === 0;
        bouton.textContent = `Tout réafficher (${n} figure${n > 1 ? 's' : ''})`;
        bouton.title = 'Lever les restrictions d’affichage de toutes les figures';
        bouton.onclick = () => {
            etat.restrictions = {};
            this.rendre();
        };
    },

    /* ── Annulation ── */
    _rendreHistorique() {
        const annuler = $('annuler'), retablir = $('retablir');
        if (!annuler || !retablir) return;

        const possible = this.historique.peutAnnuler(this.source);
        annuler.disabled = !possible;
        annuler.title = possible
            ? `Annuler ${this.historique.descriptionAnnulation(this.source)}`
            : 'Rien à annuler';

        const refaisable = this.historique.peutRetablir(this.source);
        retablir.disabled = !refaisable;
        retablir.hidden = !refaisable;
        retablir.title = refaisable
            ? `Rétablir ${this.historique.descriptionRetablissement(this.source)}`
            : '';
    },

    annuler() {
        const etat = this.historique.annuler(this.source);
        if (!etat) return;
        this.etats[this.source] = etat;
        this.rendre();
    },

    retablir() {
        const etat = this.historique.retablir(this.source);
        if (!etat) return;
        this.etats[this.source] = etat;
        this.rendre();
    },

    /* ── Valeurs mises hors périmètre ── */
    _rendreMasquees() {
        const hote = $('masquees');
        const etat = this.etat();
        hote.innerHTML = '';
        if (!etat.masquees.size) {
            hote.innerHTML = '<p class="note">Aucune valeur masquée.</p>';
            return;
        }
        [...etat.masquees].forEach(v => {
            const puce = document.createElement('button');
            puce.type = 'button';
            puce.className = 'puce';
            const nom = document.createElement('span');
            nom.textContent = v;
            puce.append(document.createTextNode('⊘ '), nom, document.createTextNode(' ✕'));
            puce.title = 'Remettre cette valeur dans le périmètre';
            puce.addEventListener('click', () => {
                etat.masquees.delete(v);
                this.rendre();
            });
            hote.appendChild(puce);
        });
        const tout = document.createElement('button');
        tout.type = 'button';
        tout.className = 'lien';
        tout.textContent = 'Tout remettre';
        tout.addEventListener('click', () => { etat.masquees = new Set(); this.rendre(); });
        hote.appendChild(tout);

        /* Un masquage posé d'office doit être annoncé : l'utilisateur n'a pas
           fait ce geste et doit pouvoir comprendre d'où vient l'écart. */
        const office = masquagesParDefaut(this.records(), this.source)
            .filter(v => etat.masquees.has(v));
        if (office.length) {
            const note = document.createElement('p');
            note.className = 'note';
            note.textContent = 'L’établissement porteur est masqué d’office : présent dans '
                + 'la plupart des opérations, il écrase l’échelle des figures et masque '
                + 'les partenaires extérieurs. Cliquez la puce pour le rétablir.';
            hote.appendChild(note);
        }
    },

    /* ── Profils ── */
    _rendreProfils() {
        const hote = $('profils');
        hote.innerHTML = '';
        const profils = listerProfils().filter(p => p.source === this.source);

        const ligne = document.createElement('div');
        ligne.className = 'profil-ligne';
        const select = document.createElement('select');
        select.innerHTML = '<option value="">— appliquer un profil —</option>';
        profils.forEach(p => {
            const o = document.createElement('option');
            o.value = p.id; o.textContent = p.nom;
            if (this.profilCourant === p.id) o.selected = true;
            select.appendChild(o);
        });
        select.addEventListener('change', () => {
            const p = lireProfil(select.value);
            if (!p) return;
            const connues = {};
            FACETTES[this.source].forEach(cle => {
                connues[cle] = new Set(valeursDistinctes(this.records(), this.source, cle));
            });
            const { etat, reglages, ignorees } = appliquerProfil(p, connues);
            this.etats[this.source] = etat;
            this.reglages[this.source] = reglages;
            this.profilCourant = p.id;
            this.rendre();
            if (ignorees.length) {
                this._message(`Profil appliqué. ${ignorees.length} valeur(s) absente(s) de l'extraction courante ont été ignorées.`);
            } else {
                this._message(`Profil « ${p.nom} » appliqué.`);
            }
        });
        const suppr = document.createElement('button');
        suppr.type = 'button'; suppr.className = 'btn btn-petit';
        suppr.textContent = 'Supprimer';
        suppr.addEventListener('click', () => {
            if (!select.value) return;
            supprimerProfil(select.value);
            this.profilCourant = null;
            this.rendre();
        });
        ligne.append(select, suppr);
        hote.appendChild(ligne);

        const enreg = document.createElement('div');
        enreg.className = 'profil-ligne';
        const nom = document.createElement('input');
        nom.type = 'text'; nom.placeholder = 'Nom du profil…'; nom.maxLength = 48;
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'btn btn-petit';
        btn.textContent = 'Enregistrer les filtres';
        const faire = () => {
            if (!nom.value.trim()) { nom.focus(); return; }
            const p = enregistrerProfil(nom.value, this.source, this.etat(), this.regl());
            this.profilCourant = p.id;
            nom.value = '';
            this.rendre();
            this._message(`Profil « ${p.nom} » enregistré.`);
        };
        btn.addEventListener('click', faire);
        nom.addEventListener('keydown', e => { if (e.key === 'Enter') faire(); });
        enreg.append(nom, btn);
        hote.appendChild(enreg);

        if (nombreFiltres(this.etat()) === 0) {
            const note = document.createElement('p');
            note.className = 'note';
            note.textContent = 'Un profil enregistre les filtres, les valeurs masquées et la recherche.';
            hote.appendChild(note);
        }
    },

    /* ── Interface ── */
    _brancherInterface() {
        ['ec', 'ope'].forEach(s => {
            $(`onglet-${s}`)?.addEventListener('click', () => {
                if (this.source === s) return;
                this.source = s;
                this.profilCourant = null;
                this.charger(s);
            });
        });

        $('annuler')?.addEventListener('click', () => this.annuler());
        $('retablir')?.addEventListener('click', () => this.retablir());

        /* Raccourcis usuels, sauf lorsqu'une saisie a le focus : Ctrl+Z doit
           y défaire la frappe, non la sélection. */
        document.addEventListener('keydown', e => {
            if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
            const cible = e.target;
            if (cible && /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName)) return;
            e.preventDefault();
            if (e.shiftKey) this.retablir(); else this.annuler();
        });

        $('copier-lien')?.addEventListener('click', async () => {
            const bouton = $('copier-lien');
            try {
                await navigator.clipboard.writeText(lienCourant(this.source, this.etat()));
                bouton.textContent = 'Lien copié';
            } catch { bouton.textContent = 'Copie impossible'; }
            setTimeout(() => { bouton.textContent = 'Copier le lien'; }, 1800);
        });

        /* Adresse modifiée à la main, ou navigation entre deux liens. */
        window.addEventListener('hashchange', () => {
            const partage = depuisAdresse(location.hash || '');
            if (!partage) return;
            this.source = partage.source;
            this.etats[partage.source] = partage.etat;
            this.charger(partage.source);
        });

        const rech = $('recherche');
        let minuteur;
        rech?.addEventListener('input', () => {
            clearTimeout(minuteur);
            minuteur = setTimeout(() => {
                this.etat().recherche = rech.value;
                this.rendre();
            }, 220);
        });

        $('export-csv')?.addEventListener('click', () => {
            this._telecharger(this.tableau.csv(this._rows || []),
                `valorisation-${this.source}-${this._dateDuJour()}.csv`);
        });

        $('export-partenaires')?.addEventListener('click', () => {
            this._telecharger(this.partenaires.csv(), `partenaires-${this._dateDuJour()}.csv`);
        });

        /* Thème : le bouton du bandeau fait défiler les trois états, le menu
           des paramètres permet de les choisir directement. */
        const cycle = { systeme: 'clair', clair: 'sombre', sombre: 'systeme' };
        $('theme-bascule')?.addEventListener('click', () => {
            this._changerTheme(cycle[preferences.theme] || 'systeme');
        });
        $('pref-theme')?.addEventListener('change', e => {
            this._changerTheme(e.target.value);
        });
        this._majBoutonTheme();

        /* Onglets de la configuration */
        document.querySelectorAll('.onglets-modale .onglet').forEach(bouton => {
            bouton.addEventListener('click', () => {
                document.querySelectorAll('.onglets-modale .onglet')
                    .forEach(b => b.classList.toggle('actif', b === bouton));
                document.querySelectorAll('.volet').forEach(v => {
                    v.hidden = v.id !== bouton.dataset.volet;
                });
            });
        });

        /* Préférences d'affichage : effet immédiat, sans rechargement —
           elles ne touchent qu'à la présentation. */
        const prefDuree = $('pref-duree');
        const prefPas   = $('pref-pas');
        const prefCoul  = $('pref-couleurs');
        const appliquerPrefs = () => {
            if (prefDuree) prefDuree.value = preferences.dureeAffichage;
            if (prefPas)   prefPas.value   = String(preferences.pasTableau);
            if (prefCoul)  prefCoul.value  = preferences.couleurs ? 'oui' : 'non';
        };
        appliquerPrefs();
        prefDuree?.addEventListener('change', () => {
            enregistrerPreferences({ dureeAffichage: prefDuree.value });
            this.rendre();
        });
        prefPas?.addEventListener('change', () => {
            enregistrerPreferences({ pasTableau: +prefPas.value });
            this.rendre();
        });
        prefCoul?.addEventListener('change', () => {
            enregistrerPreferences({ couleurs: prefCoul.value === 'oui' });
            this.rendre();
        });
        $('pref-defaut')?.addEventListener('click', () => {
            reinitialiserPreferences();
            appliquerTheme();
            this._majBoutonTheme();
            appliquerPrefs();
            this.rendre();
            this._message('Paramètres d’affichage rétablis.');
        });

        brancherOutils($('outils-ouvrir'), () => {
            $('config-ouvrir').click();
            document.querySelector('.onglets-modale .onglet[data-volet="volet-outils"]')?.click();
        });

        $('outil-ajouter')?.addEventListener('click', () => {
            const nom = $('outil-nom').value.trim();
            const url = $('outil-url').value.trim();
            if (!nom) { $('outil-erreur').textContent = 'Donnez un nom à ce lien.'; return; }
            if (!adresseOutilValide(url)) {
                $('outil-erreur').textContent = 'L’adresse doit être complète, '
                    + 'commençant par http:// ou https://';
                return;
            }
            $('outil-erreur').textContent = '';
            ajouterOutil(nom, url);
            $('outil-nom').value = '';
            $('outil-url').value = '';
            this._rendreOutils();
        });

        this._rendreOutils();

        $('accueil-configurer')?.addEventListener('click', () => {
            $('config-ouvrir').click();
        });

        $('config-ouvrir')?.addEventListener('click', () => {
            $('cfg-api').value   = CONFIG.api;
            $('cfg-ident').value = CONFIG.ident;
            $('cfg-key').value   = CONFIG.key;
            $('cfg-erreur').textContent = '';
            $('config').hidden = false;
        });
        $('config-fermer')?.addEventListener('click', () => { $('config').hidden = true; });
        $('config-vider')?.addEventListener('click', () => {
            viderCache();
            this._message('Cache vidé. Rechargez la page pour réinterroger l’API.');
        });
        $('config-enregistrer')?.addEventListener('click', () => {
            const api = $('cfg-api').value.trim();
            if (!adresseValide(api)) {
                $('cfg-erreur').textContent = 'Adresse incomplète. Elle doit commencer par '
                    + 'http:// ou https:// — par exemple https://exemple.org/omeka/api/';
                $('cfg-api').focus();
                return;
            }
            $('cfg-erreur').textContent = '';
            enregistrerConfig({ api, ident: $('cfg-ident').value.trim(), key: $('cfg-key').value.trim() });
            viderCache();
            location.reload();
        });

        $('diag-lancer')?.addEventListener('click', async () => {
            const zone = $('diag-resultat');
            zone.textContent = 'Interrogation…';
            try {
                const r = await diagnostiquer($('diag-classe').value);
                zone.innerHTML = '';
                if (r.erreur) {
                    const p = document.createElement('p');
                    p.className = 'note note-alerte';
                    p.textContent = r.erreur;
                    zone.appendChild(p);
                    if (r.classes) {
                        const l = document.createElement('p');
                        l.className = 'note';
                        l.textContent = 'Classes disponibles : ' + r.classes.join(', ');
                        zone.appendChild(l);
                    }
                    return;
                }
                const table = document.createElement('table');
                table.className = 'tableau';
                const th = table.createTHead().insertRow();
                ['Propriété', 'Forme', 'Exemple'].forEach(t => {
                    const c = document.createElement('th'); c.textContent = t; th.appendChild(c);
                });
                const tb = table.createTBody();
                r.proprietes.forEach(p => {
                    const tr = tb.insertRow();
                    [p.propriete, p.forme, p.exemple].forEach(v => {
                        const td = tr.insertCell();
                        td.textContent = String(v).slice(0, 80);
                        td.title = String(v);
                    });
                });
                zone.appendChild(table);
                const note = document.createElement('p');
                note.className = 'note';
                note.textContent = `${r.proprietes.length} propriétés relevées sur `
                                 + `${r.echantillon} élément(s) de la classe ${r.classe}.`;
                zone.appendChild(note);
            } catch (err) {
                zone.innerHTML = '';
                const p = document.createElement('p');
                p.className = 'note note-alerte';
                p.textContent = err.message;
                zone.appendChild(p);
            }
        });

        $('config-defaut')?.addEventListener('click', () => {
            reinitialiserConfig();
            viderCache();
            location.reload();
        });

        $('recharger')?.addEventListener('click', () => {
            viderCache();
            location.reload();
        });
    },

    _changerTheme(theme) {
        enregistrerPreferences({ theme });
        appliquerTheme();
        this._majBoutonTheme();
        const select = $('pref-theme');
        if (select) select.value = theme;
        /* Les figures portent des couleurs résolues au dessin : il faut les
           reconstruire pour qu'elles suivent le thème. */
        this.rendre();
    },

    _majBoutonTheme() {
        const bouton = $('theme-bascule');
        if (!bouton) return;
        const libelles = {
            systeme: 'Thème : système',
            clair:   'Thème : clair',
            sombre:  'Thème : sombre',
        };
        bouton.textContent = libelles[preferences.theme] || 'Thème';
        bouton.title = `Affichage ${themeEffectif()}. Cliquez pour changer.`;
        const select = $('pref-theme');
        if (select) select.value = preferences.theme;
    },

    /**
     * Ajoute les commandes d'export à l'en-tête d'un panneau.
     * La légende de la sélection est incrustée dans le fichier : une figure
     * exportée circule seule, et sans cette phrase plus personne ne saura sur
     * quel sous-ensemble elle portait.
     */
    ajouterExport(tete, corps, titre) {
        const svg = corps.querySelector('svg.figure');
        if (!svg || tete.querySelector('.export-figure')) return;

        const boite = document.createElement('div');
        boite.className = 'export-figure';

        const contexte = () => ({
            titre,
            /* La restriction propre à cette figure rejoint la légende de son
               export : sans elle, l'image sortirait en paraissant décrire
               toute la sélection alors qu'elle en dessine une fraction. Le
               bouton « Tout réafficher » est retranché, il n'a pas de sens
               hors de l'écran. */
            legende: [
                texteLegende(this._rows || [], this.source, this.etat(), this.regl()),
                (() => {
                    const note = corps.querySelector('.note-restriction');
                    if (!note) return '';
                    const copie = note.cloneNode(true);
                    copie.querySelector('button')?.remove();
                    return copie.textContent.trim();
                })(),
            ].filter(Boolean).join(' — '),
            source: texteSource(CONFIG.api, dateExtraction(this.source)),
            fondClair: document.documentElement.getAttribute('data-theme') !== 'sombre',
        });

        const bouton = (libelle, action, aide) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-petit';
            b.textContent = libelle;
            b.title = aide;
            b.addEventListener('click', async () => {
                const ancien = b.textContent;
                try {
                    await action(contexte());
                    b.textContent = '✓';
                } catch (err) {
                    b.textContent = '⚠';
                    this._message(err.message || 'Export impossible.');
                }
                setTimeout(() => { b.textContent = ancien; }, 1500);
            });
            return b;
        };

        boite.append(
            bouton('SVG', ctx => exporterSvg(svg, nomFichier(titre, this.source), ctx),
                'Image vectorielle, avec la légende incrustée'),
            bouton('PNG', ctx => exporterPng(svg, nomFichier(titre, this.source), ctx),
                'Image matricielle en double résolution, avec la légende incrustée'),
        );
        tete.appendChild(boite);
    },

    /** Liste des liens réglés, dans l'écran de configuration. */
    _rendreOutils() {
        const hote = $('outils-liste');
        if (!hote) return;
        hote.innerHTML = '';
        const liens = liensOutils();
        if (!liens.length) {
            hote.innerHTML = '<p class="note">Aucun lien enregistré.</p>';
            return;
        }
        const liste = document.createElement('ul');
        liste.className = 'liste-valeurs';
        let rang = 0;
        liens.forEach(lien => {
            const li = document.createElement('li');
            li.className = 'liste-ligne';
            const nom = document.createElement('span');
            nom.className = 'liste-nom';
            nom.textContent = lien.nom;
            nom.title = lien.url;
            li.appendChild(nom);
            if (lien.deduit) {
                /* L'instance est déduite de l'adresse de l'API : la retirer
                   ici n'aurait pas de sens, elle suit la configuration. */
                const note = document.createElement('span');
                note.className = 'liste-nombre';
                note.textContent = 'déduit';
                li.appendChild(note);
            } else {
                const indice = rang++;
                const retirer = document.createElement('button');
                retirer.type = 'button';
                retirer.className = 'liste-action liste-danger';
                retirer.textContent = 'Retirer';
                retirer.addEventListener('click', () => {
                    retirerOutil(indice);
                    this._rendreOutils();
                });
                li.appendChild(retirer);
            }
            liste.appendChild(li);
        });
        hote.appendChild(liste);
    },

    /**
     * Fiche Omeka S d'une valeur, lorsqu'elle provient d'un item lié.
     *
     * Les champs dérivés — année, tranche de durée, laboratoire déduit — sont
     * calculés et n'ont pas de fiche. Le renvoi n'est alors pas proposé,
     * plutôt que de mener à une page inexistante.
     */
    _ficheDe(cle, valeur) {
        const id = identifiantOmeka(this.records(), this.source, cle, valeur);
        return id ? ficheAdmin(id) : '';
    },

    _dateDuJour() { return new Date().toISOString().slice(0, 10); },

    /* Le préfixe BOM permet à un tableur français d'ouvrir le fichier en
       UTF-8 sans intervention. */
    _telecharger(contenu, nom) {
        const blob = new Blob(['\ufeff' + contenu], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = nom;
        a.click();
        URL.revokeObjectURL(a.href);
    },

    _message(texte) {
        const zone = $('messages');
        const p = document.createElement('p');
        p.className = 'message';
        p.textContent = texte;
        zone.appendChild(p);
        setTimeout(() => { p.style.opacity = '0'; setTimeout(() => p.remove(), 400); }, 3600);
    },

    _voile(texte) {
        const v = $('voile');
        if (texte === null) { v.hidden = true; return; }
        v.hidden = false;
        $('voile-texte').textContent = texte;
        $('voile-erreur').hidden = true;
        $('voile-accueil').hidden = true;
        $('voile-attente').hidden = false;
    },

    /** Premier lancement : aucune adresse n'a encore été indiquée. */
    _voileAccueil() {
        $('voile').hidden = false;
        $('voile-attente').hidden = true;
        $('voile-erreur').hidden = true;
        $('voile-accueil').hidden = false;
    },

    _voileErreur(texte) {
        const v = $('voile');
        v.hidden = false;
        $('voile-attente').hidden = true;
        $('voile-accueil').hidden = true;
        $('voile-erreur').hidden = false;
        $('voile-erreur-texte').textContent = texte;
        $('voile-adresse').textContent = CONFIG.api || '(aucune adresse configurée)';
    },
};

app.init();
window.__valo = app;
