# Business Shield external monitoring

Recommended starter setup: Better Stack.

## External HTTP monitors

Create two HTTP status monitors:

1. https://bis-shield.ru/health
2. https://bis-shield.ru/health/ready

Both must return HTTP 2xx. The readiness endpoint additionally verifies PostgreSQL.

Suggested check interval:
- /health: 60 seconds
- /health/ready: 60 seconds

Add SSL/domain expiration monitoring for bis-shield.ru as a separate monitor.

## Daily backup heartbeat

Create a heartbeat named `Business Shield daily PostgreSQL backup`.

Schedule:
- expected every 24 hours
- cron currently runs at 03:30 Europe/Moscow
- recommended grace period: 60 minutes

Create the private file:

```bash
mkdir -p /home/acosta/.config/business-shield
chmod 700 /home/acosta/.config/business-shield
cp deploy/monitoring/monitoring.env.example /home/acosta/.config/business-shield/monitoring.env
chmod 600 /home/acosta/.config/business-shield/monitoring.env
```

Replace the example heartbeat URL with the secret URL from Better Stack.

The backup job:
- pings the heartbeat URL after a successful local + optional off-site backup;
- calls `/fail` when the backup command exits non-zero;
- never prints the secret URL.

## Off-site backups

Recommended initial storage: Yandex Object Storage.

Expected environment file for the existing uploader:
`/etc/business-shield/backup-offsite.env`

Required values:
- BACKUP_S3_BUCKET
- BACKUP_S3_REGION=ru-central1
- BACKUP_S3_ENDPOINT=https://storage.yandexcloud.net
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY

Use a dedicated service account restricted to the backup bucket.
