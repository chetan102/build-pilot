import path from 'path';

export function resolveSafePath(workspaceDir: string, targetPath: string): string {
  const normalizedWorkspace = path.resolve(workspaceDir);

  // Normalize virtual sandbox root paths (e.g. /workspace/file.js -> file.js, /workspace -> .)
  let cleanTarget = (targetPath || '.').trim();
  if (cleanTarget === '/workspace') {
    cleanTarget = '.';
  } else if (cleanTarget.startsWith('/workspace/')) {
    cleanTarget = cleanTarget.slice('/workspace/'.length);
  }

  const resolvedTarget = path.resolve(normalizedWorkspace, cleanTarget);

  // Prevent path traversal outside of workspace
  if (resolvedTarget !== normalizedWorkspace && !resolvedTarget.startsWith(normalizedWorkspace + path.sep)) {
    throw new Error(`Path traversal denied: '${targetPath}' is outside workspace boundary '${workspaceDir}'`);
  }

  return resolvedTarget;
}

export function toRelativePath(workspaceDir: string, absolutePath: string): string {
  const normalizedWorkspace = path.resolve(workspaceDir);
  const normalizedTarget = path.resolve(absolutePath);
  const relative = path.relative(normalizedWorkspace, normalizedTarget);
  return relative === '' ? '.' : relative;
}
