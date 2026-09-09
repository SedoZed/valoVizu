/**
 * ui/liste.js
 * Fenêtre de consultation d'une liste de valeurs.
 *
 * Sert à ouvrir un regroupement « Autres ». Un lien déplié sous la figure
 * suffisait à consulter le contenu, mais il s'insérait mal dans la lecture :
 * la figure sautait, et les valeurs listées n'offraient qu'une seule action.
 * La fenêtre les présente à part, avec pour chacune le même jeu de gestes que
 * partout ailleurs.
 */
import { attacherMenu } from './menu.js';

const plier = t => String(t ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

let ouverte = null;

export function fermerListe() {
    if (!ouverte) return;
    ouverte.remove();
    ouverte = null;
    document.removeEventListener('keydown', surTouche, true);
}

function surTouche(e) {
    if (e.key === 'Escape') { e.preventDefault(); fermerListe(); }
}

/**
 * @param options
 *   titre       intitulé de la fenêtre
 *   sousTitre   précision facultative
 *   valeurs     [{ valeur, effectif }]
 *   unite       mot employé pour les effectifs
 *   selection   Set des valeurs déjà retenues dans le filtre
 *   epinglees   Set des valeurs déjà détachées du regroupement
 *   onDetailler (valeur) => void     sortir la valeur du regroupement
 *   onFiltrer   (valeur) => void     restreindre la sélection à cette valeur
 *   onIsoler    (valeur) => void     n'afficher que celle-ci
 *   onMasquer   (valeur) => void     mettre hors périmètre
 *   onToutDetailler () => void       sortir toutes les valeurs du regroupement
 */
export function ouvrirListe(options) {
    fermerListe();
    const {
        titre, sousTitre, valeurs = [], unite = 'éléments',
        selection = new Set(), epinglees = new Set(),
        onDetailler, onFiltrer, onIsoler, onMasquer, onToutDetailler,
    } = options;

    const fond = document.createElement('div');
    fond.className = 'modale';
    fond.addEventListener('click', e => { if (e.target === fond) fermerListe(); });

    const carte = document.createElement('div');
    carte.className = 'modale-carte modale-liste';
    carte.setAttribute('role', 'dialog');
    carte.setAttribute('aria-modal', 'true');
    fond.appendChild(carte);

    const tete = document.createElement('div');
    tete.className = 'modale-tete';
    const h = document.createElement('h2');
    h.textContent = titre;
    const fermer = document.createElement('button');
    fermer.type = 'button';
    fermer.className = 'btn btn-petit';
    fermer.textContent = 'Fermer';
    fermer.addEventListener('click', fermerListe);
    tete.append(h, fermer);
    carte.appendChild(tete);

    if (sousTitre) {
        const p = document.createElement('p');
        p.className = 'note';
        p.textContent = sousTitre;
        carte.appendChild(p);
    }

    const recherche = document.createElement('input');
    recherche.type = 'search';
    recherche.placeholder = `Rechercher parmi ${valeurs.length} valeurs…`;
    carte.appendChild(recherche);

    const compteur = document.createElement('p');
    compteur.className = 'note';
    carte.appendChild(compteur);

    const liste = document.createElement('ul');
    liste.className = 'liste-valeurs';
    carte.appendChild(liste);

    const total = valeurs.reduce((s, v) => s + v.effectif, 0);

    const dessiner = () => {
        const q = plier(recherche.value);
        const visibles = q ? valeurs.filter(v => plier(v.valeur).includes(q)) : valeurs;
        compteur.textContent = q
            ? `${visibles.length} sur ${valeurs.length} valeurs`
            : `${valeurs.length} valeurs, ${total} ${unite} au total`;

        liste.innerHTML = '';
        if (!visibles.length) {
            const vide = document.createElement('li');
            vide.className = 'note';
            vide.textContent = 'Aucune valeur ne correspond.';
            liste.appendChild(vide);
            return;
        }

        visibles.forEach(v => {
            const li = document.createElement('li');
            li.className = 'liste-ligne'
                + (selection.has(v.valeur) ? ' choisie' : '')
                + (epinglees.has(v.valeur) ? ' epinglee' : '');

            const nom = document.createElement('span');
            nom.className = 'liste-nom';
            nom.textContent = v.valeur;
            nom.title = v.valeur;

            const nb = document.createElement('span');
            nb.className = 'liste-nombre';
            nb.textContent = v.effectif;

            const actions = document.createElement('span');
            actions.className = 'liste-actions';

            const bouton = (libelle, aide, action, classe) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'liste-action' + (classe ? ' ' + classe : '');
                b.textContent = libelle;
                b.title = aide;
                b.addEventListener('click', action);
                return b;
            };

            /* Action première : détacher du regroupement. La valeur rejoint
               les autres barres de la figure, sans que la sélection bouge —
               au contraire d'un filtre, qui écarterait tout le reste. */
            if (onDetailler) {
                const deja = epinglees.has(v.valeur);
                actions.appendChild(bouton(
                    deja ? '− regrouper' : '+ afficher',
                    deja
                        ? 'Remettre cette valeur dans le regroupement'
                        : 'Afficher cette valeur dans la figure, à côté des autres',
                    () => { onDetailler(v.valeur); dessiner(); },
                    deja ? '' : 'liste-primaire'));
            }
            if (onFiltrer) {
                actions.appendChild(bouton(
                    selection.has(v.valeur) ? '− filtre' : '+ filtre',
                    selection.has(v.valeur)
                        ? 'Retirer cette valeur du filtre'
                        : 'Restreindre la sélection à cette valeur',
                    () => { onFiltrer(v.valeur); fermerListe(); }));
            }
            if (onIsoler) {
                actions.appendChild(bouton('◎', 'N’afficher que cette valeur',
                    () => { onIsoler(v.valeur); fermerListe(); }));
            }
            if (onMasquer) {
                actions.appendChild(bouton('⊘', 'Mettre cette valeur hors périmètre',
                    () => { onMasquer(v.valeur); fermerListe(); }, 'liste-danger'));
            }

            li.append(nom, nb, actions);

            attacherMenu(li, v.valeur, () => [
                onDetailler && {
                    libelle: epinglees.has(v.valeur)
                        ? 'Remettre dans le regroupement'
                        : 'Afficher dans la figure',
                    action: () => { onDetailler(v.valeur); dessiner(); },
                },
                onFiltrer && {
                    libelle: selection.has(v.valeur) ? 'Retirer du filtre' : 'Ajouter au filtre',
                    action: () => { onFiltrer(v.valeur); fermerListe(); },
                },
                onIsoler && {
                    libelle: 'N’afficher que cette valeur',
                    action: () => { onIsoler(v.valeur); fermerListe(); },
                },
                onMasquer && {
                    separateurAvant: true, danger: true,
                    libelle: 'Masquer cette valeur',
                    action: () => { onMasquer(v.valeur); fermerListe(); },
                },
            ].filter(Boolean));

            liste.appendChild(li);
        });
    };

    recherche.addEventListener('input', dessiner);
    dessiner();

    if (onToutDetailler) {
        const pied = document.createElement('div');
        pied.className = 'modale-actions';
        const tout = document.createElement('button');
        tout.type = 'button';
        tout.className = 'btn';
        tout.textContent = 'Afficher toutes ces valeurs dans la figure';
        tout.title = 'Le regroupement cesse d’en être un : chaque valeur '
                   + 'reparaît séparément, sans que la sélection change.';
        tout.addEventListener('click', () => { onToutDetailler(); fermerListe(); });
        pied.appendChild(tout);
        carte.appendChild(pied);
    }

    document.body.appendChild(fond);
    document.addEventListener('keydown', surTouche, true);
    recherche.focus();
    ouverte = fond;
    return fond;
}
