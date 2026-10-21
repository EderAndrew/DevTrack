#!/usr/bin/env bash
# Daily dump of the DevTrack beta database (docs/deploy/hostinger.md). Run as root from cron:
#   30 3 * * * /home/devtrack/devtrack/deploy/hostinger/backup.sh >> /var/log/devtrack-backup.log 2>&1
# Keeps the last KEEP_DAYS dumps in BACKUP_DIR. Copy them off the VPS as well: a dump on the same disk
# does not survive the loss of the machine.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/devtrack}"
KEEP_DAYS="${KEEP_DAYS:-14}"
CONTAINER="${CONTAINER:-devtrack-prod-postgres-1}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
file="$BACKUP_DIR/devtrack-$(date +%Y%m%d-%H%M%S).dump"

docker exec "$CONTAINER" pg_dump -U devtrack -d devtrack -Fc > "$file.partial"
mv "$file.partial" "$file"
find "$BACKUP_DIR" -name 'devtrack-*.dump' -mtime +"$KEEP_DAYS" -delete

echo "$(date -Is) ok $(du -h "$file" | cut -f1) $file"
