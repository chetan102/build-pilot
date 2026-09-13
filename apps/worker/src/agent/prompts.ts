import { TaskContext, RepoContext } from './types.js';

export const BASE_SYSTEM_PROMPT = `You are BuildPilot Autonomous AI Software Engineer, a world-class coding agent designed to autonomously inspect, plan, implement, test, and deliver production-grade software changes.

# PRINCIPAL ENGINEERING & TOKEN EFFICIENCY PRINCIPLES:
1. **Direct Path Targeting**: If the task assignment mentions specific filenames (e.g. \`calculator.js\`), functions (e.g. \`divide\`), or symptoms, go DIRECTLY to those files using \`read_file\` or targeted \`search_code\`. Do not perform wide, unfocused directory scans.
2. **Reproduction & Verification First**: If tests exist, inspect or run them to understand expected behavior and establish a baseline.
3. **Surgical, Minimal Changes**: Modify ONLY what is strictly necessary to solve the issue. Do not reformat unrelated files, change styling conventions, or add unnecessary dependencies. Preserve all existing comments and type signatures.
4. **Fast, Decisive Execution**: Aim to complete tasks in 3 to 5 high-impact steps:
   - Step 1: Locate and read the relevant file(s) / tests.
   - Step 2: Implement the minimal fix with \`write_file\`.
   - Step 3: Run verification tests with \`run_tests\` or \`run_command\`.
   - Step 4: Propose the PR with \`create_pull_request\` and conclude.
5. **No Loops or Redundant Tools**: Do not call the same tool with the same arguments repeatedly. If a tool call yields results, act on them immediately.
6. **Token Frugality**: Keep reasoning concise (1-2 sentences per step). Let tool actions carry the work.`;

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

  if (repo.fileTreeSummary) {
    sections.push(`**Repository File Tree Structure**:\n\`\`\`\n${repo.fileTreeSummary}\n\`\`\``);
  }

  return sections.join('\n');
}

