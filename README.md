# BuildPilot

> **AI Engineering Control Plane**
> Turn a software backlog into autonomous, observable, verifiable engineering work.

BuildPilot is a self-hosted control plane for coordinating AI coding agents across intake, scheduling, isolated execution, testing, review, human approvals, and pull requests.

---

## 📖 Documentation & Architecture

- **[MAIN_README.md](./MAIN_README.md)**: Full architecture design, tech stack specification, and service boundaries.
- **[MASTER_TODO.md](./MASTER_TODO.md)**: Master task breakdown, execution roadmap, and live progress tracker.

---

## 🚀 Quick Start

### Prerequisites

- Node.js `>= 20.0.0`
- pnpm `>= 9.0.0`
- Docker & Docker Compose

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Environment Setup

```bash
cp .env.example .env
```

### 3. Start Local Infrastructure

```bash
docker compose -f infra/docker-compose.yml up -d
```

### 4. Run Development Stack

```bash
pnpm dev
```

---

## 🏗 Monorepo Layout

```text
build-pilot/
├── apps/
│   ├── web/                         # Next.js dashboard
│   ├── api/                         # Express.js control API
│   └── worker/                      # Background agent worker
│
├── packages/
│   ├── database/                    # MongoDB models & connection management
│   ├── domain/                      # Shared domain types & state machines
│   ├── llm/                         # Provider abstraction (OpenRouter, Gemini, OpenAI, etc.)
│   ├── github/                      # GitHub App client & webhook handlers
│   ├── tools/                       # Tool registry & typed tool schemas
│   ├── config/                      # Validated environment configuration
│   ├── observability/               # Pino structured logging & OpenTelemetry
│   └── shared/                      # Shared utility helpers
│
├── infra/                           # Docker compose & Caddy reverse proxy configs
├── scripts/                         # Development, seed, and benchmark scripts
└── docs/                            # Architecture decisions & API specifications
```
