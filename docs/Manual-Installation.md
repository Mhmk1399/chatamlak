# Manual Installation

**Prerequisites (Ubuntu 22.04+ instructions):**

- An Ubuntu server with sudo access
- A domain name pointing to your server's public IP (recommended)
- A reachable MongoDB 8 replica set or suitable Atlas deployment; configure it using the [MongoDB guide](./MongoDB.md).

## 1. System setup

Update and install required packages:

```bash
sudo apt update
sudo apt install -y git curl build-essential nginx python3-certbot-nginx ffmpeg
```

Install Node.js and npm (pick one):

| Method | Best for | Note |
|---|---|---|
| NodeSource | Most installs (recommended) | System-wide install via apt. |
| nvm | Per-user Node version management | Requires `nvm install` / `nvm use` after cloning. |
| Volta | Pinned toolchain per project | Installs a specific Node/npm version. |

**NodeSource (Recommended)**:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
```

**nvm**:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/latest/install.sh | bash
```

**Volta**:

```bash
curl https://get.volta.sh | bash
volta install node@24.22.1 npm@11.18.0
```

## 2. Clone repository

Set `OUJ_CHAT_REPOSITORY_URL` to the trusted repository URL supplied by your deployment maintainer, or copy a reviewed source checkout to `/opt/ouj-chat`. No public project repository is assumed here.

```bash
sudo mkdir -p /opt/ouj-chat
cd /opt/ouj-chat
git clone "$OUJ_CHAT_REPOSITORY_URL" .
```

:::info

If you installed Node.js using nvm:

```bash
nvm install
nvm use
```

:::

## 3. Configure MongoDB and install dependencies

From the repository root, copy `.env.example` to `.env` and fill the intentionally blank `MONGODB_URI` with your replica-set/Atlas URI. Keep `MONGODB_DATABASE=ouj_chat`. A standalone MongoDB server and the old SQL environment variables are not runtime substitutes.

```bash
cd /opt/ouj-chat
cp .env.example .env
npm install
npm --prefix client install
npm --prefix server install
npm --prefix worker install
npm run build
```

Use `npm run dev` for local development, or `npm --prefix server run start` to run the built API/application. The service below needs the same private environment and a reachable MongoDB primary. See [MongoDB](./MongoDB.md) for Docker/local replica-set setup, Atlas, import, backups and tests.

## 4. Create systemd service

Create `/etc/systemd/system/ouj-chat.service` with the following:

```ini
[Unit]
Description=Ouj Chat server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/ouj-chat/server
ExecStart=/usr/bin/env node /opt/ouj-chat/server/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

:::info

- If you installed Node.js using nvm, set this as Node path in `ExecStart`:

```ini
ExecStart=/root/.nvm/versions/node/v24.22.1/bin/node index.js
```

- If you installed Node.js using volta, set this as Node path in `ExecStart`:

```ini
ExecStart=/root/.volta/bin/node index.js
```

:::

**Recommended: Create a dedicated user:**

:::warning

Skip this step if you installed Node.js using nvm or volta.

:::

Due to security concerns, it is recommended to create a dedicated system user and change ownership of the project directory:

1. Add these lines to systemd service file:

```ini
User=ouj-chat
Group=ouj-chat
```

2. Create a dedicated system user:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin ouj-chat
```

3. Change ownership of the project directory:

```bash
sudo chown -R ouj-chat:ouj-chat /opt/ouj-chat
git config --global --add safe.directory /opt/ouj-chat
```

4. Grant the service user permission to control its own unit and read system logs (required for service restart/stop and the Logs tab in the admin panel):

```bash
sudo tee /etc/sudoers.d/ouj-chat > /dev/null <<'EOF'
# Ouj Chat — allow the service user to control its own unit
# and read privileged logs without a password.
ouj-chat ALL=(root) NOPASSWD: /usr/bin/systemctl restart ouj-chat.service
ouj-chat ALL=(root) NOPASSWD: /usr/bin/systemctl stop ouj-chat.service
ouj-chat ALL=(root) NOPASSWD: /usr/bin/journalctl -u ouj-chat *
ouj-chat ALL=(root) NOPASSWD: /usr/bin/journalctl -u ouj-chat-worker *
ouj-chat ALL=(root) NOPASSWD: /usr/bin/cat /var/log/nginx/error.log
ouj-chat ALL=(root) NOPASSWD: /usr/bin/cat /var/log/nginx/access.log
ouj-chat ALL=(root) NOPASSWD: /usr/bin/nginx -t
ouj-chat ALL=(root) NOPASSWD: /usr/bin/systemctl reload nginx
EOF
sudo chmod 0440 /etc/sudoers.d/ouj-chat
```

Without this step the **Restart service** and **Stop service** buttons in the admin panel will fail with a permissions error, and system logs (service journal, nginx) will not be visible in the Logs tab.

**Enable and start the service:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ouj-chat.service
```
