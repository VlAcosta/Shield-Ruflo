#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/bis-shield}"
RUN_USER="${RUN_USER:-acosta}"
RUN_GROUP="${RUN_GROUP:-acosta}"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
BACKEND="$APP_DIR/backend"
ENV_FILE="$BACKEND/.env"

[[ -x "$NODE_BIN" ]] || { echo "Node executable not found: $NODE_BIN" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE" >&2; exit 1; }
[[ -f "$BACKEND/dist/server.js" ]] || { echo "Missing backend/dist/server.js. Run the backend build first." >&2; exit 1; }
[[ -f "$BACKEND/dist/worker.js" ]] || { echo "Missing backend/dist/worker.js. Run the backend build first." >&2; exit 1; }

sudo tee /etc/systemd/system/bis-shield-api.service >/dev/null <<EOF
[Unit]
Description=Business Shield Fastify API
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_GROUP}
WorkingDirectory=${BACKEND}
EnvironmentFile=${ENV_FILE}
ExecStart=${NODE_BIN} ${BACKEND}/dist/server.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
KillSignal=SIGTERM
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=read-only
ProtectSystem=full
UMask=0027
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/bis-shield-worker.service >/dev/null <<EOF
[Unit]
Description=Business Shield durable background worker
After=network-online.target docker.service bis-shield-api.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_GROUP}
WorkingDirectory=${BACKEND}
EnvironmentFile=${ENV_FILE}
ExecStart=${NODE_BIN} ${BACKEND}/dist/worker.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
KillSignal=SIGTERM
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=read-only
ProtectSystem=full
UMask=0027
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable bis-shield-api bis-shield-worker
sudo systemctl restart bis-shield-api
sudo systemctl restart bis-shield-worker

sudo systemctl is-active --quiet bis-shield-api
sudo systemctl is-active --quiet bis-shield-worker

curl -fsS http://127.0.0.1:8081/health >/dev/null
curl -fsS http://127.0.0.1:8081/health/ready >/dev/null

printf '✅ bis-shield-api active\n'
printf '✅ bis-shield-worker active\n'
printf '✅ API/PostgreSQL health ready\n'
