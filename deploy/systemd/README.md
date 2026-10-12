# Business Shield systemd operations

## Daily PostgreSQL backup

Install:

```bash
sudo install -m 0644 deploy/systemd/bis-shield-backup.service /etc/systemd/system/bis-shield-backup.service
sudo install -m 0644 deploy/systemd/bis-shield-backup.timer /etc/systemd/system/bis-shield-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now bis-shield-backup.timer
sudo systemctl start bis-shield-backup.service
```

Defaults:
- daily around 03:30 server local time, with up to 15 minutes randomized delay;
- 14-day retention;
- backups under `/home/acosta/business-shield-backups/daily`;
- custom-format PostgreSQL dump + SHA-256 manifest;
- backend environment snapshot saved mode 0600;
- single-instance lock prevents overlapping runs.

## Optional S3-compatible off-site copy

Install AWS CLI v2, then create `/etc/business-shield/backup-offsite.env` mode 0600:

```env
BACKUP_S3_BUCKET=...
BACKUP_S3_REGION=...
BACKUP_S3_ENDPOINT=https://...
BACKUP_S3_PREFIX=business-shield
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

The daily job detects this file and uploads the completed backup directory.
Without that file, local backup remains fully functional and the off-site stage is skipped.
