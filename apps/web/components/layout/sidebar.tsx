'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  KanbanSquare,
  FolderGit2,
  Sliders,
  Bot,
  Activity,
  GitBranch,
  ShieldCheck,
  Github,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { fetchGitHubUser, GitHubUser } from '@/lib/api-client';

export function Sidebar() {
  const pathname = usePathname();
  const [githubUser, setGithubUser] = React.useState<GitHubUser | null>(null);

  React.useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('bp_github_token') : null;
    fetchGitHubUser(token || undefined)
      .then((res) => {
        if (res.connected && res.user) {
          setGithubUser(res.user);
        }
      })
      .catch(() => {});
  }, []);

  const navItems = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      name: 'Task Board',
      href: '/tasks',
      icon: KanbanSquare,
      badge: 'Live',
    },
    {
      name: 'Projects & Repos',
      href: '/projects',
      icon: FolderGit2,
      badge: githubUser ? 'OAuth' : null,
    },
    {
      name: 'LLM Providers',
      href: '/settings/providers',
      icon: Sliders,
      badge: null,
    },
  ];

  return (
    <aside className="w-64 flex-shrink-0 border-r border-slate-200/80 bg-white flex flex-col h-screen select-none shadow-[1px_0_10px_rgba(0,0,0,0.02)]">
      {/* Brand Header */}
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-100">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-slate-900 to-indigo-900 text-white flex items-center justify-center font-bold text-lg shadow-sm group-hover:scale-105 transition-transform">
            <Bot className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <span className="font-bold text-slate-900 tracking-tight text-sm block leading-none">
              BuildPilot
            </span>
            <span className="text-[10px] font-semibold text-indigo-600 tracking-wider uppercase mt-1 block">
              AI Autonomous Agent
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-1.5 flex-1 overflow-y-auto">
        <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Navigation
        </div>
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group',
                isActive
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900',
              )}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={cn(
                    'h-4 w-4 transition-colors',
                    isActive ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-700',
                  )}
                />
                <span>{item.name}</span>
              </div>
              {item.badge && (
                <span
                  className={cn(
                    'text-[10px] font-bold px-2 py-0.5 rounded-md',
                    isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600',
                  )}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}

        {/* Quick Launch Button */}
        <div className="pt-4 pb-2">
          <Link href="/projects">
            <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-50 via-indigo-50/40 to-white border border-indigo-100 hover:border-indigo-200 transition group cursor-pointer">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-950 mb-1">
                <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                <span>Quick Import</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                Select a repo from GitHub to start an AI agent task.
              </p>
            </div>
          </Link>
        </div>

        {/* System Engine Health */}
        <div className="pt-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Engine Runtime
        </div>
        <div className="px-3 py-2 text-xs text-slate-600 space-y-2.5 bg-slate-50/70 rounded-xl border border-slate-100">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[11px] font-medium text-slate-600">
              <Activity className="h-3.5 w-3.5 text-emerald-500 animate-pulse" />
              BullMQ Worker
            </span>
            <Badge variant="success" className="text-[9px] px-1.5 py-0 h-4">
              Running
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[11px] font-medium text-slate-600">
              <GitBranch className="h-3.5 w-3.5 text-indigo-500" />
              Worktrees
            </span>
            <Badge variant="info" className="text-[9px] px-1.5 py-0 h-4">
              Isolated
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[11px] font-medium text-slate-600">
              <ShieldCheck className="h-3.5 w-3.5 text-purple-500" />
              Policy Gating
            </span>
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
              Active
            </Badge>
          </div>
        </div>
      </nav>

      {/* GitHub Account or Setup status */}
      <div className="p-3.5 border-t border-slate-100 bg-slate-50/60">
        {githubUser ? (
          <div className="flex items-center gap-2.5">
            <img
              src={githubUser.avatarUrl}
              alt={githubUser.login}
              className="w-7 h-7 rounded-full ring-1 ring-slate-300"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-800 truncate">@{githubUser.login}</p>
              <p className="text-[10px] text-emerald-600 flex items-center gap-1 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                OAuth Connected
              </p>
            </div>
          </div>
        ) : (
          <Link
            href="/projects"
            className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-900 font-semibold"
          >
            <Github className="h-4 w-4 text-slate-500" />
            <span>Connect GitHub</span>
          </Link>
        )}
      </div>
    </aside>
  );
}
