# BuildPilot — AI Engineering Control Plane

> **Turn a software backlog into autonomous, observable, verifiable engineering work.**

BuildPilot is a self-hosted AI engineering control plane for developers and small teams. It watches a GitHub repository for eligible issues, converts them into durable engineering tasks, dispatches work to AI agents in isolated workspaces, tracks every stage of execution, runs verification, and returns reviewable pull requests to a human developer.

The project is intentionally designed **around AI agents as workers, not as the product itself**. The goal is not to clone Claude Code, Codex, Cursor, or another coding agent. The goal is to build the system that coordinates agents: task intake, scheduling, persistence, provider abstraction, tool execution, isolation, verification, retries, observability, approvals, and evaluation.

## Why BuildPilot Exists

Modern coding agents can already inspect repositories, edit files, run commands, and produce changes. OpenAI's 2026 Symphony work describes the next bottleneck as orchestration: treating the issue/task tracker as the control plane from which coding agents pull work. Current agent infrastructure is also moving toward durable execution, approvals, sandboxing, MCP, and telemetry.

BuildPilot is a learning-first implementation of that idea.

### Core outcome

A developer should be able to:

1. Open a normal GitHub issue.
2. Mark it as ready for BuildPilot.
3. Let BuildPilot detect and queue it automatically.
4. Watch the task move through planning → development → testing → review → approval.
5. Close the dashboard and let the backend continue working.
6. Return later and see exactly what happened.
7. Review a PR with evidence instead of trusting a model's claim that the task is done.

GitHub Apps and webhooks are a natural trigger for this model: GitHub can send event payloads to our server whenever subscribed repository activity occurs.

---

# 1. Product Definition

## 1.1 What BuildPilot is

BuildPilot is a **self-hosted control plane for AI-assisted software delivery**.

It has five core responsibilities:

- **Ingest work** from GitHub Issues.
- **Orchestrate work** through durable task workflows.
- **Dispatch work** to AI agent workers.
- **Verify work** with tests, browser checks, review, and policy gates.
- **Expose evidence** through a live dashboard and GitHub PRs.

## 1.2 What BuildPilot is NOT

BuildPilot is not:

- A new foundation model.
- A chatbot for answering coding questions.
- A direct Claude Code/Codex replacement.
- A prompt library.
- A simple `issue -> LLM -> PR` wrapper.
- A collection of unrelated microservices.

The differentiator is the **engineering control plane around agents**.

## 1.3 North-star workflow

```text
GitHub Issue
    |
    v
Webhook / Event Intake
    |
    v
Task Record + Eligibility Check
    |
    v
Persistent Task State Machine
    |
    v
Planner Agent
    |
    v
Execution Assignment
    |
    v
Developer Agent / Agent Harness
    |
    v
Isolated Git Worktree + Sandbox
    |
    v
Tests / Build / Browser Verification
    |
    v
Reviewer / Quality Gates
    |
    +-------> retry / repair loop
    |
    v
Human Approval (when required)
    |
    v
GitHub Pull Request
    |
    v
Completed + Audit Trail + Metrics
```

---

# 2. Product Principles

## 2.1 Human is the owner, agents are workers

Agents can perform work, but humans remain responsible for system policy, risky approvals, production-impacting actions, and final merge decisions.

## 2.2 Evidence over claims

The system should never treat an agent message such as `done` as proof of completion.

Completion should be backed by:

- Tests passing.
- Build succeeding.
- Required checks passing.
- Optional browser flow passing.
- Review completed.
- Required approvals completed.

## 2.3 Persistent state over browser sessions

The web dashboard is a control/observation surface. It must not be the process that owns the work.

If the browser closes, work continues.

If the UI disconnects, work continues.

If an agent process crashes, the workflow can retry or resume from a durable checkpoint.

## 2.4 Provider-agnostic LLM layer

The core agent runtime must not depend on one model provider.

A provider adapter should allow the same agent runtime to work with:

- OpenRouter
- Gemini
- OpenAI
- Anthropic
- Groq
- Other OpenAI-compatible endpoints
- Local endpoints such as Ollama/LM Studio later

For the first working prototype, one provider is enough. Provider abstraction is required before the product is considered mature.

## 2.5 Self-hosted first

The first production-like deployment runs on a cheap VPS owned by the developer. Managed services are optional later.

This is deliberate: the project should teach Linux, Docker, networking, process management, queues, databases, background workers, observability, and distributed-system thinking instead of hiding those concerns behind a managed platform.

---

# 3. System Architecture

## 3.1 High-level architecture

```text
                                  INTERNET
                                      |
                                      v
                           +-----------------------+
                           | Caddy / Reverse Proxy |
                           | TLS + Routing         |
                           +-----------+-----------+
                                       |
                     +-----------------+-----------------+
                     |                                   |
                     v                                   v
             +---------------+                   +---------------+
             |   Next.js     |                   | Express API   |
             |   Dashboard   |                   | Control API   |
             +-------+-------+                   +-------+-------+
                     |                                   |
                     |                                   +------------------+
                     |                                                      |
                     v                                                      v
             Live Event Stream                                     +----------------+
                     |                                             | GitHub App     |
                     |                                             | Webhooks/API   |
                     |                                             +-------+--------+
                     |                                                     |
                     +-----------------------------------------------------+
                                                                           |
                                                                           v
                                                               +----------------------+
                                                               | Task Intake / Router |
                                                               +----------+-----------+
                                                                          |
                                                                          v
                                                               +----------------------+
                                                               | Redis + BullMQ       |
                                                               | Async Job Queue      |
                                                               +----------+-----------+
                                                                          |
                                                                          v
                                                               +----------------------+
                                                               | Agent Worker         |
                                                               |                     |
                                                               | Agent Runtime       |
                                                               | Provider Adapter    |
                                                               | Tool Registry       |
                                                               | Policy Engine       |
                                                               +----------+-----------+
                                                                          |
                                     +------------------------------------+-----------------------------------+
                                     |                                    |                                   |
                                     v                                    v                                   v
                            +----------------+                  +----------------+                  +----------------+
                            | LLM Providers  |                  | Git / GitHub   |                  | Tool Systems   |
                            | OpenRouter     |                  | Worktrees      |                  | Browser        |
                            | Gemini/OpenAI  |                  | Branches      |                  | Tests          |
                            | Anthropic/etc. |                  | PRs           |                  | Filesystem     |
                            +----------------+                  +----------------+                  +-------+--------+
                                                                                                        |
                                                                                                        v
                                                                                               +----------------+
                                                                                               | Docker Sandbox |
                                                                                               | Repo + Tools   |
                                                                                               +----------------+

                 +-------------------------+            +---------------------------+
                 | MongoDB                 |            | Observability            |
                 | Durable app state       |            | Pino -> OpenTelemetry    |
                 | Tasks, runs, events,    |            | traces, metrics, logs    |
                 | providers, approvals   |            +---------------------------+
                 +-------------------------+
```

## 3.2 Service boundaries

We intentionally start with a **small number of deployable services**. We do not create a microservice for every feature.

### Service A — Web Dashboard

**Technology:** Next.js + React + TypeScript

Responsibilities:

- Project/repository overview.
- Task board.
- Task detail page.
- Live timeline.
- Agent status.
- Tool activity.
- Test status.
- Approval requests.
- PR links.
- Provider configuration.
- Usage/cost view later.

The dashboard is a client of the backend; it does not own execution.

### Service B — Control API

**Technology:** Express.js + TypeScript

Responsibilities:

- Receive GitHub webhooks.
- Authenticate users/API clients.
- Create/update projects and repositories.
- Create and query tasks.
- Manage task state transitions.
- Enqueue background jobs.
- Manage provider configuration.
- Expose task/run APIs to the dashboard.
- Issue human approvals.

### Service C — Agent Worker

**Technology:** Node.js + TypeScript

Responsibilities:

- Consume tasks from Redis/BullMQ.
- Run the agent loop.
- Ask the selected LLM for the next action.
- Execute approved tools.
- Persist every important step.
- Recover/retry after expected failures.
- Create commits/PRs.
- Hand off to QA/review stages.

This is the **main intelligence/orchestration service**.

### Supporting infrastructure

#### MongoDB

Persistent application and execution records.

#### Redis

Queue and short-lived coordination data.

#### Docker

Isolation boundary for repository execution.

#### GitHub

External source-of-truth for repositories, issues, branches, and PRs.

#### LLM APIs

External intelligence providers selected by the user or system policy.

#### Caddy

Public HTTP(S) entry point and reverse proxy.

---

# 4. Core Domain Model

The implementation should use explicit domain concepts rather than putting everything into one `tasks` collection.

```text
User
  |
  +--- ProviderCredential
  |
  +--- Project
          |
          +--- Repository
          |       |
          |       +--- GitHub Installation
          |
          +--- Task
                  |
                  +--- TaskRun
                  |       |
                  |       +--- AgentStep
                  |       +--- ToolCall
                  |       +--- Artifact
                  |       +--- TestRun
                  |
                  +--- Approval
                  +--- PullRequest
                  +--- EvaluationResult
```

## 4.1 Task lifecycle

Initial state machine:

```text
QUEUED
  |
  v
PLANNING
  |
  v
READY_FOR_DEVELOPMENT
  |
  v
DEVELOPMENT
  |
  v
TESTING
  |   \
  |    \-- failure --> REPAIRING --+
  |                                  |
  +----------------------------------+
  |
  v
REVIEW
  |
  +--> CHANGES_REQUESTED --> REPAIRING
  |
  v
AWAITING_APPROVAL
  |
  v
PR_READY
  |
  v
COMPLETED
```

Terminal/error states:

```text
FAILED
CANCELLED
BLOCKED
TIMED_OUT
```

Every state transition must be persisted.

---

# 5. LLM / Agent Architecture

## 5.1 Our Agent Runtime

The first version deliberately implements the core tool loop ourselves.

The agent runtime is responsible for:

1. Loading task context.
2. Loading project/repository context.
3. Loading available tools.
4. Calling the selected LLM.
5. Detecting text vs tool-call output.
6. Validating tool arguments.
7. Enforcing permissions.
8. Executing the tool.
9. Persisting the tool result.
10. Sending the result back to the model.
11. Repeating until a terminal condition.
12. Performing final verification.

Conceptually:

```text
while (!terminal) {

  context = loadContext(task)

  response = await llm.generate(context, tools)

  if (response.isFinal) {
      terminal = true
      break
  }

  toolCall = validateToolCall(response)

  policy = authorize(toolCall)

  result = await executeTool(toolCall)

  persistStep(response, toolCall, result)

  context = appendResult(context, result)
}
```

The actual implementation must include:

- Maximum step count.
- Maximum wall-clock runtime.
- Per-tool timeout.
- Retry policy.
- Token/cost tracking where provider data allows it.
- Cancellation.
- Pause/resume.
- Approval-required tool support.
- Idempotency protection.

## 5.2 Provider abstraction

Create a stable internal interface such as:

```ts
interface LLMProvider {
  readonly id: string;

  generate(request: LLMRequest): Promise<LLMResponse>;

  stream?(request: LLMRequest): AsyncIterable<LLMStreamEvent>;

  supports(capability: LLMCapability): boolean;
}
```

Possible adapters:

```text
LLMProvider
  ├── OpenRouterProvider
  ├── GeminiProvider
  ├── OpenAIProvider
  ├── AnthropicProvider
  ├── OpenAICompatibleProvider
  └── LocalProvider (later)
```

The agent runtime must only depend on `LLMProvider`, not on provider-specific SDK classes.

### Initial provider

Use **OpenRouter** for development because its current API standardizes tool calling across supported models and provides a free-model router for experimentation. Use a fixed model for repeatable testing rather than relying on random free-model selection for evaluation.

### API keys

The self-hosted product uses **BYOK (Bring Your Own Key)**.

A deployment owner configures one or more provider credentials. The system does not pay model providers on behalf of all users.

For V1, environment variables are acceptable. Multi-user encrypted credentials come later.

---

# 6. Tool System

Tools are capabilities the agent can invoke.

## V1 tools

```text
Repository
  - list_files
  - search_code
  - read_file
  - write_file
  - delete_file (disabled by default)

Git
  - git_status
  - git_diff
  - create_branch
  - commit_changes

Execution
  - run_command
  - run_tests

GitHub
  - get_issue
  - create_issue_comment
  - create_pull_request
```

Every tool must define:

```text
name
input schema
output schema
permission class
timeout
idempotency behavior
audit information
```

Use **Zod** for runtime validation.

## Tool permission classes

```text
READ_ONLY
SAFE_WRITE
EXTERNAL_WRITE
HIGH_RISK
```

Example:

```text
read_file          READ_ONLY
search_code        READ_ONLY
run_tests          SAFE_WRITE
write_file         SAFE_WRITE
create_branch      SAFE_WRITE
create_pull_request EXTERNAL_WRITE
merge_pull_request HIGH_RISK
production_deploy  HIGH_RISK
```

The agent may not bypass the permission engine.

---

# 7. MCP Strategy

MCP is a **later capability**, not a prerequisite for the first prototype.

Initially, tools are implemented through an internal typed registry:

```text
Agent Runtime
    |
    v
Internal Tool Registry
    |
    +--- GitHub tools
    +--- filesystem tools
    +--- git tools
    +--- test tools
```

Once the internal tool model is stable, expose selected tools through MCP:

```text
Agent Runtime
    |
    v
MCP Client
    |
    +--- GitHub MCP server
    +--- Browser MCP server
    +--- CI/Test MCP server
    +--- BuildPilot MCP server
```

This sequence is intentional: understand tool calling first, standardize the interface second.

MCP is relevant because it provides a standardized tool/resource interaction layer, and current agent tooling increasingly treats MCP as a core agent integration mechanism.

---

# 8. Execution Sandbox

## Why it exists

The agent may need to execute arbitrary repository commands:

```bash
npm install
npm test
npm run build
node scripts/check.js
```

Those commands must not run directly against the host system by default.

## Model

Each task receives an isolated workspace:

```text
Task #142
   |
   v
Docker container
   |
   +--- cloned repository
   +--- task worktree
   +--- dependencies
   +--- test/build process
   +--- controlled environment variables
```

On completion/failure:

```text
artifacts / logs / diff
        |
        v
persistent storage
        |
        v
temporary sandbox destroyed
```

### V1 sandbox rules

- Non-root process where practical.
- CPU/time limits.
- Memory limit.
- Workspace-only filesystem access.
- Explicit environment-variable allowlist.
- Secrets are not copied into arbitrary repository files.
- Network access disabled by default; explicitly enable where required.
- No access to host Docker socket.
- No access to host filesystem outside the mounted workspace.

---

# 9. Git Strategy

Every autonomous development task gets its own isolated Git workspace.

Preferred V1 strategy:

```text
main
 |
 +--- worktree/task-142
 |
 +--- worktree/task-143
 |
 +--- worktree/task-144
```

The worker should:

1. Fetch latest target branch.
2. Create a dedicated branch/worktree.
3. Run the agent only inside that workspace.
4. Capture the final diff.
5. Commit only verified changes.
6. Push branch.
7. Create/update PR.

Future iterations should handle stale branches, merge conflicts, and rebasing.

---

# 10. GitHub Integration

Use a **GitHub App**, not a personal token as the permanent product architecture.

The App should request only the permissions actually required.

Initial webhook events:

- `issues`
- `issue_comment` later
- `pull_request`
- `push` later
- `installation` / installation lifecycle as required

Initial trigger rule:

```text
Issue opened/updated
        |
        v
Does repository have BuildPilot enabled?
        |
       yes
        |
        v
Is issue eligible for automation?
        |
       yes
        |
        v
Create task + enqueue
```

GitHub's App/webhook model supports exactly this event-driven pattern: GitHub sends HTTP notifications to the configured webhook URL, and the server can then call GitHub APIs in response.

---

# 11. Queue and Background Execution

Use:

**Redis + BullMQ**

The queue separates event intake from long-running agent execution.

```text
GitHub webhook
    |
    v
API
    |
    v
Task persisted
    |
    v
BullMQ queue
    |
    +------ worker 1
    +------ worker 2
    +------ worker 3
```

Queue concepts to implement:

- Job IDs.
- Priority.
- Concurrency limit.
- Retries.
- Exponential backoff.
- Dead-letter/failed-job handling.
- Cancellation.
- Deduplication.
- Idempotency.

Do not introduce a second queue technology unless there is a measured reason.

---

# 12. Database Design

Use MongoDB for V1 because the developer already knows it and it is suitable for the event/run-oriented document model.

## Initial collections

```text
users
projects
repositories
github_installations
provider_credentials
agent_definitions
tasks
task_runs
agent_steps
tool_calls
test_runs
artifacts
approvals
pull_requests
events
evaluation_results
```

## Important design rule

Never make the UI state the source of truth.

MongoDB stores the authoritative task/run state.

Redis is for queue processing and short-lived coordination.

GitHub is the source of truth for GitHub-native entities such as Issues and PRs.

---

# 13. Realtime Updates

V1 can use Server-Sent Events (SSE) from the Express API.

```text
Worker
  |
  v
MongoDB/Event publisher
  |
  v
Express SSE endpoint
  |
  v
Next.js dashboard
```

Why SSE first:

- Simpler than WebSocket for server → browser progress streams.
- Perfect for task timelines.
- Easy to reconnect.
- Easy to reason about.

WebSockets can be introduced later if true bidirectional realtime interactions become necessary.

---

# 14. Observability

## V1

Use structured **Pino** logs.

Every log should carry correlation IDs:

```text
requestId
taskId
runId
agentStepId
repositoryId
```

Example:

```json
{
  "level": "info",
  "event": "tool.completed",
  "taskId": "task_142",
  "runId": "run_91",
  "tool": "run_tests",
  "durationMs": 3812
}
```

## V2+

Add OpenTelemetry traces:

```text
Task
 └── Task Run
      ├── LLM call
      ├── Tool call
      ├── Sandbox command
      ├── Test run
      └── GitHub API call
```

Track:

- Runtime.
- LLM latency.
- Tool latency.
- Test duration.
- Retries.
- Token usage where available.
- Estimated model cost.
- Task success rate.
- Human interventions.

Current TypeScript agent infrastructure increasingly exposes lifecycle callbacks and telemetry for exactly this reason.

---

# 15. Evaluation System

This is a first-class feature, not an optional analytics page.

## Evaluation objective

Answer:

> **Does the agent actually complete engineering tasks reliably?**

Create a controlled benchmark repository with seeded tasks.

Example tasks:

```text
TASK-001 Fix incorrect rounding
TASK-002 Add missing validation
TASK-003 Add endpoint
TASK-004 Fix TypeScript error
TASK-005 Fix failing test
TASK-006 Refactor function
TASK-007 Fix database query
TASK-008 Add regression test
TASK-009 Fix UI bug
TASK-010 Update API behavior
```

Run the same benchmark across models/providers.

Measure:

```text
success rate
verification rate
regression rate
average retries
average tool calls
average runtime
human intervention rate
estimated cost
```

Do not claim a model is “better” without benchmark evidence.

---

# 16. Security Model

The system is executing AI-generated actions, so security is a core product feature.

## Required controls

- GitHub App least-privilege permissions.
- Server-side provider secrets.
- Secret redaction in logs.
- Tool-level authorization.
- Sandbox isolation.
- Command allow/deny policy.
- Network policy.
- Resource limits.
- Approval gates.
- Audit log.
- Signed/verified GitHub webhook handling.
- Task ownership checks.
- Repository allowlist.

## Human approval policy

Default behavior:

```text
Read repository                AUTO
Search code                    AUTO
Run tests                      AUTO
Create branch                  AUTO
Edit files                     AUTO
Create PR                      AUTO / policy-based
Comment externally             APPROVAL OPTIONAL
Merge PR                       HUMAN
Production deploy              HUMAN
Delete production data        HUMAN
Change security credentials    HUMAN
```

The exact policy must be configurable.

---

# 17. Folder Structure

Use a monorepo with pnpm + Turborepo.

```text
code-backplane/
├── apps/
│   ├── web/                         # Next.js dashboard
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── hooks/
│   │   └── lib/
│   │
│   ├── api/                         # Express control API
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── auth/
│   │       │   ├── projects/
│   │       │   ├── repositories/
│   │       │   ├── tasks/
│   │       │   ├── github/
│   │       │   ├── providers/
│   │       │   └── approvals/
│   │       ├── routes/
│   │       ├── middlewares/
│   │       └── server.ts
│   │
│   └── worker/                      # background agent worker
│       └── src/
│           ├── jobs/
│           ├── agent/
│           ├── tools/
│           ├── policies/
│           ├── execution/
│           ├── git/
│           ├── providers/
│           └── worker.ts
│
├── packages/
│   ├── database/                    # MongoDB models/repositories
│   ├── domain/                      # shared domain types/state machine
│   ├── llm/                         # LLM provider interface + adapters
│   ├── github/                      # GitHub API client
│   ├── tools/                       # shared tool definitions/schemas
│   ├── config/                      # environment/config validation
│   ├── observability/               # logging/tracing utilities
│   └── shared/                      # common utilities/types
│
├── infra/
│   ├── docker/
│   ├── docker-compose.yml
│   └── caddy/
│
├── scripts/
│   ├── seed/
│   ├── benchmark/
│   └── dev/
│
├── docs/
│   ├── architecture/
│   ├── decisions/
│   ├── api/
│   └── benchmark/
│
├── .github/
│   └── workflows/
│
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .env.example
└── README.md
```

### Important structural rule

Do not prematurely create `services/agent`, `services/planner`, `services/reviewer`, etc. as independently deployed services. Initially these are modules within the worker. Split them into deployable services only after a measured need appears.

---

# 18. Technology Decisions

## Locked for V1

| Area | Choice |
|---|---|
| Language | TypeScript |
| Frontend | Next.js + React |
| UI | Tailwind CSS + shadcn/ui |
| Backend | Express.js + Node.js |
| Database | MongoDB |
| Queue | Redis + BullMQ |
| Agent runtime | Custom TypeScript implementation |
| Initial LLM gateway | OpenRouter |
| Initial model strategy | One fixed tool-capable model |
| GitHub integration | GitHub App + Webhooks |
| Git | Git CLI + worktrees |
| Sandbox | Docker |
| Testing | Vitest |
| Browser E2E | Playwright (later in V1/V2) |
| Realtime | SSE |
| Logging | Pino |
| Validation | Zod |
| Deployment | Docker Compose on one VPS |
| Reverse proxy | Caddy |
| Monorepo | pnpm + Turborepo |
| CI/CD | GitHub Actions |

## Intentionally NOT locked initially

- AI SDK / LangChain / LangGraph.
- MCP.
- Temporal.
- Kubernetes.
- Kafka/RabbitMQ.
- Microservices everywhere.
- Managed database.
- Managed workflow platform.

These can be evaluated later once the core system works and we understand the problems they solve.

---

# 19. Deployment Architecture

## First deployment: one VPS

```text
                         VPS
                          |
                    Docker Compose
                          |
        +-----------------+--------------------+
        |                 |                    |
        v                 v                    v
      Caddy           Next.js              Express API
        |                                      |
        |                                      +------ MongoDB
        |                                      +------ Redis
        |                                      |
        |                                      v
        |                                BullMQ Queue
        |                                      |
        |                                      v
        |                                Agent Worker
        |                                      |
        |                                Docker Sandbox
        |
        +------ HTTPS 443
```

## Deployment principles

- One VPS first.
- Docker Compose for reproducibility.
- Persistent volumes for MongoDB/Redis where appropriate.
- Daily database backup strategy before public use.
- SSH keys only; disable password SSH login where practical.
- Firewall only required ports.
- Caddy handles HTTPS.
- GitHub Actions builds/tests and deploys the application.
- Never expose MongoDB or Redis publicly.

## Scaling path

When one machine becomes a real bottleneck:

```text
                VPS 1
          Control Plane
          API + Web + DB
                |
              Redis
                |
      +---------+---------+
      |         |         |
      v         v         v
   Worker 1  Worker 2  Worker 3
      |         |         |
      v         v         v
   Sandbox   Sandbox   Sandbox
```

Only then consider separating workers, moving the database, or introducing a managed workflow engine.

---

# 20. Development Strategy

The project MUST be developed **vertically**, not layer-by-layer in isolation.

Bad approach:

```text
build entire frontend
then database
then backend
then agent
then GitHub
```

Good approach:

```text
One issue
  -> webhook
  -> task
  -> worker
  -> LLM
  -> tool
  -> change
  -> test
  -> PR
```

Once that vertical slice works, expand its reliability.

---

# 21. MASTER TODO

> **Execution rule for humans and coding agents:** Work from top to bottom. Do not jump ahead unless a later task is required to unblock the current task. Check a box only after the acceptance criteria for that item are actually satisfied. Do not mark work complete because code was generated; verify it.

---

## Phase 0 — Project Foundation

### Task 0.1 — Repository and monorepo

- [ ] Create the root repository.
  - [ ] Initialize Git.
  - [ ] Create `README.md`.
  - [ ] Create `.gitignore`.
  - [ ] Create `.env.example`.
  - [ ] Add Node.js version requirement.
- [ ] Initialize pnpm workspace.
  - [ ] Add `pnpm-workspace.yaml`.
  - [ ] Add root `package.json`.
- [ ] Initialize Turborepo.
  - [ ] Add `turbo.json`.
  - [ ] Add shared base TypeScript config.
- [ ] Create initial directories exactly as described in the folder structure.
- [ ] Add formatting/linting.
  - [ ] ESLint.
  - [ ] Prettier.
- [ ] Add root scripts.
  - [ ] `dev`.
  - [ ] `build`.
  - [ ] `test`.
  - [ ] `lint`.
  - [ ] `typecheck`.
- [ ] Verify clean install from a fresh clone.

**Acceptance:** `pnpm install`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` all work from a clean checkout.

---

### Task 0.2 — Local infrastructure

- [ ] Create `infra/docker-compose.yml`.
  - [ ] MongoDB container.
  - [ ] Redis container.
  - [ ] Caddy container placeholder.
- [ ] Add persistent volumes.
- [ ] Add internal Docker network.
- [ ] Confirm MongoDB is reachable only from the internal network.
- [ ] Confirm Redis is reachable only from the internal network.
- [ ] Add health checks.
- [ ] Document startup/shutdown commands.

**Acceptance:** `docker compose up -d` starts MongoDB and Redis and both pass health checks.

---

## Phase 1 — Web Dashboard Shell

### Task 1.1 — Next.js application

- [ ] Create `apps/web`.
- [ ] Configure TypeScript.
- [ ] Configure Tailwind.
- [ ] Install/configure shadcn/ui.
- [ ] Create application shell.
  - [ ] Sidebar.
  - [ ] Header.
  - [ ] Main content area.
- [ ] Add pages.
  - [ ] `/dashboard`.
  - [ ] `/projects`.
  - [ ] `/tasks`.
  - [ ] `/settings/providers`.
- [ ] Build placeholder task board.
  - [ ] Queued.
  - [ ] Planning.
  - [ ] Development.
  - [ ] Testing.
  - [ ] Review.
  - [ ] Completed.

**Acceptance:** Dashboard runs locally and displays the complete task lifecycle UI using mock data.

---

### Task 1.2 — Domain types

- [ ] Create shared task status enum.
- [ ] Create task/run/step/tool/provider types.
- [ ] Create state transition rules.
- [ ] Reject illegal transitions.
- [ ] Add unit tests for transition rules.

**Acceptance:** Every legal task transition is tested, and illegal transitions are rejected.

---

## Phase 2 — Database Layer

### Task 2.1 — MongoDB connection

- [ ] Create `packages/database`.
- [ ] Add MongoDB client.
- [ ] Validate `MONGODB_URI` with Zod.
- [ ] Add connection lifecycle.
- [ ] Add health check.

**Acceptance:** API and worker can connect to MongoDB and fail with a clear configuration error when the database is unavailable.

### Task 2.2 — Core collections/models

- [ ] Implement `projects`.
- [ ] Implement `repositories`.
- [ ] Implement `tasks`.
- [ ] Implement `task_runs`.
- [ ] Implement `agent_steps`.
- [ ] Implement `tool_calls`.
- [ ] Implement `test_runs`.
- [ ] Implement `artifacts`.
- [ ] Implement `approvals`.
- [ ] Implement `pull_requests`.
- [ ] Implement `events`.
- [ ] Add indexes for:
  - [ ] task status.
  - [ ] repository + task state.
  - [ ] task + run.
  - [ ] task + chronological events.

**Acceptance:** CRUD/repository tests cover each core entity and indexes are documented.

---

## Phase 3 — Control API

### Task 3.1 — Express application

- [ ] Create `apps/api`.
- [ ] Add Express.
- [ ] Add config loading.
- [ ] Add request ID/correlation ID.
- [ ] Add Pino logging.
- [ ] Add `/health` endpoint.
- [ ] Add global error handling.
- [ ] Add graceful shutdown.

**Acceptance:** API starts, reports health, logs requests, and shuts down cleanly.

### Task 3.2 — Task API

- [ ] `POST /projects`.
- [ ] `GET /projects`.
- [ ] `POST /projects/:projectId/tasks`.
- [ ] `GET /tasks`.
- [ ] `GET /tasks/:taskId`.
- [ ] `POST /tasks/:taskId/cancel`.
- [ ] `POST /tasks/:taskId/retry`.
- [ ] Validate all input with Zod.
- [ ] Persist task events.

**Acceptance:** A task can be created, queried, cancelled, and retried entirely through the API.

---

## Phase 4 — Queue + Worker

### Task 4.1 — Redis/BullMQ

- [ ] Add BullMQ.
- [ ] Configure Redis connection.
- [ ] Create `engineering-task` queue.
- [ ] Define job payload schema.
- [ ] Add job ID = task/run correlation.
- [ ] Add retry policy.
- [ ] Add exponential backoff.
- [ ] Add concurrency configuration.
- [ ] Add failed-job handling.

**Acceptance:** API can enqueue a task and a worker can consume it exactly once per job execution attempt.

### Task 4.2 — Worker service

- [ ] Create `apps/worker`.
- [ ] Add worker process.
- [ ] Add graceful shutdown.
- [ ] Add job lifecycle logging.
- [ ] Persist `TaskRun`.
- [ ] Persist start/end/failure events.

**Acceptance:** Creating a task in the API produces a background worker run without keeping an HTTP request open.

---

## Phase 5 — LLM Provider Layer

### Task 5.1 — Generic provider contract

- [ ] Create `packages/llm`.
- [ ] Define `LLMProvider`.
- [ ] Define `LLMRequest`.
- [ ] Define `LLMResponse`.
- [ ] Define tool-call representation.
- [ ] Define model capabilities.
- [ ] Define normalized provider errors.
- [ ] Add provider factory.

**Acceptance:** Agent code depends only on the internal provider contract.

### Task 5.2 — OpenRouter provider

- [ ] Add OpenRouter configuration.
- [ ] Add API key configuration.
- [ ] Add model configuration.
- [ ] Implement text generation.
- [ ] Implement tool-call parsing.
- [ ] Normalize provider errors.
- [ ] Add request timeout.
- [ ] Add basic usage metadata.

**Acceptance:** A standalone test script can send a prompt with one tool definition to a fixed OpenRouter model and receive a valid normalized tool call.

### Task 5.3 — Direct-provider compatibility

- [ ] Define generic OpenAI-compatible endpoint config.
- [ ] Add support for custom base URL.
- [ ] Test against a second compatible endpoint.
- [ ] Document provider configuration.

**Acceptance:** The same agent code can call two different API endpoints without changing the agent loop.

---

## Phase 6 — Agent Runtime

### Task 6.1 — Context builder

- [ ] Build task context.
- [ ] Build repository metadata context.
- [ ] Build current branch/worktree context.
- [ ] Build conversation/tool history.
- [ ] Enforce context size limits.

### Task 6.2 — Agent loop

- [ ] Implement initial system instructions.
- [ ] Send task to LLM.
- [ ] Detect tool calls.
- [ ] Validate tool calls.
- [ ] Execute tools.
- [ ] Append tool results.
- [ ] Repeat.
- [ ] Detect final answer.
- [ ] Persist every step.
- [ ] Add max-step guard.
- [ ] Add max-runtime guard.
- [ ] Add cancellation support.

### Task 6.3 — Agent failure recovery

- [ ] Retry transient LLM errors.
- [ ] Retry transient tool errors.
- [ ] Stop on repeated identical failures.
- [ ] Persist failure reason.
- [ ] Mark run as `FAILED` or `BLOCKED`.
- [ ] Implement safe resume point.

**Acceptance for Phase 6:** A scripted agent can complete a multi-step tool-calling task and the full sequence is visible in persisted `agent_steps` and `tool_calls` records.

---

## Phase 7 — First Tool Registry

### Task 7.1 — Tool framework

- [ ] Create typed tool definition structure.
- [ ] Add Zod input schemas.
- [ ] Add permission class.
- [ ] Add timeout.
- [ ] Add audit metadata.
- [ ] Create registry lookup.
- [ ] Add unknown-tool rejection.

### Task 7.2 — Repository tools

- [ ] `list_files`.
- [ ] `search_code`.
- [ ] `read_file`.
- [ ] `write_file`.
- [ ] `git_status`.
- [ ] `git_diff`.

### Task 7.3 — Execution tools

- [ ] `run_command`.
- [ ] `run_tests`.
- [ ] Capture stdout/stderr.
- [ ] Capture exit code.
- [ ] Capture duration.
- [ ] Enforce timeout.

**Acceptance:** The agent can inspect a repository, modify one file, and run a test command through the typed tool system.

---

## Phase 8 — Git Workspace Management

### Task 8.1 — Repository preparation

- [ ] Clone repository into controlled workspace.
- [ ] Validate repository URL.
- [ ] Validate default branch.
- [ ] Fetch latest refs.

### Task 8.2 — Worktree management

- [ ] Create unique branch.
- [ ] Create unique worktree.
- [ ] Record branch/worktree path.
- [ ] Remove worktree after terminal state.
- [ ] Handle cleanup after worker crash.

### Task 8.3 — Commit flow

- [ ] Inspect diff.
- [ ] Require clean/expected repository state.
- [ ] Commit changes.
- [ ] Capture commit SHA.
- [ ] Push branch.

**Acceptance:** One task can receive a repository, create an isolated branch/worktree, modify code, commit, and push without touching `main`.

---

## Phase 9 — GitHub App + Automatic Issue Intake

### Task 9.1 — GitHub App setup

- [ ] Create development GitHub App.
- [ ] Configure App permissions.
- [ ] Configure webhook secret.
- [ ] Enable issue events.
- [ ] Store App credentials securely.

### Task 9.2 — Webhook endpoint

- [ ] Implement webhook route.
- [ ] Verify signature.
- [ ] Parse issue event.
- [ ] Reject invalid payloads.
- [ ] Persist raw event metadata.
- [ ] Make webhook processing idempotent.

### Task 9.3 — Issue-to-task conversion

- [ ] Detect eligible labels/trigger.
- [ ] Map GitHub issue → internal task.
- [ ] Prevent duplicate tasks.
- [ ] Enqueue task.
- [ ] Comment/status update on GitHub where configured.

**Acceptance:** Creating/marking an eligible GitHub issue automatically creates exactly one internal task and puts it into the queue.

---

## Phase 10 — End-to-End MVP: Issue → PR

### Task 10.1 — Build the vertical slice

- [ ] Receive GitHub issue.
- [ ] Persist task.
- [ ] Queue task.
- [ ] Start worker.
- [ ] Clone repository.
- [ ] Create worktree.
- [ ] Run agent.
- [ ] Search/read files.
- [ ] Modify file.
- [ ] Run tests.
- [ ] Commit changes.
- [ ] Push branch.
- [ ] Create GitHub PR.
- [ ] Persist PR metadata.

### Task 10.2 — First controlled demo

Create a deliberately simple test repository and issue:

> Fix a known bug and add a regression test.

- [ ] Run task end-to-end.
- [ ] Verify generated diff.
- [ ] Verify tests pass.
- [ ] Verify PR exists.
- [ ] Verify task ends in `PR_READY`.

**Acceptance:** A real GitHub issue can flow through the system without a developer manually operating the agent terminal during execution.

---

## Phase 11 — Dashboard Connected to Reality

### Task 11.1 — API-backed task board

- [ ] Replace mock tasks with API data.
- [ ] Add loading states.
- [ ] Add error states.
- [ ] Add pagination where required.
- [ ] Add task filters.

### Task 11.2 — Live timeline

- [ ] Implement SSE endpoint.
- [ ] Stream task events.
- [ ] Reconnect automatically.
- [ ] Update task state immediately.
- [ ] Render agent steps.
- [ ] Render tool calls.
- [ ] Render test results.

### Task 11.3 — Task detail

- [ ] Show GitHub issue.
- [ ] Show current stage.
- [ ] Show progress timeline.
- [ ] Show branch.
- [ ] Show changed files.
- [ ] Show latest test result.
- [ ] Show PR link.

**Acceptance:** A user can open the dashboard, start a GitHub issue, close the browser, return later, and see the persisted/updated state.

---

## Phase 12 — Reliability / Durable Workflow

### Task 12.1 — Persistent state machine

- [ ] Make every transition transactional/idempotent where needed.
- [ ] Persist current stage.
- [ ] Persist attempt number.
- [ ] Persist last successful step.
- [ ] Persist current worker lease/heartbeat.

### Task 12.2 — Crash recovery

- [ ] Kill worker during planning.
- [ ] Confirm task is not lost.
- [ ] Restart worker.
- [ ] Resume/retry safely.
- [ ] Kill worker during tests.
- [ ] Confirm no duplicate commit/PR is produced.

### Task 12.3 — Idempotency

- [ ] Duplicate webhook does not create duplicate task.
- [ ] Replayed queue job does not create duplicate branch.
- [ ] Replayed PR creation is detected.
- [ ] Tool side effects have idempotency keys where possible.

**Acceptance:** Worker restarts and duplicate delivery do not corrupt task state or produce duplicate external side effects.

---

## Phase 13 — Sandbox Execution

### Task 13.1 — Docker sandbox runner

- [ ] Create task container.
- [ ] Mount only task workspace.
- [ ] Set CPU limit.
- [ ] Set memory limit.
- [ ] Set timeout.
- [ ] Capture stdout/stderr.
- [ ] Capture exit status.

### Task 13.2 — Security restrictions

- [ ] Disable privileged mode.
- [ ] Deny host Docker socket.
- [ ] Restrict network access by default.
- [ ] Define environment-variable allowlist.
- [ ] Prevent host filesystem access.
- [ ] Add cleanup on success/failure/crash.

### Task 13.3 — Integration

- [ ] Route `run_command` through sandbox.
- [ ] Route `run_tests` through sandbox.
- [ ] Persist command/test artifacts.
- [ ] Destroy container after terminal state.

**Acceptance:** Agent code execution happens inside an isolated disposable container and the host is not used as the task workspace.

---

## Phase 14 — Agent Roles / Orchestration

Do NOT create separate deployed services yet. Implement role policies inside the worker first.

### Task 14.1 — Planner role

- [ ] Define planner instructions.
- [ ] Planner is read-only.
- [ ] Planner produces structured implementation plan.
- [ ] Persist plan artifact.

### Task 14.2 — Developer role

- [ ] Receives approved plan.
- [ ] Has write/test tools.
- [ ] Works in isolated worktree.
- [ ] Produces implementation.

### Task 14.3 — Reviewer role

- [ ] Read final diff.
- [ ] Check task requirements.
- [ ] Identify suspicious changes.
- [ ] Produce structured review.

### Task 14.4 — Repair loop

- [ ] Reviewer can request changes.
- [ ] Developer receives only actionable review findings.
- [ ] Retry limit enforced.
- [ ] State is preserved between attempts.

**Acceptance:** One task can pass through Planner → Developer → Reviewer without collapsing all behavior into one giant prompt.

---

## Phase 15 — Testing & Verification

### Task 15.1 — Unit tests

- [ ] Agent state machine tests.
- [ ] Provider adapter tests.
- [ ] Tool validation tests.
- [ ] Permission tests.
- [ ] Git helper tests.
- [ ] Queue/job tests.

### Task 15.2 — Integration tests

- [ ] API ↔ MongoDB.
- [ ] API ↔ Redis.
- [ ] Worker ↔ Redis.
- [ ] Worker ↔ LLM mock.
- [ ] Worker ↔ Git sandbox.

### Task 15.3 — End-to-end tests

- [ ] GitHub webhook simulation.
- [ ] Issue intake.
- [ ] Task creation.
- [ ] Queue execution.
- [ ] Sandbox.
- [ ] Test result.
- [ ] PR generation.

### Task 15.4 — Browser verification

- [ ] Add Playwright.
- [ ] Launch application preview.
- [ ] Run browser smoke tests.
- [ ] Capture screenshots on failure.
- [ ] Persist browser artifacts.

**Acceptance:** An agent cannot mark a task complete unless the configured verification gates pass.

---

## Phase 16 — Human Approval & Policies

### Task 16.1 — Approval engine

- [ ] Define approval-required actions.
- [ ] Create approval records.
- [ ] Add dashboard approval UI.
- [ ] Pause workflow awaiting approval.
- [ ] Resume after approval/rejection.

### Task 16.2 — Permissions

- [ ] Define global policy.
- [ ] Define repository policy.
- [ ] Define task-level restrictions.
- [ ] Enforce tool authorization.
- [ ] Audit every denied action.

**Acceptance:** A high-risk action pauses execution and cannot continue until a human approves it.

---

## Phase 17 — Provider Expansion

### Task 17.1 — Gemini

- [ ] Add direct Gemini adapter.
- [ ] Test same task against Gemini.
- [ ] Normalize tool calls.
- [ ] Normalize errors.

### Task 17.2 — OpenAI

- [ ] Add OpenAI adapter.
- [ ] Test same benchmark.

### Task 17.3 — Anthropic

- [ ] Add Anthropic adapter.
- [ ] Test same benchmark.

### Task 17.4 — Provider settings

- [ ] Provider list UI.
- [ ] API key entry.
- [ ] Model selection.
- [ ] Connection test.
- [ ] Default provider.
- [ ] Per-task provider override.

**Acceptance:** The agent runtime can switch between at least three providers without changes to task/tool/orchestration code.

---

## Phase 18 — MCP

### Task 18.1 — MCP client

- [ ] Add MCP client implementation/library.
- [ ] Connect to one local MCP server.
- [ ] Discover tools.
- [ ] Normalize tool schemas into internal registry.

### Task 18.2 — BuildPilot MCP server

- [ ] Expose task status.
- [ ] Expose task logs.
- [ ] Expose project context.
- [ ] Expose selected safe tools.

### Task 18.3 — External MCP integration

- [ ] Connect one external MCP server.
- [ ] Apply permission policy.
- [ ] Persist MCP tool calls.
- [ ] Handle server unavailable state.

**Acceptance:** An agent can use at least one MCP-provided tool through the same permission/audit infrastructure as native tools.

---

## Phase 19 — Observability

### Task 19.1 — Structured logging

- [ ] Standardize event names.
- [ ] Add correlation IDs.
- [ ] Add task/run/step IDs.
- [ ] Redact secrets.

### Task 19.2 — OpenTelemetry

- [ ] Add tracing SDK.
- [ ] Trace API request.
- [ ] Trace queue job.
- [ ] Trace LLM call.
- [ ] Trace tool call.
- [ ] Trace sandbox execution.
- [ ] Trace GitHub API call.

### Task 19.3 — Metrics

- [ ] Task success rate.
- [ ] Task duration.
- [ ] Retry count.
- [ ] Failure reasons.
- [ ] LLM usage.
- [ ] Estimated cost.
- [ ] Human intervention.

**Acceptance:** A failed task can be traced from dashboard task ID to worker run to LLM/tool/test failure without guessing.

---

## Phase 20 — Evaluation Harness

### Task 20.1 — Benchmark repository

- [ ] Create benchmark repository.
- [ ] Add 20 controlled tasks.
- [ ] Add acceptance tests.
- [ ] Add seeded bugs.
- [ ] Document expected outcomes.

### Task 20.2 — Automated benchmark runner

- [ ] Run task set automatically.
- [ ] Record model/provider.
- [ ] Record success/failure.
- [ ] Record verification result.
- [ ] Record retries.
- [ ] Record runtime.
- [ ] Record cost.

### Task 20.3 — Evaluation dashboard

- [ ] Overall success rate.
- [ ] By task type.
- [ ] By provider/model.
- [ ] Failure categories.
- [ ] Trend over time.

**Acceptance:** You can run the same benchmark on two providers/models and produce a reproducible comparison report.

---

## Phase 21 — Production Hardening

### Task 21.1 — Authentication

- [ ] Add user authentication.
- [ ] Add session management.
- [ ] Protect dashboard routes.
- [ ] Protect API routes.

### Task 21.2 — Secrets

- [ ] Server-side secret storage.
- [ ] Encryption at rest for user-provided provider keys.
- [ ] Secret redaction.
- [ ] Rotation path.

### Task 21.3 — VPS security

- [ ] Configure SSH keys.
- [ ] Firewall.
- [ ] Automatic security updates.
- [ ] Non-root runtime where practical.
- [ ] No public MongoDB/Redis ports.
- [ ] HTTPS.

### Task 21.4 — Backups

- [ ] MongoDB backup job.
- [ ] Verify backup restore.
- [ ] Document recovery procedure.

### Task 21.5 — CI/CD

- [ ] GitHub Actions lint.
- [ ] GitHub Actions typecheck.
- [ ] GitHub Actions tests.
- [ ] GitHub Actions build.
- [ ] Deploy to VPS.
- [ ] Health check after deploy.
- [ ] Rollback strategy.

**Acceptance:** A clean GitHub commit can be tested and deployed automatically, and the system can recover from the most common operational failures.

---

## Phase 22 — Scale Experiment

Only start after the single-VPS version is reliable.

### Task 22.1 — Parallel tasks

- [ ] Run 2 tasks simultaneously.
- [ ] Verify isolated worktrees.
- [ ] Verify isolated sandboxes.
- [ ] Verify independent task state.
- [ ] Measure CPU/memory.

### Task 22.2 — Worker scaling

- [ ] Run 2 worker replicas.
- [ ] Confirm Redis distributes jobs.
- [ ] Confirm duplicate processing is prevented.
- [ ] Test worker crash/restart.

### Task 22.3 — Bottleneck analysis

- [ ] Measure DB load.
- [ ] Measure Redis load.
- [ ] Measure sandbox startup time.
- [ ] Measure LLM latency.
- [ ] Measure GitHub API rate limits.

**Acceptance:** You have measured evidence for what needs scaling before introducing additional infrastructure.

---

# 23. Definition of Done for the Whole Project

BuildPilot can be considered a strong portfolio project only when all of the following are true:

- [ ] A GitHub issue can automatically become an internal task.
- [ ] The task survives closing the browser.
- [ ] Background work is processed asynchronously.
- [ ] The task lifecycle is persisted.
- [ ] An agent can inspect and modify a real repository.
- [ ] Code execution occurs in an isolated sandbox.
- [ ] Tests are executed automatically.
- [ ] Failed tests can trigger a bounded repair loop.
- [ ] Changes are committed to an isolated branch.
- [ ] A PR can be created automatically.
- [ ] Human approval exists for configured high-risk actions.
- [ ] The dashboard shows live task progress.
- [ ] Every significant agent/tool action is auditable.
- [ ] At least three LLM providers can use the same runtime.
- [ ] MCP can be used for at least one integration.
- [ ] Observability provides enough evidence to debug a failed run.
- [ ] A benchmark measures agent reliability.
- [ ] The project is deployed on a VPS using Docker.
- [ ] The system has CI/CD and basic backup/recovery.

---

# 24. What We Should NOT Add Without a Clear Reason

Do not add technology because it is fashionable.

Avoid premature use of:

- Kubernetes.
- Kafka.
- Temporal.
- RabbitMQ.
- GraphQL.
- LangChain/LangGraph.
- Vector database.
- RAG pipeline.
- Multi-region infrastructure.
- 10 different agent frameworks.

Every new dependency should answer:

1. What concrete problem does it solve?
2. Why cannot the current architecture solve that problem?
3. What new operational complexity does it introduce?
4. Does it improve learning value or product reliability?

---

# 25. The First 48 Hours

The first target is **not** the final architecture.

The first target is the first believable autonomous engineering run.

## Day 1 — Make the agent work

### Morning

- [ ] Create monorepo.
- [ ] Create Next.js shell.
- [ ] Create Express API.
- [ ] Start MongoDB + Redis with Docker Compose.
- [ ] Create task collection.
- [ ] Create basic task API.

### Afternoon

- [ ] Create BullMQ queue.
- [ ] Create worker.
- [ ] Build `LLMProvider` interface.
- [ ] Build OpenRouter adapter.
- [ ] Verify one free/tool-capable model works.
- [ ] Implement basic agent loop.

### Evening

- [ ] Implement `list_files`.
- [ ] Implement `search_code`.
- [ ] Implement `read_file`.
- [ ] Implement `write_file`.
- [ ] Implement `run_tests` in a simple local test workspace.
- [ ] Run an agent against a tiny test repository.

## Day 2 — Make the vertical slice real

### Morning

- [ ] Add Git worktree creation.
- [ ] Let the agent modify a branch.
- [ ] Run tests.
- [ ] Commit changes.
- [ ] Push branch.

### Afternoon

- [ ] Create GitHub App.
- [ ] Add issue webhook.
- [ ] Convert GitHub issue → internal task.
- [ ] Queue automatically.
- [ ] Create PR automatically.

### Evening

- [ ] Connect dashboard to real tasks.
- [ ] Display current state.
- [ ] Display agent activity.
- [ ] Test browser closure while task is running.
- [ ] Reopen dashboard and verify persisted progress.
- [ ] Record a demo run.

### 48-hour definition of success

```text
GitHub Issue
    ↓
Webhook
    ↓
Task
    ↓
Queue
    ↓
Agent
    ↓
Tools
    ↓
Code change
    ↓
Tests
    ↓
Commit
    ↓
Pull Request
```

**Do not move into advanced architecture until this works.**

---

# 26. Suggested First Test Repository

Create a small repository specifically for BuildPilot testing.

Example:

```text
code-backplane-playground/
├── src/
│   ├── calculator.ts
│   ├── users.ts
│   └── notifications.ts
├── tests/
│   ├── calculator.test.ts
│   └── users.test.ts
├── package.json
└── README.md
```

Seed a known bug:

```ts
export function applyDiscount(price: number, percentage: number) {
  return price - percentage;
}
```

Expected behavior:

```text
100 with 20% discount -> 80
```

The task:

> Fix `applyDiscount`, add regression coverage, and do not change unrelated files.

The system should demonstrate:

```text
Issue
  ↓
Plan
  ↓
Search
  ↓
Read
  ↓
Edit
  ↓
Test
  ↓
Observe failure if introduced
  ↓
Repair
  ↓
Test again
  ↓
Commit
  ↓
PR
```

This deliberately small task lets us debug the orchestration system without being distracted by a large production repository.

---

# 27. Future Expansion Roadmap

After the core system is reliable, the following are potential expansion tracks.

## Track A — Advanced agent orchestration

- Parallel sub-agents.
- Agent handoffs.
- Specialist roles.
- Planning vs execution separation.
- Agent capability registry.
- Task dependency graph.

## Track B — Browser/computer verification

- Playwright browser worker.
- Automatic reproduction of web bugs.
- Screenshot/video evidence.
- Console/network inspection.
- Browser-based acceptance tests.

## Track C — Model routing

- Cost-aware routing.
- Capability-aware routing.
- Provider fallback.
- Model benchmarking.
- Task-type classification.

## Track D — Engineering memory

- Repository architecture summaries.
- Past task knowledge.
- Important decisions.
- Previous failure patterns.
- Project-specific agent instructions.

## Track E — Enterprise controls

- RBAC.
- Policy engine.
- Approval workflows.
- Audit exports.
- Organization-level provider policies.
- Secret rotation.

## Track F — Scale

- Worker pools.
- Remote sandbox workers.
- Dedicated execution nodes.
- Multi-VPS deployment.
- Workload scheduling.

---

# 28. What This Project Teaches

Completing BuildPilot should give practical experience in:

### Backend engineering

- API design.
- Authentication.
- Webhooks.
- Background processing.
- Queues.
- State machines.
- Idempotency.
- Retries.
- Distributed coordination.
- Persistence.

### AI engineering

- LLM APIs.
- Tool calling.
- Agent loops.
- Context management.
- Provider abstraction.
- Multi-model routing.
- Agent evaluation.
- Human-in-the-loop workflows.

### Systems engineering

- Docker.
- Linux.
- Networking.
- Process management.
- Resource limits.
- Isolation.
- Failure recovery.
- Observability.

### Developer infrastructure

- Git automation.
- Worktrees.
- GitHub Apps.
- CI/CD.
- Automated testing.
- Pull-request workflows.

### Security

- Least privilege.
- Secret handling.
- Sandboxing.
- Tool permissions.
- Auditability.
- Approval gates.

The goal is not to collect technologies. The goal is to understand how all of these concerns interact in a single autonomous engineering system.

---

# 29. Interview-Level Explanation

When asked **“What did you build?”**, the final explanation should be close to:

> I built a self-hosted AI engineering control plane that turns GitHub issues into autonomous engineering workflows. A GitHub webhook creates a durable task, which is queued and executed by an agent worker in an isolated Git worktree and sandbox. The agent uses a provider-agnostic LLM interface and typed tools to inspect and modify the repository, run tests, recover from bounded failures, and produce a pull request. The dashboard tracks the workflow independently of the browser, so long-running tasks continue in the background. I also added permission gates, observability, provider switching, and an evaluation harness so I could measure reliability instead of treating model output as automatically correct.

The key distinction from a coding assistant is that BuildPilot is **not the coding model**. It is the control plane that manages autonomous engineering work around coding agents.

OpenAI's Symphony project provides a current industry example of the same broader architectural direction: using a task tracker as a control plane from which coding agents pull work, rather than forcing developers to micromanage individual coding sessions.

---

# 30. Repository Working Rules for AI Coding Tools

Any coding agent working from this README must follow these rules:

1. **Read this README fully before modifying architecture.**
2. **Find the first unchecked task in the MASTER TODO that is not blocked.**
3. **Implement only the smallest scope required for that task.**
4. **Do not skip acceptance criteria.**
5. **Do not silently introduce a new framework or infrastructure service.**
6. **Update tests alongside implementation.**
7. **Run the relevant tests before checking a box.**
8. **Never mark a task complete if it is only partially implemented.**
9. **Preserve existing interfaces unless the task explicitly changes them.**
10. **When a decision materially changes the architecture, add an Architecture Decision Record under `docs/decisions/`.**
11. **Prefer simple modules inside a service before creating another deployed service.**
12. **Use environment variables for secrets. Never hard-code credentials.**
13. **Never expose MongoDB or Redis publicly.**
14. **Never execute agent-generated repository commands directly on the host once sandbox execution is available.**
15. **Do not use a model's “done” response as verification. Run the configured checks.**
16. **When a task is blocked, record the blocker explicitly instead of faking completion.**

## Required task completion format

When a coding agent finishes a TODO item, it should report:

```text
Task:
<task number and title>

Implemented:
- ...

Files changed:
- ...

Tests run:
- ...

Result:
PASS / FAIL

Remaining work:
- ...

Next TODO:
<next unchecked task>
```

---

# 31. Current Status

**Project status: Architecture + implementation plan defined.**

The repository itself does not yet count as complete merely because this README exists.

### Current next action

- [ ] **START PHASE 0 — TASK 0.1: Repository and monorepo foundation.**

Do not begin with MCP, multiple agents, browser QA, provider routing, or advanced sandboxing.

The first objective is to establish the repository and then build the smallest end-to-end vertical slice.

---

# 32. License

TBD during implementation.

---

# 33. References

These references justify the architectural direction used by this README. They are not runtime dependencies.

- OpenAI — Symphony: https://openai.com/index/open-source-codex-orchestration-symphony/
- Vercel — AI SDK 7: https://vercel.com/blog/ai-sdk-7
- GitHub Docs — Webhooks: https://docs.github.com/en/webhooks/about-webhooks
- GitHub Docs — Building a GitHub App that responds to webhook events: https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-a-github-app-that-responds-to-webhook-events
- OpenRouter — Tool-calling models: https://openrouter.ai/collections/tool-calling-models
- OpenRouter — Free Models Router: https://openrouter.ai/openrouter/free/

The project architecture should be revisited against current provider/runtime capabilities before any major production-scale redesign.
