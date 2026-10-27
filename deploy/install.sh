#!/bin/bash
# One-shot installer for a fresh Ubuntu/Debian VPS. Run as root:
#   curl -fsSL <raw url of this file> | bash -s -- <git-repo-url> <domain>
# or copy the repo to the server and run:  bash deploy/install.sh <git-repo-url> <domain>
set -euo pipefail

REPO=${1:?usage: install.sh <git-repo-url> <domain>}
DOMAIN=${2:?usage: install.sh <git-repo-url> <domain>}
DIR=/opt/ard-almultaqa
BRANCH=${BRANCH:-claude/new-session-amlm6y}  # change to main after merging

command -v docker >/dev/null || { echo ">> installing Docker"; curl -fsSL https://get.docker.com | sh; }
command -v git >/dev/null || apt-get install -y git

if [ -d "$DIR/.git" ]; then git -C "$DIR" fetch origin && git -C "$DIR" checkout "$BRANCH" && git -C "$DIR" pull --ff-only origin "$BRANCH"
else git clone --branch "$BRANCH" "$REPO" "$DIR"; fi
cd "$DIR"

if [ ! -f .env ]; then
  echo ">> generating secrets in $DIR/.env  (keep a copy of this file somewhere safe!)"
  cat > .env <<ENV
DOMAIN=$DOMAIN
DB_PASSWORD=$(openssl rand -hex 24)
APP_SECRET=$(openssl rand -hex 32)
BACKUP_PASSPHRASE=$(openssl rand -hex 24)
RCLONE_REMOTE=
ENV
  chmod 600 .env
fi

docker compose up -d --build
echo ">> waiting for the app to answer..."
for i in $(seq 1 60); do docker compose exec -T app node -e "fetch('http://localhost:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" && break || sleep 3; done

read -r -p "Admin username to create: " AU
read -r -s -p "Admin password (8+ chars): " AP; echo
docker compose exec -T app npx tsx prisma/create-admin.ts "$AU" "$AP" "مدير النظام"
echo ">> done: https://$DOMAIN  (DNS for $DOMAIN must point to this server; HTTPS certificate is issued automatically)"
