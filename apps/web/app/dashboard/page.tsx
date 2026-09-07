'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock,
  Cpu,
  ArrowUpRight,
  GitPullRequest,
  AlertCircle,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fetchTasks, TaskSummary } from '@/lib/api-client';
import { MOCK_TASKS, MOCK_REPOSITORIES, MOCK_PROVIDERS } from '@/lib/mock-data';
import { formatDuration } from '@/lib/utils';

export default function DashboardPage() {
  const [tasks, setTasks] = React.useState<TaskSummary[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchTasks({ limit: 10 });
      if (res.tasks && res.tasks.length > 0) {
        setTasks(res.tasks);
      } else {
        setTasks(
          MOCK_TASKS.map((m) => ({
            _id: m.id,
            id: m.id,
            projectId: 'proj_mock',
            repositoryId: m.repository,
            issueNumber: m.issueNumber,
            title: m.title,
            description: m.description,
            status: m.status,
            branch: m.branch,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            durationMs: m.durationMs,
            model: m.model,
            provider: m.provider,
            prUrl: m.prUrl,
            prNumber: m.prNumber,
          })),
        );
      }
    } catch {
      setTasks(
        MOCK_TASKS.map((m) => ({
          _id: m.id,
          id: m.id,
          projectId: 'proj_mock',
          repositoryId: m.repository,
          issueNumber: m.issueNumber,
          title: m.title,
          description: m.description,
          status: m.status,
          branch: m.branch,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          durationMs: m.durationMs,
          model: m.model,
          provider: m.provider,
          prUrl: m.prUrl,
          prNumber: m.prNumber,
        })),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const activeTasks = tasks.filter(
    (t) => t.status !== 'COMPLETED' && t.status !== 'FAILED' && t.status !== 'CANCELLED',
  );
  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED');
  const awaitingApprovalTasks = tasks.filter((t) => t.status === 'AWAITING_APPROVAL');

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Active Tasks
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{activeTasks.length}</div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <span className="text-blue-600 font-semibold">{activeTasks.length} in flight</span>
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Completed PRs
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <GitPullRequest className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{completedTasks.length}</div>
            <p className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Verified with automated tests
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Awaiting Approval
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertCircle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{awaitingApprovalTasks.length}</div>
            <p className="text-xs text-amber-700 font-medium mt-1">
              High-risk policy gates
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              LLM Providers
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Cpu className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {MOCK_PROVIDERS.filter((p) => p.status === 'connected').length} / {MOCK_PROVIDERS.length}
            </div>
            <p className="text-xs text-slate-500 mt-1">OpenRouter, OpenAI, Groq, Ollama ready</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Active Pipeline & System Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Active Tasks Feed */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Active Workflows</h2>
              <p className="text-xs text-slate-500">
                Tasks executing autonomously in background BullMQ workers
              </p>
            </div>
            <Link href="/tasks">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <span>View All Tasks</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>

          <div className="space-y-3">
            {activeTasks.map((task) => {
              const taskId = task._id || task.id;
              const statusColors: Record<string, 'default' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
                QUEUED: 'secondary',
                PLANNING: 'info',
                DEVELOPMENT: 'default',
                TESTING: 'warning',
                AWAITING_APPROVAL: 'destructive',
              };

              return (
                <Card
                  key={taskId}
                  className="hover:border-slate-300 transition-all shadow-sm border border-slate-200"
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={statusColors[task.status] || 'default'}>
                            {task.status.replace(/_/g, ' ')}
                          </Badge>
                          <span className="text-xs font-mono text-slate-400">#{task.issueNumber || 1}</span>
                          <span className="text-xs text-slate-500 font-medium">
                            {task.repositoryId}
                          </span>
                        </div>
                        <Link
                          href={`/tasks/${taskId}`}
                          className="font-semibold text-sm text-slate-900 hover:text-blue-600 block transition-colors line-clamp-1"
                        >
                          {task.title}
                        </Link>
                        <p className="text-xs text-slate-500 line-clamp-1">{task.description}</p>
                      </div>

                      <Link href={`/tasks/${taskId}`}>
                        <Button size="sm" variant="outline" className="text-xs">
                          Inspect
                        </Button>
                      </Link>
                    </div>

                    {/* Progress Bar & Info */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <div className="flex items-center gap-4">
                        <span>Provider: <strong className="text-slate-700">{task.provider || 'OPENROUTER'}</strong></span>
                        <span>Model: <code className="text-slate-600 bg-slate-100 px-1 py-0.5 rounded text-[11px]">{task.model || 'anthropic/claude-3.5-sonnet'}</code></span>
                      </div>
                      <span>Runtime: {formatDuration(task.durationMs || 45000)}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Sidebar Status / Quick Info */}
        <div className="space-y-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-600" />
                <span>Trigger Automation</span>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                How BuildPilot converts issues into PRs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-slate-600">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 space-y-2">
                <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <span className="h-5 w-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">
                    1
                  </span>
                  Open a GitHub Issue
                </div>
                <p className="text-slate-500 pl-6.5">
                  Describe the bug, feature, or refactor needed on any connected repository.
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 space-y-2">
                <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <span className="h-5 w-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">
                    2
                  </span>
                  Add <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">buildpilot</code> label
                </div>
                <p className="text-slate-500 pl-6.5">
                  The webhook immediately registers the task and dispatches an agent in Docker.
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 space-y-2">
                <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <span className="h-5 w-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">
                    3
                  </span>
                  Review & Merge PR
                </div>
                <p className="text-slate-500 pl-6.5">
                  BuildPilot runs tests, verifies the build, and opens a reviewable Pull Request.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Connected Repositories */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold text-slate-900">Repositories</CardTitle>
              <Link href="/projects" className="text-xs text-blue-600 hover:underline">
                Manage
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {MOCK_REPOSITORIES.map((repo) => (
                <div
                  key={repo.id}
                  className="flex items-center justify-between p-2.5 rounded-md hover:bg-slate-50 transition-colors text-xs border border-slate-100"
                >
                  <div>
                    <p className="font-semibold text-slate-800">{repo.fullName}</p>
                    <p className="text-slate-400 text-[11px]">Branch: {repo.defaultBranch}</p>
                  </div>
                  <Badge variant="success" className="text-[10px]">
                    Active
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
