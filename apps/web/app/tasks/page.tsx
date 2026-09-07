'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Kanban,
  Table as TableIcon,
  Search,
  RefreshCw,
  AlertCircle,
  Clock,
  ExternalLink,
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
import { fetchTasks, TaskSummary } from '@/lib/api-client';
import { MOCK_TASKS } from '@/lib/mock-data';
import { formatDuration } from '@/lib/utils';

export default function TasksPage() {
  const [viewMode, setViewMode] = React.useState<'kanban' | 'table'>('kanban');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');
  const [tasks, setTasks] = React.useState<TaskSummary[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [isUsingFallback, setIsUsingFallback] = React.useState<boolean>(false);
  const [page, setPage] = React.useState<number>(1);
  const [totalPages, setTotalPages] = React.useState<number>(1);

  const loadTasks = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchTasks({
        search: searchQuery || undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        page,
        limit: 50,
      });

      if (res.tasks && res.tasks.length > 0) {
        setTasks(res.tasks);
        setTotalPages(res.totalPages || 1);
        setIsUsingFallback(false);
      } else {
        // If live DB is empty, use mock fallback so UI demonstrates all states
        setTasks(
          MOCK_TASKS.map((m) => ({
            _id: m.id,
            id: m.id,
            projectId: 'proj_mock',
            repositoryId: m.repository,
            issueNumber: m.issueNumber,
            title: m.title,
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
        setIsUsingFallback(true);
      }
    } catch {
      // Offline fallback
      setTasks(
        MOCK_TASKS.map((m) => ({
          _id: m.id,
          id: m.id,
          projectId: 'proj_mock',
          repositoryId: m.repository,
          issueNumber: m.issueNumber,
          title: m.title,
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
      setIsUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, page]);

  React.useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.repositoryId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.issueNumber?.toString().includes(searchQuery);

    const matchesStatus = statusFilter === 'ALL' || task.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const columns = [
    { key: 'QUEUED', label: 'Queued', color: 'bg-slate-100 text-slate-700' },
    { key: 'PLANNING', label: 'Planning', color: 'bg-blue-50 text-blue-700' },
    { key: 'DEVELOPMENT', label: 'Development', color: 'bg-indigo-50 text-indigo-700' },
    { key: 'TESTING', label: 'Testing', color: 'bg-amber-50 text-amber-700' },
    { key: 'AWAITING_APPROVAL', label: 'Approval', color: 'bg-purple-50 text-purple-700' },
    { key: 'COMPLETED', label: 'Completed', color: 'bg-emerald-50 text-emerald-700' },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Autonomous Task Board</h1>
            {isUsingFallback && (
              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 bg-amber-50">
                Demo Fixture Data
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Real-time pipeline tracking GitHub issues through execution, verification, and PR delivery
          </p>
        </div>

        {/* View Toggle & Refresh */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadTasks()}
            disabled={loading}
            className="h-8 text-xs gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-500' : 'text-slate-500'}`} />
            <span>Refresh</span>
          </Button>

          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'kanban'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Kanban className="h-3.5 w-3.5" />
              <span>Board</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-sm'
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
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by title, repo, or #issue..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          {['ALL', 'QUEUED', 'PLANNING', 'DEVELOPMENT', 'TESTING', 'AWAITING_APPROVAL', 'COMPLETED'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === status
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {status === 'ALL' ? 'All Tasks' : status.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* View: Kanban Board */}
      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-start">
          {columns.map((col) => {
            const tasksInColumn = filteredTasks.filter((t) => t.status === col.key);

            return (
              <div key={col.key} className="bg-slate-100/75 rounded-xl p-3 border border-slate-200/80 min-h-[500px] flex flex-col">
                {/* Column Header */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${col.color}`}>
                      {col.label}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                    {tasksInColumn.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="space-y-3 flex-1">
                  {tasksInColumn.map((task) => {
                    const taskId = task._id || task.id;
                    return (
                      <Link key={taskId} href={`/tasks/${taskId}`}>
                        <Card className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer bg-white border-slate-200">
                          <CardContent className="p-3.5 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-mono font-semibold text-slate-400">
                                #{task.issueNumber || 1}
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium truncate max-w-[120px]">
                                {task.repositoryId?.split('/')[1] || task.repositoryId || 'repo'}
                              </span>
                            </div>

                            <h3 className="font-semibold text-xs text-slate-900 leading-snug line-clamp-2 hover:text-blue-600 transition-colors">
                              {task.title}
                            </h3>

                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                              <span className="truncate max-w-[90px]">{task.model?.split('/')[1] || task.model || 'claude-3.5-sonnet'}</span>
                              <span className="font-medium text-slate-600">
                                {task.durationMs ? formatDuration(task.durationMs) : '0s'}
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}

                  {tasksInColumn.length === 0 && (
                    <div className="h-28 rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-400">
                      Empty
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* View: Table */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Issue</TableHead>
                <TableHead>Task Title & Repository</TableHead>
                <TableHead className="w-36">Status</TableHead>
                <TableHead className="w-40">Model / Provider</TableHead>
                <TableHead className="w-28">Runtime</TableHead>
                <TableHead className="w-24 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTasks.map((task) => {
                const taskId = task._id || task.id;
                return (
                  <TableRow key={taskId}>
                    <TableCell className="font-mono font-bold text-xs text-slate-500">
                      #{task.issueNumber || 1}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/tasks/${taskId}`}
                        className="font-semibold text-slate-900 hover:text-blue-600 transition-colors block text-xs"
                      >
                        {task.title}
                      </Link>
                      <span className="text-[11px] text-slate-400">{task.repositoryId} · {task.branch}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={task.status === 'COMPLETED' ? 'success' : task.status === 'AWAITING_APPROVAL' ? 'warning' : 'default'}>
                        {task.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 font-mono">
                      {task.model || 'anthropic/claude-3.5-sonnet'}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 font-medium">
                      {task.durationMs ? formatDuration(task.durationMs) : '0s'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/tasks/${taskId}`}>
                        <Button variant="outline" size="sm" className="text-xs h-7 px-2">
                          Inspect
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
