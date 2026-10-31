#!/bin/bash
# Run ON THE SERVER (by GitHub Actions over SSH, or by hand): pulls the latest code of a branch and rebuilds the stack.
#   bash /opt/ard-almultaqa/deploy/update.sh [branch]
set -euo pipefail
DIR=/opt/ard-almultaqa
BRANCH=${1:-${BRANCH:-main}}
cd "$DIR"
git fetch --prune origin
git checkout -q "$BRANCH"
git reset --hard "origin/$BRANCH"
# build first while the old version keeps serving; the switch itself then takes only a few seconds
docker compose build
docker compose up -d --remove-orphans
docker image prune -f >/dev/null
echo "deployed $(git rev-parse --short HEAD) from $BRANCH"
