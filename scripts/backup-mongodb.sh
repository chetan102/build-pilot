#!/bin/bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/buildpilot}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
CONTAINER_NAME="${CONTAINER_NAME:-buildpilot-mongodb}"
DB_NAME="${DB_NAME:-buildpilot}"

mkdir -p "${BACKUP_DIR}"

echo "Starting automated MongoDB backup for ${DB_NAME} at ${TIMESTAMP}..."
docker exec "${CONTAINER_NAME}" mongodump --db "${DB_NAME}" --archive --gzip > "${BACKUP_DIR}/mongodb_backup_${TIMESTAMP}.gz"

echo "Backup completed successfully: ${BACKUP_DIR}/mongodb_backup_${TIMESTAMP}.gz"
echo "Cleaning up backups older than 14 days..."
find "${BACKUP_DIR}" -type f -name "mongodb_backup_*.gz" -mtime +14 -delete
echo "Backup lifecycle maintenance complete."
