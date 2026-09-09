/**
 * ui/facettes.js
 * Les filtres. Une facette par champ retenu, avec pour chaque valeur son
 * effectif dans la sélection courante — hors sa propre facette.
 *
 * Trois gestes par valeur :
 *   case à cocher   ajouter / retirer de la sélection (OU dans la facette)
 *   ◎               ne garder que celle-ci
 *   ⊘               la mettre hors périmètre, partout dans l'outil
 */
import { FACETTES, champ, estAbsence } from '../core/champs.js';
import { comptesFacette, nombreFiltres, plier } from '../core/selection.js';
import { libelleDe } from '../core/reglages.js';
import { facetteDepliee, basculerFacette } from '../core/preferences.js';

export class Facettes {
    /**
     * @param hote     élément d'accueil
     * @param options  { records(), source(), etat(), reglages(), onChange() }
     */
    constructor(hote, options) {
        this.hote = hote;
        this.o = options;
        this.rechercheLocale = {};   // texte de filtrage par facette
    }

    rendre() {
        this.hote.innerHTML = '';
        const source   = this.o.source();
        const records  = this.o.records();
        const etat     = this.o.etat();
        const reglages = this.o.reglages();

        FACETTES[source].forEach(cle => {
            const def = champ(source, cle);
            if (!def) return;

            const comptes = comptesFacette(records, source, etat, cle);
            const choix   = etat.facettes[cle] || new Set();

            const valeurs = Object.keys(comptes).sort((a, b) => {
                if (def.nature === 'temporel') {
                    return String(b).localeCompare(String(a), 'fr', { numeric: true });
                }
                /* Ordre imposé (tranches de durée) : le classer par effectif
                   rendrait la progression illisible. */
                if (def.ordre) {
                    const ra = def.ordre.indexOf(a), rb = def.ordre.indexOf(b);
                    if (ra !== -1 || rb !== -1) {
                        return (ra === -1 ? 1e9 : ra) - (rb === -1 ? 1e9 : rb);
                    }
                }
                const aAbs = estAbsence(a), bAbs = estAbsence(b);
                if (aAbs !== bAbs) return aAbs ? 1 : -1;
                if (comptes[b] !== comptes[a]) return comptes[b] - comptes[a];
                return String(a).localeCompare(String(b), 'fr');
            });
            if (!valeurs.length) return;

            const depliee = facetteDepliee(source, cle);
            const bloc = document.createElement('section');
            bloc.className = 'facette' + (depliee ? ' facette-ouverte' : '');

            /* En-tête dépliant.
               Sept facettes déployées saturent la colonne : on n'ouvre que
               celle qu'on interroge. Le repli est mémorisé, comme celui des
               figures. */
            const tete = document.createElement('div');
            tete.className = 'facette-tete';

            const bascule = document.createElement('button');
            bascule.type = 'button';
            bascule.className = 'facette-bascule';
            bascule.setAttribute('aria-expanded', String(depliee));
            const fleche = document.createElement('span');
            fleche.className = 'facette-fleche';
            fleche.textContent = depliee ? '▾' : '▸';
            const titre = document.createElement('h3');
            titre.textContent = def.libelle;
            bascule.append(fleche, titre);

            /* Nombre de valeurs cochées, visible même repliée : une facette
               fermée ne doit jamais dissimuler un filtre actif. */
            if (choix.size) {
                const compte = document.createElement('span');
                compte.className = 'facette-compte';
                compte.textContent = choix.size;
                bascule.appendChild(compte);
            }
            bascule.addEventListener('click', () => {
                basculerFacette(source, cle);
                this.o.onChange();
            });
            tete.appendChild(bascule);

            if (choix.size) {
                const vider = document.createElement('button');
                vider.type = 'button';
                vider.className = 'lien facette-vider';
                vider.textContent = '✕';
                vider.title = 'Retirer cette sélection';
                vider.addEventListener('click', e => {
                    e.stopPropagation();
                    const etatCourant = this.o.etat();
                    etatCourant.facettes[cle] = new Set();
                    this.o.onChange();
                });
                tete.appendChild(vider);
            }
            bloc.appendChild(tete);

            /* Repliée avec une sélection : les valeurs retenues sont
               rappelées, sinon le filtre agirait sans se montrer. */
            if (!depliee && choix.size) {
                const rappel = document.createElement('p');
                rappel.className = 'facette-rappel';
                const noms = [...choix].map(v => libelleDe(reglages, cle, v))
                    .sort((a, b) => String(a).localeCompare(String(b), 'fr'));
                rappel.textContent = noms.length > 3
                    ? `${noms.slice(0, 3).join(', ')} et ${noms.length - 3} autre(s)`
                    : noms.join(', ');
                rappel.title = noms.join('\n');
                bloc.appendChild(rappel);
            }

            if (!depliee) { this.hote.appendChild(bloc); return; }

            const liste = document.createElement('ul');
            liste.className = 'facette-liste';

            /* Recherche intra-facette au-delà de neuf valeurs */
            if (valeurs.length > 9) {
                const rech = document.createElement('input');
                rech.type = 'search';
                rech.className = 'facette-recherche';
                rech.placeholder = `Filtrer (${valeurs.length} valeurs)`;
                rech.value = this.rechercheLocale[cle] || '';
                rech.addEventListener('input', () => {
                    this.rechercheLocale[cle] = rech.value;
                    const q = plier(rech.value);
                    [...liste.children].forEach(li => {
                        li.hidden = q !== '' && !plier(li.dataset.recherche).includes(q);
                    });
                });
                bloc.appendChild(rech);
            }

            const q = plier(this.rechercheLocale[cle] || '');

            valeurs.forEach((identite, i) => {
                const libelle = libelleDe(reglages, cle, identite);
                const li = document.createElement('li');
                li.dataset.recherche = identite + ' ' + libelle;
                if (q && !plier(li.dataset.recherche).includes(q)) li.hidden = true;

                const id = `f-${cle}-${i}`;
                const case_ = document.createElement('input');
                case_.type = 'checkbox';
                case_.id = id;
                case_.checked = choix.has(identite);
                case_.addEventListener('change', () => {
                    const e = this.o.etat();
                    const sel = new Set(e.facettes[cle] || []);
                    if (sel.has(identite)) sel.delete(identite); else sel.add(identite);
                    e.facettes[cle] = sel;
                    this.o.onChange();
                });

                const etiquette = document.createElement('label');
                etiquette.htmlFor = id;
                etiquette.textContent = libelle;
                etiquette.title = libelle === identite ? libelle : `${libelle} (valeur d'origine : ${identite})`;
                if (estAbsence(identite)) etiquette.classList.add('valeur-absente');

                const nb = document.createElement('span');
                nb.className = 'facette-nombre';
                nb.textContent = comptes[identite];

                const seul = document.createElement('button');
                seul.type = 'button';
                seul.className = 'facette-action action-seul';
                seul.textContent = '◎';
                seul.title = 'N’afficher que cette valeur';
                seul.addEventListener('click', () => {
                    const e = this.o.etat();
                    e.facettes[cle] = new Set([identite]);
                    this.o.onChange();
                });

                const masquer = document.createElement('button');
                masquer.type = 'button';
                masquer.className = 'facette-action action-masquer';
                masquer.textContent = '⊘';
                masquer.title = 'Mettre cette valeur hors périmètre';
                masquer.addEventListener('click', () => {
                    const e = this.o.etat();
                    e.masquees.add(identite);
                    const sel = new Set(e.facettes[cle] || []);
                    sel.delete(identite);
                    e.facettes[cle] = sel;
                    this.o.onChange();
                });

                this.o.onMenu?.(li, cle, identite);
                li.append(case_, etiquette, nb, seul, masquer);
                liste.appendChild(li);
            });

            bloc.appendChild(liste);
            this.hote.appendChild(bloc);
        });
    }
}

/** Bouton de réinitialisation, hors du bloc de facettes. */
export function rendreReinitialisation(bouton, etat, onChange) {
    const n = nombreFiltres(etat);
    bouton.hidden = n === 0;
    bouton.textContent = `Réinitialiser les filtres (${n})`;
    bouton.onclick = () => {
        etat.facettes = {};
        etat.recherche = '';
        onChange();
    };
}
