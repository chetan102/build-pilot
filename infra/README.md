# Infrastructure

Local infrastructure services for BuildPilot.

## Services

- **MongoDB 7.0**: Application database (task definitions, runs, steps, logs, artifacts).
- **Redis 7.0 (Alpine)**: BullMQ async job queue and real-time coordination.
- **Caddy 2.0 (Alpine)**: Reverse proxy and routing layer (optional for local dev, used in production).

---

## Commands

### 1. Start Services (MongoDB + Redis)

```bash
docker compose -f infra/docker-compose.yml up -d
```

### 2. Check Health Status

```bash
docker compose -f infra/docker-compose.yml ps
```

Expected health status:
- `buildpilot-mongodb` — `Up (healthy)`
- `buildpilot-redis` — `Up (healthy)`

### 3. View Service Logs

```bash
# All services
docker compose -f infra/docker-compose.yml logs -f

# MongoDB logs only
docker compose -f infra/docker-compose.yml logs -f mongodb

# Redis logs only
docker compose -f infra/docker-compose.yml logs -f redis
```

### 4. Stop Services

```bash
docker compose -f infra/docker-compose.yml down
```

### 5. Stop and Wipe Volumes (Reset State)

```bash
docker compose -f infra/docker-compose.yml down -v
```

---

## Networking & Security

- MongoDB and Redis bind to `127.0.0.1` locally and communicate with apps via the isolated `buildpilot-network` bridge.
- Neither MongoDB nor Redis are exposed to public interfaces.
