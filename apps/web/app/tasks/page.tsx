'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Kanban,
  Table as TableIcon,
  Search,
  RefreshCw,
  Plus,
  Clock,
  GitBranch,
  Trash2,
  Filter,
  Github,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { fetchTasks, fetchProjects, syncGitHubIssues, deleteTask, TaskSummary } from '@/lib/api-client';
import { formatDuration } from '@/lib/utils';

export default function TasksPage() {
  const [viewMode, setViewMode] = React.useState<'kanban' | 'table'>('kanban');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');
  const [tasks, setTasks] = React.useState<TaskSummary[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [syncing, setSyncing] = React.useState<boolean>(false);
  const [syncNotice, setSyncNotice] = React.useState<string | null>(null);

  const loadTasks = React.useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const res = await fetchTasks({
        search: searchQuery || undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        limit: 100,
      });

      setTasks(res.tasks || []);
    } catch (err) {
      console.warn('Could not fetch tasks:', err);
      if (isInitial) setTasks([]);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [searchQuery, statusFilter]);

  React.useEffect(() => {
    loadTasks(true);
  }, [loadTasks]);

  React.useEffect(() => {
    const hasActiveTasks = tasks.some(t => ['QUEUED', 'PLANNING', 'DEVELOPMENT', 'TESTING', 'AWAITING_APPROVAL'].includes(t.status));
    if (!hasActiveTasks) return;

    const interval = setInterval(() => {
      loadTasks(false);
    }, 4000);
    return () => clearInterval(interval);
  }, [tasks, loadTasks]);

  const handleDeleteTask = async (e: React.MouseEvent, taskId: string, taskTitle: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Are you sure you want to permanently delete task "${taskTitle}"?`)) return;
    try {
      await deleteTask(taskId);
      await loadTasks();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || 'Failed to delete task');
    }
  };

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.repositoryId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.issueNumber?.toString().includes(searchQuery);

    const matchesStatus = statusFilter === 'ALL' || task.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Logical 4-column groupings to prevent squeezed narrow columns
  const kanbanColumns = [
    {
      id: 'queued',
      title: 'Inbox & Queued',
      description: 'Tasks waiting for worker assignment',
      color: 'bg-slate-100 text-slate-700 border-slate-200',
      dotColor: 'bg-slate-400',
      match: (status: string) => status === 'QUEUED',
    },
    {
      id: 'in_progress',
      title: 'Active AI Agent',
      description: 'Planning, editing code & executing tests',
      color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      dotColor: 'bg-indigo-500 animate-pulse',
      match: (status: string) =>
        status === 'PLANNING' || status === 'DEVELOPMENT' || status === 'TESTING' || status === 'CODING',
    },
    {
      id: 'approval',
      title: 'Human Review & Gating',
      description: 'High-risk actions awaiting developer decision',
      color: 'bg-amber-50 text-amber-700 border-amber-200',
      dotColor: 'bg-amber-500',
      match: (status: string) => status === 'AWAITING_APPROVAL' || status === 'BLOCKED',
    },
    {
      id: 'completed',
      title: 'Completed & PR Created',
      description: 'Changes verified and delivered',
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      dotColor: 'bg-emerald-500',
      match: (status: string) => status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED',
    },
  ];

  const handleSyncGitHubIssues = async () => {
    try {
      setSyncing(true);
      setSyncNotice(null);
      const token = typeof window !== 'undefined' ? localStorage.getItem('bp_github_token') || undefined : undefined;

      // 1. Fetch projects to know which repos to sync
      const projectsRes = await fetchProjects();
      const allProjects = projectsRes.projects || [];
      let totalSynced = 0;
      const reposChecked: string[] = [];

      // 2. If no projects imported yet, try to auto-discover repos from connected GitHub OAuth account
      if (allProjects.length === 0 && token) {
        try {
          const { fetchGitHubRepositories } = await import('@/lib/api-client');
          const repoRes = await fetchGitHubRepositories(token);
          if (repoRes.repositories && repoRes.repositories.length > 0) {
            // Find relevant sandbox repo or active repos
            const targetRepos = repoRes.repositories.filter(
              (r) => r.fullName.includes('sandbox') || r.fullName.includes('buildpilot') || repoRes.repositories.length <= 5
            );

            for (const r of targetRepos) {
              const [owner, repo] = r.fullName.split('/');
              if (owner && repo) {
                reposChecked.push(r.fullName);
                // Try buildpilot tag first, then ALL open issues
                let res = await syncGitHubIssues(owner, repo, token, 'buildpilot');
                if (res.syncedCount === 0) {
                  res = await syncGitHubIssues(owner, repo, token, 'ALL');
                }
                totalSynced += res.syncedCount || 0;
              }
            }
          }
        } catch (autoErr: any) {
          console.warn('Auto repo discovery failed:', autoErr.message);
        }
      } else {
        for (const p of allProjects) {
          const repoFullName = p.githubRepoFullName || p.name;
          if (repoFullName && repoFullName.includes('/')) {
            const [owner, repo] = repoFullName.split('/');
            if (owner && repo) {
              reposChecked.push(repoFullName);
              try {
                // Try buildpilot label first
                let res = await syncGitHubIssues(owner, repo, token, 'buildpilot');
                if (res.syncedCount === 0) {
                  // Also check all open issues if none tagged buildpilot
                  res = await syncGitHubIssues(owner, repo, token, 'ALL');
                }
                totalSynced += res.syncedCount || 0;
              } catch (err: any) {
                console.warn(`Could not sync ${repoFullName}:`, err.message);
              }
            }
          }
        }
      }

      await loadTasks();

      if (totalSynced > 0) {
        setSyncNotice(`🎉 Successfully imported and queued ${totalSynced} issue(s) from GitHub! Agent is now processing.`);
      } else if (reposChecked.length > 0) {
        setSyncNotice(`ℹ️ Checked GitHub (${reposChecked.join(', ')}). All open issues are already synced or no open issues found.`);
      } else {
        setSyncNotice(`ℹ️ No GitHub projects found. Please go to Projects (/projects) to connect GitHub and import your repository.`);
      }
    } catch (err: any) {
      setSyncNotice(`⚠️ Failed to sync issues: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-12">
      {/* Sync Notification Banner */}
      {syncNotice && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs rounded-xl flex items-center justify-between font-medium">
          <span>{syncNotice}</span>
          <button onClick={() => setSyncNotice(null)} className="text-indigo-500 hover:text-indigo-700 font-bold px-1.5">
            ×
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Kanban className="h-6 w-6 text-indigo-600" />
              Autonomous Task Board
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time pipeline tracking engineering tasks through Planner, Developer, and Reviewer loops.
          </p>
        </div>

        {/* View Switcher & Action Controls */}
        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            onClick={handleSyncGitHubIssues}
            disabled={syncing}
            className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 shadow-sm font-semibold rounded-xl"
          >
            <Github className={`h-3.5 w-3.5 ${syncing ? 'animate-spin text-white' : ''}`} />
            <span>{syncing ? 'Syncing GitHub...' : 'Sync GitHub Issues'}</span>
          </Button>

          <Link href="/projects">
            <Button size="sm" className="h-8 text-xs bg-slate-900 hover:bg-slate-800 text-white gap-1.5 shadow-sm rounded-xl">
              <Plus className="h-3.5 w-3.5" />
              <span>New Task</span>
            </Button>
          </Link>

          <Button
            variant="outline"
            size="sm"
            onClick={() => loadTasks()}
            disabled={loading}
            className="h-8 text-xs gap-1.5 bg-white shadow-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-indigo-500' : 'text-slate-500'}`} />
            <span>Refresh</span>
          </Button>

          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'kanban'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Kanban className="h-3.5 w-3.5" />
              <span>Board</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
              <span>Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by title, repository, or issue #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs bg-slate-50/50 border-slate-200 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <Filter className="h-3.5 w-3.5 text-slate-400 ml-1 mr-1 hidden sm:block shrink-0" />
          {[
            { key: 'ALL', label: 'All Statuses' },
            { key: 'QUEUED', label: 'Queued' },
            { key: 'PLANNING', label: 'Planning' },
            { key: 'DEVELOPMENT', label: 'Coding' },
            { key: 'AWAITING_APPROVAL', label: 'Approval' },
            { key: 'COMPLETED', label: 'Completed' },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                statusFilter === f.key
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100/70 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* View: Spacious Kanban Board */}
      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 items-start">
          {kanbanColumns.map((col) => {
            const columnTasks = filteredTasks.filter((t) => col.match(t.status));

            return (
              <div
                key={col.id}
                className="bg-slate-100/60 rounded-2xl p-4 border border-slate-200/70 min-h-[550px] flex flex-col"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${col.dotColor}`} />
                    <h2 className="text-xs font-bold text-slate-800 tracking-tight uppercase">
                      {col.title}
                    </h2>
                  </div>
                  <span className="text-xs font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200 shadow-xs">
                    {columnTasks.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="space-y-3.5 flex-1">
                  {columnTasks.map((task) => {
                    const taskId = task._id || task.id;
                    return (
                      <Link key={taskId} href={`/tasks/${taskId}`} className="block group">
                        <Card className="bg-white border-slate-200/90 shadow-xs hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer rounded-xl overflow-hidden">
                          <CardContent className="p-4 space-y-3">
                            {/* Card Top: Issue number & Repo tag + Delete */}
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100 text-[11px]">
                                #{task.issueNumber || 1}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-medium text-slate-500 truncate max-w-[120px]" title={task.repositoryId}>
                                  {task.repositoryId}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteTask(e, taskId, task.title)}
                                  className="text-slate-400 hover:text-red-600 p-1 rounded-md hover:bg-red-50 transition"
                                  title="Delete task"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>

                            {/* Card Title */}
                            <h3 className="font-bold text-xs text-slate-900 leading-snug group-hover:text-indigo-600 transition-colors line-clamp-2">
                              {task.title}
                            </h3>

                            {/* Status and Model Tag */}
                            <div className="flex items-center gap-2 flex-wrap text-[11px]">
                              <Badge
                                variant={
                                  task.status === 'COMPLETED'
                                    ? 'success'
                                    : task.status === 'AWAITING_APPROVAL'
                                      ? 'destructive'
                                      : task.status === 'PLANNING' || task.status === 'DEVELOPMENT'
                                        ? 'info'
                                        : 'secondary'
                                }
                                className="text-[10px] px-2 py-0.5 font-bold"
                              >
                                {task.status.replace(/_/g, ' ')}
                              </Badge>

                              {task.branch && (
                                <span className="text-slate-400 font-mono text-[10px] truncate max-w-[130px] flex items-center gap-0.5">
                                  <GitBranch className="h-2.5 w-2.5 shrink-0" />
                                  {task.branch}
                                </span>
                              )}
                            </div>

                            {/* Card Footer: Model + Runtime */}
                            <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                              <span className="truncate max-w-[120px] font-medium text-slate-500">
                                {task.model || 'Configured Model'}
                              </span>
                              <div className="flex items-center gap-1 font-semibold text-slate-600">
                                <Clock className="h-3 w-3 text-slate-400" />
                                <span>{task.durationMs ? formatDuration(task.durationMs) : '0s'}</span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}

                  {columnTasks.length === 0 && (
                    <div className="h-32 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-xs text-slate-400 gap-1 bg-white/40">
                      <span>No tasks in this stage</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* View: Table */
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <TableHead className="w-20 font-bold text-xs">Issue</TableHead>
                <TableHead className="font-bold text-xs">Task Title & Details</TableHead>
                <TableHead className="w-40 font-bold text-xs">Stage Status</TableHead>
                <TableHead className="w-48 font-bold text-xs">Model & Branch</TableHead>
                <TableHead className="w-32 font-bold text-xs">Runtime</TableHead>
                <TableHead className="w-32 text-right font-bold text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-xs text-slate-400">
                    No tasks found. Launch a task from the Projects page to get started.
                  </TableCell>
                </TableRow>
              ) : (
                filteredTasks.map((task) => {
                  const taskId = task._id || task.id;
                  return (
                    <TableRow key={taskId} className="hover:bg-slate-50/70 transition-colors">
                      <TableCell className="font-mono font-bold text-xs text-indigo-600">
                        #{task.issueNumber || 1}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/tasks/${taskId}`}
                          className="font-bold text-xs text-slate-900 hover:text-indigo-600 transition-colors block"
                        >
                          {task.title}
                        </Link>
                        <span className="text-[11px] text-slate-400">{task.repositoryId}</span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            task.status === 'COMPLETED'
                              ? 'success'
                              : task.status === 'AWAITING_APPROVAL'
                                ? 'destructive'
                                : 'default'
                          }
                          className="text-[10px] font-bold"
                        >
                          {task.status.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        <p className="font-medium text-[11px] text-slate-700">{task.model || 'Configured Model'}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{task.branch}</p>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 font-medium">
                        {task.durationMs ? formatDuration(task.durationMs) : '0s'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/tasks/${taskId}`}>
                            <Button variant="outline" size="sm" className="text-xs h-7 px-2.5">
                              Inspect
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => handleDeleteTask(e, taskId, task.title)}
                            className="text-xs h-7 px-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50"
                            title="Delete task"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
