#!/bin/sh
# Lance l'ensemble des vérifications.
cd "$(dirname "$0")/../.." || exit 1
node valo/test/moteur.mjs    || exit 1
node valo/test/interface.mjs || exit 1
node valo/test/effets.mjs    || exit 1
node valo/test/styles.mjs    || exit 1
echo "Tout est vert."
