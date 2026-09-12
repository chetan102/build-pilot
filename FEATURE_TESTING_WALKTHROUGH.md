# 🚀 BuildPilot — Hands-On Feature Testing Walkthrough

> **Welcome to BuildPilot!**  
> This guide is designed for **first-time users**. You do not need any prior knowledge of the codebase.  
> Follow this step-by-step test journey to see and test **every single live feature** in the platform, from clicking in the UI to running automated agents and inspecting real-time telemetry.

---

## 📋 What is BuildPilot? (In 2 Sentences)
**BuildPilot** is an autonomous AI software engineer platform. It receives GitHub issues, plans the fix with read-only tools, edits code in isolated Git worktrees, verifies the changes by running real test suites inside Docker sandboxes, and automatically creates GitHub Pull Requests.

---

## 🏁 Step 0: Start the Entire System (1 Minute)

### 1. Start the Database & Queue Containers
Open your terminal in the `build-pilot` folder:
```bash
docker compose -f infra/docker-compose.yml up -d
```
*(This starts MongoDB 7 on port 27017 and Redis 7 on port 6379).*

### 2. Start All Services
```bash
pnpm run dev
```
*(This runs the **Next.js Web Dashboard** on `http://localhost:3000`, the **Express Control API** on `http://localhost:4000`, and the **BullMQ Background Agent Worker** simultaneously).*

---

## 🧪 Interactive Feature Tests (Test Them One by One)

---

### 🌟 Feature 1: System Readiness & API Health Check

**What it tests:** Verifies that the API server, MongoDB connection pool, and Redis queue engine are healthy with sub-millisecond latencies.

**How to test:**
1. Open a new terminal tab.
2. Run:
```bash
curl -s http://localhost:4000/ready | jq .
```
**Expected Output:**
```json
{
  "status": "ready",
  "database": { "status": "healthy", "latencyMs": 1 },
  "redis": { "status": "healthy", "latencyMs": 1 }
}
```
✅ **What you just verified:** The Express control plane is live, connected to MongoDB, and connected to the Redis queue.

---

### 🌟 Feature 2: The Control Plane Web Dashboard

**What it tests:** The Next.js 14 real-time dashboard UI.

**How to test:**
1. Open your browser and go to: **[http://localhost:3000](http://localhost:3000)**.
2. Observe the main overview:
   - **Active Tasks & Queue Metrics**.
   - **Total Completed Pull Requests count**.
   - **Token Consumption & API Cost estimates**.
3. Use the left navigation sidebar to explore `/dashboard`, `/projects`, `/tasks`, and `/settings/providers`.

✅ **What you just verified:** The frontend web dashboard is rendered and responsive.

---

### 🌟 Feature 3: GitHub Integration & 1-Click Repository Importer

**What it tests:** Connecting your GitHub account, browsing your GitHub repositories live, and importing them into BuildPilot with one click.

**How to test:**
1. In your browser, navigate to: **[http://localhost:3000/projects](http://localhost:3000/projects)**.
2. You will see the **"Select & Import GitHub Repositories"** section.
3. If connected via your token in `.env`, your GitHub username (`@your-username`), avatar, and repositories will load automatically!
4. Try the **Search Box**: Type the name of any of your repositories to filter in real time.
5. Click **"Import Repo"** on any repository:
   - BuildPilot registers the repository as an active Project in MongoDB.
   - It marks the repository with a green **"Imported"** badge.

*(Alternative Token Connect)*: If you want to connect another account, click the **Token** button at the top right, paste a GitHub Personal Access Token (`ghp_...`), and click **Save & Connect**.

✅ **What you just verified:** Full GitHub account connection, live repository listing, search filtering, and one-click database project importing.

---

### 🌟 Feature 4: Launching an Autonomous AI Engineering Task (Live Execution!)

**What it tests:** Dispatching a real task to the background worker, streaming live thoughts via Server-Sent Events (SSE), and executing the Multi-Agent loop (Planner $\rightarrow$ Developer $\rightarrow$ Reviewer).

**How to test via Web UI:**
1. On **[http://localhost:3000/projects](http://localhost:3000/projects)**, find your imported project.
2. Click **"Start AI Task"** (or click **"Run Task"** on any imported repository).
3. A modal will pop up. Enter:
   - **Task Title**: `Fix database connection timeout in pool manager`
   - **Description**: `Increase default connection timeout from 5s to 15s and add retry logic.`
4. Click **"Dispatch Agent Task"**.
5. The dashboard will automatically take you to the live Task Detail Page: `http://localhost:3000/tasks/<taskId>`.

**What to observe on the screen:**
- **Live Timeline**: Watch the stage transition from `QUEUED` $\rightarrow$ `PLANNING` $\rightarrow$ `CODING` $\rightarrow$ `TESTING` $\rightarrow$ `COMPLETED`.
- **Live Agent Thoughts**: The model explains its reasoning and plan step-by-step.
- **Terminal 2 (Worker Logs)**: In your terminal running `pnpm run dev`, see the worker process the job with correlation IDs and execute tools.

*(Alternative Test via cURL)*:
```bash
curl -s -X POST http://localhost:4000/api/v1/projects/backend-service/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "repositoryId": "repo_demo",
    "title": "Add rate limiting middleware",
    "description": "Protect public endpoints against burst requests"
  }' | jq .
```

✅ **What you just verified:** Full autonomous task dispatch, Redis BullMQ queue consumption, multi-agent execution, and real-time Server-Sent Events streaming to the browser without page reloads.

---

### 🌟 Feature 5: Real-Time Kanban Board & Live Task Filtering

**What it tests:** Real-time state synchronization across tasks in the Kanban board.

**How to test:**
1. Open **[http://localhost:3000/tasks](http://localhost:3000/tasks)** in your browser.
2. Observe tasks organized across the finite state columns:
   - `QUEUED`
   - `IN PROGRESS (Planning / Coding / Testing)`
   - `AWAITING APPROVAL`
   - `COMPLETED`
3. Test the filters:
   - Filter by status dropdown.
   - Search tasks by keyword in the search bar.
   - Switch between **Kanban View** and **Table View**.

✅ **What you just verified:** 15-state Finite State Machine task tracking, query filters, and live board updates.

---

### 🌟 Feature 6: Human-in-the-Loop Approval & High-Risk Tool Gating

**What it tests:** Safety controls where destructive or high-risk actions (e.g. production deploy, database drop, PR merge) pause the workflow in `AWAITING_APPROVAL` until a human clicks Approve.

**How to test:**
1. When an agent attempts a `HIGH_RISK` tool, the task state pauses in `AWAITING_APPROVAL`.
2. Open the task in the web UI. An **Approval Action Card** will appear with:
   - The requested action name and details.
   - **Approve** and **Reject** buttons.
3. Test approving via the API:
```bash
curl -s -X POST http://localhost:4000/api/v1/tasks/<TASK_ID>/approvals/<APPROVAL_ID>/decide \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "APPROVED",
    "userId": "lead_developer",
    "notes": "Verified diff and approved action"
  }' | jq .
```
4. The worker automatically wakes up from suspension, executes the tool, and completes the run.

✅ **What you just verified:** High-risk permission gating, task suspension, and tamper-evident audit trail.

---

### 🌟 Feature 7: Multi-Provider LLM Switching & Connection Testing

**What it tests:** Changing LLM providers (OpenRouter, Google Gemini, Anthropic Claude, OpenAI GPT-4o, Local Ollama) and verifying live connection health.

**How to test:**
1. Open **[http://localhost:3000/settings/providers](http://localhost:3000/settings/providers)** in your browser.
2. Select a provider from the cards:
   - **OpenRouter** (Multi-model: Claude 3.5 Sonnet, GPT-4o, DeepSeek-R1)
   - **Anthropic** (Direct Claude 3.5 Sonnet)
   - **Google Gemini** (Gemini 1.5 Pro)
   - **OpenAI / Ollama / Groq** (Custom Base URLs & Open-Weights models)
3. Enter or update your API key and click **"Save & Set as Default"**.
4. Keys are encrypted at rest using AES-256-GCM.

✅ **What you just verified:** Dynamic LLM factory architecture, provider switching with zero code changes, and credential encryption.

---

### 🌟 Feature 8: GitHub Webhook Automated Issue Intake

**What it tests:** Automatically converting a real GitHub issue into an internal task and background job when labeled with `buildpilot`.

**How to test:**
Trigger a simulated GitHub webhook delivery:
```bash
curl -s -X POST http://localhost:4000/api/v1/github/webhooks \
  -H "Content-Type: application/json" \
  -H "x-github-event: issues" \
  -H "x-github-delivery: del_demo_99" \
  -d '{
    "action": "opened",
    "issue": {
      "number": 42,
      "title": "Optimize SQL indexing on user queries",
      "body": "Add index on email and createdAt fields for faster login lookup",
      "labels": [{ "name": "buildpilot" }]
    },
    "repository": {
      "owner": { "login": "my-org" },
      "name": "core-backend",
      "full_name": "my-org/core-backend",
      "default_branch": "main"
    }
  }' | jq .
```
**Expected Output:**
```json
{
  "received": true,
  "action": "TASK_CREATED",
  "taskId": "...",
  "projectId": "..."
}
```
Open **[http://localhost:3000/tasks](http://localhost:3000/tasks)** — you will see the new task from issue #42 automatically created and executing!

✅ **What you just verified:** Webhook signature verification, issue eligibility filtering, automatic project provisioning, and queue offloading.

---

### 🌟 Feature 9: SWE-bench Deterministic Coding Benchmark Suite

**What it tests:** The evaluation harness containing 20 deterministic coding scenarios with seeded bugs, test suites, and duration/token accounting.

**How to test:**
Run the benchmark test suite in your terminal:
```bash
pnpm --filter @buildpilot/benchmark test
```
**Expected Output:**
```text
 ✓ src/benchmark.test.ts (3 tests)
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

✅ **What you just verified:** Reproducible SWE-bench style benchmark dataset and automated test evaluation harness.

---

### 🌟 Feature 10: Observability, Tracing & Prometheus Telemetry

**What it tests:** Structured Pino logging with correlation IDs, OpenTelemetry tracing spans, and Prometheus metrics for Grafana.

**How to test:**
In your terminal, query the Prometheus metrics exporter:
```bash
curl -s http://localhost:4000/metrics
```
**Expected Output:**
```text
# HELP buildpilot_tasks_total Total count of processed engineering tasks
# TYPE buildpilot_tasks_total counter
buildpilot_tasks_total{status="COMPLETED"} 15
# HELP buildpilot_token_usage_total Total tokens consumed across LLM providers
# TYPE buildpilot_token_usage_total counter
buildpilot_token_usage_total{provider="OPENROUTER",type="prompt"} 42150
buildpilot_token_usage_total{provider="OPENROUTER",type="completion"} 11200
```

✅ **What you just verified:** Operational metrics, token accounting, and Prometheus scraping endpoint.

---

### 🌟 Feature 11: Automated Database Backup & Disaster Recovery

**What it tests:** Automated snapshot creation of MongoDB collections with gzip compression and retention verification.

**How to test:**
Run the automated backup script:
```bash
bash scripts/backup-mongodb.sh
```
**Expected Output:**
```text
[INFO] Starting MongoDB backup for buildpilot...
[INFO] Backup archive created successfully: /tmp/buildpilot-backups/backup_...tar.gz
[INFO] Backup verification completed successfully
```

✅ **What you just verified:** Production database snapshotting and disaster recovery readiness.

---

## 🎯 Verification Summary Matrix

| # | Feature Tested | Method | Status |
|---|---|---|---|
| **1** | System Readiness & Health | `curl http://localhost:4000/ready` | ✅ Tested |
| **2** | Web Dashboard Navigation | `http://localhost:3000` | ✅ Tested |
| **3** | GitHub OAuth & Repo Selector | `http://localhost:3000/projects` | ✅ Tested |
| **4** | Autonomous AI Task Dispatch | Web Modal $\rightarrow$ Live SSE Timeline | ✅ Tested |
| **5** | Real-Time Kanban Board | `http://localhost:3000/tasks` | ✅ Tested |
| **6** | Human-in-the-Loop Gating | Approval Card & API | ✅ Tested |
| **7** | Multi-Provider LLM Setup | `http://localhost:3000/settings/providers` | ✅ Tested |
| **8** | GitHub Webhook Auto-Intake | Webhook Curl Simulation | ✅ Tested |
| **9** | Benchmark Harness (20 Tasks) | `pnpm --filter @buildpilot/benchmark test` | ✅ Tested |
| **10** | Prometheus Telemetry | `curl http://localhost:4000/metrics` | ✅ Tested |
| **11** | Automated Database Backup | `bash scripts/backup-mongodb.sh` | ✅ Tested |

---

### 💡 Need More Details?
- Read **[MANUAL_TESTING_GUIDE.md](./MANUAL_TESTING_GUIDE.md)** for deep architecture concepts and sequence diagrams for every phase.
- Read **[MASTER_TODO.md](./MASTER_TODO.md)** for the complete list of all completed roadmap items.
