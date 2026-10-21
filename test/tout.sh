#!/bin/sh
# Lance l'ensemble des vérifications.
cd "$(dirname "$0")/../.." || exit 1
node valo/test/moteur.mjs    || exit 1
node valo/test/interface.mjs || exit 1
node valo/test/effets.mjs    || exit 1
node valo/test/styles.mjs    || exit 1
# Mise en page : demande un vrai navigateur, jsdom n'ayant pas de moteur de
# rendu. Le fichier passe son tour de lui-même si Playwright est absent.
node valo/test/mise-en-page.mjs || exit 1
echo "Tout est vert."
