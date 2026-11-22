#!/bin/bash
# Mise en ligne sur un serveur, lancée en SSH (ou par une tâche planifiée) :
#   SURVOL_DEST=~/chemin/du/site ~/survol-ecrins-src/scripts/deploy.sh
# Voir docs/DEPLOIEMENT.md.
# GitHub teste et construit le site à chaque envoi, puis le publie sur la branche « site ».
# Ce script ne fait que récupérer cette branche et la copier dans le dossier du site :
# aucun npm ni Node sur le serveur, très peu de mémoire. Aucune clé : le dépôt est public.
#
# Tout le travail est dans une fonction : bash la lit en entier avant de l'exécuter,
# donc le script peut se mettre à jour lui-même pendant qu'il tourne.
set -euo pipefail

main() {
  local here
  here="$(cd "$(dirname "$0")/.." && pwd)"
  # Par défaut, la branche « site » vient du même dépôt que ce script.
  local repo="${SURVOL_REPO:-$(git -C "$here" remote get-url origin)}"
  local site="${SURVOL_SITE:-$HOME/survol-ecrins-site}"
  local dest="${SURVOL_DEST:-$HOME/www/survol-ecrins}"

  # Le script lui-même (branche main), pour la prochaine fois.
  git -C "$here" fetch --quiet origin main && git -C "$here" reset --quiet --hard origin/main || true

  # Le site construit (branche site).
  if [ ! -d "$site/.git" ]; then
    git clone --quiet --depth 1 --branch site "$repo" "$site"
  else
    git -C "$site" fetch --quiet --depth 1 origin site
    git -C "$site" reset --quiet --hard FETCH_HEAD
  fi
  echo "Version : $(git -C "$site" log -1 --format='%s (%cd)' --date=format:'%d/%m/%Y %H:%M')"

  mkdir -p "$dest"
  # P data/ : les données déjà présentes dans data/ sur le serveur ne sont jamais effacées.
  if command -v rsync >/dev/null; then
    rsync -a --delete --exclude .git --filter='P data/' "$site/" "$dest/"
  else
    find "$dest" -mindepth 1 -maxdepth 1 ! -name data -exec rm -rf {} +
    tar -C "$site" --exclude=.git -cf - . | tar -C "$dest" -xf -
  fi
  echo "Site à jour dans $dest."
}

main "$@"
exit
