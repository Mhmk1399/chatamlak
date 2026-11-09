# Install via Docker

:::tip Infrastructure Note
This guide uses Docker Compose and is designed for **IaaS** (Infrastructure as a Service — self-hosted VPS or dedicated virtual machines running Docker Engine). If you are deploying to managed cloud platforms (PaaS / CaaS) like Render, Railway, AWS ECS, Google Cloud Run, or Kubernetes, see the [Cloud Deployment](./Cloud-Deployment.md) guide.
:::

**Prerequisites (Ubuntu 22.04+ instructions):**

- An Ubuntu server with sudo access
- A domain name pointing to your server's public IP (recommended)
- A MongoDB 8 replica set or suitable Atlas deployment reachable from the application container

## 1. System Setup

Install these packages:

```bash
sudo apt install -y ca-certificates gnupg lsb-release
```

Add Docker official GPG key:

```bash
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
```

Add Docker apt repository:

```bash
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

Install Docker Engine + Compose plugin:

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Optional: run Docker without `sudo`:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

Optional: Verify installation:

```bash
docker --version
docker compose version
docker run hello-world
```

## 2. Clone repository

Set `OUJ_CHAT_REPOSITORY_URL` to the trusted repository URL supplied by your deployment maintainer, or copy a reviewed source checkout to `/opt/ouj-chat`. No public project repository is assumed here.

```bash
sudo mkdir -p /opt/ouj-chat
cd /opt/ouj-chat
git clone "$OUJ_CHAT_REPOSITORY_URL" .
```

## 3. Configure environment

Copy the example environment file and edit it:

```bash
cp .env.example .env
nano .env
```

:::info MongoDB connection required
The main `docker-compose.yaml` runs the application and nginx against an **external MongoDB replica set or Atlas deployment**. Fill the intentionally blank `MONGODB_URI` in your private `.env` and keep `DB_CLIENT=mongodb` and `MONGODB_DATABASE=ouj_chat`. Use hostnames reachable from the application container, including the member hostnames advertised by the replica set. The main file does not provision a SQL database or import old data. See [MongoDB](./MongoDB.md) for setup and migration.

The separate `docker-compose.mongo.yaml` is for development with Node.js running **on the host**. It publishes MongoDB on `127.0.0.1:27017` and advertises `localhost:27017`; that address does not point from the application container to the host database. Do not combine the two Compose files as an application/database stack. Follow the [host development setup](./MongoDB#local-mongodb-with-docker) instead.

The `ouj-chat-data` volume still preserves local upload binaries and local runtime files; it is not the MongoDB database volume. Back up the configured MongoDB deployment and file volume separately.
:::

:::info Media Worker Container
The all-in-one application container manages a local Media Worker child process by default. You can also configure a standalone worker; see [Media Worker](./Media-Worker.md). When selecting a published application or worker image, verify that it contains the version and database support you intend to deploy.
:::

## 4. Set up TLS certificates

The nginx container requires TLS certificate files before it can start. Place your certificate and private key at:

- `certs/cert.pem` — certificate (or full chain)
- `certs/key.pem` — private key

See [SSL Certificates](./SSL-Certificates.md) for the available options.

## 5. Build and start

Build the checked-out source and start the containers:

```bash
cd /opt/ouj-chat
docker compose up -d --build
```

The main Compose file builds the local source by default. To use a published image instead, explicitly select a release that includes this MongoDB implementation; an upstream image tag alone is not evidence that it contains the changes in your checkout.

The nginx container waits for the app to pass its health check before it starts accepting traffic. This prevents 502 errors during the brief startup window while database initialization runs.

Optional: verify the containers started successfully:

```bash
docker compose ps
docker compose logs -f
```

:::info Nginx configuration

The nginx container serves HTTPS on port 443 using the certificates from the `certs/` directory. To customise the nginx config, refer to [Configure Nginx](./Nginx-Configuration.md). After editing `nginx/nginx.conf`, restart the nginx container:

```bash
docker compose restart nginx
```

:::

## Runtime User and Persistent Data

Docker deployments do not use `ouj-chat.service`. Ouj Chat runs as the user configured for the container (root in the current image unless Compose `user:` overrides it), and database commands run as that same container UID/GID:

```bash
docker compose exec ouj-chat npm --prefix /app/server run db:inspect
```

To run the container as a specific non-root UID/GID, configure `user:` in your Compose service:

```yaml
services:
  ouj-chat:
    user: "ouj-chat:ouj-chat"
```

When using a bind mount instead of the default named volume, make the host directory writable by that same UID:GID before starting Ouj Chat. Ouj Chat does not change host bind-mount ownership automatically:

```bash
mkdir -p ./data
sudo chown -R ouj-chat:ouj-chat ./data
```

## Admin panel service control

The admin panel's **Restart service** and **Stop service** actions work in Docker deployments by calling the Docker Engine API through the mounted socket (`/var/run/docker.sock`). The compose file sets `OUJ_CHAT_CONTAINER_NAME=ouj-chat` so the app knows which container to target.

If you rename the container or use a custom name, set the env var to match:

```yaml
# docker-compose.yaml
environment:
  OUJ_CHAT_CONTAINER_NAME: my-custom-name
```

If you do not need service control from the admin panel, you can remove the socket mount from `docker-compose.yaml`:

```yaml
# Remove or comment out this line under ouj-chat volumes:
# - /var/run/docker.sock:/var/run/docker.sock
```

## Updating

Update your source checkout, then rebuild and restart:

```bash
cd /opt/ouj-chat
docker compose up -d --build
```

If you explicitly selected a published image, pull that chosen version before restarting. See the [Updating](./Updating.md) page for backups, database compatibility and the full procedure.
