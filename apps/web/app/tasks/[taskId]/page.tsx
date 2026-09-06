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
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MOCK_TASKS } from '@/lib/mock-data';
import { formatDuration } from '@/lib/utils';

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = params?.taskId as string;

  const task = MOCK_TASKS.find((t) => t.id === taskId) || MOCK_TASKS[0]!;

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
              <span className="font-mono text-xs text-slate-400 font-bold">#{task.issueNumber}</span>
              <Badge variant={task.status === 'COMPLETED' ? 'success' : task.status === 'AWAITING_APPROVAL' ? 'warning' : 'default'}>
                {task.status.replace(/_/g, ' ')}
              </Badge>
              <span className="text-xs text-slate-500 font-medium">· {task.repository}</span>
            </div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight mt-1">{task.title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {task.prUrl && (
            <a href={task.prUrl} target="_blank" rel="noreferrer">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs">
                <GitPullRequest className="h-4 w-4" />
                <span>View PR #{task.prNumber}</span>
                <ExternalLink className="h-3 w-3 ml-0.5 opacity-80" />
              </Button>
            </a>
          )}
          <Button variant="outline" size="sm" className="gap-1 text-xs">
            <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
            <span>Retry Run</span>
          </Button>
        </div>
      </div>

      {/* Task Meta Details Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 text-xs">
          <span className="text-slate-400 block mb-1">Git Branch</span>
          <span className="font-mono font-semibold text-slate-800 text-[11px] truncate block">
            {task.branch}
          </span>
        </div>
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 text-xs">
          <span className="text-slate-400 block mb-1">LLM Model</span>
          <span className="font-semibold text-slate-800 truncate block">
            {task.provider} · {task.model}
          </span>
        </div>
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 text-xs">
          <span className="text-slate-400 block mb-1">Total Duration</span>
          <span className="font-semibold text-slate-800">
            {task.durationMs ? formatDuration(task.durationMs) : 'Running...'}
          </span>
        </div>
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 text-xs">
          <span className="text-slate-400 block mb-1">Tokens & Cost</span>
          <span className="font-semibold text-slate-800">
            {task.tokenCount.toLocaleString()} tokens ({task.costEstimate})
          </span>
        </div>
      </div>

      {/* Approval Alert Banner if Awaiting Approval */}
      {task.status === 'AWAITING_APPROVAL' && (
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-purple-600 flex-shrink-0" />
            <div>
              <h3 className="font-bold text-xs text-purple-900">Human Approval Required</h3>
              <p className="text-xs text-purple-700 mt-0.5">
                The agent is attempting a HIGH_RISK operation. Execution is safely paused until reviewed.
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
            <span>Agent Steps ({task.steps.length})</span>
          </TabsTrigger>
          <TabsTrigger value="diff" className="gap-1.5">
            <FileCode className="h-3.5 w-3.5" />
            <span>Changed Files</span>
          </TabsTrigger>
          <TabsTrigger value="tests" className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Verification & Tests</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Agent Step Timeline */}
        <TabsContent value="timeline" className="space-y-4">
          <div className="space-y-3">
            {task.steps.map((step, idx) => (
              <Card key={step.id} className="border-slate-200 shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-6 w-6 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center">
                        {idx + 1}
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {step.stage}
                      </Badge>
                      <h4 className="font-semibold text-xs text-slate-900">{step.title}</h4>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {step.durationMs ? formatDuration(step.durationMs) : 'In Progress'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 pl-8.5">{step.description}</p>

                  {/* Tool Call Preview */}
                  {step.toolCall && (
                    <div className="ml-8.5 mt-2 bg-slate-900 text-slate-200 rounded-lg p-3 text-xs font-mono">
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-700 text-[11px] text-slate-400">
                        <span>Tool: <strong className="text-blue-400">{step.toolCall.name}</strong></span>
                        <span>Executed in Docker Sandbox</span>
                      </div>
                      <div className="mt-2 space-y-1 text-[11px]">
                        <div>
                          <span className="text-slate-500">Input: </span>
                          <span className="text-amber-300">{JSON.stringify(step.toolCall.input)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Output: </span>
                          <span className="text-emerald-300">{JSON.stringify(step.toolCall.output)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {task.steps.length === 0 && (
              <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-xs text-slate-400">
                Task is currently queued. Agent worker will begin initialization shortly.
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
              {task.diffPreview ? (
                <pre className="whitespace-pre">{task.diffPreview}</pre>
              ) : (
                <p className="text-slate-500 italic">No code modifications have been committed yet.</p>
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
                    {task.testSummary?.passed || 0}
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide">
                    Tests Passed
                  </span>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center min-w-[120px]">
                  <span className="text-2xl font-bold text-slate-700 block">
                    {task.testSummary?.failed || 0}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                    Failed
                  </span>
                </div>
              </div>

              <div className="p-4 bg-slate-900 text-slate-200 font-mono text-xs rounded-xl space-y-1">
                <div className="text-slate-400 text-[11px] pb-2 border-b border-slate-800">
                  Execution Command: <code className="text-emerald-400">pnpm test</code> in isolated container
                </div>
                <p className="text-emerald-400 pt-2">✓ src/calculator.test.ts (6 tests passed) [240ms]</p>
                <p className="text-slate-400">Test Files: 1 passed (1)</p>
                <p className="text-slate-400">Tests: 6 passed (6)</p>
                <p className="text-slate-400">Duration: 1.2s</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

