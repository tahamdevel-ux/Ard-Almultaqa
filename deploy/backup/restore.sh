#!/bin/bash
# Usage: restore.sh /backups/ard-YYYYMMDD-HHMMSS.tar.enc
# Restores the database into $PGDATABASE (drops existing objects) and documents into /data/storage.
set -euo pipefail
[ -f /etc/backup.env ] && . /etc/backup.env
FILE=${1:?backup file}
TMP=$(mktemp -d)
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in "$FILE" | tar -C "$TMP" -xf -
pg_restore --clean --if-exists --no-owner -d "$PGDATABASE" "$TMP/db.dump"
if [ -w /data/storage ]; then tar -C /data -xzf "$TMP/documents.tar.gz"; else echo "documents are mounted read-only; extract $TMP/documents.tar.gz manually"; fi
echo "restore done"
