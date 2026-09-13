# 🚀 BuildPilot — Complete Hands-On Feature Testing Runbook

> **Welcome to the BuildPilot Deep Testing Guide!**  
> This runbook is a comprehensive, step-by-step master guide to testing **every single capability of BuildPilot** from scratch.  
> You will create a real GitHub test repository, connect it via 1-click GitHub OAuth, dispatch autonomous AI coding tasks, observe multi-agent planning and live execution, test human approval gating, and watch BuildPilot automatically open real GitHub Pull Requests.

---

## 📑 Table of Contents
1. [Prerequisites & Environment Check](#-part-1-prerequisites--environment-check)
2. [Setting Up Your GitHub Test Repository (2 Minutes)](#-part-2-setting-up-your-github-test-repository-2-minutes)
3. [Connecting GitHub via OAuth & Importing Repositories](#-part-3-connecting-github-via-oauth--importing-repositories)
4. [5 Realistic AI Engineering Tasks to Test](#-part-4-5-realistic-ai-engineering-tasks-to-test)
   - [Test Task 1: Autonomous Bug Fix with Test Verification](#-test-task-1-autonomous-bug-fix-with-test-verification)
   - [Test Task 2: New Feature Implementation & Unit Tests](#-test-task-2-new-feature-implementation--unit-tests)
   - [Test Task 3: Security & Input Validation Hardening](#-test-task-3-security--input-validation-hardening)
   - [Test Task 4: Testing Human-in-the-Loop Approval Gating](#-test-task-4-testing-human-in-the-loop-approval-gating)
   - [Test Task 5: End-to-End GitHub Webhook Automation (`buildpilot` label $\rightarrow$ PR)](#-test-task-5-end-to-end-github-webhook-automation-buildpilot-label--pr)
5. [Testing the Live UI (Dashboard, Kanban, SSE Stream, Diff Viewer)](#-part-5-testing-the-live-ui-dashboard-kanban-sse-stream-diff-viewer)
6. [Testing LLM Provider Switching (Gemini, Claude, GPT-4o, OpenRouter)](#-part-6-testing-llm-provider-switching)
7. [Testing Failure Recovery & Retry Resiliency](#-part-7-testing-failure-recovery--retry-resiliency)
8. [Automated Benchmark Harness & Telemetry](#-part-8-automated-benchmark-harness--telemetry)

---

## 🛠️ Part 1: Prerequisites & Environment Check

### 1. Start Infrastructure Containers
Open your terminal in the `build-pilot` root directory:
```bash
docker compose -f infra/docker-compose.yml up -d
```
Verify MongoDB and Redis are running:
```bash
docker ps
```
*(You should see `mongodb` on port `27017` and `redis` on port `6379` healthy).*

### 2. Verify `.env` Configuration
Open your `.env` file and make sure you have:
1. GitHub OAuth App credentials (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`) or your `GITHUB_TOKEN`.
2. *(Note: You do **not** need to put AI API keys into `.env`! You can enter your OpenAI, Gemini, Anthropic, or OpenRouter API key directly in the UI at `/settings/providers` or right inside the task modal).*

### 3. Launch BuildPilot
```bash
pnpm dev
```
*(Starts Web UI on `http://localhost:3000`, API on `http://localhost:4000`, and Worker in background).*

---

## 📦 Part 2: Setting Up Your GitHub Test Repository (2 Minutes)

To test BuildPilot on real code with real tests, create a small test repository on your GitHub account.

### Step 2.1: Create a new repository on GitHub
1. Go to **[https://github.com/new](https://github.com/new)**.
2. Repository name: **`buildpilot-sandbox-app`**
3. Set visibility to **Public** (or **Private**).
4. Check **Add a README file**.
5. Click **Create repository**.

### Step 2.2: Add Starter Code (Calculator API with a seeded bug)
Clone your newly created repository locally or use GitHub Web Editor (press `.` in GitHub):

Create a file **`package.json`**:
```json
{
  "name": "buildpilot-sandbox-app",
  "version": "1.0.0",
  "scripts": {
    "test": "node --test"
  }
}
```

Create a file **`calculator.js`** *(Note: contains an intentional bug in `divide`)*:
```javascript
function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

function multiply(a, b) {
  return a * b;
}

// BUG: divide returns multiplication instead of division!
function divide(a, b) {
  if (b === 0) {
    throw new Error('Division by zero is not allowed');
  }
  return a * b; // <-- Seeded Bug for AI Agent to fix
}

module.exports = { add, subtract, multiply, divide };
```

Create a test file **`calculator.test.js`**:
```javascript
const test = require('node:test');
const assert = require('node:assert');
const { add, subtract, multiply, divide } = require('./calculator');

test('add numbers correctly', () => {
  assert.strictEqual(add(2, 3), 5);
});

test('subtract numbers correctly', () => {
  assert.strictEqual(subtract(10, 4), 6);
});

test('multiply numbers correctly', () => {
  assert.strictEqual(multiply(3, 4), 12);
});

test('divide numbers correctly', () => {
  assert.strictEqual(divide(10, 2), 5);
});

test('throws error on division by zero', () => {
  assert.throws(() => divide(10, 0), /Division by zero/);
});
```

Commit and push this to your repository's `main` branch:
```bash
git add .
git commit -m "feat: initial calculator app with seeded bug and test suite"
git push origin main
```

---

## 🔑 Part 3: Connecting GitHub via OAuth & Importing Repositories

1. Open your browser and navigate to: **[http://localhost:3000/projects](http://localhost:3000/projects)**.
2. Click the black **"Authorize with GitHub (OAuth)"** button.
3. You will be redirected to GitHub's authorization consent screen:
   - Click **"Authorize BuildPilot"**.
4. GitHub redirects you back to `http://localhost:3000/projects`.
5. **Observe**:
   - Your GitHub avatar and username (e.g. `@your-username`) appear in the top-right header and profile card.
   - All your public and private repositories are fetched and rendered in the live repository browser!
6. Type `buildpilot-sandbox-app` in the repository search bar.
7. Click the **"Import Repo"** button on `buildpilot-sandbox-app`.
   - BuildPilot registers the project in MongoDB and shows a green **"Imported"** checkmark.

---

## 🤖 Part 4: 5 Realistic AI Engineering Tasks to Test

---

### 🧪 Test Task 1: Autonomous Bug Fix with Test Verification

**Objective:** Have the AI Agent locate the seeded bug in `calculator.js`, run tests to confirm the failure, correct the bug, re-run tests until green, and create a Pull Request.

1. On **[http://localhost:3000/projects](http://localhost:3000/projects)**, find your imported `buildpilot-sandbox-app` project.
2. Click **"Start AI Task"**.
3. In the modal, enter:
   - **Task Title**: `Fix divide function bug in calculator.js`
   - **Description**: `The divide test is failing because divide(10, 2) is returning 20 instead of 5. Please inspect calculator.js, fix the division logic, and run npm test to ensure all 5 tests pass.`
   - **AI Provider & Model**: Select your preferred provider (e.g. OpenAI GPT-4o, Google Gemini 1.5 Pro, or Anthropic Claude 3.5 Sonnet).
   - **API Key**: Paste your API key (if you haven't already saved it in Settings).
4. Click **"Dispatch Agent Task"**.
5. **Watch the live execution on `/tasks/<taskId>`**:
   - **Planner Agent**: Reads `calculator.js` and `calculator.test.js`.
   - **Developer Agent**: Changes `return a * b` to `return a / b`.
   - **Reviewer Agent**: Executes `npm test` inside the sandbox, sees all 5 tests passing with exit code 0.
   - **GitHub Integration**: Pushes branch `buildpilot/task-...` and creates a GitHub Pull Request!

---

### 🧪 Test Task 2: New Feature Implementation & Unit Tests

**Objective:** Have the AI Agent implement power and modulo functions, plus unit tests.

1. Click **"Start AI Task"** on `buildpilot-sandbox-app`.
2. In the modal, enter:
   - **Task Title**: `Add power and modulo functions with unit tests`
   - **Description**: `Add power(base, exponent) and modulo(dividend, divisor) functions to calculator.js and export them. Add comprehensive unit tests in calculator.test.js and run tests to verify.`
3. Click **"Dispatch Agent Task"**.
4. Observe the Multi-Agent loop write new code, append tests, and verify 100% test pass rate.

---

### 🧪 Test Task 3: Security & Input Validation Hardening

**Objective:** Prompt the AI to add strict type checking to reject non-numeric inputs (`NaN`, strings).

1. Click **"Start AI Task"** on `buildpilot-sandbox-app`.
2. In the modal, enter:
   - **Task Title**: `Add strict numeric type validation to all calculator functions`
   - **Description**: `Update all functions to throw a TypeError if any argument is not a finite number. Add tests verifying that invalid inputs throw TypeError.`
3. Click **"Dispatch Agent Task"**.
4. Check the generated diff in the live Diff Viewer tab on `/tasks/<taskId>` to review the added validation guards.

---

### 🧪 Test Task 4: Testing Human-in-the-Loop Approval Gating

**Objective:** Test safety gating where high-risk actions pause the agent until you approve.

1. Dispatch a task with a high-risk instruction:
   - **Task Title**: `Clean up remote stale branches and delete old tags`
   - **Description**: `Delete obsolete remote git branches.`
2. The agent will attempt to call a `HIGH_RISK` tool (e.g. branch deletion).
3. **Observe**:
   - The task state immediately halts at `AWAITING_APPROVAL`.
   - An amber **Human Approval Required** action banner appears on the task detail page.
   - You can inspect the exact tool arguments and risk classification.
   - Click **Approve** (or **Reject**) to resume the agent workflow.

---

### 🧪 Test Task 5: End-to-End GitHub Webhook Automation (`buildpilot` label $\rightarrow$ PR)

**Objective:** Test fully autonomous intake where opening a GitHub Issue with the `buildpilot` label automatically triggers BuildPilot to write code and open a PR.

1. Go to your repository on GitHub: `https://github.com/<your-username>/buildpilot-sandbox-app/issues/new`.
2. Create an Issue:
   - **Title**: `Add square root function to calculator`
   - **Body**: `Add a sqrt(n) function that returns the square root of a non-negative number and throws on negative numbers. Add tests.`
   - **Labels**: Add label `buildpilot`.
3. Submit the issue.
4. Open **[http://localhost:3000/tasks](http://localhost:3000/tasks)**:
   - BuildPilot's webhook intake immediately creates the task from the GitHub issue.
   - The worker starts automatically.
   - Once completed, look at the GitHub PRs tab on your repo — a Pull Request titled `Fix #1: Add square root function to calculator` is waiting for your review!

---

## 🖥️ Part 5: Testing the Live UI (Dashboard, Kanban, SSE Stream, Diff Viewer)

### 1. Spacious Kanban Board (`/tasks`)
- Open **[http://localhost:3000/tasks](http://localhost:3000/tasks)**.
- See your tasks categorized cleanly into 4 spacious columns:
  - **`📥 Inbox & Queued`**
  - **`🤖 Active AI Agent`**
  - **`🛡️ Human Review`**
  - **`🚀 Completed & PR Created`**
- Click the **Table View** toggle at top right to switch to list view.
- Filter by status using the dropdown or search tasks by title.

### 2. Live Task Streaming & Interactive Diff Viewer (`/tasks/[taskId]`)
- Click on any active or completed task.
- **SSE Stream**: Watch thoughts and tool executions stream in real-time.
- **Git Diff Viewer**: Click on the **Diff** tab to see colorized additions (`+`) and deletions (`-`) generated by the AI agent.

### 3. Overview Dashboard (`/dashboard`)
- Open **[http://localhost:3000/dashboard](http://localhost:3000/dashboard)**.
- View live KPI cards: Active Tasks, Success Rate, Pull Requests Created, Total Token Consumption.
- Review the live runtime engine indicators (Docker sandbox, BullMQ worker, SSE engine).

---

## 🧠 Part 6: Testing LLM Provider Switching & UI Credentials

BuildPilot supports 100% UI-driven LLM switching across all major providers with AES-256 encryption at rest.

1. Open **[http://localhost:3000/settings/providers](http://localhost:3000/settings/providers)**.
2. Select your provider:
   - **OpenAI** (Direct GPT-4o, GPT-4o-mini)
   - **Google Gemini** (Gemini 1.5 Pro, Gemini 1.5 Flash)
   - **Anthropic** (Direct Claude 3.5 Sonnet, Claude 3.5 Haiku)
   - **OpenRouter** (Claude 3.5 Sonnet, DeepSeek R1, Llama 3)
3. Enter your API key and click **"Test Connection"** to verify ping latency and tool calling live.
4. Click **"Save API Key"** — your key is encrypted with AES-256 and stored securely in MongoDB.
5. Launch any task from `/projects` — the worker will immediately utilize your saved active model and credentials.

---

## 🔄 Part 7: Testing Failure Recovery & Retry Resiliency

**Objective:** Test what happens when an agent encounters compile errors or rate limits.

1. Dispatch a difficult or deliberately broken task.
2. If tests fail on Attempt 1, watch the **Self-Healing Loop**:
   - The Developer Agent receives the stderr output from the test failure.
   - It analyzes the error trace and generates a second patch (Attempt 2).
   - Once tests pass, it transitions to `COMPLETED`.
3. If a task fails or is cancelled, click the **"Retry Task"** button in the UI or use the API:
   ```bash
   curl -s -X POST http://localhost:4000/api/v1/tasks/<TASK_ID>/retry | jq .
   ```

---

## 📊 Part 8: Automated Benchmark Harness & Telemetry

### 1. Run the SWE-bench Benchmark Suite (20 Deterministic Scenarios)
In your terminal:
```bash
pnpm --filter @buildpilot/benchmark test
```
*(Runs evaluations across 20 synthetic coding challenges with seeded bugs).*

### 2. Inspect Prometheus Metrics
```bash
curl -s http://localhost:4000/metrics | grep buildpilot
```
*(Exposes active task counts, duration histograms, and token consumption by provider).*

---

## ✅ Complete Feature Testing Matrix

| Feature | Where to Test | Verification Metric | Status |
| :--- | :--- | :--- | :--- |
| **1. GitHub OAuth** | `/projects` $\rightarrow$ "Authorize with GitHub" | Redirects to GitHub & loads user avatar + repos | ✅ Verified |
| **2. Repo Importer** | `/projects` $\rightarrow$ Search & "Import Repo" | MongoDB project created with green "Imported" badge | ✅ Verified |
| **3. AI Bug Fixing** | `/projects` $\rightarrow$ "Start AI Task" | Fixes `calculator.js`, passes tests, creates PR | ✅ Verified |
| **4. Multi-Agent Flow** | `/tasks/[taskId]` | Live timeline (Planner $\rightarrow$ Dev $\rightarrow$ Reviewer) | ✅ Verified |
| **5. Live SSE Stream** | `/tasks/[taskId]` | Real-time reasoning stream without page reloads | ✅ Verified |
| **6. Diff Viewer** | `/tasks/[taskId]` $\rightarrow$ Diff Tab | Color-coded syntax diff of modified files | ✅ Verified |
| **7. Spacious Kanban** | `/tasks` | 4 spacious columns with card timers & filters | ✅ Verified |
| **8. Human Approval** | High-risk tool execution | State halts at `AWAITING_APPROVAL` until decided | ✅ Verified |
| **9. Webhook Intake** | GitHub issue with `buildpilot` label | Webhook auto-creates task and dispatches worker | ✅ Verified |
| **10. LLM Switching** | `/settings/providers` | Dynamic provider switching with AES-256 encryption | ✅ Verified |
| **11. Self-Healing Loop** | Failing test scenario | Agent consumes test stderr and retries up to 3 times | ✅ Verified |
| **12. Prometheus Metrics**| `curl http://localhost:4000/metrics` | Prometheus counters and histograms exported | ✅ Verified |
