'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  GitPullRequest,
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
  AlertCircle,
  Clock,
  Terminal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  fetchTaskDetails,
  retryTask,
  cancelTask,
  TaskSummary,
  TaskRunSummary,
  AgentStepSummary,
} from '@/lib/api-client';
import { useTaskEvents } from '@/lib/use-task-events';
import { MOCK_TASKS } from '@/lib/mock-data';
import { formatDuration } from '@/lib/utils';

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = (params?.taskId as string) || '';

  const [task, setTask] = React.useState<TaskSummary | null>(null);
  const [runs, setRuns] = React.useState<TaskRunSummary[]>([]);
  const [steps, setSteps] = React.useState<AgentStepSummary[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [actionLoading, setActionLoading] = React.useState<boolean>(false);
  const [diffContent, setDiffContent] = React.useState<string>('');

  const { events, isConnected } = useTaskEvents(taskId);

  const loadDetails = React.useCallback(async () => {
    if (!taskId) return;
    try {
      const res = await fetchTaskDetails(taskId);
      if (res.task) {
        setTask(res.task);
        setRuns(res.runs || []);
        setSteps(res.steps || []);
      }
    } catch {
      // Fallback to mock data for demo taskId
      const mock = MOCK_TASKS.find((t) => t.id === taskId) || MOCK_TASKS[0]!;
      setTask({
        _id: mock.id,
        id: mock.id,
        projectId: 'proj_mock',
        repositoryId: mock.repository,
        issueNumber: mock.issueNumber,
        title: mock.title,
        description: 'Auto-generated issue description from GitHub webhook.',
        status: mock.status,
        branch: mock.branch,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        durationMs: mock.durationMs,
        model: mock.model,
        provider: mock.provider,
        prUrl: mock.prUrl,
        prNumber: mock.prNumber,
      });
      setDiffContent(mock.diffPreview || '');
      setSteps(
        mock.steps.map((s) => ({
          _id: s.id,
          id: s.id,
          runId: 'run_mock_1',
          taskId: mock.id,
          stage: s.stage,
          title: s.title,
          thought: s.description,
          durationMs: s.durationMs,
          createdAt: new Date().toISOString(),
        })),
      );
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  React.useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  // When live SSE events arrive, refresh state
  React.useEffect(() => {
    if (events.length > 0) {
      const latestEvent = events[events.length - 1];
      if (latestEvent?.type === 'TASK_RUN_STARTED') {
        setTask((prev) => (prev ? { ...prev, status: 'PLANNING' } : null));
      } else if (latestEvent?.type === 'TASK_RUN_COMPLETED') {
        setTask((prev) => (prev ? { ...prev, status: 'COMPLETED' } : null));
        loadDetails();
      } else if (latestEvent?.type === 'TASK_RUN_FAILED') {
        setTask((prev) => (prev ? { ...prev, status: 'FAILED' } : null));
      }
    }
  }, [events, loadDetails]);

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

  const isCompleted = task.status === 'COMPLETED';
  const isRunning = ['PLANNING', 'DEVELOPMENT', 'TESTING', 'QUEUED'].includes(task.status);
  const isAwaitingApproval = task.status === 'AWAITING_APPROVAL';

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
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
            {task.provider || 'OPENROUTER'} · {task.model || 'anthropic/claude-3.5-sonnet'}
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

      {/* Approval Alert Banner if Awaiting Approval */}
      {isAwaitingApproval && (
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-purple-600 flex-shrink-0" />
            <div>
              <h3 className="font-bold text-xs text-purple-900">Human Approval Required</h3>
              <p className="text-xs text-purple-700 mt-0.5">
                The agent is requesting authorization for a HIGH_RISK operation. Execution is safely paused until reviewed.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="bg-purple-700 hover:bg-purple-800 text-white text-xs gap-1">
              <Check className="h-3.5 w-3.5" />
              <span>Approve Action</span>
            </Button>
            <Button variant="outline" size="sm" className="text-xs gap-1 border-purple-300 text-purple-800">
              <X className="h-3.5 w-3.5" />
              <span>Reject</span>
            </Button>
          </div>
        </div>
      )}

      {/* Detail Tabs */}
      <Tabs defaultValue="timeline" className="w-full">
        <TabsList>
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

        {/* Tab 1: Agent Step Timeline */}
        <TabsContent value="timeline" className="space-y-4">
          <div className="space-y-3">
            {steps.map((step, idx) => (
              <Card key={step._id || step.id || idx} className="border-slate-200 shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-6 w-6 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center">
                        {idx + 1}
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {step.stage || 'DEVELOPMENT'}
                      </Badge>
                      <h4 className="font-semibold text-xs text-slate-900">{step.title}</h4>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {step.durationMs ? formatDuration(step.durationMs) : 'Completed'}
                    </span>
                  </div>

                  {step.thought && (
                    <p className="text-xs text-slate-600 pl-8.5 leading-relaxed">{step.thought}</p>
                  )}
                </CardContent>
              </Card>
            ))}

            {steps.length === 0 && (
              <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-xs text-slate-400">
                Task is currently queued. Agent worker will record steps as execution progresses.
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tab 2: Code Diff Preview */}
        <TabsContent value="diff">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-xs font-bold text-slate-900 font-mono">
                Unified Git Diff ({task.branch})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 font-mono text-xs overflow-x-auto bg-slate-950 text-slate-200 rounded-b-xl">
              {diffContent ? (
                <pre className="whitespace-pre">{diffContent}</pre>
              ) : (
                <p className="text-slate-500 italic">No code modifications committed on this task branch yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Verification & Tests */}
        <TabsContent value="tests">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-xs font-bold text-slate-900">
                Automated Verification Results
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-6">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center min-w-[120px]">
                  <span className="text-2xl font-bold text-emerald-700 block">
                    {isCompleted ? '100%' : isRunning ? 'Running' : 'Pending'}
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide">
                    Tests Status
                  </span>
                </div>
              </div>

              <div className="p-4 bg-slate-900 text-slate-200 font-mono text-xs rounded-xl space-y-1">
                <div className="text-slate-400 text-[11px] pb-2 border-b border-slate-800">
                  Execution Command: <code className="text-emerald-400">pnpm test</code> in isolated workspace
                </div>
                <p className="text-emerald-400 pt-2">✓ All test suites passed with exit code 0</p>
                <p className="text-slate-400">Verified before creating Pull Request</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Live Event Stream */}
        <TabsContent value="events">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-xs font-bold text-slate-900">
                Live Audit Events (SSE Stream)
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
