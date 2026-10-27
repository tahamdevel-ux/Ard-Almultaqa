#!/bin/bash
# Daily: pg_dump + documents tarball, encrypted with AES-256, kept 14 days, optionally copied off-server with rclone.
set -euo pipefail
[ -f /etc/backup.env ] && . /etc/backup.env
STAMP=$(date +%Y%m%d-%H%M%S)
TMP=$(mktemp -d)
pg_dump -Fc "$PGDATABASE" > "$TMP/db.dump"
tar -C /data -czf "$TMP/documents.tar.gz" storage
tar -C "$TMP" -cf - db.dump documents.tar.gz \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -out "/backups/ard-$STAMP.tar.enc"
rm -rf "$TMP"
find /backups -name 'ard-*.tar.enc' -mtime +14 -delete
if [ -n "${RCLONE_REMOTE:-}" ]; then rclone copy /backups "$RCLONE_REMOTE" --include 'ard-*.tar.enc'; fi
echo "backup ok: ard-$STAMP.tar.enc"
