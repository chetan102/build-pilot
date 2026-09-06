# BuildPilot — Master Execution Tracker

> **Source of Truth for Project Progress**
> 
> **Execution Rule:** Work top-to-bottom. Do not jump ahead unless a later task is strictly required to unblock the current task. Check a box `[x]` only after the acceptance criteria for that item are actually satisfied and verified with tests.

---

## 📊 Overall Progress Summary

- **Current Phase:** Phase 1 — Web Dashboard Shell
- **Current Task:** Task 1.2 — Domain types
- **Project Status:** 🟢 IN PROGRESS (Phase 0: 100% Complete ✅ | Phase 1: 50% Complete)
- **Completed Tasks:** 3 / 23 Phases (Task 0.1, 0.2, 1.1 complete)

---

## 📋 Task Execution Reporting Standard

When completing any task or sub-task, log a structured entry following this format:

```text
Task: <task number and title>
Implemented:
- <bullet points of implementation details>
Files changed:
- <file paths modified or created>
Tests run:
- <test command and output summary>
Result: PASS / FAIL
Remaining work:
- <any remaining items in this phase>
Next TODO: <next unchecked task>
```

---

# Master Roadmap & Task Breakdown

---

## Phase 0 — Project Foundation

- [x] **Task 0.1 — Repository and monorepo**
  - [x] Initialize Git repository.
  - [x] Create `README.md`.
  - [x] Create `.gitignore`.
  - [x] Create `.env.example`.
  - [x] Add Node.js version requirement (`.nvmrc` or `package.json` `engines`).
  - [x] Initialize pnpm workspace (`pnpm-workspace.yaml`).
  - [x] Add root `package.json`.
  - [x] Initialize Turborepo (`turbo.json`).
  - [x] Add shared base TypeScript config (`tsconfig.base.json`).
  - [x] Create initial directories matching folder structure (`apps/*`, `packages/*`, `infra/*`, `scripts/*`, `docs/*`).
  - [x] Add formatting/linting (ESLint, Prettier).
  - [x] Add root scripts (`dev`, `build`, `test`, `lint`, `typecheck`).
  - [x] Verify clean install and run from fresh clone.
  - **Acceptance Criteria:** `pnpm install`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` all succeed cleanly. (PASSED ✅)

- [x] **Task 0.2 — Local infrastructure**
  - [x] Create `infra/docker-compose.yml`.
  - [x] Configure MongoDB service container with health checks and persistent volume.
  - [x] Configure Redis service container with health checks and persistent volume.
  - [x] Add Caddy service placeholder.
  - [x] Configure internal Docker network with proper port isolation.
  - [x] Document startup/shutdown commands in `infra/README.md`.
  - **Acceptance Criteria:** `docker compose up -d` starts MongoDB and Redis, and both pass health checks. (PASSED ✅)

---

## Phase 1 — Web Dashboard Shell

- [x] **Task 1.1 — Next.js application**
  - [x] Create `apps/web` (Next.js + React + TypeScript).
  - [x] Configure TypeScript and path aliases.
  - [x] Configure Tailwind CSS.
  - [x] Install and configure shadcn/ui components (Button, Card, Badge, Dialog, Table, Tabs, Input, Progress, etc.).
  - [x] Create application layout shell (Sidebar, Header, Main Content Area, Theme Provider).
  - [x] Add application routes:
    - [x] `/dashboard` (overview metrics & recent tasks).
    - [x] `/projects` (project & repository management).
    - [x] `/tasks` (kanban & table task board).
    - [x] `/tasks/[taskId]` (agent step timeline, tool calls, git diff, test run logs, high-risk approval banner).
    - [x] `/settings/providers` (LLM provider management).
  - [x] Build mock task board supporting all task states (Queued, Planning, Development, Testing, Awaiting Approval, Completed, Failed).
  - **Acceptance Criteria:** Dashboard runs locally (`pnpm --filter web dev`) and displays the complete task lifecycle UI using mock data. (PASSED ✅)

- [ ] **Task 1.2 — Domain types**
  - [ ] Create `packages/domain` package.
  - [ ] Define TaskStatus enum and state definitions.
  - [ ] Define Task, TaskRun, AgentStep, ToolCall, Artifact, TestRun, Approval, PullRequest types.
  - [ ] Define state transition rules & validation matrix.
  - [ ] Implement transition helper functions (reject illegal transitions).
  - [ ] Add unit tests for transition rules.
  - **Acceptance Criteria:** Every legal task transition is tested and verified; illegal transitions throw strict domain errors.

---

## Phase 2 — Database Layer

- [ ] **Task 2.1 — MongoDB connection**
  - [ ] Create `packages/database` package.
  - [ ] Add MongoDB / Mongoose client connection manager.
  - [ ] Validate database connection URI using Zod.
  - [ ] Implement connection lifecycle handling (connect, disconnect, reconnect, health check).
  - **Acceptance Criteria:** API and worker connect to MongoDB and fail with clear configuration error when DB is unavailable.

- [ ] **Task 2.2 — Core collections & models**
  - [ ] Implement `User` model & schema.
  - [ ] Implement `Project` model & schema.
  - [ ] Implement `Repository` model & schema.
  - [ ] Implement `GitHubInstallation` model & schema.
  - [ ] Implement `ProviderCredential` model & schema.
  - [ ] Implement `AgentDefinition` model & schema.
  - [ ] Implement `Task` model & schema.
  - [ ] Implement `TaskRun` model & schema.
  - [ ] Implement `AgentStep` model & schema.
  - [ ] Implement `ToolCall` model & schema.
  - [ ] Implement `TestRun` model & schema.
  - [ ] Implement `Artifact` model & schema.
  - [ ] Implement `Approval` model & schema.
  - [ ] Implement `PullRequest` model & schema.
  - [ ] Implement `Event` model & schema.
  - [ ] Implement `EvaluationResult` model & schema.
  - [ ] Add database indexes (task status, repo + task state, task + run, chronological events).
  - [ ] Write repository CRUD tests.
  - **Acceptance Criteria:** CRUD repository tests cover each core entity and indexes are verified.

---

## Phase 3 — Control API

- [ ] **Task 3.1 — Express application**
  - [ ] Create `apps/api` (Express.js + TypeScript).
  - [ ] Configure environment config loading and Zod validation.
  - [ ] Add request ID / correlation ID middleware.
  - [ ] Add structured Pino HTTP request logging middleware.
  - [ ] Add `/health` and `/ready` endpoints.
  - [ ] Add global error handling and 404 middleware.
  - [ ] Add graceful shutdown handling (`SIGTERM`, `SIGINT`).
  - **Acceptance Criteria:** API starts, reports health, logs structured requests with correlation IDs, and shuts down cleanly.

- [ ] **Task 3.2 — Task & Project API**
  - [ ] `POST /api/v1/projects` (create project).
  - [ ] `GET /api/v1/projects` (list projects).
  - [ ] `GET /api/v1/projects/:projectId` (get project details).
  - [ ] `POST /api/v1/projects/:projectId/tasks` (create task manually).
  - [ ] `GET /api/v1/tasks` (list tasks with pagination, status, and repository filters).
  - [ ] `GET /api/v1/tasks/:taskId` (get detailed task with runs and steps).
  - [ ] `POST /api/v1/tasks/:taskId/cancel` (cancel task).
  - [ ] `POST /api/v1/tasks/:taskId/retry` (retry failed task).
  - [ ] Validate all request inputs and query params with Zod schemas.
  - [ ] Persist task state transition events on every mutation.
  - **Acceptance Criteria:** A task can be created, queried, cancelled, and retried entirely through the API with full validation.

---

## Phase 4 — Queue + Worker

- [ ] **Task 4.1 — Redis + BullMQ setup**
  - [ ] Add BullMQ queue connection in worker and API.
  - [ ] Configure Redis connection with retry and health check.
  - [ ] Create `engineering-task` queue.
  - [ ] Define strongly-typed job payload schemas.
  - [ ] Implement job ID = `taskId:runId` correlation.
  - [ ] Configure retry policy, exponential backoff, and dead-letter handling.
  - [ ] Configure worker concurrency limits.
  - **Acceptance Criteria:** API can enqueue a task and worker consumes it exactly once per job execution attempt.

- [ ] **Task 4.2 — Worker service foundation**
  - [ ] Create `apps/worker` (Node.js + TypeScript).
  - [ ] Implement BullMQ worker processor loop.
  - [ ] Add graceful shutdown with active job drainage.
  - [ ] Add structured lifecycle logging (job start, progress, failure, completion).
  - [ ] Persist `TaskRun` record and update `Task` status in MongoDB.
  - [ ] Persist start/end/failure events to events collection.
  - **Acceptance Criteria:** Creating a task in the API produces a background worker run without keeping an HTTP request open.

---

## Phase 5 — LLM Provider Layer

- [ ] **Task 5.1 — Generic provider contract**
  - [ ] Create `packages/llm` package.
  - [ ] Define `LLMProvider` interface (`generate`, `stream`, `supports`).
  - [ ] Define `LLMRequest`, `LLMResponse`, `LLMMessage`, `ToolDefinition` types.
  - [ ] Define normalized tool-call and tool-result representation.
  - [ ] Define normalized provider error hierarchy (`RateLimitError`, `AuthError`, `InvalidRequestError`, `ProviderTimeoutError`).
  - [ ] Implement `ProviderFactory` for dynamic provider instantiation.
  - **Acceptance Criteria:** Agent code depends exclusively on the internal `LLMProvider` interface.

- [ ] **Task 5.2 — OpenRouter provider adapter**
  - [ ] Implement `OpenRouterProvider` adapter using OpenRouter API standard.
  - [ ] Support text generation with system prompts and message history.
  - [ ] Support tool/function definition passing and tool-call response parsing.
  - [ ] Normalize OpenRouter error responses into standard error classes.
  - [ ] Add configurable timeout and token usage metadata extraction.
  - [ ] Write unit & integration test with mock and real/test endpoints.
  - **Acceptance Criteria:** A standalone test script can send a prompt with tool definitions to a fixed OpenRouter model and receive a normalized tool call.

- [ ] **Task 5.3 — OpenAI-compatible provider adapter**
  - [ ] Implement `OpenAICompatibleProvider` adapter supporting custom `baseURL` and API keys.
  - [ ] Support standard OpenAI endpoints, Ollama, Groq, vLLM, etc.
  - [ ] Verify identical interface behavior across providers.
  - **Acceptance Criteria:** The same agent code can call two different API endpoints without modifying the agent loop.

---

## Phase 6 — Agent Runtime

- [ ] **Task 6.1 — Context builder**
  - [ ] Build task instruction and requirements context.
  - [ ] Build repository metadata, file tree summary, and branch context.
  - [ ] Format conversation and tool call execution history.
  - [ ] Enforce context window token budgets and truncation policies.
  - **Acceptance Criteria:** Context builder produces structured prompts within token limits.

- [ ] **Task 6.2 — Agent core loop**
  - [ ] Implement deterministic system prompt for engineering agents.
  - [ ] Send structured context + available tools to LLM.
  - [ ] Detect and parse tool calls vs final answer messages.
  - [ ] Validate tool arguments using Zod schemas.
  - [ ] Authorize tool execution via permission policy.
  - [ ] Execute tool, capture output, and append tool results to message history.
  - [ ] Persist every `AgentStep` and `ToolCall` to database in real-time.
  - [ ] Enforce safety guards: max steps, max wall-clock runtime, per-tool timeout.
  - [ ] Support cancellation signals during agent execution.
  - **Acceptance Criteria:** Scripted agent executes a multi-step tool-calling task with full history recorded in `agent_steps` and `tool_calls`.

- [ ] **Task 6.3 — Agent failure recovery**
  - [ ] Implement retry logic for transient LLM errors (exponential backoff).
  - [ ] Implement error feedback to LLM when tool execution fails (allowing model self-correction).
  - [ ] Guard against infinite identical failure loops.
  - [ ] Persist detailed failure diagnostics and mark task run as `FAILED` or `BLOCKED`.
  - **Acceptance Criteria:** Transient errors are recovered cleanly; persistent failures terminate safely with audit records.

---

## Phase 7 — First Tool Registry

- [ ] **Task 7.1 — Typed tool framework**
  - [ ] Create `packages/tools` package.
  - [ ] Implement typed tool definition interface (`name`, `description`, `inputSchema`, `outputSchema`, `permissionClass`, `timeout`, `execute`).
  - [ ] Implement `ToolRegistry` with lookup, registration, and unknown tool rejection.
  - [ ] Define permission classes: `READ_ONLY`, `SAFE_WRITE`, `EXTERNAL_WRITE`, `HIGH_RISK`.
  - **Acceptance Criteria:** Registry validates tool inputs via Zod and enforces permission classes.

- [ ] **Task 7.2 — Repository tools**
  - [ ] Implement `list_files` tool (with path filtering, glob patterns, max depth).
  - [ ] Implement `search_code` tool (regex / ripgrep search within workspace).
  - [ ] Implement `read_file` tool (with line range slicing and truncation safeguards).
  - [ ] Implement `write_file` tool (create or replace file contents within workspace).
  - [ ] Implement `git_status` tool.
  - [ ] Implement `git_diff` tool.
  - **Acceptance Criteria:** Agent can inspect repository structure, search contents, read files, and write modifications.

- [ ] **Task 7.3 — Execution tools**
  - [ ] Implement `run_command` tool (executes shell command in controlled workspace).
  - [ ] Implement `run_tests` tool (executes configured test suite).
  - [ ] Capture stdout, stderr, exit code, duration, and output size limits.
  - [ ] Enforce strict execution timeouts.
  - **Acceptance Criteria:** Agent can run tests and commands with captured outputs, exit codes, and enforced timeouts.

---

## Phase 8 — Git Workspace Management

- [ ] **Task 8.1 — Repository preparation**
  - [ ] Implement Git clone / fetch service into controlled workspace directory.
  - [ ] Validate repository remote URL and verify default branch ref.
  - [ ] Fetch latest target branch refs.
  - **Acceptance Criteria:** Worker can clone and maintain a clean mirror of a target repository.

- [ ] **Task 8.2 — Isolated worktree management**
  - [ ] Create dedicated branch per task (`buildpilot/task-<taskId>-<shortId>`).
  - [ ] Create dedicated Git worktree per task run.
  - [ ] Track active worktree paths in task metadata.
  - [ ] Implement worktree cleanup upon task completion, cancellation, or crash.
  - **Acceptance Criteria:** Multiple task runs operate in completely isolated worktrees without cross-contamination.

- [ ] **Task 8.3 — Commit & push flow**
  - [ ] Inspect diff before committing to ensure only expected changes exist.
  - [ ] Create structured commit with task metadata and issue reference.
  - [ ] Capture commit SHA and push task branch to remote.
  - **Acceptance Criteria:** Worker can branch, commit verified changes, and push to remote without touching `main`.

---

## Phase 9 — GitHub App + Automatic Issue Intake

- [ ] **Task 9.1 — GitHub App integration**
  - [ ] Create `packages/github` package with Octokit / GitHub App client.
  - [ ] Implement GitHub App authentication (private key, app ID, installation ID token generation).
  - [ ] Support required permissions (Issues read/write, Pull Requests read/write, Contents read/write).
  - **Acceptance Criteria:** Client can authenticate as a GitHub App installation and interact with GitHub API.

- [ ] **Task 9.2 — Webhook endpoint**
  - [ ] Implement `POST /api/v1/github/webhooks` in `apps/api`.
  - [ ] Verify GitHub webhook signature (`x-hub-signature-256`).
  - [ ] Parse `issues`, `pull_request`, and `installation` event payloads.
  - [ ] Persist raw webhook event to `events` collection.
  - [ ] Implement idempotent event deduplication (`x-github-delivery`).
  - **Acceptance Criteria:** Webhook endpoint validates signatures, deduplicates deliveries, and parses events.

- [ ] **Task 9.3 — Issue-to-task conversion**
  - [ ] Implement eligibility filter (e.g. `buildpilot` label or configured trigger).
  - [ ] Map GitHub issue fields → internal `Task` entity.
  - [ ] Prevent duplicate task creation for the same issue.
  - [ ] Enqueue task in BullMQ queue.
  - [ ] Post initial acknowledgment comment on GitHub issue.
  - **Acceptance Criteria:** Labeling or opening an eligible issue automatically creates and queues an internal task.

---

## Phase 10 — End-to-End Vertical Slice (MVP: Issue → PR)

- [ ] **Task 10.1 — End-to-end integration**
  - [ ] Connect webhook intake → Task creation → Queue → Worker → LLM loop → Git worktree → Tests → PR creation.
  - [ ] Implement `create_pull_request` tool / post-execution step linking issue to PR.
  - [ ] Update GitHub issue with link to generated PR and execution summary.
  - **Acceptance Criteria:** End-to-end flow executes without manual terminal intervention.

- [ ] **Task 10.2 — Controlled benchmark demo test**
  - [ ] Create a controlled demo test case (e.g. fix a bug and add a regression test).
  - [ ] Run end-to-end task against test repo.
  - [ ] Verify generated diff, passing tests, PR creation, and `PR_READY` / `COMPLETED` status.
  - **Acceptance Criteria:** First end-to-end autonomous engineering run verified with full audit trail.

---

## Phase 11 — Dashboard Connected to Reality

- [ ] **Task 11.1 — API-backed task board**
  - [ ] Connect Next.js task board to Express API (`/api/v1/tasks`).
  - [ ] Implement real loading states, error boundaries, and empty states.
  - [ ] Implement task filtering by status, repository, and search query.
  - [ ] Implement pagination / infinite scroll.
  - **Acceptance Criteria:** Dashboard shows live tasks from database instead of mock data.

- [ ] **Task 11.2 — Live timeline & Server-Sent Events (SSE)**
  - [ ] Implement `GET /api/v1/tasks/:taskId/events` SSE endpoint in Express API.
  - [ ] Implement SSE client hook with automatic reconnection in Next.js dashboard.
  - [ ] Stream real-time agent steps, tool calls, and test outputs as they occur.
  - [ ] Render interactive step cards with timestamps, durations, and tool inputs/outputs.
  - **Acceptance Criteria:** Browser updates live during agent execution and reconnects cleanly on network interruption.

- [ ] **Task 11.3 — Task detail view**
  - [ ] Display GitHub issue context, repository, and branch info.
  - [ ] Display interactive execution timeline.
  - [ ] Display changed files and diff viewer.
  - [ ] Display test run results and PR links.
  - **Acceptance Criteria:** User can inspect all details and artifacts of a task run from the web dashboard.

---

## Phase 12 — Reliability & Durable Workflow

- [ ] **Task 12.1 — Persistent state machine & transactional transitions**
  - [ ] Ensure every state change is persisted atomically with transition audit log.
  - [ ] Persist current stage, attempt number, and last successful checkpoint.
  - [ ] Implement worker heartbeat and lease renewal to detect stalled workers.
  - **Acceptance Criteria:** Task state is always consistent and auditable across restarts.

- [ ] **Task 12.2 — Crash recovery & resume**
  - [ ] Handle worker crashes during planning, execution, and testing.
  - [ ] Implement safe resume from last checkpoint without duplicate PRs or branch corruption.
  - **Acceptance Criteria:** Killing and restarting worker resumes or recovers task safely.

- [ ] **Task 12.3 — Idempotency guards**
  - [ ] Guard against duplicate webhook deliveries.
  - [ ] Guard against duplicate queue job processing.
  - [ ] Guard against duplicate branch creation and PR opening.
  - **Acceptance Criteria:** Replayed events produce no duplicate external side effects.

---

## Phase 13 — Sandbox Execution

- [ ] **Task 13.1 — Docker sandbox runner**
  - [ ] Create Docker container runner for isolated command execution.
  - [ ] Mount only task worktree into container.
  - [ ] Configure CPU, memory, and runtime limits.
  - [ ] Stream stdout/stderr from container to worker logs and database.
  - **Acceptance Criteria:** Commands execute inside disposable containers with resource limits enforced.

- [ ] **Task 13.2 — Security restrictions & policies**
  - [ ] Disable privileged mode and root execution.
  - [ ] Deny access to host Docker socket and filesystem.
  - [ ] Restrict network access (offline execution by default, whitelist for package installs).
  - [ ] Enforce environment variable allowlist.
  - [ ] Add automatic container cleanup on completion, error, or crash.
  - **Acceptance Criteria:** Host system is completely protected from untrusted code execution.

- [ ] **Task 13.3 — Tool sandbox routing**
  - [ ] Route `run_command` and `run_tests` through Docker sandbox.
  - [ ] Persist command outputs and test artifacts.
  - **Acceptance Criteria:** All code changes and tests execute exclusively inside Docker sandbox.

---

## Phase 14 — Agent Roles & Orchestration

- [ ] **Task 14.1 — Planner role**
  - [ ] Implement Planner agent instructions and prompt.
  - [ ] Enforce read-only tools for Planner.
  - [ ] Generate structured implementation plan artifact.
  - [ ] Persist plan in task artifacts.
  - **Acceptance Criteria:** Planner produces a clear, verified implementation plan before code modification.

- [ ] **Task 14.2 — Developer role**
  - [ ] Implement Developer agent receiving approved plan.
  - [ ] Enable write and test tools in isolated worktree.
  - [ ] Execute code changes and local test cycles.
  - **Acceptance Criteria:** Developer implements changes adhering to the plan.

- [ ] **Task 14.3 — Reviewer role**
  - [ ] Implement Reviewer agent inspecting final diff against requirements.
  - [ ] Detect regressions, anti-patterns, or incomplete acceptance criteria.
  - [ ] Produce structured review report (Approved / Changes Requested).
  - **Acceptance Criteria:** Reviewer provides independent validation before PR creation.

- [ ] **Task 14.4 — Bounded repair loop**
  - [ ] Feed Reviewer findings or failing test outputs back to Developer.
  - [ ] Enforce maximum repair iteration limit (e.g. max 3 repair cycles).
  - [ ] Persist iteration history.
  - **Acceptance Criteria:** System autonomously fixes minor bugs/test failures up to iteration limit.

---

## Phase 15 — Testing & Verification

- [ ] **Task 15.1 — Unit tests**
  - [ ] Domain state machine & transition tests.
  - [ ] LLM provider adapter & error normalization tests.
  - [ ] Tool registry & schema validation tests.
  - [ ] Git worktree helper tests.
  - [ ] Queue payload validation tests.
  - **Acceptance Criteria:** `pnpm test` runs all unit tests with 100% pass rate.

- [ ] **Task 15.2 — Integration tests**
  - [ ] Express API ↔ MongoDB integration tests.
  - [ ] Express API ↔ BullMQ / Redis integration tests.
  - [ ] Worker ↔ Redis job processing integration tests.
  - [ ] Worker ↔ Mock LLM provider end-to-end tests.
  - [ ] Worker ↔ Git worktree integration tests.
  - **Acceptance Criteria:** Integration test suite passes against local containerized test DB and Redis.

- [ ] **Task 15.3 — End-to-end automated tests**
  - [ ] Simulate GitHub webhook → Task → Agent run → PR output.
  - [ ] Verify state transitions from QUEUED to COMPLETED.
  - **Acceptance Criteria:** Automated E2E test passes in CI.

- [ ] **Task 15.4 — Browser verification (Playwright)**
  - [ ] Configure Playwright runner in sandbox.
  - [ ] Run browser smoke tests for frontend tasks.
  - [ ] Capture screenshots and traces on failure.
  - **Acceptance Criteria:** Agent captures browser verification artifacts for UI tasks.

---

## Phase 16 — Human Approval & Policies

- [ ] **Task 16.1 — Approval engine**
  - [ ] Define high-risk actions requiring approval (`HIGH_RISK` tools, PR merge, deploy).
  - [ ] Implement approval request records and pause workflow in `AWAITING_APPROVAL`.
  - [ ] Add interactive approval UI in web dashboard (Approve / Reject with notes).
  - [ ] Resume or terminate task upon human decision.
  - **Acceptance Criteria:** High-risk actions pause execution until human approves in the dashboard.

- [ ] **Task 16.2 — Granular permissions & audit**
  - [ ] Configurable global and repository-level tool permission policies.
  - [ ] Audit log for every executed, denied, or approved action.
  - **Acceptance Criteria:** Unauthorized tool calls are blocked and audited.

---

## Phase 17 — Provider Expansion

- [ ] **Task 17.1 — Google Gemini provider adapter**
  - [ ] Implement `GeminiProvider` adapter using `@google/genai` or Gemini REST API.
  - [ ] Map tool calling and schema format.
  - [ ] Normalize errors and token usage.
  - **Acceptance Criteria:** Agent runtime executes tasks using Gemini model.

- [ ] **Task 17.2 — OpenAI provider adapter**
  - [ ] Implement direct `OpenAIProvider` adapter.
  - [ ] Support GPT-4o / standard models with native tool calling.
  - **Acceptance Criteria:** Agent runtime executes tasks using OpenAI provider.

- [ ] **Task 17.3 — Anthropic provider adapter**
  - [ ] Implement `AnthropicProvider` adapter.
  - [ ] Support Claude models with tool calling.
  - **Acceptance Criteria:** Agent runtime executes tasks using Anthropic provider.

- [ ] **Task 17.4 — Provider settings & model selection**
  - [ ] Provider configuration UI in dashboard (`/settings/providers`).
  - [ ] Store API keys encrypted or via server env.
  - [ ] Connection test button for each provider.
  - [ ] Task-level provider/model override capability.
  - **Acceptance Criteria:** User can switch default provider and test connections from UI.

---

## Phase 18 — Model Context Protocol (MCP)

- [ ] **Task 18.1 — MCP client integration**
  - [ ] Implement MCP client in agent runtime (`packages/tools` / `packages/mcp`).
  - [ ] Connect to local stdio or SSE MCP servers.
  - [ ] Discover MCP tools and adapt them to internal tool registry format.
  - **Acceptance Criteria:** Agent runtime can discover and execute tools from an MCP server.

- [ ] **Task 18.2 — BuildPilot MCP server**
  - [ ] Expose BuildPilot control plane as an MCP server.
  - [ ] Provide tools to query tasks, runs, status, and logs.
  - **Acceptance Criteria:** External AI tools can query BuildPilot via MCP.

- [ ] **Task 18.3 — External MCP integration & safety gates**
  - [ ] Support connecting external MCP servers with permission class assignment.
  - [ ] Audit and persist all MCP tool invocations.
  - **Acceptance Criteria:** MCP tools adhere to the same permission and audit gates as native tools.

---

## Phase 19 — Observability & Telemetry

- [ ] **Task 19.1 — Structured logging**
  - [ ] Standardize Pino logging schemas across API, Worker, and packages.
  - [ ] Attach `requestId`, `taskId`, `runId`, `stepId`, `repoId` to all log records.
  - [ ] Implement automatic secret redaction.
  - **Acceptance Criteria:** Logs are structured JSON with complete correlation IDs.

- [ ] **Task 19.2 — OpenTelemetry tracing**
  - [ ] Add OpenTelemetry SDK instrumentation.
  - [ ] Trace API requests, BullMQ jobs, LLM calls, tool executions, and sandbox runs.
  - **Acceptance Criteria:** Traces provide end-to-end visualization of task execution.

- [ ] **Task 19.3 — Operational metrics**
  - [ ] Track task duration, success rate, retry rate, tool latency, token usage, and cost estimates.
  - [ ] Expose metrics endpoint (`/metrics` for Prometheus).
  - [ ] Display aggregate metrics on dashboard.
  - **Acceptance Criteria:** Dashboard displays operational metrics and estimated costs.

---

## Phase 20 — Evaluation & Benchmark Harness

- [ ] **Task 20.1 — Benchmark task suite**
  - [ ] Create benchmark task repository with 20 deterministic coding tasks.
  - [ ] Include seeded bugs, test suites, and expected diffs.
  - **Acceptance Criteria:** Benchmark suite covers bug fixes, refactoring, feature additions, and tests.

- [ ] **Task 20.2 — Automated benchmark runner**
  - [ ] Script to execute benchmark tasks across selected models and providers.
  - [ ] Record pass/fail, test results, retries, duration, tool call count, and token cost.
  - **Acceptance Criteria:** Runner produces reproducible benchmark runs.

- [ ] **Task 20.3 — Evaluation dashboard**
  - [ ] Evaluation UI displaying pass rate, cost comparison, and failure breakdown by provider/model.
  - **Acceptance Criteria:** Direct comparison report generated for different models.

---

## Phase 21 — Production Hardening & Deployment

- [ ] **Task 21.1 — Authentication & Authorization**
  - [ ] Add user authentication (NextAuth / JWT / session tokens).
  - [ ] Protect API and dashboard routes.
  - **Acceptance Criteria:** Unauthorized requests are rejected.

- [ ] **Task 21.2 — Secrets management**
  - [ ] Server-side secret encryption at rest for user API keys.
  - [ ] Secure environment variable configuration.
  - **Acceptance Criteria:** Sensitive credentials are encrypted and never leaked in logs.

- [ ] **Task 21.3 — VPS deployment & Caddy reverse proxy**
  - [ ] Production `docker-compose.prod.yml`.
  - [ ] Configure Caddy with automatic TLS / HTTPS.
  - [ ] Harden Linux server (firewall, SSH keys only, non-root containers).
  - **Acceptance Criteria:** Full stack runs in production on a VPS behind HTTPS.

- [ ] **Task 21.4 — Database backup strategy**
  - [ ] Implement automated MongoDB backup cron job.
  - [ ] Document restore and disaster recovery procedure.
  - **Acceptance Criteria:** Backup archive generated and verified via restore test.

- [ ] **Task 21.5 — CI/CD pipeline**
  - [ ] GitHub Actions workflow for lint, typecheck, unit tests, and build.
  - [ ] Automated deployment to VPS on push to `main`.
  - **Acceptance Criteria:** Clean commits trigger automated test and deployment.

---

## Phase 22 — Scale & Multi-Worker Optimization

- [ ] **Task 22.1 — Parallel execution**
  - [ ] Run multiple tasks concurrently in separate worktrees and containers.
  - [ ] Measure resource consumption (CPU, RAM, disk I/O).
  - **Acceptance Criteria:** Concurrent tasks execute without resource collisions.

- [ ] **Task 22.2 — Worker clustering**
  - [ ] Scale to multiple worker replicas sharing BullMQ queue.
  - [ ] Validate lock acquisition and job distribution.
  - **Acceptance Criteria:** Jobs are distributed evenly across worker replicas.

- [ ] **Task 22.3 — Performance bottleneck analysis**
  - [ ] Profile database queries, Redis traffic, sandbox spin-up times, and LLM latency.
  - [ ] Document scaling recommendations and optimization points.
  - **Acceptance Criteria:** Performance profile documented with bottleneck mitigations.

---

# 🎯 Definition of Done for Entire Project

- [ ] A real GitHub issue automatically becomes an internal task via webhook.
- [ ] Tasks survive browser closure and continue running asynchronously.
- [ ] Entire task lifecycle is persisted in MongoDB and updated in real-time.
- [ ] AI agent inspects, plans, writes code, and executes tests in isolated worktree and sandbox.
- [ ] Failed tests trigger bounded autonomous repair loops.
- [ ] Verified changes are committed to a task branch and opened as a GitHub Pull Request.
- [ ] Human approval gates protect high-risk actions.
- [ ] Web dashboard provides live SSE progress streaming, diff viewer, and controls.
- [ ] LLM layer is provider-agnostic (OpenRouter, Gemini, OpenAI, Anthropic).
- [ ] Structured logging and OpenTelemetry provide complete auditability.
- [ ] Benchmark suite objectively measures model performance and reliability.
- [ ] Deployed with Docker Compose and Caddy on a single VPS with automated CI/CD.

