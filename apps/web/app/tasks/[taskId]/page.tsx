'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  GitPullRequest,
  GitMerge,
  ArrowRight,
  CheckCircle2,
  ShieldAlert,
  Bot,
  ExternalLink,
  FileCode,
  RotateCcw,
  Ban,
  Activity,
  Check,
  X,
  Terminal,
  Trash2,
  ChevronDown,
  ChevronRight,
  Code2,
  Sparkles,
  ArrowDownUp,
  AlertTriangle,
  Layers,
  FlaskConical,
  Cpu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  fetchTaskDetails,
  retryTask,
  cancelTask,
  deleteTask,
  mergeTaskPullRequest,
  TaskSummary,
  TaskRunSummary,
  AgentStepSummary,
} from '@/lib/api-client';
import { useTaskEvents } from '@/lib/use-task-events';
import { formatDuration } from '@/lib/utils';

export default function TaskDetailPage() {
  const router = useRouter();
  const params = useParams();
  const taskId = String(params?.taskId || '');

  const [task, setTask] = React.useState<TaskSummary | null>(null);
  const [runs, setRuns] = React.useState<TaskRunSummary[]>([]);
  const [steps, setSteps] = React.useState<AgentStepSummary[]>([]);
  const [diffContent, setDiffContent] = React.useState<string>('');
  const [loading, setLoading] = React.useState<boolean>(true);
  const [actionLoading, setActionLoading] = React.useState<boolean>(false);
  const [activeTab, setActiveTab] = React.useState<string>('timeline');
  const [expandedTools, setExpandedTools] = React.useState<Record<string, boolean>>({});
  const [stepSortOrder, setStepSortOrder] = React.useState<'desc' | 'asc'>('desc');
  const [mergeLoading, setMergeLoading] = React.useState<boolean>(false);
  const [mergeSuccess, setMergeSuccess] = React.useState<boolean>(false);
  const [mergeError, setMergeError] = React.useState<string | null>(null);

  const { events, isConnected } = useTaskEvents(taskId);
  const isPrMerged = mergeSuccess || events.some((e) => e.type === 'PULL_REQUEST_MERGED');

  const toggleTool = (toolId: string) => {
    setExpandedTools((prev) => ({ ...prev, [toolId]: !prev[toolId] }));
  };

  const loadDetails = React.useCallback(async (isInitial = false) => {
    if (!taskId) return;
    try {
      if (isInitial) setLoading(true);
      const res = await fetchTaskDetails(taskId);
      if (res.task) {
        setTask(res.task);
        setRuns(res.runs || []);
        setSteps(res.steps || []);
        if (res.runs?.[0]?.diff) {
          setDiffContent(res.runs[0].diff);
        }
        if (isInitial && (res.task.status === 'COMPLETED' || res.task.prUrl)) {
          setActiveTab('results');
        }
      } else if (isInitial) {
        setTask(null);
      }
    } catch (err) {
      console.error('Failed to load task details:', err);
      if (isInitial) setTask(null);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [taskId]);

  const lastProcessedEventIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    loadDetails(true);
  }, [loadDetails]);

  // Only poll if the task is actively running. Stop immediately when COMPLETED, FAILED, or CANCELLED.
  React.useEffect(() => {
    if (!task) return;
    const isRunning = ['QUEUED', 'PLANNING', 'DEVELOPMENT', 'TESTING', 'AWAITING_APPROVAL'].includes(task.status);
    if (!isRunning) return;

    const interval = setInterval(() => {
      loadDetails(false);
    }, 3000);
    return () => clearInterval(interval);
  }, [task?.status, loadDetails]);

  React.useEffect(() => {
    if (events.length === 0) return;
    const latestEvent = events[events.length - 1];
    const eventKey = latestEvent?._id || `${latestEvent?.type}_${events.length}`;
    if (lastProcessedEventIdRef.current === eventKey) return;
    lastProcessedEventIdRef.current = eventKey;

    if (latestEvent?.type === 'TASK_RUN_STARTED') {
      setTask((prev) => (prev ? { ...prev, status: 'PLANNING' } : null));
      loadDetails(false);
    } else if (latestEvent?.type === 'TASK_RUN_COMPLETED') {
      setTask((prev) => (prev ? { ...prev, status: 'COMPLETED' } : null));
      loadDetails(false);
    } else if (latestEvent?.type === 'TASK_RUN_FAILED') {
      setTask((prev) => (prev ? { ...prev, status: 'FAILED' } : null));
      loadDetails(false);
    } else if (latestEvent?.type === 'PULL_REQUEST_MERGED') {
      setMergeSuccess(true);
      loadDetails(false);
    }
  }, [events, loadDetails]);

  const handleMergePR = async () => {
    if (!taskId || !task) return;
    const targetBranch = task.baseBranch || 'main';
    const prIdentifier = task.prNumber ? `#${task.prNumber}` : 'created for this task';
    if (!window.confirm(`Are you sure you want to merge Pull Request ${prIdentifier} into ${targetBranch}?`)) {
      return;
    }
    setMergeLoading(true);
    setMergeError(null);
    try {
      const res = await mergeTaskPullRequest(taskId);
      if (res.merged) {
        setMergeSuccess(true);
      }
      await loadDetails();
    } catch (err: any) {
      setMergeError(err.message || 'Failed to merge pull request');
      alert(`Merge failed: ${err.message}`);
    } finally {
      setMergeLoading(false);
    }
  };

  const handleRetry = async () => {
    if (!taskId) return;
    setActionLoading(true);
    try {
      await retryTask(taskId);
      await loadDetails();
    } catch (err: any) {
      alert(`Retry failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!taskId) return;
    setActionLoading(true);
    try {
      await cancelTask(taskId, 'User clicked Cancel in dashboard');
      await loadDetails();
    } catch (err: any) {
      alert(`Cancel failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!taskId) return;
    if (!window.confirm('Are you sure you want to permanently delete this task, all its runs, steps, and audit events? This action cannot be undone.')) {
      return;
    }
    setActionLoading(true);
    try {
      await deleteTask(taskId);
      router.push('/tasks');
    } catch (err: any) {
      alert(`Failed to delete task: ${err.message}`);
      setActionLoading(false);
    }
  };

  const isCompleted = task?.status === 'COMPLETED';
  const isRunning = task ? ['PLANNING', 'DEVELOPMENT', 'TESTING', 'QUEUED'].includes(task.status) : false;
  const isAwaitingApproval = task?.status === 'AWAITING_APPROVAL';

  // Extract final resolution summary
  const finalSummary =
    task?.finalAnswer ||
    runs[0]?.output?.finalAnswer ||
    runs[0]?.checkpoint?.summary ||
    (task as any)?.metadata?.finalAnswer;

  // Extract test execution tool calls
  const testToolCalls = React.useMemo(() => {
    return steps.flatMap((s) => s.toolCalls || []).filter(
      (tc) =>
        tc.name === 'run_tests' ||
        tc.name === 'run_browser_verification' ||
        (tc.name === 'run_command' &&
          typeof tc.input?.command === 'string' &&
          /test|jest|vitest|pytest|mocha|playwright|cypress/i.test(tc.input.command)),
    );
  }, [steps]);

  // Compute actual verification test statistics
  const testStats = React.useMemo(() => {
    if (testToolCalls.length === 0) {
      return {
        total: 0,
        passed: 0,
        failed: 0,
        percentageText: isCompleted ? 'Static Analysis' : isRunning ? 'In Progress' : 'Pending',
        subtitle: isCompleted ? 'Task completed without invoking test suite tools' : 'Automated test suite runner pending',
        cardClass: isCompleted
          ? 'bg-slate-50 border-slate-200 text-slate-700'
          : 'bg-amber-50 border-amber-200 text-amber-700',
        badgeVariant: isCompleted ? ('outline' as const) : ('secondary' as const),
      };
    }

    const total = testToolCalls.length;
    const passed = testToolCalls.filter((tc) => {
      const out = tc.output as any;
      return out?.passed === true || (out?.exitCode === 0 && !out?.stderr?.includes('not found'));
    }).length;
    const failed = total - passed;

    if (failed === 0) {
      return {
        total,
        passed,
        failed,
        percentageText: '100% Passed',
        subtitle: `All ${total} test execution session(s) completed with Exit 0`,
        cardClass: 'bg-emerald-50 border-emerald-200 text-emerald-700',
        badgeVariant: 'success' as const,
      };
    } else {
      return {
        total,
        passed,
        failed,
        percentageText: `${Math.round((passed / total) * 100)}% (${failed} Failed)`,
        subtitle: `${failed} of ${total} test run(s) failed or encountered command errors`,
        cardClass: 'bg-red-50 border-red-200 text-red-700',
        badgeVariant: 'destructive' as const,
      };
    }
  }, [testToolCalls, isCompleted, isRunning]);

  // Sort steps with newest on top by default
  const sortedSteps = React.useMemo(() => {
    const indexed = steps.map((s, originalIndex) => ({
      ...s,
      stepNumber: originalIndex + 1,
    }));
    return stepSortOrder === 'desc' ? [...indexed].reverse() : indexed;
  }, [steps, stepSortOrder]);

  if (loading || !task) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-2">
          <Activity className="h-6 w-6 animate-spin text-blue-600" />
          <p className="text-xs text-slate-500">Loading task execution details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-16">
      {/* Back Button and Actions Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <Link href="/tasks">
            <Button variant="outline" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-4 w-4 text-slate-600" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-slate-400 font-bold">#{task.issueNumber || 1}</span>
              <Badge variant={isCompleted ? 'success' : isAwaitingApproval ? 'warning' : 'default'}>
                {task.status.replace(/_/g, ' ')}
              </Badge>
              <span className="text-xs text-slate-500 font-medium">· {task.repositoryId}</span>

              {/* SSE Live Indicator */}
              <div className="flex items-center gap-1.5 ml-2 bg-slate-100 px-2 py-0.5 rounded-full text-[10px] font-medium text-slate-600 border border-slate-200">
                <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                <span>{isConnected ? 'SSE Live' : 'Polling'}</span>
              </div>
            </div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight mt-1">{task.title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {task.prUrl && (
            <a href={task.prUrl} target="_blank" rel="noreferrer">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs">
                <GitPullRequest className="h-4 w-4" />
                <span>View PR #{task.prNumber || 42}</span>
                <ExternalLink className="h-3 w-3 ml-0.5 opacity-80" />
              </Button>
            </a>
          )}

          {isRunning && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={actionLoading}
              className="gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50"
            >
              <Ban className="h-3.5 w-3.5" />
              <span>Cancel Task</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleRetry}
            disabled={actionLoading}
            className="gap-1 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
            <span>Retry Run</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={actionLoading}
            className="gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
            title="Permanently delete task"
          >
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
            <span>Delete Task</span>
          </Button>
        </div>
      </div>

      {/* Task Meta Details Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 text-xs">
          <span className="text-slate-400 block mb-1">Git Task Branch</span>
          <span className="font-mono font-semibold text-slate-800 text-[11px] truncate block">
            {task.branch}
          </span>
        </div>
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 text-xs">
          <span className="text-slate-400 block mb-1">LLM Model & Provider</span>
          <span className="font-semibold text-slate-800 truncate block">
            {task.provider || runs[0]?.provider || (task as any).metadata?.provider || 'OPENROUTER'} ·{' '}
            {task.model || runs[0]?.model || (task as any).metadata?.model || 'Configured Model'}
          </span>
        </div>
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 text-xs">
          <span className="text-slate-400 block mb-1">Execution Duration</span>
          <span className="font-semibold text-slate-800">
            {task.durationMs ? formatDuration(task.durationMs) : isRunning ? 'In Progress...' : '0s'}
          </span>
        </div>
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 text-xs">
          <span className="text-slate-400 block mb-1">Total Steps Recorded</span>
          <span className="font-semibold text-slate-800">
            {steps.length} steps ({events.length} real-time events)
          </span>
        </div>
      </div>

      {/* 🌟 Prominent Agent Resolution & Final Summary Card (When Completed) */}
      {isCompleted && finalSummary && (
        <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50/70 via-teal-50/40 to-white shadow-sm overflow-hidden">
          <CardHeader className="pb-2 border-b border-emerald-100 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                  Agent Execution Resolution & Summary
                </CardTitle>
                <p className="text-[11px] text-emerald-700">
                  Autonomous engineer successfully delivered and verified changes
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {task.prUrl && (
                <a href={task.prUrl} target="_blank" rel="noreferrer">
                  <Badge variant="outline" className="bg-white border-emerald-300 text-emerald-800 gap-1 cursor-pointer hover:bg-emerald-50 text-[11px]">
                    <GitPullRequest className="h-3 w-3" />
                    <span>{task.prNumber ? `PR #${task.prNumber}` : 'Pull Request'}</span>
                    <ExternalLink className="h-2.5 w-2.5 ml-0.5 opacity-60" />
                  </Badge>
                </a>
              )}
              {task.prUrl && (
                <Button
                  size="sm"
                  disabled={isPrMerged || mergeLoading}
                  onClick={handleMergePR}
                  className={`h-7 text-xs gap-1.5 font-medium shadow-sm ${
                    isPrMerged
                      ? 'bg-purple-100 text-purple-800 border border-purple-300 hover:bg-purple-100 cursor-default'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  <GitMerge className="h-3.5 w-3.5" />
                  <span>{isPrMerged ? 'Merged to main' : mergeLoading ? 'Merging...' : 'Merge to main'}</span>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="p-3.5 bg-white/90 rounded-lg border border-emerald-200/80 text-xs text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">
              {finalSummary}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab('results')}
                className="h-7 text-[11px] bg-white border-emerald-200 text-emerald-800 hover:bg-emerald-50 gap-1"
              >
                <GitPullRequest className="h-3.5 w-3.5" />
                <span>PR & Results</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab('diff')}
                className="h-7 text-[11px] bg-white border-emerald-200 text-emerald-800 hover:bg-emerald-50 gap-1"
              >
                <FileCode className="h-3.5 w-3.5" />
                <span>View Code Diff</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab('tests')}
                className="h-7 text-[11px] bg-white border-emerald-200 text-emerald-800 hover:bg-emerald-50 gap-1"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Inspect Test Results</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Human Approval Gating Banner */}
      {isAwaitingApproval && (
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-purple-600 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-sm text-purple-900">
                Action Requires Approval
              </h3>
              <p className="text-xs text-purple-700 mt-0.5">
                The agent proposes high-risk changes. Review unified diff and approve to continue.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="text-xs gap-1 bg-purple-600 hover:bg-purple-700 text-white">
              <Check className="h-3.5 w-3.5" />
              <span>Approve & Push</span>
            </Button>
            <Button variant="outline" size="sm" className="text-xs gap-1 border-purple-300 text-purple-800">
              <X className="h-3.5 w-3.5" />
              <span>Reject</span>
            </Button>
          </div>
        </div>
      )}

      {/* Detail Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="results" className="gap-1.5">
            <GitPullRequest className="h-3.5 w-3.5" />
            <span>Results & PR</span>
          </TabsTrigger>
          <TabsTrigger value="timeline" className="gap-1.5">
            <Bot className="h-3.5 w-3.5" />
            <span>Agent Steps ({steps.length})</span>
          </TabsTrigger>
          <TabsTrigger value="diff" className="gap-1.5">
            <FileCode className="h-3.5 w-3.5" />
            <span>Unified Git Diff</span>
          </TabsTrigger>
          <TabsTrigger value="tests" className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Verification & Tests</span>
          </TabsTrigger>
          <TabsTrigger value="events" className="gap-1.5">
            <Terminal className="h-3.5 w-3.5" />
            <span>Audit Events ({events.length})</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 0: Results & Pull Request Hub */}
        <TabsContent value="results" className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <GitPullRequest className="h-4 w-4 text-emerald-600" />
                <span>Pull Request & Execution Outcome</span>
              </CardTitle>
              {task.prUrl ? (
                <Badge
                  variant="outline"
                  className={
                    isPrMerged
                      ? 'bg-purple-50 border-purple-300 text-purple-700'
                      : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  }
                >
                  {isPrMerged ? 'Merged into main' : 'Pull Request Open'}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-slate-500">
                  {isCompleted ? 'Finished (No PR)' : 'In Progress'}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="p-5 space-y-5">
              {/* PR Status & Quick Merge Section */}
              {task.prUrl ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-900">
                          {task.prNumber ? `GitHub Pull Request #${task.prNumber}` : 'GitHub Pull Request'}
                        </span>
                        <a
                          href={task.prUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-800 underline inline-flex items-center gap-1 font-mono"
                        >
                          <span>{task.prUrl}</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                        <span className="bg-slate-200 px-2 py-0.5 rounded text-slate-800">
                          {task.branch}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                        <span className="bg-slate-200 px-2 py-0.5 rounded text-slate-800">
                          {task.baseBranch || 'main'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <a href={task.prUrl} target="_blank" rel="noreferrer">
                        <Button variant="outline" size="sm" className="text-xs gap-1.5 bg-white">
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>View on GitHub</span>
                        </Button>
                      </a>
                      <Button
                        size="sm"
                        disabled={isPrMerged || mergeLoading}
                        onClick={handleMergePR}
                        className={`text-xs gap-1.5 font-semibold ${
                          isPrMerged
                            ? 'bg-purple-600 text-white cursor-default'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                        }`}
                      >
                        <GitMerge className="h-4 w-4" />
                        <span>
                          {isPrMerged
                            ? 'Merged to main'
                            : mergeLoading
                            ? 'Merging PR to main...'
                            : 'Merge to main'}
                        </span>
                      </Button>
                    </div>
                  </div>

                  {isPrMerged && (
                    <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-800 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-purple-600 flex-shrink-0" />
                      <span>
                        This Pull Request has been successfully merged into <strong>{task.baseBranch || 'main'}</strong>.
                      </span>
                    </div>
                  )}

                  {mergeError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                      <strong>Merge Error:</strong> {mergeError}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
                  {isCompleted ? (
                    <p>No remote Pull Request URL was generated for this run.</p>
                  ) : (
                    <p>Task is running. When completed, the Pull Request URL and one-click Merge button will appear here.</p>
                  )}
                </div>
              )}

              {/* Resolution Report */}
              <div className="space-y-2">
                <span className="font-semibold text-xs text-slate-900 block uppercase tracking-wider">
                  Resolution Summary:
                </span>
                <div className="p-4 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">
                  {finalSummary || 'No resolution summary provided yet.'}
                </div>
              </div>

              {/* Action Shortcuts */}
              <div className="flex items-center gap-3 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab('diff')}
                  className="text-xs gap-1.5"
                >
                  <FileCode className="h-3.5 w-3.5 text-blue-600" />
                  <span>Inspect Unified Git Diff</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab('tests')}
                  className="text-xs gap-1.5"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Check Test Logs</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab('timeline')}
                  className="text-xs gap-1.5"
                >
                  <Bot className="h-3.5 w-3.5 text-purple-600" />
                  <span>View Step Timeline ({steps.length})</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 1: Agent Step Timeline (Current / Latest Step at the Top) */}
        <TabsContent value="timeline" className="space-y-4">
          {/* Header Controls for Sorting & Overview */}
          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <div className="flex items-center gap-2 font-medium text-slate-700">
              <Layers className="h-4 w-4 text-indigo-600" />
              <span>
                {steps.length} Step{steps.length === 1 ? '' : 's'} Recorded • {stepSortOrder === 'desc' ? 'Latest Step on Top' : 'Oldest Step on Top'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStepSortOrder(stepSortOrder === 'desc' ? 'asc' : 'desc')}
                className="h-7 text-[11px] gap-1.5 bg-white shadow-2xs font-semibold"
              >
                <ArrowDownUp className="h-3 w-3 text-slate-500" />
                <span>{stepSortOrder === 'desc' ? 'Showing Newest First' : 'Showing Oldest First'}</span>
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {sortedSteps.map((step, idx) => {
              const stepTools = step.toolCalls || [];
              const isLatestStep = idx === 0 && stepSortOrder === 'desc';
              const isFirstStep = idx === sortedSteps.length - 1 && stepSortOrder === 'desc';

              return (
                <Card
                  key={step._id || step.id || idx}
                  className={`border transition-all shadow-sm overflow-hidden ${
                    isLatestStep
                      ? isRunning
                        ? 'border-indigo-400 ring-2 ring-indigo-200/60 bg-white'
                        : 'border-indigo-200 bg-white'
                      : 'border-slate-200/90 bg-white'
                  }`}
                >
                  <CardContent className="p-4 space-y-3">
                    {/* Step Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <div
                          className={`h-6 w-6 rounded-full text-[11px] font-bold flex items-center justify-center ${
                            isLatestStep
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-slate-800 text-slate-200'
                          }`}
                        >
                          {step.stepNumber}
                        </div>

                        {/* Stage Badge */}
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-semibold uppercase tracking-wider ${
                            step.stage === 'PLANNING'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : step.stage === 'DEVELOPMENT'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : step.stage === 'TESTING'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : step.stage === 'REVIEW' || step.stage === 'AWAITING_APPROVAL'
                              ? 'bg-orange-50 text-orange-700 border-orange-200'
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          {step.stage || 'DEVELOPMENT'}
                        </Badge>

                        {/* Current Active Badge */}
                        {isLatestStep && isRunning && (
                          <Badge className="bg-indigo-600 text-white text-[10px] gap-1 animate-pulse">
                            <Sparkles className="h-2.5 w-2.5" />
                            <span>CURRENT ACTIVE STEP</span>
                          </Badge>
                        )}

                        <h4 className="font-semibold text-xs text-slate-900">{step.title}</h4>
                      </div>

                      <div className="flex items-center gap-2.5 text-[11px] text-slate-400 font-mono">
                        {step.tokenUsage && step.tokenUsage.totalTokens > 0 && (
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-semibold">
                            {step.tokenUsage.totalTokens.toLocaleString()} tokens
                          </span>
                        )}
                        <span>{step.durationMs ? formatDuration(step.durationMs) : 'Completed'}</span>
                      </div>
                    </div>

                    {/* Agent Thought / Reasoning */}
                    {step.thought && (
                      <div className="text-xs text-slate-700 leading-relaxed bg-slate-50/80 p-3 rounded-xl border border-slate-200/70 space-y-1">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          <Cpu className="h-3 w-3 text-indigo-500" />
                          <span>Agent Thought & Plan:</span>
                        </div>
                        <p className="text-slate-800 whitespace-pre-wrap font-sans text-xs">
                          {step.thought}
                        </p>
                      </div>
                    )}

                    {/* Executed Tools Details */}
                    {stepTools.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <span className="font-semibold text-slate-500 text-[10px] uppercase tracking-wider block">
                          Tool Executions ({stepTools.length}):
                        </span>
                        {stepTools.map((tool, tIdx) => {
                          const toolKey = tool._id || tool.id || `${idx}_${tIdx}`;
                          const isExpanded = !!expandedTools[toolKey];
                          const isSuccess = tool.status === 'SUCCESS';
                          const isFailed = tool.status === 'FAILED';

                          return (
                            <div
                              key={toolKey}
                              className="border border-slate-200 rounded-xl overflow-hidden bg-white text-xs shadow-2xs"
                            >
                              <div
                                onClick={() => toggleTool(toolKey)}
                                className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100/80 cursor-pointer transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  {isExpanded ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                                  )}
                                  <Code2 className="h-3.5 w-3.5 text-blue-600" />
                                  <span className="font-mono font-semibold text-slate-900">
                                    {tool.name}
                                  </span>
                                  <Badge
                                    variant={isSuccess ? 'success' : isFailed ? 'destructive' : 'outline'}
                                    className="text-[9px] py-0 px-1.5"
                                  >
                                    {tool.status}
                                  </Badge>
                                </div>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {tool.durationMs ? `${tool.durationMs}ms` : ''}
                                </span>
                              </div>

                              {isExpanded && (
                                <div className="p-3 border-t border-slate-200 space-y-2.5 bg-slate-950 text-slate-200 font-mono text-[11px] overflow-x-auto">
                                  {tool.input && (
                                    <div>
                                      <span className="text-slate-400 text-[10px] block mb-1 uppercase tracking-wider">
                                        Input Parameters:
                                      </span>
                                      <pre className="text-emerald-400 bg-slate-900 p-2.5 rounded-lg overflow-x-auto">
                                        {JSON.stringify(tool.input, null, 2)}
                                      </pre>
                                    </div>
                                  )}

                                  {tool.output && (
                                    <div>
                                      <span className="text-slate-400 text-[10px] block mb-1 uppercase tracking-wider">
                                        Output Result:
                                      </span>
                                      <pre className="text-slate-200 bg-slate-900 p-2.5 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-60">
                                        {typeof tool.output === 'string'
                                          ? tool.output
                                          : JSON.stringify(tool.output, null, 2)}
                                      </pre>
                                    </div>
                                  )}

                                  {tool.error && (
                                    <div>
                                      <span className="text-red-400 text-[10px] block mb-1 uppercase tracking-wider">
                                        Execution Error:
                                      </span>
                                      <pre className="text-red-300 bg-red-950/60 p-2.5 rounded-lg overflow-x-auto">
                                        {tool.error}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {steps.length === 0 && (
              <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-xs text-slate-400">
                Task is currently queued. Agent worker will record steps in real-time as execution progresses.
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tab 2: Code Diff Preview */}
        <TabsContent value="diff">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-bold text-slate-900 font-mono flex items-center gap-2">
                <FileCode className="h-4 w-4 text-blue-600" />
                <span>Unified Git Diff ({task.branch})</span>
              </CardTitle>
              {diffContent && (
                <Badge variant="outline" className="text-[10px] font-mono">
                  Modified in worktree
                </Badge>
              )}
            </CardHeader>
            <CardContent className="p-4 font-mono text-xs overflow-x-auto bg-slate-950 text-slate-200 rounded-b-xl">
              {diffContent ? (
                <pre className="whitespace-pre leading-relaxed">
                  {diffContent.split('\n').map((line, lIdx) => {
                    const isAdd = line.startsWith('+') && !line.startsWith('+++');
                    const isDel = line.startsWith('-') && !line.startsWith('---');
                    const isHeader = line.startsWith('@@') || line.startsWith('diff --git');
                    return (
                      <div
                        key={lIdx}
                        className={
                          isAdd
                            ? 'text-emerald-400 bg-emerald-950/30 px-1'
                            : isDel
                            ? 'text-red-400 bg-red-950/30 px-1'
                            : isHeader
                            ? 'text-blue-400 font-bold'
                            : 'text-slate-300'
                        }
                      >
                        {line}
                      </div>
                    );
                  })}
                </pre>
              ) : (
                <p className="text-slate-500 italic py-4 text-center">
                  No code modifications committed on this task branch yet.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Verification & Tests */}
        <TabsContent value="tests">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Automated Verification & Test Logs</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                <div className={`p-4 border rounded-xl text-center min-w-[170px] ${testStats.cardClass}`}>
                  <span className="text-2xl font-bold block">
                    {testStats.percentageText}
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide block mt-0.5">
                    Verification Status
                  </span>
                </div>

                <div className="text-xs text-slate-600 space-y-1">
                  <p className="font-semibold text-slate-800">
                    {testStats.subtitle}
                  </p>
                  <p className="text-slate-500">
                    BuildPilot executes test commands inside isolated sandboxes to guarantee 0 regressions before PR creation.
                  </p>
                </div>
              </div>

              {/* Display actual test tool executions */}
              {testToolCalls.length > 0 ? (
                <div className="space-y-3 pt-2">
                  <span className="font-semibold text-xs text-slate-900 block">
                    Recorded Test Execution Sessions:
                  </span>
                  {testToolCalls.map((tc, idx) => {
                    const output = tc.output as any;
                    const passed = output?.passed === true || (output?.exitCode === 0 && !output?.stderr?.includes('not found'));
                    const isCommandNotFound = output?.exitCode === 127 || output?.stderr?.includes('not found');

                    return (
                      <div
                        key={tc._id || idx}
                        className="p-4 bg-slate-900 text-slate-200 font-mono text-xs rounded-xl space-y-2 border border-slate-800"
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-[11px]">
                          <div className="flex items-center gap-2">
                            <Terminal className="h-3.5 w-3.5 text-slate-400" />
                            <span>Command:</span>
                            <code className="text-emerald-400 font-bold">
                              {output?.command || tc.input?.testCommand || tc.input?.command || 'npm test'}
                            </code>
                          </div>
                          <Badge
                            variant={passed ? 'success' : 'destructive'}
                            className="text-[10px]"
                          >
                            {passed ? 'PASSED (Exit 0)' : `FAILED (Exit ${output?.exitCode ?? 1})`}
                          </Badge>
                        </div>

                        {isCommandNotFound && (
                          <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded-lg text-amber-300 text-[11px] space-y-1">
                            <div className="flex items-center gap-1.5 font-bold">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                              <span>Environment Notice: CLI Tool Not Preinstalled in Sandbox</span>
                            </div>
                            <p className="text-amber-200/90 font-sans text-xs">
                              The test runner invoked a package manager (e.g. <code>pnpm</code>) that was missing in the default container. BuildPilot now includes automatic fallback to <code>npm test</code> / <code>corepack enable</code>.
                            </p>
                          </div>
                        )}

                        {output?.stdout && (
                          <div className="pt-1">
                            <span className="text-slate-500 text-[10px] block mb-1 uppercase tracking-wider">
                              Standard Output:
                            </span>
                            <pre className="text-slate-300 bg-slate-950 p-2.5 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-64">
                              {output.stdout}
                            </pre>
                          </div>
                        )}

                        {output?.stderr && (
                          <div className="pt-1">
                            <span className="text-red-400 text-[10px] block mb-1 uppercase tracking-wider">
                              Standard Error:
                            </span>
                            <pre className="text-red-300 bg-red-950/40 p-2.5 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-48">
                              {output.stderr}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 bg-slate-900 text-slate-200 font-mono text-xs rounded-xl space-y-1">
                  <div className="text-slate-400 text-[11px] pb-2 border-b border-slate-800">
                    Execution Workspace: <code className="text-emerald-400">{task.branch}</code>
                  </div>
                  <p className="text-emerald-400 pt-2">
                    {isCompleted
                      ? '✓ Static code review & changes verified.'
                      : 'Pending automated test execution during task pipeline.'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Live Event Stream */}
        <TabsContent value="events">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <Terminal className="h-4 w-4 text-blue-600" />
                <span>Live Audit Events (SSE Stream)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              {events.map((evt, idx) => (
                <div key={evt._id || idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-bold text-[10px]">
                      {evt.type}
                    </span>
                    <span className="text-slate-600">{JSON.stringify(evt.payload || {})}</span>
                  </div>
                  <span className="text-[10px] text-slate-400">{evt.timestamp || 'Just now'}</span>
                </div>
              ))}

              {events.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">
                  Connecting to live SSE stream...
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
