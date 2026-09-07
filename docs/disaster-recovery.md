# BuildPilot Disaster Recovery & Database Restoration Guide

## 1. Backup Schedule
- Automated hourly/daily snapshots generated via `scripts/backup-mongodb.sh`.
- Backups archived to `/var/backups/buildpilot/mongodb_backup_<timestamp>.gz`.

## 2. Restore Procedure
To restore a snapshot into MongoDB:

```bash
# 1. Copy or locate the backup archive
BACKUP_FILE="/var/backups/buildpilot/mongodb_backup_20260907_000000.gz"

# 2. Stream restore into container
docker exec -i buildpilot-mongodb mongorestore --archive --gzip --drop < "${BACKUP_FILE}"

# 3. Verify collection indexes and entity counts
docker exec -it buildpilot-mongodb mongosh buildpilot --eval "db.tasks.countDocuments()"
```

## 3. Worker Reconnection & Task Recovery
1. When MongoDB is restored, restart the worker container:
   `docker compose -f infra/docker-compose.prod.yml restart worker`
2. Stalled tasks are automatically detected by `CrashRecoveryService` and retried from their last checkpoint.
