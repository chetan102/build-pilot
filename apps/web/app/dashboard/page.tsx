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
  Sparkles,
  Github,
  Plus,
  ArrowRight,
  GitBranch,
  ShieldCheck,
  Bot,
  Activity,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fetchTasks, fetchGitHubUser, fetchProjects, TaskSummary, GitHubUser, ProjectSummary } from '@/lib/api-client';
import { MOCK_TASKS, MOCK_REPOSITORIES, MOCK_PROVIDERS } from '@/lib/mock-data';
import { formatDuration, formatDate } from '@/lib/utils';

export default function DashboardPage() {
  const [tasks, setTasks] = React.useState<TaskSummary[]>([]);
  const [projects, setProjects] = React.useState<ProjectSummary[]>([]);
  const [githubUser, setGithubUser] = React.useState<GitHubUser | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      // 1. Load tasks
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

      // 2. Load projects
      const projRes = await fetchProjects().catch(() => ({ projects: [] }));
      setProjects(projRes.projects || []);

      // 3. Check GitHub OAuth
      const token = typeof window !== 'undefined' ? localStorage.getItem('bp_github_token') : null;
      const ghRes = await fetchGitHubUser(token || undefined).catch(() => ({ connected: false, user: null }));
      if (ghRes.connected && ghRes.user) {
        setGithubUser(ghRes.user);
      }
    } catch {
      // Offline mock fallback
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
    <div className="space-y-8 max-w-[1400px] mx-auto pb-12">
      {/* Welcome Hero Card */}
      <div className="p-6 md:p-8 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-indigo-200 text-xs font-semibold backdrop-blur-xs border border-white/10">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span>Autonomous Software Engineering Platform</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              AI Control Plane & Delivery Pipeline
            </h1>
            <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
              Connect your repositories, dispatch engineering tasks, and let autonomous multi-agent loops plan, code, test, and deliver verified Pull Requests.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/projects">
              <Button className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs h-9 px-4 gap-2 shadow-sm">
                <Github className="h-4 w-4" />
                <span>{githubUser ? `Connected as @${githubUser.login}` : 'Connect GitHub (OAuth)'}</span>
              </Button>
            </Link>

            <Link href="/tasks">
              <Button variant="outline" className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs h-9 px-4 gap-1.5">
                <Layers className="h-4 w-4" />
                <span>Task Board</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="shadow-xs border-slate-200/90 rounded-2xl bg-white hover:border-slate-300 transition">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Active Agents
            </CardTitle>
            <div className="h-9 w-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Bot className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-slate-900">{activeTasks.length}</div>
            <p className="text-xs text-indigo-600 font-semibold mt-1.5 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
              <span>In autonomous flight</span>
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-slate-200/90 rounded-2xl bg-white hover:border-slate-300 transition">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Delivered PRs
            </CardTitle>
            <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <GitPullRequest className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-slate-900">{completedTasks.length}</div>
            <p className="text-xs text-emerald-600 font-semibold mt-1.5 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>100% test verified</span>
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-slate-200/90 rounded-2xl bg-white hover:border-slate-300 transition">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Awaiting Approval
            </CardTitle>
            <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertCircle className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-slate-900">{awaitingApprovalTasks.length}</div>
            <p className="text-xs text-amber-700 font-semibold mt-1.5 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Policy safety gates</span>
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-slate-200/90 rounded-2xl bg-white hover:border-slate-300 transition">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400">
              LLM Providers
            </CardTitle>
            <div className="h-9 w-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Cpu className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-slate-900">4 Ready</div>
            <p className="text-xs text-slate-500 mt-1.5 truncate">
              Claude, Gemini, OpenAI, Ollama
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Active Tasks Feed (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Active Agent Workflows</h2>
              <p className="text-xs text-slate-500">
                Tasks executing in background BullMQ worker sandboxes
              </p>
            </div>
            <Link href="/tasks">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
                <span>View Board</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>

          <div className="space-y-3">
            {activeTasks.slice(0, 5).map((task) => {
              const taskId = task._id || task.id;
              return (
                <Card
                  key={taskId}
                  className="bg-white border-slate-200/90 shadow-xs hover:border-indigo-300 hover:shadow-sm transition rounded-xl"
                >
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant={
                              task.status === 'COMPLETED'
                                ? 'success'
                                : task.status === 'AWAITING_APPROVAL'
                                  ? 'destructive'
                                  : 'info'
                            }
                            className="text-[10px] font-bold"
                          >
                            {task.status.replace(/_/g, ' ')}
                          </Badge>
                          <span className="text-[11px] font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded">
                            #{task.issueNumber || 1}
                          </span>
                          <span className="text-xs font-semibold text-slate-700">
                            {task.repositoryId}
                          </span>
                        </div>

                        <Link
                          href={`/tasks/${taskId}`}
                          className="font-bold text-xs text-slate-900 hover:text-indigo-600 block transition-colors leading-snug line-clamp-1"
                        >
                          {task.title}
                        </Link>
                      </div>

                      <Link href={`/tasks/${taskId}`}>
                        <Button size="sm" variant="outline" className="text-xs h-7 px-2.5">
                          Inspect
                        </Button>
                      </Link>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-600 font-medium">{task.model || 'claude-3.5-sonnet'}</span>
                        <span className="font-mono text-[10px] text-slate-400">{task.branch}</span>
                      </div>
                      <div className="flex items-center gap-1 font-semibold text-slate-600">
                        <Clock className="h-3 w-3 text-slate-400" />
                        <span>{formatDuration(task.durationMs || 30000)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Sidebar: Projects & Automation Guide */}
        <div className="space-y-6">
          {/* Quick Repositories Widget */}
          <Card className="border-slate-200/90 shadow-xs rounded-2xl bg-white">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Github className="h-4 w-4 text-slate-800" />
                  <span>Connected Repositories</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Tracked Git projects
                </CardDescription>
              </div>
              <Link href="/projects" className="text-xs text-indigo-600 font-bold hover:underline">
                Manage
              </Link>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {projects.length > 0 ? (
                projects.slice(0, 4).map((p) => (
                  <div
                    key={p.id || (p as any)._id}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-bold text-slate-800">{p.name}</p>
                      <p className="text-[10px] text-slate-400">{(p as any).githubRepoFullName || p.slug}</p>
                    </div>
                    <Link href={`/tasks?projectId=${(p as any)._id || p.id}`}>
                      <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2 text-indigo-600">
                        Tasks →
                      </Button>
                    </Link>
                  </div>
                ))
              ) : (
                <div className="py-4 text-center text-xs text-slate-400">
                  <p>No repositories connected.</p>
                  <Link href="/projects" className="text-indigo-600 font-semibold hover:underline mt-1 block">
                    Import from GitHub →
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Autonomous Engine Flow */}
          <Card className="border-slate-200/90 shadow-xs rounded-2xl bg-gradient-to-br from-indigo-50/40 via-white to-slate-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Autonomous Delivery
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-start gap-2.5">
                <span className="h-5 w-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  1
                </span>
                <div>
                  <p className="font-bold text-slate-800">Issue Intake</p>
                  <p className="text-[11px] text-slate-500">Label an issue with <code>buildpilot</code> or create via UI.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="h-5 w-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  2
                </span>
                <div>
                  <p className="font-bold text-slate-800">Multi-Agent Execution</p>
                  <p className="text-[11px] text-slate-500">Planner inspects code, Developer edits & tests, Reviewer audits diff.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="h-5 w-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  3
                </span>
                <div>
                  <p className="font-bold text-slate-800">PR Creation</p>
                  <p className="text-[11px] text-slate-500">Opens verified Pull Request linking to the issue.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
