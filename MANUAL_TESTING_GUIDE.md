# BuildPilot — Manual Testing & Learning Guide 🧑‍💻📚

> **Hands-on verification and rapid engineering learning guide for BuildPilot.**
> For each task, this guide breaks down:
> 1. 📂 **Key Files to Study** — Exactly which source files to read to understand the implementation.
> 2. 🔄 **Execution & Data Flow** — How data flows across processes, databases, and layers.
> 3. 💡 **Core Concepts & Why It's Built This Way** — Software design patterns, enterprise tradeoffs, and best practices.
> 4. 🧪 **How to Manually Run & Test** — Copy-pasteable CLI commands and expected outputs.

---

## 📋 Table of Contents

- [Phase 0 — Infrastructure & Monorepo](#phase-0--infrastructure--monorepo)
  - [Task 0.1: Monorepo & Build Toolchain](#task-01-monorepo--scripts)
  - [Task 0.2: Container Infrastructure (MongoDB & Redis)](#task-02-docker-infrastructure-mongodb--redis)
- [Phase 1 — Web Dashboard Shell & Domain Types](#phase-1--web-dashboard-shell--domain-types)
  - [Task 1.1: Next.js Web Dashboard](#task-11-nextjs-web-dashboard)
  - [Task 1.2: Domain Types & Finite State Machine](#task-12-domain-types--state-machine)
- [Phase 2 — Database Layer](#phase-2--database-layer)
  - [Task 2.1: MongoDB Connection Manager](#task-21-mongodb-connection-manager)
  - [Task 2.2: Mongoose Models & Repositories](#task-22-mongoose-models--repositories)
- [Phase 3 — Control API](#phase-3--control-api)
  - [Task 3.1: Express Application Shell & Correlation Tracing](#task-31-express-application-shell)
  - [Task 3.2: Task & Project API (4-Tier Architecture)](#task-32-task--project-api-4-tier-architecture)
- [Phase 4 — Queue + Worker](#phase-4--queue--worker)
  - [Task 4.1: Redis + BullMQ Queue Engine](#task-41-redis--bullmq-queue-setup)
  - [Task 4.2: Worker Service Foundation & State Persistence](#task-42-worker-service-foundation--state-persistence)
- [Phase 5 — LLM Provider Layer](#phase-5--llm-provider-layer)
  - [Task 5.1: Generic Provider Contract & Factory Architecture](#task-51-generic-provider-contract--factory-architecture)
  - [Task 5.2: OpenRouter Provider Adapter & Tool Calling](#task-52-openrouter-provider-adapter--tool-calling)
  - [Task 5.3: OpenAI-Compatible Provider Adapter (Local Ollama, Groq, vLLM)](#task-53-openai-compatible-provider-adapter-local-ollama-groq-vllm)
- [Phase 6 — Agent Runtime](#phase-6--agent-runtime)
  - [Task 6.1: Context Builder & Token Budget Management](#task-61-context-builder--token-budget-management)

---

## Phase 0 — Infrastructure & Monorepo

### Task 0.1: Monorepo & Scripts

#### 📂 Key Files to Study:
- [`package.json`](./package.json) — Monorepo root scripts, dependencies, and workspace engines.
- [`pnpm-workspace.yaml`](./pnpm-workspace.yaml) — Defines the `apps/*` and `packages/*` workspace glob topology.
- [`turbo.json`](./turbo.json) — Turborepo task pipeline (`build`, `test`, `lint`, `typecheck`) with caching dependencies (`^build`).
- [`tsconfig.base.json`](./tsconfig.base.json) — Shared strict TypeScript compiler configuration.

#### 🔄 Architecture Flow:
```text
Root Monorepo (pnpm + turborepo)
   ├── packages/ (domain, database, queue, observability, config, tools, github, llm)
   └── apps/     (web: Next.js, api: Express, worker: BullMQ)
```

#### 💡 Core Concepts & Why It's Built This Way:
- **Pnpm Workspaces**: Uses symlinked node_modules with content-addressable storage, saving disk space and ensuring 100% deterministic dependency resolution.
- **Turborepo Dependency Graph (`^build`)**: Tells Turborepo to build upstream packages (like `@buildpilot/domain` and `@buildpilot/database`) before building downstream consumers (like `@buildpilot/api` or `@buildpilot/web`).
- **Shared Compiler Target**: Setting `NodeNext` and strict typechecking across all sub-packages ensures types match seamlessly when imported across packages.

#### 🧪 How to Manually Run & Test:
```bash
# 1. Verify TypeScript compiles across all 12 packages
pnpm run typecheck

# 2. Run ESLint across all workspaces
pnpm run lint

# 3. Build all packages in parallel (observe Turbo caching)
pnpm run build
```

---

### Task 0.2: Docker Infrastructure (MongoDB & Redis)

#### 📂 Key Files to Study:
- [`infra/docker-compose.yml`](./infra/docker-compose.yml) — Multi-container definition for MongoDB 7 and Redis 7 with healthchecks and persistent volumes.
- [`.env.example`](./.env.example) — Standardized environment variable template.

#### 🔄 Architecture Flow:
```text
Host Machine (Node.js apps)
   ├── mongodb://localhost:27017 ──> Docker Container (buildpilot-mongodb: persistent volume)
   └── redis://localhost:6379   ──> Docker Container (buildpilot-redis: in-memory cache & queues)
```

#### 💡 Core Concepts & Why It's Built This Way:
- **Separation of Concerns**: MongoDB handles relational/document persistence (Tasks, Projects, Runs, Logs), while Redis handles high-throughput in-memory job queues and inter-process locking.
- **Docker Healthchecks**: The API and Worker services depend on databases being fully initialized. Docker healthchecks (`mongosh --eval "db.adminCommand('ping')"` and `redis-cli ping`) prevent starting app servers before DBs are ready.

#### 🧪 How to Manually Run & Test:
```bash
# 1. Start MongoDB & Redis containers in background
docker compose -f infra/docker-compose.yml up -d

# 2. Check container health status
docker compose -f infra/docker-compose.yml ps

# 3. Inspect Redis directly
docker exec -it buildpilot-redis redis-cli ping
# Expected response: PONG

# 4. Inspect MongoDB directly
docker exec -it buildpilot-mongodb mongosh --eval "db.adminCommand('ping')"
# Expected response: { ok: 1 }
```

---

## Phase 1 — Web Dashboard Shell & Domain Types

### Task 1.1: Next.js Web Dashboard

#### 📂 Key Files to Study:
- [`apps/web/src/app/layout.tsx`](./apps/web/src/app/layout.tsx) — Root layout with responsive navigation sidebar and top header.
- [`apps/web/src/app/dashboard/page.tsx`](./apps/web/src/app/dashboard/page.tsx) — Main control plane dashboard with real-time stats and execution charts.
- [`apps/web/src/app/tasks/page.tsx`](./apps/web/src/app/tasks/page.tsx) — 15-state Kanban task board.
- [`apps/web/src/components/DiffViewer.tsx`](./apps/web/src/components/DiffViewer.tsx) — Syntax-highlighted patch and Git diff reviewer.

#### 🔄 UI Navigation Flow:
```text
/ (Home) ──> /dashboard (Metrics & Quick Actions)
          ──> /projects  (Repository Management)
          ──> /tasks     (Kanban Board: Queued -> In-Progress -> Awaiting Approval -> Completed)
          ──> /tasks/:id (Live Step Logs, Diff Viewer, Human Approval Actions)
          ──> /settings  (LLM Provider Keys: OpenRouter, Anthropic, OpenAI)
```

#### 💡 Core Concepts & Why It's Built This Way:
- **Server Components + Client Components**: Next.js App Router allows rendering static layout skeletons on the server while keeping interactive elements (diff viewers, modals, kanban drag/drop) fast and reactive on the client.
- **Human-in-the-Loop AI UX**: Engineering agents generate code diffs that require human approval before git push. The `DiffViewer` and `/tasks/:id` detail page are designed specifically for developer review.

#### 🧪 How to Manually Run & Test:
```bash
pnpm run dev:web
```
**Action:** Open [http://localhost:3000](http://localhost:3000) in your browser:
- Check `/dashboard`, `/projects`, `/tasks`, and `/settings/providers`.
- Toggle themes, test responsive sidebar collapse, and inspect task status badges.

---

### Task 1.2: Domain Types & State Machine

#### 📂 Key Files to Study:
- [`packages/domain/src/task.ts`](./packages/domain/src/task.ts) — 15 Task states, Task priorities, and data schemas.
- [`packages/domain/src/events.ts`](./packages/domain/src/events.ts) — 20+ strongly-typed system event schemas.
- [`packages/domain/src/state-machine.ts`](./packages/domain/src/state-machine.ts) — Task lifecycle Finite State Machine (`TaskStateMachine`, `ALLOWED_TASK_TRANSITIONS`).

#### 🔄 State Machine Lifecycle:
```text
QUEUED ──> PLANNING ──> CODING ──> TESTING ──> AWAITING_APPROVAL ──> COMPLETED
   │           │           │          │               │
   └───> FAILED / CANCELLED / BLOCKED ◄────────────────┘
```

#### 💡 Core Concepts & Why It's Built This Way:
- **Finite State Machine (FSM)**: Long-running AI agents can fail at any point (LLM rate limit, syntax error, failed unit tests). An FSM guarantees that tasks can only move through verified paths (e.g. you cannot jump from `QUEUED` directly to `COMPLETED`).
- **Domain-Driven Design (DDD)**: By placing domain entities in `@buildpilot/domain`, both the frontend Next.js app and the backend API import the exact same TypeScript types and validation schemas.

#### 🧪 How to Manually Run & Test:
```bash
pnpm --filter @buildpilot/domain test
```
**What you learn:** Observe how `TaskStateMachine.transition(task, 'COMPLETED')` throws `InvalidStateTransitionError` when called on a task that is currently in `QUEUED` state.

---

## Phase 2 — Database Layer

### Task 2.1: MongoDB Connection Manager

#### 📂 Key Files to Study:
- [`packages/database/src/connection.ts`](./packages/database/src/connection.ts) — `DatabaseManager` singleton with connection retry logic, pool sizing, and latency ping.
- [`packages/database/src/errors.ts`](./packages/database/src/errors.ts) — Custom typed database errors (`DatabaseConnectionError`, `EntityNotFoundError`).

#### 🔄 Connection Lifecycle Flow:
```text
connectToDatabase({ uri })
   ├── Validate URI format (Zod)
   ├── Establish Mongoose connection (poolSize: 10, serverSelectionTimeoutMS: 5000)
   ├── Attach process listeners (SIGINT/SIGTERM -> graceful disconnect)
   └── healthCheck() -> ping latency ms + connection state (0: disconnected, 1: connected)
```

#### 💡 Core Concepts & Why It's Built This Way:
- **Connection Pooling**: Managing a pool of persistent TCP sockets avoids the massive latency overhead of opening a new MongoDB connection on every incoming HTTP request.
- **Graceful Shutdown**: When a container receives `SIGTERM`, it closes pending queries before exiting to prevent database document corruption.

#### 🧪 How to Manually Run & Test:
```bash
pnpm --filter @buildpilot/database test src/index.test.ts
```

---

### Task 2.2: Mongoose Models & Repositories

#### 📂 Key Files to Study:
- [`packages/database/src/models/`](./packages/database/src/models) — 16 Mongoose Schemas (`TaskModel`, `ProjectModel`, `TaskRunModel`, `EventModel`, `AgentStepModel`, etc.).
- [`packages/database/src/repositories/`](./packages/database/src/repositories) — Type-safe repository abstraction layer (`TaskRepository`, `ProjectRepository`, `EventRepository`).
- [`packages/database/src/models/task.model.ts`](./packages/database/src/models/task.model.ts) — Task Mongoose schema, compound indexes, and interface bindings.
- [`packages/database/src/repositories/task.repository.ts`](./packages/database/src/repositories/task.repository.ts) — Type-safe repository abstraction layer for task mutations and atomic state queries.

#### 🔄 Repository Pattern Flow:
```text
API Controller / Service
       │ (calls clean domain methods: findById, updateStatus, createWithRun)
       ▼
TaskRepository (Hides Mongoose specifics)
       │ (runs schema validation, compound indexes, timestamps)
       ▼
MongoDB Database Engine
```

#### 💡 Core Concepts & Why It's Built This Way:
- **Repository Pattern**: Never write raw database queries (`TaskModel.findOneAndUpdate(...)`) inside HTTP controllers. Encapsulating queries inside repository classes allows changing the underlying DB or mocking data in unit tests effortlessly.
- **Compound Database Indexes**: Queries like `db.tasks.find({ projectId: "xyz", status: "QUEUED" })` use compound index `{ projectId: 1, status: 1 }` to scan only matching index pointers instead of performing full table scans.

#### 🧪 How to Manually Run & Test:
```bash
pnpm --filter @buildpilot/database test src/models.test.ts
```

---

## Phase 3 — Control API

### Task 3.1: Express Application Shell & Correlation Tracing

#### 📂 Key Files to Study:
- [`apps/api/src/server.ts`](./apps/api/src/server.ts) — Server entrypoint, environment bootloader, and graceful signal handling.
- [`apps/api/src/app.ts`](./apps/api/src/app.ts) — Express middleware pipeline setup.
- [`apps/api/src/middleware/correlation.middleware.ts`](./apps/api/src/middleware/correlation.middleware.ts) — Injects and propagates `x-correlation-id`.
- [`apps/api/src/middleware/error.middleware.ts`](./apps/api/src/middleware/error.middleware.ts) — Global error handler mapping domain errors to HTTP status codes.

#### 🔄 HTTP Request Pipeline:
```text
Incoming HTTP Request
   │
   ▼
1. Correlation Middleware (Extracts or generates UUID `x-correlation-id`)
   │
   ▼
2. Request Logger Middleware (Pino structured log with correlation ID)
   │
   ▼
3. Security & Parser Middleware (Helmet, CORS, JSON Body Parser)
   │
   ▼
4. Route Handlers (/health, /ready, /api/v1/projects, /api/v1/tasks)
   │
   ▼
5. Global Error Middleware (Formats uniform JSON error response with correlation ID)
```

#### 💡 Core Concepts & Why It's Built This Way:
- **Correlation IDs in Distributed Systems**: When 100 concurrent tasks are executing across API servers and Worker nodes, logs get interleaved. By tagging every log statement with `correlationId`, you can run a single query like `grep correlationId="123"` to see the entire history of that single request.
- **Liveness vs. Readiness Probes**:
  - `/health`: Liveness probe — answers "Is the Node process alive?" (Fast, no DB calls).
  - `/ready`: Readiness probe — answers "Are MongoDB and Redis healthy to accept traffic?"

#### 🧪 How to Manually Run & Test:
```bash
# 1. Start the API
pnpm run dev:api

# 2. In another terminal, inspect headers and correlation ID
curl -i http://localhost:4000/health

# 3. Test readiness probe formatted with jq
curl -s http://localhost:4000/ready | jq .
```
**Expected Response:**
```http
HTTP/1.1 200 OK
x-correlation-id: 7b32d2c1-840e-4361-9c87-bbbb61fa71cf
Content-Type: application/json; charset=utf-8

{"status":"healthy","timestamp":"2026-09-06T09:30:00.000Z","service":"buildpilot-control-api"}
```

---

### Task 3.2: Task & Project API (4-Tier Architecture)

#### 📂 Key Files to Study:
- [`apps/api/src/controllers/task.controller.ts`](./apps/api/src/controllers/task.controller.ts) — Request input validation via Zod schemas and HTTP response translation.
- [`apps/api/src/services/task.service.ts`](./apps/api/src/services/task.service.ts) — Business orchestration & BullMQ dispatch.
- [`packages/database/src/repositories/task.repository.ts`](./packages/database/src/repositories/task.repository.ts) — Task persistence abstraction.

#### 🔄 4-Tier Architecture Flow:
```mermaid
sequenceDiagram
    participant Client as Web Dashboard / cURL
    participant Route as Express Route
    participant Controller as TaskController
    participant Service as TaskService
    participant Repo as TaskRepository
    participant DB as MongoDB
    participant Queue as BullMQ / Redis

    Client->>Route: POST /api/v1/projects/:id/tasks
    Route->>Controller: createTask(req, res)
    Controller->>Controller: Validate Zod Schema
    Controller->>Service: createTaskForProject(data)
    Service->>Repo: Increment issue number & save task
    Repo->>DB: db.tasks.insertOne(...)
    Service->>Queue: Enqueue task:execute job
    Queue->>Redis: Save job in Redis hash/queue
    Service-->>Controller: Return created Task entity
    Controller-->>Client: 201 Created (JSON Task + Run info)
```

#### 💡 Core Concepts & Why It's Built This Way:
- **Clean 4-Tier Layering**:
  1. **Routes**: Pure URL matching (0 logic).
  2. **Controllers**: Input validation (Zod) and HTTP status translation.
  3. **Services**: Business rules (auto-generating branch names, validating FSM transitions, enqueuing background jobs).
  4. **Repositories**: Database persistence queries.
- **Asynchronous Task Offloading**: The HTTP request does NOT execute the AI agent. It creates the task in MongoDB, enqueues a job into Redis, and returns `201 Created` within 10ms. The background worker picks up the heavy execution asynchronously.

#### 🧪 How to Manually Run & Test:
```bash
# 1. Create a project (piped to jq)
curl -s -X POST http://localhost:4000/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "Backend Service", "description": "Core control plane"}' | jq .

# 2. List projects (piped to jq)
curl -s http://localhost:4000/api/v1/projects | jq .

# 3. Create a task under the project (auto-generates issue number and branch, piped to jq)
curl -s -X POST http://localhost:4000/api/v1/projects/backend-service/tasks \
  -H "Content-Type: application/json" \
  -d '{"repositoryId": "repo_1", "title": "Implement rate limiting"}' | jq .

# 4. List tasks with filtering (piped to jq)
curl -s "http://localhost:4000/api/v1/tasks?status=QUEUED" | jq .

# 5. Cancel a task (validates transition to CANCELLED)
curl -s -X POST http://localhost:4000/api/v1/tasks/<TASK_ID>/cancel \
  -H "Content-Type: application/json" \
  -d '{"reason": "Cancelled by user"}' | jq .

# 6. Retry a cancelled/failed task (validates transition back to QUEUED)
curl -s -X POST http://localhost:4000/api/v1/tasks/<TASK_ID>/retry | jq .
```

---

## Phase 4 — Queue + Worker

### Task 4.1: Redis + BullMQ Queue Engine

#### 📂 Key Files to Study:
- [`packages/queue/src/queue.ts`](./packages/queue/src/queue.ts) — `TaskQueueManager` (Job Producer) for dispatching tasks with deduplication IDs.
- [`packages/queue/src/worker.ts`](./packages/queue/src/worker.ts) — `TaskWorkerManager` (Job Consumer) with concurrency control and lifecycle hooks.
- [`apps/worker/src/worker.ts`](./apps/worker/src/worker.ts) — Worker process entrypoint and signal handling.

#### 🔄 Queue & Worker Data Flow:
```mermaid
flowchart LR
    subgraph API_Process["apps/api (Producer)"]
        API[TaskService]
        QueueManager[TaskQueueManager]
    end

    subgraph Redis_Engine["Redis In-Memory Engine"]
        JobQueue[("BullMQ List & Hash\n(Job Payload)")]
        Locks[("Distributed Locks\n(Lua Scripts)")]
        PubSub[("Pub/Sub Channels\n(Job Events)")]
    end

    subgraph Worker_Process["apps/worker (Consumer)"]
        WorkerManager[TaskWorkerManager]
        WorkerService[Worker Execution Loop]
    end

    API -->|1. enqueueTask()| QueueManager
    QueueManager -->|2. LPUSH job payload| JobQueue
    WorkerManager -->|3. Atomic Lock & Pop| Locks
    JobQueue -.-> WorkerManager
    WorkerManager -->|4. processJob()| WorkerService
    WorkerService -->|5. Publish progress/completion| PubSub
```

#### 💡 Core Concepts & Why It's Built This Way:
- **Why BullMQ + Redis?**: BullMQ is a Node.js library (code), not a database. It uses Redis as its high-speed in-memory engine to persist job queues, coordinate distributed locks (so multiple worker nodes don't execute the same task at once), and handle delayed retries.
- **Deterministic Job IDs (`${taskId}__${runId}`)**: Setting the job ID to `taskId__runId` prevents duplicate jobs from ever being enqueued twice if the API or user retries a request (BullMQ uses `__` as custom delimiter).
- **Exponential Backoff**: When jobs fail (e.g. LLM rate limit), BullMQ uses Redis Sorted Sets (`ZSET`) to delay retrying for 2s, 4s, 8s automatically without blocking any Node.js event loop.

#### 🧠 In Simple Words: How Does the Worker Know a Task Was Created?
> **The Doorbell Analogy 🔔**
> 1. `apps/api` and `apps/worker` **never talk directly to each other** (they run in separate terminal windows / servers).
> 2. When the **Worker** starts up, it connects to Redis and says: *"I'm going to sleep. Ring my phone the exact millisecond a new task arrives in the queue"* (this is an open TCP network socket with the Redis `BLMOVE` blocking command). The worker uses **0% CPU** while sleeping.
> 3. When you make an API request, `apps/api` drops the new task into Redis.
> 4. Redis instantly **rings the open line** to the sleeping worker.
> 5. The Worker wakes up in **less than 1 millisecond**, grabs the task data, and executes it!

#### 🧪 How to Manually Run & Test:

##### Step 1: Ensure Containers Are Running
```bash
docker compose -f infra/docker-compose.yml up -d
```

##### Step 2: Start the API in Terminal 1
```bash
pnpm run dev:api
```

##### Step 3: Start the Worker in Terminal 2
```bash
pnpm run dev:worker
```

##### Step 4: Check Dual Readiness (MongoDB + Redis) in Terminal 3
```bash
curl -s http://localhost:4000/ready | jq .
```
**Expected Output:**
```json
{
  "status": "ready",
  "database": { "status": "healthy", "latencyMs": 2 },
  "redis": { "status": "healthy", "latencyMs": 1 }
}
```

##### Step 5: Dispatch a Task to the Background Queue
```bash
curl -s -X POST http://localhost:4000/api/v1/projects/backend-service/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "repositoryId": "repo_demo",
    "title": "Async worker demo",
    "description": "Queued into BullMQ"
  }' | jq .
```

##### Step 6: Observe Terminal 2 (Worker Output)
The background worker instantly consumes the job from Redis with correlated `jobId: taskId__runId` without blocking the API:
```text
[INFO] (task-worker): Job execution started (jobId: taskId__runId)
[INFO] (agent-worker): Processing engineering task job
[INFO] (task-worker): Job execution completed successfully
```

---

### Task 4.2: Worker Service Foundation & State Persistence

#### 📂 Key Files to Study:
- [`apps/worker/src/worker.ts`](./apps/worker/src/worker.ts) — Worker service implementation, atomic state transition lifecycle, and shutdown handling.
- [`packages/database/src/repositories/task-run.repository.ts`](./packages/database/src/repositories/task-run.repository.ts) — `TaskRunRepository` with atomic create, status updates, completion, and failure tracking.
- [`packages/queue/src/worker.ts`](./packages/queue/src/worker.ts) — BullMQ `Worker` encapsulation, concurrency throttling, and connection options.

#### 🔄 Worker Execution & Persistence Flow:
```mermaid
sequenceDiagram
    autonumber
    participant API as apps/api
    participant Redis as Redis Queue (BullMQ)
    participant Worker as apps/worker
    participant DB as MongoDB (Tasks / Runs / Events)

    API->>Redis: 1. enqueueTask({ taskId, runId, branch, ... })
    Redis-->>Worker: 2. Redis BLMOVE wakes Worker with Job
    Worker->>DB: 3. Create TaskRun (status: RUNNING, startedAt)
    Worker->>DB: 4. Update Task (status: PLANNING, activeRunId: runId)
    Worker->>DB: 5. Insert Event (type: TASK_RUN_STARTED)
    Note over Worker: 6. Execute Agent Workflow Pipeline
    alt Job Succeeded
        Worker->>DB: 7a. Update TaskRun (status: COMPLETED, durationMs)
        Worker->>DB: 8a. Update Task (status: COMPLETED, completedRunId: runId)
        Worker->>DB: 9a. Insert Event (type: TASK_RUN_COMPLETED)
    else Job Failed (e.g. rate limit / build error)
        Worker->>DB: 7b. Update TaskRun (status: FAILED, errorMessage)
        Worker->>DB: 8b. Insert Event (type: TASK_RUN_FAILED)
        Worker->>DB: 9b. Update Task (status: FAILED if attempts exhausted)
    end
```

#### 💡 Core Concepts & Why It's Built This Way:
- **Task vs TaskRun Entity Separation**: A `Task` represents the persistent business issue (e.g. "Fix auth token bug"). A `TaskRun` represents a specific execution attempt with its own LLM provider, prompt parameters, duration, and error trace. Retrying a task spawns a new `TaskRun` without losing history of previous attempts.
- **Atomic State Transitions**: Status transitions (`QUEUED` $\rightarrow$ `PLANNING` $\rightarrow$ `COMPLETED`/`FAILED`) are persisted in MongoDB at each milestone, ensuring the control plane reflects the exact state of work even if the host abruptly restarts.
- **Audit Trail via Events Collection**: Every key lifecycle event (`TASK_RUN_STARTED`, `TASK_RUN_COMPLETED`, `TASK_RUN_FAILED`) is logged to the `events` collection with microsecond timestamps, powering the real-time activity stream on the web dashboard.
- **Graceful Shutdown & Active Job Drainage**: On `SIGTERM` / `SIGINT`, the worker immediately pauses intake of new jobs from Redis (`worker.pause()`), waits for actively executing jobs to finish cleanly (`worker.close()`), disconnects the MongoDB client, and exits with code 0.

#### 🧪 How to Manually Run & Test:

##### Step 1: Ensure Containers & Services Are Running
In Terminal 1 (API):
```bash
pnpm run dev:api
```

In Terminal 2 (Worker):
```bash
pnpm run dev:worker
```

##### Step 2: Create a Project (if not created yet) in Terminal 3
```bash
curl -s -X POST http://localhost:4000/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Backend Service",
    "slug": "backend-service",
    "ownerId": "user_demo"
  }' | jq .
```

##### Step 3: Dispatch an Engineering Task to the Queue
```bash
curl -s -X POST http://localhost:4000/api/v1/projects/backend-service/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "repositoryId": "repo_demo",
    "title": "Optimize DB Query Indexing",
    "description": "Add compound index for faster lookup"
  }' | jq .
```
**Capture the `_id` from the output as `TASK_ID` (e.g. `6a9cf2425d9b845db6781a18`).**

##### Step 4: Verify Worker Processed and Persisted the Job
Observe Terminal 2 (Worker) — notice the structured logs tracking the complete lifecycle:
```text
[INFO] (agent-worker): Worker picked up engineering task job (taskId: "...", runId: "...")
[INFO] (agent-worker): Executing agent workflow pipeline (placeholder for Phase 5)
[INFO] (agent-worker): Job execution completed successfully (durationMs: ...)
```

##### Step 5: Query Task Details & Verify `TaskRun` in MongoDB via API
```bash
curl -s http://localhost:4000/api/v1/tasks/<TASK_ID> | jq .
```
**Expected Output:**
```json
{
  "task": {
    "_id": "<TASK_ID>",
    "title": "Optimize DB Query Indexing",
    "status": "COMPLETED",
    "activeRunId": "<RUN_ID>",
    "completedRunId": "<RUN_ID>"
  },
  "runs": [
    {
      "_id": "<RUN_ID>",
      "taskId": "<TASK_ID>",
      "status": "COMPLETED",
      "provider": "OPENROUTER",
      "model": "anthropic/claude-3.5-sonnet",
      "maxSteps": 30,
      "durationMs": 12
    }
  ],
  "steps": []
}
```

##### Step 6: Test Graceful Worker Shutdown
In Terminal 2, press `Ctrl+C`:
```text
^C
[INFO] (agent-worker): Stopping Agent Worker Service gracefully...
[INFO] (agent-worker): Agent Worker Service stopped cleanly
```
The worker gracefully drains in-flight jobs, disconnects from MongoDB and Redis, and terminates without errors.

---

## Phase 5 — LLM Provider Layer

### Task 5.1: Generic Provider Contract & Factory Architecture

#### 📂 Key Files to Study:
- [`packages/llm/src/interfaces.ts`](./packages/llm/src/interfaces.ts) — Generic `LLMProvider` contract (`generate`, `stream`, `supports`, `getCapabilities`).
- [`packages/llm/src/types.ts`](./packages/llm/src/types.ts) — Normalized `LLMRequest`, `LLMResponse`, `ToolDefinition`, `ToolCall`, `ToolResult`, and token usage data types.
- [`packages/llm/src/factory.ts`](./packages/llm/src/factory.ts) — `ProviderFactory` dynamic registry, instantiation, and instance caching.
- [`packages/llm/src/errors.ts`](./packages/llm/src/errors.ts) — Normalized provider error hierarchy (`RateLimitError`, `AuthError`, `InvalidRequestError`, `ProviderTimeoutError`, `ContextWindowExceededError`).
- [`packages/llm/src/base-provider.ts`](./packages/llm/src/base-provider.ts) — `BaseLLMProvider` abstract template and `MockLLMProvider` for offline testing.

#### 🔄 LLM Provider Contract Architecture:
```mermaid
flowchart TD
    subgraph Agent_Runtime["Agent Runtime (apps/worker)"]
        AgentLoop["Agent Core Loop (Phase 6)"]
        Context["Context Builder (Phase 6)"]
    end

    subgraph Generic_Contract["Generic LLM Contract (@buildpilot/llm)"]
        LLMProvider["interface LLMProvider\n(generate, stream, supports)"]
        Types["Normalized Data Types\n(LLMRequest, LLMResponse, ToolCall, ToolResult)"]
        Errors["Normalized Error Hierarchy\n(RateLimitError, AuthError, TimeoutError)"]
        Factory["ProviderFactory\n(Dynamic Registry & Cache)"]
    end

    subgraph Provider_Adapters["Provider Adapters (Phase 5)"]
        OpenRouter["OpenRouterProvider\n(Task 5.2)"]
        OpenAI["OpenAICompatibleProvider\n(Task 5.3)"]
        Anthropic["AnthropicProvider"]
        Mock["MockLLMProvider\n(Offline & CI)"]
    end

    AgentLoop -->|Calls generate() / stream()| LLMProvider
    Context -->|Constructs| Types
    AgentLoop -.->|Handles normalized errors| Errors
    AgentLoop -->|Requests provider instance| Factory
    Factory -->|Instantiates| OpenRouter
    Factory -->|Instantiates| OpenAI
    Factory -->|Instantiates| Anthropic
    Factory -->|Instantiates| Mock
```

#### 💡 Core Concepts & Why It's Built This Way:
- **Dependency Inversion Principle (DIP)**: Agent code depends strictly on the abstract `LLMProvider` interface, never on third-party vendor SDKs (`openai`, `@anthropic-ai/sdk`, `@google/genai`). Switching between OpenRouter, local Ollama, Groq, or OpenAI requires zero changes to the agent loop.
- **Normalized Tool Calling Standard**: Different LLM vendors represent tool calls differently (e.g. OpenAI's `tool_calls` vs Anthropic's `tool_use` blocks vs Gemini's `functionCall`). `@buildpilot/llm` unifies them into standard `ToolDefinition`, `ToolCall`, and `ToolResult` schemas.
- **Normalized Error Hierarchy**: Vendor-specific HTTP status codes and JSON error objects are parsed into standard error classes (`RateLimitError`, `AuthError`, `ProviderTimeoutError`, `ContextWindowExceededError`) with explicit `retryable: boolean` flags. This tells BullMQ queue workers and agent loops whether to back off and retry or fail immediately.
- **Dynamic Factory & Offline Mockability**: `providerFactory` provides decoupled registration and instance caching. Built-in `MockLLMProvider` enables 100% offline unit tests and CI testing without needing live API tokens or spending LLM credits.

#### 🧪 How to Manually Run & Test:

##### Step 1: Run the LLM Package Test Suite
```bash
pnpm --filter @buildpilot/llm test
```
**Expected Output:**
```text
 ✓ src/index.test.ts (19 tests)
 Test Files  1 passed (1)
      Tests  19 passed (19)
```

##### Step 2: Verify Monorepo Full Typecheck & Build
```bash
pnpm run typecheck && pnpm run build
```
Verify that all 12 monorepo packages compile cleanly without type mismatches.

---

### Task 5.2: OpenRouter Provider Adapter & Tool Calling

#### 📂 Key Files to Study:
- [`packages/llm/src/openrouter.ts`](./packages/llm/src/openrouter.ts) — `OpenRouterProvider` adapter with system prompt prepending, tool definition formatting, response parsing, error normalization, and SSE streaming.
- [`packages/llm/src/openrouter.test.ts`](./packages/llm/src/openrouter.test.ts) — Comprehensive unit test suite with mock fetch fixtures covering tool calling, rate limiting, and SSE streaming.
- [`packages/llm/src/scripts/test-openrouter.ts`](./packages/llm/src/scripts/test-openrouter.ts) — Standalone CLI demonstration script.

#### 🔄 OpenRouter Adapter Execution Flow:
```mermaid
sequenceDiagram
    autonumber
    participant Agent as Agent Loop (apps/worker)
    participant Adapter as OpenRouterProvider
    participant OpenRouter as OpenRouter API (api/v1/chat/completions)

    Agent->>Adapter: 1. generate({ model, messages, tools, systemPrompt })
    Note over Adapter: 2. Formats messages + OpenAI tools schema
    Adapter->>OpenRouter: 3. POST /chat/completions (JSON payload + Bearer Auth)
    alt API Responds Successfully
        OpenRouter-->>Adapter: 4a. 200 OK (choices with tool_calls / message content)
        Note over Adapter: 5a. Normalizes tool_calls (JSON.parse arguments) + TokenUsage
        Adapter-->>Agent: 6a. Returns normalized LLMResponse
    else Rate Limited / Error
        OpenRouter-->>Adapter: 4b. 429 Too Many Requests / 401 Auth Error
        Note over Adapter: 5b. Maps status to RateLimitError / AuthError
        Adapter-->>Agent: 6b. Throws normalized LLMError (with retryable flag)
    end
```

#### 💡 Core Concepts & Why It's Built This Way:
- **Unified Multi-Model Gateway**: OpenRouter provides a single standard API to route prompts to 200+ models (Anthropic Claude 3.5 Sonnet, OpenAI GPT-4o, DeepSeek-R1, Gemini 1.5 Pro) with consistent tool-calling semantics.
- **Resilient Tool Argument Deserialization**: In tool calling, LLMs return tool arguments as stringified JSON. The adapter parses the JSON into typed JavaScript objects while gracefully preserving `rawArguments` if partial output is received.
- **Automatic Status Code Normalization**: HTTP error responses are intercepted and transformed into strongly typed error classes:
  - `401/403` $\rightarrow$ `AuthError` (`retryable: false`)
  - `429` $\rightarrow$ `RateLimitError` (`retryable: true`)
  - `400 (context limit)` $\rightarrow$ `ContextWindowExceededError` (`retryable: false`)
  - `408/Timeout` $\rightarrow$ `ProviderTimeoutError` (`retryable: true`)
  - `500+` $\rightarrow$ `ProviderUnavailableError` (`retryable: true`)
- **SSE Stream Reader**: When streaming responses, the adapter uses native `ReadableStream` reader with line buffering to yield `LLMStreamChunk` objects in real time.

#### 🧪 How to Manually Run & Test:

##### Step 1: Run All Unit Tests for the LLM Package
```bash
pnpm --filter @buildpilot/llm test
```
**Expected Output:**
```text
 ✓ src/index.test.ts (19 tests)
 ✓ src/openrouter.test.ts (13 tests)
 Test Files  2 passed (2)
      Tests  32 passed (32)
```

##### Step 2: Run the Standalone OpenRouter Demonstration Script
```bash
pnpm --filter @buildpilot/llm test:openrouter
```
**Expected Output (Without API Key - Safe Mock Demo):**
```text
ℹ️  No OPENROUTER_API_KEY found in environment. Running in mock demonstration mode.
🚀 Initializing OpenRouterProvider with model: anthropic/claude-3.5-sonnet
📤 Sending prompt with tool definitions...
❌ Request error: Failed to reach OpenRouter API: fetch failed PROVIDER_UNAVAILABLE_ERROR
💡 Note: Set OPENROUTER_API_KEY in your .env or shell to execute live network calls.
```

*(Optional: Set `export OPENROUTER_API_KEY=sk-or-v1-...` in your shell to execute live network calls against OpenRouter).*

---

### Task 5.3: OpenAI-Compatible Provider Adapter (Local Ollama, Groq, vLLM)

#### 📂 Key Files to Study:
- [`packages/llm/src/openai-compatible.ts`](./packages/llm/src/openai-compatible.ts) — OpenAI-compatible provider adapter supporting standard OpenAI, Ollama, Groq, vLLM, custom baseURLs, headers, and SSE streaming.
- [`packages/llm/src/openai-compatible.test.ts`](./packages/llm/src/openai-compatible.test.ts) — Unit test suite verifying completions, tool calling, error normalization, and cross-provider DIP interchangeability.
- [`packages/llm/src/scripts/test-openai-compatible.ts`](./packages/llm/src/scripts/test-openai-compatible.ts) — Standalone CLI demonstration script.

#### 🔄 Multi-Provider Interchangeability Architecture:
```mermaid
flowchart TD
    subgraph Agent_Layer["Agent Reasoning Layer (apps/worker)"]
        AgentLoop["Agent Core Loop\n(Identical Code)"]
    end

    subgraph LLM_Interface["@buildpilot/llm Abstraction"]
        Contract["interface LLMProvider\n(generate, stream, supports)"]
        Factory["providerFactory.create(config)"]
    end

    subgraph Adapters["Provider Adapters"]
        OpenRouter["OpenRouterProvider\n(https://openrouter.ai/api/v1)"]
        OpenAI["OpenAICompatibleProvider\n(https://api.openai.com/v1)"]
        Ollama["OpenAICompatibleProvider\n(http://localhost:11434/v1)"]
        Groq["OpenAICompatibleProvider\n(https://api.groq.com/openai/v1)"]
    end

    AgentLoop -->|Calls generate()| Contract
    Factory -->|Instantiates| OpenRouter
    Factory -->|Instantiates| OpenAI
    Factory -->|Instantiates| Ollama
    Factory -->|Instantiates| Groq
    OpenRouter -.->|Implements| Contract
    OpenAI -.->|Implements| Contract
    Ollama -.->|Implements| Contract
    Groq -.->|Implements| Contract
```

#### 💡 Core Concepts & Why It's Built This Way:
- **Universal OpenAI Wire Protocol**: Most local and cloud LLM inference engines (Ollama, vLLM, Groq, LM Studio, Together AI) adhere to the OpenAI `/chat/completions` REST format. A single robust adapter enables BuildPilot to run across both enterprise clouds and air-gapped local clusters.
- **Zero Cloud API Cost / Private Mode**: By pointing `baseUrl` to `http://localhost:11434/v1` (Ollama) with open-weights models (such as `qwen2.5-coder:32b` or `deepseek-coder-v2`), engineering teams can run automated agent pipelines with 100% on-premise data privacy.
- **Dependency Inversion in Action**: Agent reasoning algorithms and tool loops have zero vendor-specific imports. Changing from OpenRouter Claude 3.5 to local Ollama requires changing only the configuration file or UI dropdown, without touching a single line of agent code.

#### 🧪 How to Manually Run & Test:

##### Step 1: Run All LLM Unit Tests
```bash
pnpm --filter @buildpilot/llm test
```
**Expected Output:**
```text
 ✓ src/index.test.ts (19 tests)
 ✓ src/openrouter.test.ts (13 tests)
 ✓ src/openai-compatible.test.ts (12 tests)
 Test Files  3 passed (3)
      Tests  44 passed (44)
```

##### Step 2: Run the Standalone OpenAI-Compatible Demonstration Script
```bash
pnpm --filter @buildpilot/llm test:openai
```
**Expected Output (Without API Key - Safe Mock Demo):**
```text
🚀 Initializing OpenAICompatibleProvider with endpoint: https://api.openai.com/v1, model: gpt-4o
📤 Sending prompt with tool definitions...
❌ Request error: Failed to reach OpenAI-compatible provider at 'https://api.openai.com/v1': fetch failed PROVIDER_UNAVAILABLE_ERROR
💡 Note: Set OPENAI_API_KEY or OPENAI_BASE_URL (e.g. for Ollama) in your environment to execute live network calls.
```

*(Optional: Set `export OPENAI_BASE_URL=http://localhost:11434/v1` and `export OPENAI_MODEL=qwen2.5-coder:32b` to test with a locally running Ollama instance).*

---

## Phase 6 — Agent Runtime

### Task 6.1: Context Builder & Token Budget Management

#### 📂 Key Files to Study:
- [`apps/worker/src/agent/context-builder.ts`](./apps/worker/src/agent/context-builder.ts) — Main `ContextBuilder` assembling system prompts, task goals, repo context, and history within strict budgets.
- [`apps/worker/src/agent/token-budget.ts`](./apps/worker/src/agent/token-budget.ts) — Token estimation algorithms, middle-out truncation, file tree formatting, and history message pruning.
- [`apps/worker/src/agent/prompts.ts`](./apps/worker/src/agent/prompts.ts) — Base system prompt templates, task goals, and repository summary formatting.
- [`apps/worker/src/agent/context-builder.test.ts`](./apps/worker/src/agent/context-builder.test.ts) — Unit test suite verifying token budgets, tool output truncation, and context window safety.

#### 🔄 Context Assembly & Budgeting Flow:
```mermaid
flowchart TD
    subgraph Inputs["Task & Repo Inputs"]
        Task["TaskContext\n(Issue #, Title, Desc, Branch)"]
        Repo["RepoContext\n(File Tree, Scripts, Guidelines)"]
        History["Conversation History\n(User, Tool Calls, Tool Results)"]
    end

    subgraph Budget_Engine["ContextBuilder & Token Budget Engine"]
        SysBuilder["System Prompt Builder\n(Base Rules + Task Goal + Repo Summary)"]
        TreeTruncator["File Tree Truncator\n(Capped to maxFileTreeTokens)"]
        ToolTruncator["Middle-Out Tool Output Truncator\n(Head + Tail preserved)"]
        HistoryPruner["Sliding History Pruner\n(Pins initial prompt, prunes older steps)"]
    end

    subgraph Output["Output for LLM Provider"]
        ReadyMessages["Structured Context\n{ systemPrompt, messages, estimatedTokens }\n(Guaranteed <= maxContextTokens)"]
    end

    Task --> SysBuilder
    Repo --> TreeTruncator
    TreeTruncator --> SysBuilder
    History --> ToolTruncator
    ToolTruncator --> HistoryPruner
    SysBuilder --> ReadyMessages
    HistoryPruner --> ReadyMessages
```

#### 💡 Core Concepts & Why It's Built This Way:
- **Context Window is Finite & Costly**: Modern frontier models have varying context windows (e.g. 128k, 32k, 8k tokens). Without strict budgeting, reading large source files or executing verbose commands (like `pnpm test` with 5,000 lines of output) will blow past limits and crash with `400 ContextWindowExceededError`.
- **Middle-Out Truncation Strategy**: When truncating oversized tool outputs, cutting the middle while keeping the head (declarations/inputs) and tail (error traces/summary results) preserves the most critical diagnostic information.
- **Task Goal Pinning & History Pruning**: The original developer instruction (Issue description) is permanently pinned at index 0. If conversation steps grow long across 30+ turns, older intermediate thoughts are pruned while retaining recent reasoning steps.
- **Fast Heuristic Token Estimation**: Estimates tokens accurately (~3.8 characters per token) without adding heavy WebAssembly tokenizer dependencies or slowing down the agent loop.

#### 🧪 How to Manually Run & Test:

##### Step 1: Run the Agent Runtime ContextBuilder Test Suite
```bash
pnpm --filter @buildpilot/worker test
```
**Expected Output:**
```text
 ✓ src/agent/context-builder.test.ts (12 tests)
 ✓ src/worker.test.ts (7 tests)
 Test Files  2 passed (2)
      Tests  19 passed (19)
```

##### Step 2: Run Full Monorepo Test Suite
```bash
pnpm test
```
Verify that all test suites pass with 100% clean verification across all 12 packages.

---

### Task 6.2: Agent Core Loop with Multi-Step Tool Execution & Persistence

#### 📂 Key Files to Study:
- [`apps/worker/src/agent/agent-loop.ts`](./apps/worker/src/agent/agent-loop.ts) — Autonomous ReAct agent loop execution engine with Zod schema validation, safety timeouts, cancellation token handling, and live MongoDB persistence.
- [`apps/worker/src/agent/agent-loop.test.ts`](./apps/worker/src/agent/agent-loop.test.ts) — Unit test suite verifying multi-step tool calls, schema rejection, error recovery, step limit enforcement, and DB audit logging.
- [`packages/database/src/repositories/agent-step.repository.ts`](./packages/database/src/repositories/agent-step.repository.ts) — Real-time persistence repository for LLM thoughts, prompts, tool calls, and completion tokens.
- [`packages/database/src/repositories/tool-call.repository.ts`](./packages/database/src/repositories/tool-call.repository.ts) — Real-time persistence repository for tool execution inputs, outputs, error traces, and latency.

#### 🔄 Multi-Step Agent Execution Flow:
```mermaid
sequenceDiagram
    autonumber
    participant Worker as WorkerService (apps/worker)
    participant Loop as AgentCoreLoop
    participant Ctx as ContextBuilder
    participant LLM as LLMProvider (OpenRouter/OpenAI)
    participant Registry as ToolRegistry (@buildpilot/tools)
    participant DB as MongoDB (agent_steps & tool_calls)

    Worker->>Loop: 1. execute({ task, repo, provider, tools })
    Loop->>Ctx: 2. build({ task, repo, history })
    Ctx-->>Loop: 3. Formatted prompt within token budget
    
    loop While step <= maxSteps && not completed
        Loop->>LLM: 4. generate({ systemPrompt, messages, tools })
        LLM-->>Loop: 5. LLMResponse (thought text + tool_calls)
        Loop->>DB: 6. Persist AgentStep (type: MODEL_REASONING, status: RUNNING)
        
        alt Has Tool Calls
            loop For each ToolCall
                Loop->>Registry: 7. Validate tool arguments with Zod
                alt Arguments Valid & Tool Found
                    Loop->>Registry: 8. Execute tool with per-tool timeout
                    Registry-->>Loop: 9. Tool execution output
                    Loop->>DB: 10. Persist ToolCall record (status: SUCCESS)
                else Validation Error / Unknown Tool
                    Loop->>DB: 10b. Persist ToolCall record (status: FAILED)
                    Note over Loop: 11. Feed error back as tool result for self-correction
                end
            end
            Loop->>Loop: 12. Append tool results to message history
            Loop->>DB: 13. Mark AgentStep as COMPLETED
        else No Tool Calls (Final Answer Reached)
            Loop->>DB: 14. Mark AgentStep as COMPLETED
            Loop-->>Worker: 15. Return { success: true, finalAnswer, stepsCount }
        end
    end
```

#### 💡 Core Concepts & Why It's Built This Way:
- **Autonomous Tool-Calling Loop**: The core loop follows the ReAct (Reasoning + Action) pattern. The LLM reasons about the task, decides which tools to invoke (e.g. `read_file`, `search_code`), inspects their outputs, and repeats until it synthesizes the final solution.
- **Strict Zod Argument Validation**: LLMs occasionally hallucinate parameter types or omit required fields. Before invoking any system tool, arguments are parsed and validated through runtime Zod schemas. If invalid, the error message is fed back directly to the LLM so it can immediately correct its call.
- **Granular Real-Time DB Persistence**: Every reasoning step (`agent_steps`) and every individual tool execution (`tool_calls`) is saved to MongoDB asynchronously as it happens. This powers live timeline updates on the web dashboard (via SSE) and provides post-mortem auditability.
- **Comprehensive Safety Guards**:
  - `maxSteps`: Caps total LLM roundtrips (default 30) to prevent infinite billing loops.
  - `maxWallClockMs`: Enforces overall timeout per task run.
  - `toolTimeoutMs`: Enforces per-tool execution limit (e.g. preventing a hanging command from stalling the worker).
  - `cancellationToken`: Allows immediate user-initiated cancellation from the dashboard.

#### 🧪 How to Manually Run & Test:

##### Step 1: Run the Agent Core Loop Unit Tests
```bash
pnpm --filter @buildpilot/worker test
```
**Expected Output:**
```text
 ✓ src/agent/agent-loop.test.ts (6 tests)
 ✓ src/agent/context-builder.test.ts (12 tests)
 ✓ src/worker.test.ts (7 tests)
 Test Files  3 passed (3)
      Tests  25 passed (25)
```

##### Step 2: Run Full Monorepo Test Suite
```bash
pnpm test
```
Verify that all 21 test suites pass across all 12 monorepo packages.

---

### Task 6.3: Agent Failure Recovery, Transient Retry & Loop Protection

#### 📂 Key Files to Study:
- [`apps/worker/src/agent/failure-recovery.ts`](./apps/worker/src/agent/failure-recovery.ts) — Exponential backoff retry engine (`retryWithBackoff`) with jitter/delays and `LoopDetector` guarding against repetitive failing tool invocations.
- [`apps/worker/src/agent/agent-loop.ts`](./apps/worker/src/agent/agent-loop.ts) — Integration of failure recovery into the agent core loop, generating self-correction feedback prompts and persisting failure diagnostic events (`AGENT_EXECUTION_FAILED`).
- [`apps/worker/src/agent/failure-recovery.test.ts`](./apps/worker/src/agent/failure-recovery.test.ts) — Unit test suite verifying backoff math, retryable vs non-retryable error discernment, and loop threshold trips.

#### 🔄 Failure Recovery & Loop Guard Flow:
```mermaid
flowchart TD
    subgraph Execution["Agent Core Loop Step"]
        Call["provider.generate()"]
        ToolExec["Execute Tool Call"]
    end

    subgraph Failure_Detection["Failure Recovery Engine"]
        RetryCheck{"Is Transient Error?\n(429 / 503 / Timeout / Network)"}
        Backoff["Exponential Backoff\n(delay: 500ms * 2^attempt)"]
        LoopCheck{"LoopDetector\n(Identical tool + args failed N times?)"}
        WarnSys["Inject System Warning Prompt\n(Count == 3)"]
        BlockTask["Block Task with Audit Diagnostic\n(Count >= 5)"]
        SelfCorrect["Feed Error JSON + Hint to LLM\n(Self-Correction Prompt)"]
    end

    Call -->|Throws Error| RetryCheck
    RetryCheck -->|Yes & Attempts < 3| Backoff --> Call
    RetryCheck -->|No or Attempts Exhausted| BlockTask
    ToolExec -->|Fails / Throws| LoopCheck
    LoopCheck -->|Count < 3| SelfCorrect --> Call
    LoopCheck -->|Count == 3| WarnSys --> Call
    LoopCheck -->|Count >= 5| BlockTask
```

#### 💡 Core Concepts & Why It's Built This Way:
- **Resilient Transient Error Handling**: Network drops, API rate limits (`429`), and temporary upstream downtime (`503`) are common in LLM operations. Rather than crashing long-running task runs, `retryWithBackoff` transparently retries up to 3 times with exponential backoff before reporting a hard failure.
- **Model Self-Correction via Structured Error Feedback**: When an LLM passes invalid tool arguments or when a tool returns a non-zero exit code, BuildPilot returns a structured JSON payload containing the exact error and an actionable hint (e.g. schema requirement or available alternatives). This enables frontier models to self-correct in the next step.
- **Infinite Failure Loop Guard (`LoopDetector`)**: Without guards, autonomous models may get stuck in repetitive failure loops (calling the same broken command 20 times). `LoopDetector` fingerprints `tool::JSON.stringify(args)`. At 3 failures it issues a high-priority system warning, and at 5 consecutive identical failures it immediately aborts the loop to prevent token wastage.
- **Detailed Failure Audit Diagnostics**: Whenever an agent run terminates due to step limits, timeouts, or unrecoverable provider errors, structured failure events (`AGENT_EXECUTION_FAILED`) are recorded in MongoDB with error message, step count, and execution duration for transparent debugging on the dashboard.

#### 🧪 How to Manually Run & Test:

##### Step 1: Run the Failure Recovery & Agent Loop Unit Tests
```bash
pnpm --filter @buildpilot/worker test
```
**Expected Output:**
```text
 ✓ src/agent/failure-recovery.test.ts (8 tests)
 ✓ src/agent/agent-loop.test.ts (8 tests)
 ✓ src/agent/context-builder.test.ts (12 tests)
 ✓ src/worker.test.ts (7 tests)
 Test Files  4 passed (4)
      Tests  35 passed (35)
```

##### Step 2: Run Full Monorepo Test Suite
```bash
pnpm test
```
Verify that all test suites pass cleanly across all 12 monorepo packages.

---

## Phase 7 — First Tool Registry

### Task 7.1: Typed Tool Framework & Permission Policies

#### 📂 Key Files to Study:
- [`packages/tools/src/types.ts`](./packages/tools/src/types.ts) — Typed `ToolDefinition<TInput, TOutput>`, `ToolContext`, `ToolExecutionResult`, and permission classes (`READ_ONLY`, `SAFE_WRITE`, `EXTERNAL_WRITE`, `HIGH_RISK`).
- [`packages/tools/src/registry.ts`](./packages/tools/src/registry.ts) — Central `ToolRegistry` with Zod schema validation, execution timeouts, permission policy enforcement, and LLM JSON schema formatting.
- [`packages/tools/src/errors.ts`](./packages/tools/src/errors.ts) — Structured tool error hierarchy (`UnknownToolError`, `ToolValidationError`, `ToolPermissionError`, `ToolTimeoutError`).
- [`packages/tools/src/registry.test.ts`](./packages/tools/src/registry.test.ts) — Unit test suite verifying schema validation, permission class blocking, timeouts, and LLM tool formatting.

#### 🔄 Tool Registry & Permission Architecture:
```mermaid
flowchart TD
    subgraph Agent["Agent Core Loop"]
        Call["Tool Call: name + rawArguments"]
    end

    subgraph Tool_Framework["@buildpilot/tools Framework"]
        Registry["ToolRegistry.execute(name, args, context, options)"]
        Lookup{"Tool Registered?"}
        Policy{"Permission Policy Allowed?\n(READ_ONLY / SAFE_WRITE / HIGH_RISK)"}
        ZodVal{"Zod inputSchema.safeParse()"}
        ExecWrapper["execute(typedInput, context)\n[with AbortSignal + timeoutMs]"]
    end

    subgraph Outcomes["Execution Outcomes"]
        Success["Return { success: true, data, durationMs }"]
        ZodFail["Throw ToolValidationError\n(Returns structured errors to LLM)"]
        PermFail["Throw ToolPermissionError\n(Blocks unauthorized action)"]
        TimeFail["Throw ToolTimeoutError\n(Prevents hung processes)"]
    end

    Call --> Registry
    Registry --> Lookup
    Lookup -->|No| Outcomes
    Lookup -->|Yes| Policy
    Policy -->|Denied| PermFail
    Policy -->|Allowed| ZodVal
    ZodVal -->|Invalid| ZodFail
    ZodVal -->|Valid| ExecWrapper
    ExecWrapper -->|Timed Out| TimeFail
    ExecWrapper -->|Completed| Success
```

#### 💡 Core Concepts & Why It's Built This Way:
- **Type-Safe Tool Contract**: Each tool defines an `inputSchema` using Zod. Runtime inputs from LLM responses are parsed through this schema, ensuring tool implementations receive strictly validated, type-safe arguments.
- **Granular Permission Classes**:
  - `READ_ONLY`: Inspection tools (`list_files`, `read_file`, `search_code`, `git_status`) that cannot mutate anything.
  - `SAFE_WRITE`: Code modification tools (`write_file`) restricted to the task's isolated worktree.
  - `EXTERNAL_WRITE`: Actions with external side effects (`git_push`, `create_pull_request`).
  - `HIGH_RISK`: Destructive commands (`rm -rf`, system services, deploys) requiring explicit human approval.
- **Fail-Fast Execution Protection**:
  - Per-tool timeouts prevent hanging scripts from exhausting worker concurrency.
  - `AbortSignal` listener ensures that if a task is cancelled from the dashboard, child tool executions terminate immediately.

#### 🧪 How to Manually Run & Test:

##### Step 1: Run the Tool Package Unit Tests
```bash
pnpm --filter @buildpilot/tools test
```
**Expected Output:**
```text
 ✓ src/index.test.ts (1 test)
 ✓ src/registry.test.ts (7 tests)
 Test Files  2 passed (2)
      Tests  8 passed (8)
```

##### Step 2: Run Full Monorepo Test Suite
```bash
pnpm test
```
Verify that all 21 test suites pass cleanly across all 12 monorepo packages.

---

### Task 7.2: Repository Tools (`list_files`, `search_code`, `read_file`, `write_file`, `git_status`, `git_diff`)

#### 📂 Key Files to Study:
- [`packages/tools/src/repository/path-utils.ts`](./packages/tools/src/repository/path-utils.ts) — Workspace sandbox boundary resolution (`resolveSafePath`) guarding against directory traversal attacks.
- [`packages/tools/src/repository/file-tools.ts`](./packages/tools/src/repository/file-tools.ts) — `read_file` (with line slicing & truncation) and `write_file` (with auto directory creation).
- [`packages/tools/src/repository/search-tools.ts`](./packages/tools/src/repository/search-tools.ts) — `list_files` (recursive tree with ignore rules) and `search_code` (regex & text grep matching).
- [`packages/tools/src/repository/git-tools.ts`](./packages/tools/src/repository/git-tools.ts) — `git_status` (porcelain parser) and `git_diff` (patch generator).
- [`packages/tools/src/repository/repository.test.ts`](./packages/tools/src/repository/repository.test.ts) — Unit test suite verifying file manipulation, regex search, path traversal rejection, and git operations.

#### 🔄 Repository Tools Capabilities Matrix:
| Tool Name | Permission Class | Key Parameters | Return Payload |
|---|---|---|---|
| `list_files` | `READ_ONLY` | `path`, `maxDepth`, `limit`, `includeHidden` | `{ count, entries: [{ path, type, sizeBytes }] }` |
| `read_file` | `READ_ONLY` | `path`, `startLine`, `endLine`, `maxLines` | `{ content, totalLines, startLine, endLine, truncated }` |
| `write_file` | `SAFE_WRITE` | `path`, `content`, `createDirectories` | `{ path, bytesWritten, created, updated }` |
| `search_code` | `READ_ONLY` | `query`, `path`, `isRegex`, `caseSensitive`, `maxResults` | `{ query, count, matches: [{ file, lineNumber, lineContent }] }` |
| `git_status` | `READ_ONLY` | `path` | `{ clean, totalChanged, files: [{ path, status, staged, unstaged }] }` |
| `git_diff` | `READ_ONLY` | `staged`, `path`, `maxLines` | `{ diff, totalLines, truncated }` |

#### 💡 Core Concepts & Why It's Built This Way:
- **Workspace Boundary Containment**: To prevent malicious LLM prompts or security exploits from accessing `/etc`, `~/.ssh`, or parent directories, `resolveSafePath` resolves absolute paths and enforces that the target is strictly inside `context.workspaceDir`.
- **Intelligent Default Ignore List**: `list_files` and `search_code` automatically filter out `.git`, `node_modules`, `dist`, `.next`, and binary files (`.png`, `.pdf`, `.zip`), preventing context pollution and wasted token budget.
- **Line Slicing & Truncation**: `read_file` allows agents to read specific line ranges (e.g. lines 50 to 120) instead of loading a 10,000-line file into memory, keeping LLM prompts lean and fast.

#### 🧪 How to Manually Run & Test:

##### Step 1: Run Repository Tools Unit Tests
```bash
pnpm --filter @buildpilot/tools test
```
**Expected Output:**
```text
 ✓ src/registry.test.ts (7 tests)
 ✓ src/index.test.ts (1 test)
 ✓ src/repository/repository.test.ts (5 tests)
 Test Files  3 passed (3)
      Tests  13 passed (13)
```

##### Step 2: Run Full Monorepo Test Suite
```bash
pnpm test
```
Verify that all 21 test suites pass cleanly across all 12 monorepo packages.







