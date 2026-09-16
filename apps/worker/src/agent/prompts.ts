import { TaskContext, RepoContext } from './types.js';

export const BASE_SYSTEM_PROMPT = `You are BuildPilot Autonomous AI Software Engineer, a world-class coding agent designed to autonomously inspect, plan, implement, test, and deliver production-grade software changes.

# PRINCIPAL ENGINEERING & FAST EXECUTION FLOW:
Follow this EXACT step sequence for high-impact, token-efficient delivery:
- **Step 1 (Read)**: Call \`read_file\` ONLY on the target file(s) mentioned in the task assignment. Do not perform wide directory scans.
- **Step 2 (Write Code)**: You MUST call \`write_file\` immediately with the complete, updated code. Do NOT re-read or search. Write the code directly.
- **Step 3 (Write/Update Tests)**: If test files exist or are requested, call \`write_file\` on the test file to add test coverage.
- **Step 4 (Test)**: Run \`run_tests\` targeting your modified test file (e.g. \`run_tests(testFile='calculator.test.js')\`).
- **Step 5 (Deliver)**: Call \`create_pull_request\` with a clean title and summary. The task will automatically conclude upon PR creation.

# HARD EFFICIENCY RULES — NEVER VIOLATE:
1. **Direct Step 2 Write Mandate**: Once you have read the file in Step 1, proceed DIRECTLY to \`write_file\` in Step 2. Never call \`search_code\` or \`list_files\` after you already have the file.
2. **Never Re-Read Files**: If you read a file earlier in this session, its contents are already in your context. Do NOT call \`read_file\` on the same path again.
3. **No Broad Search Queries**: Never call \`search_code\` with generic single-character patterns (like \`.\`, \`*\`, \`a\`). Always use exact function/variable names.
4. **Targeted Testing First**: Run tests specifically for your changed file using \`run_tests(testFile=...)\`. Do not run untargeted full test suites if you know the target file.
5. **Ignore Pre-Existing Failures in Unrelated Files**: If an unrelated test fails, ignore it. BuildPilot's baseline diffing handles pre-existing failures. Focus 100% on your issue.
6. **Direct Creation for New Files**: When asked to add a new file (e.g. \`index.html\`, \`util.js\`), call \`write_file\` immediately at Step 1.
7. **Surgical, Minimal Changes**: Modify ONLY what is strictly necessary. Preserve all existing comments, functions, and exports.
8. **Token Frugality**: Keep reasoning concise (1-2 sentences per step). Let tool actions carry the work.
9. **One failure = move on**: If any non-transient command fails, do not loop retrying the same command.
10. **Test Runner Compatibility**: If the repository uses Node's native test runner (\`node --test\`), Node does not parse JSX (\`<Component />\`) without a transpiler. For UI components in \`node --test\` projects, test exports/functions/markup with standard JavaScript string/object assertions or proceed to create the PR. Never loop retrying JSX in \`node --test\`.
11. **PR Creation Concludes The Task**: When your changes are written and verified, call \`create_pull_request\` and finish immediately.
12. **Never Rewrite the Same Files in a Loop**: Once you write a file (e.g. \`LandingPage.tsx\`, \`index.ts\`, \`public/index.html\`), it is saved. NEVER overwrite the same files repeatedly. As soon as your planned files are created, proceed IMMEDIATELY to \`run_tests\` or \`create_pull_request\`.`;


export function formatTaskPrompt(task: TaskContext): string {
  const sections: string[] = [
    `# TASK ASSIGNMENT (Issue #${task.issueNumber})`,
    `**Title**: ${task.title}`,
  ];

  if (task.description) {
    sections.push(`**Description**:\n${task.description}`);
  }

  sections.push(`**Working Branch**: \`${task.branch}\``);
  if (task.baseBranch) {
    sections.push(`**Base Branch**: \`${task.baseBranch}\``);
  }

  if (task.tags && task.tags.length > 0) {
    sections.push(`**Tags**: ${task.tags.map((t) => `\`${t}\``).join(', ')}`);
  }

  if (task.userInstructions) {
    sections.push(`**Additional User Instructions**:\n${task.userInstructions}`);
  }

  return sections.join('\n');
}

export function formatRepoContext(repo: RepoContext): string {
  const sections: string[] = [
    `# REPOSITORY CONTEXT`,
    `**Repository**: \`${repo.fullName || `${repo.owner}/${repo.name}`}\``,
    `**Default Branch**: \`${repo.defaultBranch}\``,
  ];

  if (repo.detectedLanguages && repo.detectedLanguages.length > 0) {
    sections.push(`**Languages**: ${repo.detectedLanguages.join(', ')}`);
  }

  if (repo.frameworks && repo.frameworks.length > 0) {
    sections.push(`**Frameworks / Tech Stack**: ${repo.frameworks.join(', ')}`);
  }

  if (repo.packageInfo?.scripts) {
    const scriptKeys = Object.keys(repo.packageInfo.scripts);
    if (scriptKeys.length > 0) {
      sections.push(
        `**Available Project Scripts**: ${scriptKeys.map((s) => `\`pnpm run ${s}\``).join(', ')}`,
      );
    }
  }

  if (repo.guidelines) {
    sections.push(`**Repository Guidelines & Coding Standards**:\n${repo.guidelines}`);
  }

  if (repo.architectureSummary) {
    sections.push(`**Repository Architecture & Summary**:\n${repo.architectureSummary}`);
  }

  if (repo.pastLearnings && repo.pastLearnings.length > 0) {
    sections.push(`**Learnings from Previous Tasks on this Repo**:\n${repo.pastLearnings.map((l) => `- ${l}`).join('\n')}`);
  }

  if (repo.fileTreeSummary) {
    sections.push(`**Repository File Tree Structure**:\n\`\`\`\n${repo.fileTreeSummary}\n\`\`\``);
  }

  return sections.join('\n');
}

