/**
 * panels/qualite.js
 * Présentation des constats sur la donnée.
 *
 * Le panneau est replié par défaut : ces informations comptent, mais elles ne
 * doivent pas s'interposer entre l'utilisateur et ce qu'il est venu chercher.
 * Le résumé reste visible dans l'en-tête, ce qui suffit à savoir s'il y a lieu
 * de l'ouvrir.
 *
 * Les constats portent sur la sélection courante, non sur le corpus entier :
 * les défauts d'un sous-ensemble ne sont pas ceux de l'ensemble, et c'est le
 * sous-ensemble qu'on est en train de lire.
 */
import { controler, resumer } from '../core/qualite.js';
import { estDeplie, basculerDepliement } from '../core/preferences.js';
import { champ } from '../core/champs.js';

export class Qualite {
    constructor(hote, options) {
        this.hote = hote;
        this.o = options;
        /* L'état de dépliement est repris des préférences à chaque rendu. */
        this.ouvert = false;
        this.detailles = {};   // constats dépliés
    }

    rendre(rows) {
        const source = this.o.source();
        this.hote.innerHTML = '';

        /* Replié par défaut, mais le choix de l'utilisateur est retenu :
           `basculerRepli` renvoie « replié », d'où la négation. */
        this.ouvert = estDeplie(source, 'qualite');

        const constats = controler(rows, source);

        const tete = document.createElement('div');
        tete.className = 'panneau-tete';
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.className = 'qualite-bascule';
        bouton.setAttribute('aria-expanded', String(this.ouvert));
        const fleche = document.createElement('span');
        fleche.className = 'qualite-fleche';
        fleche.textContent = this.ouvert ? '▾' : '▸';
        const titre = document.createElement('h2');
        titre.textContent = 'Contrôle des données';
        bouton.append(fleche, titre);
        bouton.addEventListener('click', () => {
            basculerDepliement(this.o.source(), 'qualite');
            this.rendre(rows);
        });
        tete.appendChild(bouton);

        const resume = document.createElement('span');
        resume.className = 'qualite-resume'
            + (constats.some(c => c.gravite === 'attention') ? ' qualite-attention' : '');
        resume.textContent = resumer(constats);
        tete.appendChild(resume);
        this.hote.appendChild(tete);

        if (!this.ouvert) return;

        const intro = document.createElement('p');
        intro.className = 'note';
        intro.textContent = 'Ces constats portent sur la sélection courante. Aucun n’est '
            + 'une erreur en soi : une date manquante renseigne sur la saisie, pas sur '
            + 'une faute. Ils sont réunis ici pour que les figures ne donnent pas une '
            + 'impression de complétude que le corpus ne mérite pas.';
        this.hote.appendChild(intro);

        if (!constats.length) {
            const rien = document.createElement('p');
            rien.className = 'note';
            rien.textContent = 'Aucun champ vide, aucune date incohérente, aucune variante '
                + 'd’écriture repérée dans cette sélection.';
            this.hote.appendChild(rien);
            return;
        }

        const liste = document.createElement('div');
        liste.className = 'qualite-liste';
        constats.forEach(c => liste.appendChild(this._constat(c, rows)));
        this.hote.appendChild(liste);
    }

    _constat(c, rows) {
        const bloc = document.createElement('article');
        bloc.className = 'constat constat-' + c.gravite;

        const entete = document.createElement('div');
        entete.className = 'constat-tete';

        const titre = document.createElement('h3');
        titre.textContent = c.titre;

        const chiffre = document.createElement('span');
        chiffre.className = 'constat-chiffre';
        chiffre.textContent = c.part !== undefined
            ? `${c.effectif} (${Math.round(c.part * 100)} %)`
            : String(c.effectif);

        entete.append(titre, chiffre);
        bloc.appendChild(entete);

        const explication = document.createElement('p');
        explication.className = 'note';
        explication.textContent = c.explication;
        bloc.appendChild(explication);

        const actions = document.createElement('div');
        actions.className = 'constat-actions';

        /* Aller voir les enregistrements concernés */
        if (c.filtre) {
            const voir = document.createElement('button');
            voir.type = 'button';
            voir.className = 'lien';
            voir.textContent = 'Ne montrer que ces enregistrements';
            voir.addEventListener('click', () => {
                const etat = this.o.etat();
                etat.facettes[c.filtre.cle] = new Set([c.filtre.valeur]);
                /* Ces valeurs sont masquées par défaut : les afficher est
                   nécessaire pour que le filtre ait un effet visible. */
                if (this.o.etat().masquees.has(c.filtre.valeur)) {
                    this.o.etat().masquees.delete(c.filtre.valeur);
                }
                this.o.onAfficherAbsents?.();
                this.o.onRafraichir();
            });
            actions.appendChild(voir);
        }

        if (c.exemples?.length) {
            const voir = document.createElement('button');
            voir.type = 'button';
            voir.className = 'lien';
            const ouvert = !!this.detailles[c.cle];
            voir.textContent = ouvert ? 'Masquer les exemples' : 'Voir des exemples';
            voir.addEventListener('click', () => {
                this.detailles[c.cle] = !ouvert;
                this.rendre(rows);
            });
            actions.appendChild(voir);
        }

        if (actions.childNodes.length) bloc.appendChild(actions);

        if (c.exemples?.length && this.detailles[c.cle]) {
            const ul = document.createElement('ul');
            ul.className = 'constat-exemples';
            c.exemples.forEach(e => {
                const li = document.createElement('li');
                li.textContent = e;
                ul.appendChild(li);
            });
            if (c.effectif > c.exemples.length) {
                const li = document.createElement('li');
                li.className = 'note';
                li.textContent = `… et ${c.effectif - c.exemples.length} autres`;
                ul.appendChild(li);
            }
            bloc.appendChild(ul);
        }

        /* Groupes de variantes : chaque valeur reste cliquable */
        if (c.groupes) {
            const ul = document.createElement('ul');
            ul.className = 'constat-groupes';
            c.groupes.slice(0, 12).forEach(g => {
                const li = document.createElement('li');
                g.valeurs.forEach((v, i) => {
                    if (i) li.appendChild(document.createTextNode(' ≈ '));
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'variante';
                    b.textContent = v;
                    b.title = `Filtrer sur « ${v} »`;
                    b.addEventListener('click', () => this.o.onFiltrer(c.champ, v));
                    this.o.onMenu?.(b, c.champ, v);
                    li.appendChild(b);
                });
                ul.appendChild(li);
            });
            if (c.groupes.length > 12) {
                const li = document.createElement('li');
                li.className = 'note';
                li.textContent = `… et ${c.groupes.length - 12} autres groupes`;
                ul.appendChild(li);
            }
            bloc.appendChild(ul);
        }

        return bloc;
    }
}
