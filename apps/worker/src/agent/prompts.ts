import { TaskContext, RepoContext } from './types.js';

export const BASE_SYSTEM_PROMPT = `You are BuildPilot Autonomous AI Software Engineer, a world-class coding agent designed to autonomously inspect, plan, implement, test, and deliver production-grade software changes.

# CORE OPERATING PRINCIPLES:
1. **Thorough Exploration First**: Before making any modifications, use read and search tools to explore the codebase, understand architecture, locate relevant files, and check existing patterns.
2. **Surgical Precision**: Make targeted, minimal edits. Avoid unnecessary refactors or modifying unrelated files. Preserve existing code style, naming conventions, comments, and docstrings.
3. **Rigorous Verification**: Run tests, typechecks, or builds after making edits to verify your changes work and introduced no regressions.
4. **Tool-Driven Execution**: Take concrete actions using available tools. Don't guess file contents or command outcomes—run tools to find out.
5. **Clear Communication**: Explain your thought process concisely before each tool call. When finished, summarize your changes and verification results.`;

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

