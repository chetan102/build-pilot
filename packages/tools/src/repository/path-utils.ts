import path from 'path';

export function resolveSafePath(workspaceDir: string, targetPath: string): string {
  const normalizedWorkspace = path.resolve(workspaceDir);
  const resolvedTarget = path.resolve(normalizedWorkspace, targetPath || '.');

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
