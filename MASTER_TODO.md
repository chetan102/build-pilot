# BuildPilot — Master Execution Tracker

> **Source of Truth for Project Progress**
> 
> **Execution Rule:** Work top-to-bottom. Do not jump ahead unless a later task is strictly required to unblock the current task. Check a box `[x]` only after the acceptance criteria for that item are actually satisfied and verified with tests.

---

## 📊 Overall Progress Summary

- **Current Phase:** Phase 14 — Agent Roles & Orchestration
- **Current Task:** Task 14.1 — Planner role
- **Project Status:** 🟢 IN PROGRESS (Phase 0-13: 100% Complete ✅ | Phase 14: 0% Complete)
- **Completed Tasks:** 30 / 35 Tasks Complete

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

- [x] **Task 1.2 — Domain types**
  - [x] Create `packages/domain` package.
  - [x] Define TaskStatus enum and state definitions.
  - [x] Define Task, TaskRun, AgentStep, ToolCall, Artifact, TestRun, Approval, PullRequest types.
  - [x] Define state transition rules & validation matrix.
  - [x] Implement transition helper functions (reject illegal transitions).
  - [x] Add unit tests for transition rules.
  - **Acceptance Criteria:** Every legal task transition is tested and verified; illegal transitions throw strict domain errors. (PASSED ✅)

---

## Phase 2 — Database Layer

- [x] **Task 2.1 — MongoDB connection**
  - [x] Create `packages/database` package.
  - [x] Add MongoDB / Mongoose client connection manager.
  - [x] Validate database connection URI using Zod.
  - [x] Implement connection lifecycle handling (connect, disconnect, reconnect, health check).
  - **Acceptance Criteria:** API and worker connect to MongoDB and fail with clear configuration error when DB is unavailable. (PASSED ✅)

- [x] **Task 2.2 — Core collections & models**
  - [x] Implement `User` model & schema.
  - [x] Implement `Project` model & schema.
  - [x] Implement `Repository` model & schema.
  - [x] Implement `GitHubInstallation` model & schema.
  - [x] Implement `ProviderCredential` model & schema.
  - [x] Implement `AgentDefinition` model & schema.
  - [x] Implement `Task` model & schema.
  - [x] Implement `TaskRun` model & schema.
  - [x] Implement `AgentStep` model & schema.
  - [x] Implement `ToolCall` model & schema.
  - [x] Implement `TestRun` model & schema.
  - [x] Implement `Artifact` model & schema.
  - [x] Implement `Approval` model & schema.
  - [x] Implement `PullRequest` model & schema.
  - [x] Implement `Event` model & schema.
  - [x] Implement `EvaluationResult` model & schema.
  - [x] Add database indexes (task status, repo + task state, task + run, chronological events).
  - [x] Write repository CRUD tests.
  - **Acceptance Criteria:** CRUD repository tests cover each core entity and indexes are verified. (PASSED ✅)

---

## Phase 3 — Control API
- [x] **Task 3.1 — Express application**
  - [x] Create `apps/api` (Express.js + TypeScript).
  - [x] Configure environment config loading and Zod validation.
  - [x] Add request ID / correlation ID middleware.
  - [x] Add structured Pino HTTP request logging middleware.
  - [x] Add `/health` and `/ready` endpoints.
  - [x] Add global error handling and 404 middleware.
  - [x] Add graceful shutdown handling (`SIGTERM`, `SIGINT`).
  - **Acceptance Criteria:** API starts, reports health, logs structured requests with correlation IDs, and shuts down cleanly. (PASSED ✅)

- [x] **Task 3.2 — Task & Project API**
  - [x] `POST /api/v1/projects` (create project).
  - [x] `GET /api/v1/projects` (list projects).
  - [x] `GET /api/v1/projects/:projectId` (get project details).
  - [x] `POST /api/v1/projects/:projectId/tasks` (create task manually).
  - [x] `GET /api/v1/tasks` (list tasks with pagination, status, and repository filters).
  - [x] `GET /api/v1/tasks/:taskId` (get detailed task with runs and steps).
  - [x] `POST /api/v1/tasks/:taskId/cancel` (cancel task).
  - [x] `POST /api/v1/tasks/:taskId/retry` (retry failed task).
  - [x] Validate all request inputs and query params with Zod schemas.
  - [x] Persist task state transition events on every mutation.
  - **Acceptance Criteria:** A task can be created, queried, cancelled, and retried entirely through the API with full validation. (PASSED ✅)

---

## Phase 4 — Queue + Worker

- [x] **Task 4.1 — Redis + BullMQ setup**
  - [x] Add BullMQ queue connection in worker and API.
  - [x] Configure Redis connection with retry and health check.
  - [x] Create `engineering-task` queue.
  - [x] Define strongly-typed job payload schemas.
  - [x] Implement job ID = `taskId:runId` correlation.
  - [x] Configure retry policy, exponential backoff, and dead-letter handling.
  - [x] Configure worker concurrency limits.
  - **Acceptance Criteria:** API can enqueue a task and worker consumes it exactly once per job execution attempt. (PASSED ✅)

- [x] **Task 4.2 — Worker service foundation**
  - [x] Create `apps/worker` (Node.js + TypeScript).
  - [x] Implement BullMQ worker processor loop.
  - [x] Add graceful shutdown with active job drainage.
  - [x] Add structured lifecycle logging (job start, progress, failure, completion).
  - [x] Persist `TaskRun` record and update `Task` status in MongoDB.
  - [x] Persist start/end/failure events to events collection.
  - **Acceptance Criteria:** Creating a task in the API produces a background worker run without keeping an HTTP request open. (PASSED ✅)

---

## Phase 5 — LLM Provider Layer

- [x] **Task 5.1 — Generic provider contract**
  - [x] Create `packages/llm` package.
  - [x] Define `LLMProvider` interface (`generate`, `stream`, `supports`).
  - [x] Define `LLMRequest`, `LLMResponse`, `LLMMessage`, `ToolDefinition` types.
  - [x] Define normalized tool-call and tool-result representation.
  - [x] Define normalized provider error hierarchy (`RateLimitError`, `AuthError`, `InvalidRequestError`, `ProviderTimeoutError`).
  - [x] Implement `ProviderFactory` for dynamic provider instantiation.
  - **Acceptance Criteria:** Agent code depends exclusively on the internal `LLMProvider` interface. (PASSED ✅)

- [x] **Task 5.2 — OpenRouter provider adapter**
  - [x] Implement `OpenRouterProvider` adapter using OpenRouter API standard.
  - [x] Support text generation with system prompts and message history.
  - [x] Support tool/function definition passing and tool-call response parsing.
  - [x] Normalize OpenRouter error responses into standard error classes.
  - [x] Add configurable timeout and token usage metadata extraction.
  - [x] Write unit & integration test with mock and real/test endpoints.
  - **Acceptance Criteria:** A standalone test script can send a prompt with tool definitions to a fixed OpenRouter model and receive a normalized tool call. (PASSED ✅)

- [x] **Task 5.3 — OpenAI-compatible provider adapter**
  - [x] Implement `OpenAICompatibleProvider` adapter supporting custom `baseURL` and API keys.
  - [x] Support standard OpenAI endpoints, Ollama, Groq, vLLM, etc.
  - [x] Verify identical interface behavior across providers.
  - **Acceptance Criteria:** The same agent code can call two different API endpoints without modifying the agent loop. (PASSED ✅)

---

## Phase 6 — Agent Runtime

- [x] **Task 6.1 — Context builder**
  - [x] Build task instruction and requirements context.
  - [x] Build repository metadata, file tree summary, and branch context.
  - [x] Format conversation and tool call execution history.
  - [x] Enforce context window token budgets and truncation policies.
  - **Acceptance Criteria:** Context builder produces structured prompts within token limits. (PASSED ✅)

- [x] **Task 6.2 — Agent core loop**
  - [x] Implement deterministic system prompt for engineering agents.
  - [x] Send structured context + available tools to LLM.
  - [x] Detect and parse tool calls vs final answer messages.
  - [x] Validate tool arguments using Zod schemas.
  - [x] Authorize tool execution via permission policy.
  - [x] Execute tool, capture output, and append tool results to message history.
  - [x] Persist every `AgentStep` and `ToolCall` to database in real-time.
  - [x] Enforce safety guards: max steps, max wall-clock runtime, per-tool timeout.
  - [x] Support cancellation signals during agent execution.
  - **Acceptance Criteria:** Scripted agent executes a multi-step tool-calling task with full history recorded in `agent_steps` and `tool_calls`. (PASSED ✅)

- [x] **Task 6.3 — Agent failure recovery**
  - [x] Implement retry logic for transient LLM errors (exponential backoff).
  - [x] Implement error feedback to LLM when tool execution fails (allowing model self-correction).
  - [x] Guard against infinite identical failure loops.
  - [x] Persist detailed failure diagnostics and mark task run as `FAILED` or `BLOCKED`.
  - **Acceptance Criteria:** Transient errors are recovered cleanly; persistent failures terminate safely with audit records. (PASSED ✅)

---

## Phase 7 — First Tool Registry

- [x] **Task 7.1 — Typed tool framework**
  - [x] Create `packages/tools` package.
  - [x] Implement typed tool definition interface (`name`, `description`, `inputSchema`, `outputSchema`, `permissionClass`, `timeout`, `execute`).
  - [x] Implement `ToolRegistry` with lookup, registration, and unknown tool rejection.
  - [x] Define permission classes: `READ_ONLY`, `SAFE_WRITE`, `EXTERNAL_WRITE`, `HIGH_RISK`.
  - **Acceptance Criteria:** Registry validates tool inputs via Zod and enforces permission classes. (PASSED ✅)

- [x] **Task 7.2 — Repository tools**
  - [x] Implement `list_files` tool (with path filtering, glob patterns, max depth).
  - [x] Implement `search_code` tool (regex / ripgrep search within workspace).
  - [x] Implement `read_file` tool (with line range slicing and truncation safeguards).
  - [x] Implement `write_file` tool (create or replace file contents within workspace).
  - [x] Implement `git_status` tool.
  - [x] Implement `git_diff` tool.
  - **Acceptance Criteria:** Agent can inspect repository structure, search contents, read files, and write modifications. (PASSED ✅)

- [x] **Task 7.3 — Execution tools**
  - [x] Implement `run_command` tool (executes shell command in controlled workspace).
  - [x] Implement `run_tests` tool (executes configured test suite).
  - [x] Capture stdout, stderr, exit code, duration, and output size limits.
  - [x] Enforce strict execution timeouts.
  - **Acceptance Criteria:** Agent can run tests and commands with captured outputs, exit codes, and enforced timeouts. (PASSED ✅)

---

## Phase 8 — Git Workspace Management

- [x] **Task 8.1 — Repository preparation**
  - [x] Implement Git clone / fetch service into controlled workspace directory.
  - [x] Validate repository remote URL and verify default branch ref.
  - [x] Fetch latest target branch refs.
  - **Acceptance Criteria:** Worker can clone and maintain a clean mirror of a target repository. (PASSED ✅)

- [x] **Task 8.2 — Isolated worktree management**
  - [x] Create dedicated branch per task (`buildpilot/task-<taskId>-<shortId>`).
  - [x] Create dedicated Git worktree per task run.
  - [x] Track active worktree paths in task metadata.
  - [x] Implement worktree cleanup upon task completion, cancellation, or crash.
  - **Acceptance Criteria:** Multiple task runs operate in completely isolated worktrees without cross-contamination. (PASSED ✅)

- [x] **Task 8.3 — Commit & push flow**
  - [x] Inspect diff before committing to ensure only expected changes exist.
  - [x] Create structured commit with task metadata and issue reference.
  - [x] Capture commit SHA and push task branch to remote.
  - **Acceptance Criteria:** Worker can branch, commit verified changes, and push to remote without touching `main`. (PASSED ✅)

---

## Phase 9 — GitHub App + Automatic Issue Intake

- [x] **Task 9.1 — GitHub App integration**
  - [x] Create `packages/github` package with Octokit / GitHub App client.
  - [x] Implement GitHub App authentication (private key, app ID, installation ID token generation).
  - [x] Support required permissions (Issues read/write, Pull Requests read/write, Contents read/write).
  - **Acceptance Criteria:** Client can authenticate as a GitHub App installation and interact with GitHub API. (PASSED ✅)

- [x] **Task 9.2 — Webhook endpoint**
  - [x] Implement `POST /api/v1/github/webhooks` in `apps/api`.
  - [x] Verify GitHub webhook signature (`x-hub-signature-256`).
  - [x] Parse `issues`, `pull_request`, and `installation` event payloads.
  - [x] Persist raw webhook event to `events` collection.
  - [x] Implement idempotent event deduplication (`x-github-delivery`).
  - **Acceptance Criteria:** Webhook endpoint validates signatures, deduplicates deliveries, and parses events. (PASSED ✅)

- [x] **Task 9.3 — Issue-to-task conversion**
  - [x] Implement eligibility filter (e.g. `buildpilot` label or configured trigger).
  - [x] Map GitHub issue fields → internal `Task` entity.
  - [x] Prevent duplicate task creation for the same issue.
  - [x] Enqueue task in BullMQ queue.
  - [x] Post initial acknowledgment comment on GitHub issue.
  - **Acceptance Criteria:** Labeling or opening an eligible issue automatically creates and queues an internal task. (PASSED ✅)

---

## Phase 10 — End-to-End Vertical Slice (MVP: Issue → PR)

- [x] **Task 10.1 — End-to-end integration**
  - [x] Connect webhook intake → Task creation → Queue → Worker → LLM loop → Git worktree → Tests → PR creation.
  - [x] Implement `create_pull_request` tool / post-execution step linking issue to PR.
  - [x] Update GitHub issue with link to generated PR and execution summary.
  - **Acceptance Criteria:** End-to-end flow executes without manual terminal intervention. (PASSED ✅)

- [x] **Task 10.2 — Controlled benchmark demo test**
  - [x] Create a controlled demo test case (e.g. fix a bug and add a regression test).
  - [x] Run end-to-end task against test repo.
  - [x] Verify generated diff, passing tests, PR creation, and `PR_READY` / `COMPLETED` status.
  - **Acceptance Criteria:** First end-to-end autonomous engineering run verified with full audit trail. (PASSED ✅)

---

## Phase 11 — Dashboard Connected to Reality

- [x] **Task 11.1 — API-backed task board**
  - [x] Connect Next.js task board to Express API (`/api/v1/tasks`).
  - [x] Implement real loading states, error boundaries, and empty states.
  - [x] Implement task filtering by status, repository, and search query.
  - [x] Implement pagination / infinite scroll.
  - **Acceptance Criteria:** Dashboard shows live tasks from database instead of mock data. (PASSED ✅)

- [x] **Task 11.2 — Live timeline & Server-Sent Events (SSE)**
  - [x] Implement `GET /api/v1/tasks/:taskId/events` SSE endpoint in Express API.
  - [x] Implement SSE client hook with automatic reconnection in Next.js dashboard.
  - [x] Stream real-time agent steps, tool calls, and test outputs as they occur.
  - [x] Render interactive step cards with timestamps, durations, and tool inputs/outputs.
  - **Acceptance Criteria:** Browser updates live during agent execution and reconnects cleanly on network interruption. (PASSED ✅)

- [x] **Task 11.3 — Task detail view**
  - [x] Display GitHub issue context, repository, and branch info.
  - [x] Display interactive execution timeline.
  - [x] Display changed files and diff viewer.
  - [x] Display test run results and PR links.
  - **Acceptance Criteria:** User can inspect all details and artifacts of a task run from the web dashboard. (PASSED ✅)

---

## Phase 12 — Reliability & Durable Workflow

- [x] **Task 12.1 — Persistent state machine & transactional transitions**
  - [x] Ensure every state change is persisted atomically with transition audit log.
  - [x] Persist current stage, attempt number, and last successful checkpoint.
  - [x] Implement worker heartbeat and lease renewal to detect stalled workers.
  - **Acceptance Criteria:** Task state is always consistent and auditable across restarts. (PASSED ✅)

- [x] **Task 12.2 — Crash recovery & resume**
  - [x] Handle worker crashes during planning, execution, and testing.
  - [x] Implement safe resume from last checkpoint without duplicate PRs or branch corruption.
  - **Acceptance Criteria:** Killing and restarting worker resumes or recovers task safely. (PASSED ✅)

- [x] **Task 12.3 — Idempotency guards**
  - [x] Guard against duplicate webhook deliveries.
  - [x] Guard against duplicate queue job processing.
  - [x] Guard against duplicate branch creation and PR opening.
  - **Acceptance Criteria:** Replayed events produce no duplicate external side effects. (PASSED ✅)

---

## Phase 13 — Sandbox Execution

- [x] **Task 13.1 — Docker sandbox runner**
  - [x] Create Docker container runner for isolated command execution.
  - [x] Mount only task worktree into container.
  - [x] Configure CPU, memory, and runtime limits.
  - [x] Stream stdout/stderr from container to worker logs and database.
  - **Acceptance Criteria:** Commands execute inside disposable containers with resource limits enforced. (PASSED ✅)

- [x] **Task 13.2 — Security restrictions & policies**
  - [x] Disable privileged mode and root execution.
  - [x] Deny access to host Docker socket and filesystem.
  - [x] Restrict network access (offline execution by default, whitelist for package installs).
  - [x] Enforce environment variable allowlist.
  - [x] Add automatic container cleanup on completion, error, or crash.
  - **Acceptance Criteria:** Host system is completely protected from untrusted code execution. (PASSED ✅)

- [x] **Task 13.3 — Tool sandbox routing**
  - [x] Route `run_command` and `run_tests` through Docker sandbox.
  - [x] Persist command outputs and test artifacts.
  - **Acceptance Criteria:** All code changes and tests execute exclusively inside Docker sandbox. (PASSED ✅)

---

## Phase 14 — Agent Roles & Orchestration

- [x] **Task 14.1 — Planner role**
  - [x] Implement Planner agent instructions and prompt.
  - [x] Enforce read-only tools for Planner.
  - [x] Generate structured implementation plan artifact.
  - [x] Persist plan in task artifacts.
  - **Acceptance Criteria:** Planner produces a clear, verified implementation plan before code modification. (PASSED ✅)

- [x] **Task 14.2 — Developer role**
  - [x] Implement Developer agent receiving approved plan.
  - [x] Enable write and test tools in isolated worktree.
  - [x] Execute code changes and local test cycles.
  - **Acceptance Criteria:** Developer implements changes adhering to the plan. (PASSED ✅)

- [x] **Task 14.3 — Reviewer role**
  - [x] Implement Reviewer agent inspecting final diff against requirements.
  - [x] Detect regressions, anti-patterns, or incomplete acceptance criteria.
  - [x] Produce structured review report (Approved / Changes Requested).
  - **Acceptance Criteria:** Reviewer provides independent validation before PR creation. (PASSED ✅)

- [x] **Task 14.4 — Bounded repair loop**
  - [x] Feed Reviewer findings or failing test outputs back to Developer.
  - [x] Enforce maximum repair iteration limit (e.g. max 3 repair cycles).
  - [x] Persist iteration history.
  - **Acceptance Criteria:** System autonomously fixes minor bugs/test failures up to iteration limit. (PASSED ✅)

---

## Phase 15 — Testing & Verification

- [x] **Task 15.1 — Unit tests**
  - [x] Domain state machine & transition tests.
  - [x] LLM provider adapter & error normalization tests.
  - [x] Tool registry & schema validation tests.
  - [x] Git worktree helper tests.
  - [x] Queue payload validation tests.
  - **Acceptance Criteria:** `pnpm test` runs all unit tests with 100% pass rate. (PASSED ✅)

- [x] **Task 15.2 — Integration tests**
  - [x] Express API ↔ MongoDB integration tests.
  - [x] Express API ↔ BullMQ / Redis integration tests.
  - [x] Worker ↔ Redis job processing integration tests.
  - [x] Worker ↔ Mock LLM provider end-to-end tests.
  - [x] Worker ↔ Git worktree integration tests.
  - **Acceptance Criteria:** Integration test suite passes against local containerized test DB and Redis. (PASSED ✅)

- [x] **Task 15.3 — End-to-end automated tests**
  - [x] Simulate GitHub webhook → Task → Agent run → PR output.
  - [x] Verify state transitions from QUEUED to COMPLETED.
  - **Acceptance Criteria:** Automated E2E test passes in CI. (PASSED ✅)

- [x] **Task 15.4 — Browser verification (Playwright)**
  - [x] Configure Playwright runner in sandbox.
  - [x] Run browser smoke tests for frontend tasks.
  - [x] Capture screenshots and traces on failure.
  - **Acceptance Criteria:** Agent captures browser verification artifacts for UI tasks. (PASSED ✅)

---

## Phase 16 — Human Approval & Policies

- [x] **Task 16.1 — Approval engine**
  - [x] Define high-risk actions requiring approval (`HIGH_RISK` tools, PR merge, deploy).
  - [x] Implement approval request records and pause workflow in `AWAITING_APPROVAL`.
  - [x] Add interactive approval UI in web dashboard (Approve / Reject with notes).
  - [x] Resume or terminate task upon human decision.
  - **Acceptance Criteria:** High-risk actions pause execution until human approves in the dashboard. (PASSED ✅)

- [x] **Task 16.2 — Granular permissions & audit**
  - [x] Configurable global and repository-level tool permission policies.
  - [x] Audit log for every executed, denied, or approved action.
  - **Acceptance Criteria:** Unauthorized tool calls are blocked and audited. (PASSED ✅)

---

## Phase 17 — Provider Expansion

- [x] **Task 17.1 — Google Gemini provider adapter**
  - [x] Implement `GeminiProvider` adapter using `@google/genai` or Gemini REST API.
  - [x] Map tool calling and schema format.
  - [x] Normalize errors and token usage.
  - **Acceptance Criteria:** Agent runtime executes tasks using Gemini model. (PASSED ✅)

- [x] **Task 17.2 — OpenAI provider adapter**
  - [x] Implement direct `OpenAIProvider` adapter.
  - [x] Support GPT-4o / standard models with native tool calling.
  - **Acceptance Criteria:** Agent runtime executes tasks using OpenAI provider. (PASSED ✅)

- [x] **Task 17.3 — Anthropic provider adapter**
  - [x] Implement `AnthropicProvider` adapter.
  - [x] Support Claude models with tool calling.
  - **Acceptance Criteria:** Agent runtime executes tasks using Anthropic provider. (PASSED ✅)

- [x] **Task 17.4 — Provider settings & model selection**
  - [x] Provider configuration UI in dashboard (`/settings/providers`).
  - [x] Store API keys encrypted or via server env.
  - [x] Connection test button for each provider.
  - [x] Task-level provider/model override capability.
  - **Acceptance Criteria:** User can switch default provider and test connections from UI. (PASSED ✅)

---

## Phase 18 — Model Context Protocol (MCP)

- [x] **Task 18.1 — MCP client integration**
  - [x] Implement MCP client in agent runtime (`packages/tools` / `packages/mcp`).
  - [x] Connect to local stdio or SSE MCP servers.
  - [x] Discover MCP tools and adapt them to internal tool registry format.
  - **Acceptance Criteria:** Agent runtime can discover and execute tools from an MCP server. (PASSED ✅)

- [x] **Task 18.2 — BuildPilot MCP server**
  - [x] Expose BuildPilot control plane as an MCP server.
  - [x] Provide tools to query tasks, runs, status, and logs.
  - **Acceptance Criteria:** External AI tools can query BuildPilot via MCP. (PASSED ✅)

- [x] **Task 18.3 — External MCP integration & safety gates**
  - [x] Support connecting external MCP servers with permission class assignment.
  - [x] Audit and persist all MCP tool invocations.
  - **Acceptance Criteria:** MCP tools adhere to the same permission and audit gates as native tools. (PASSED ✅)

---

## Phase 19 — Observability & Telemetry

- [x] **Task 19.1 — Structured logging**
  - [x] Standardize Pino logging schemas across API, Worker, and packages.
  - [x] Attach `requestId`, `taskId`, `runId`, `stepId`, `repoId` to all log records.
  - [x] Implement automatic secret redaction.
  - **Acceptance Criteria:** Logs are structured JSON with complete correlation IDs. (PASSED ✅)

- [x] **Task 19.2 — OpenTelemetry tracing**
  - [x] Add OpenTelemetry SDK instrumentation.
  - [x] Trace API requests, BullMQ jobs, LLM calls, tool executions, and sandbox runs.
  - **Acceptance Criteria:** Traces provide end-to-end visualization of task execution. (PASSED ✅)

- [x] **Task 19.3 — Operational metrics**
  - [x] Track task duration, success rate, retry rate, tool latency, token usage, and cost estimates.
  - [x] Expose metrics endpoint (`/metrics` for Prometheus).
  - [x] Display aggregate metrics on dashboard.
  - **Acceptance Criteria:** Dashboard displays operational metrics and estimated costs. (PASSED ✅)

---

## Phase 20 — Evaluation & Benchmark Harness

- [x] **Task 20.1 — Benchmark task suite**
  - [x] Create benchmark task repository with 20 deterministic coding tasks.
  - [x] Include seeded bugs, test suites, and expected diffs.
  - **Acceptance Criteria:** Benchmark suite covers bug fixes, refactoring, feature additions, and tests. (PASSED ✅)

- [x] **Task 20.2 — Automated benchmark runner**
  - [x] Script to execute benchmark tasks across selected models and providers.
  - [x] Record pass/fail, test results, retries, duration, tool call count, and token cost.
  - **Acceptance Criteria:** Runner produces reproducible benchmark runs. (PASSED ✅)

- [x] **Task 20.3 — Evaluation dashboard**
  - [x] Evaluation UI displaying pass rate, cost comparison, and failure breakdown by provider/model.
  - **Acceptance Criteria:** Direct comparison report generated for different models. (PASSED ✅)

---

## Phase 21 — Production Hardening & Deployment

- [x] **Task 21.1 — Authentication & Authorization**
  - [x] Add user authentication (NextAuth / JWT / session tokens).
  - [x] Protect API and dashboard routes.
  - **Acceptance Criteria:** Unauthorized requests are rejected. (PASSED ✅)

- [x] **Task 21.2 — Secrets management**
  - [x] Server-side secret encryption at rest for user API keys.
  - [x] Secure environment variable configuration.
  - **Acceptance Criteria:** Sensitive credentials are encrypted and never leaked in logs. (PASSED ✅)

- [x] **Task 21.3 — VPS deployment & Caddy reverse proxy**
  - [x] Production `docker-compose.prod.yml`.
  - [x] Configure Caddy with automatic TLS / HTTPS.
  - [x] Harden Linux server (firewall, SSH keys only, non-root containers).
  - **Acceptance Criteria:** Full stack runs in production on a VPS behind HTTPS. (PASSED ✅)

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

