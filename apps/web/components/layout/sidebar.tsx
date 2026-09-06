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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    {
      name: 'Overview',
      href: '/dashboard',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      name: 'Task Board',
      href: '/tasks',
      icon: KanbanSquare,
      badge: '4 Active',
    },
    {
      name: 'Projects & Repos',
      href: '/projects',
      icon: FolderGit2,
      badge: '3 Repos',
    },
    {
      name: 'LLM Providers',
      href: '/settings/providers',
      icon: Sliders,
      badge: '3 Ready',
    },
  ];

  return (
    <aside className="w-64 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col h-screen select-none">
      {/* Brand Header */}
      <div className="h-16 px-6 flex items-center gap-3 border-b border-slate-200">
        <div className="h-9 w-9 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-lg shadow-sm">
          <Bot className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <span className="font-bold text-slate-900 tracking-tight text-base block leading-none">
            BuildPilot
          </span>
          <span className="text-[11px] font-medium text-slate-500 tracking-wide uppercase mt-0.5 block">
            Control Plane
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-1.5 flex-1 overflow-y-auto">
        <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Core Workflows
        </div>
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group',
                isActive
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={cn(
                    'h-4 w-4 transition-colors',
                    isActive ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-600',
                  )}
                />
                <span>{item.name}</span>
              </div>
              {item.badge && (
                <span
                  className={cn(
                    'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                    isActive ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600',
                  )}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}

        <div className="pt-6 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          System Engine
        </div>
        <div className="px-3 py-2 text-xs text-slate-600 space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-emerald-500 animate-pulse" />
              Worker Queue
            </span>
            <Badge variant="success" className="text-[10px] px-1.5 py-0">
              Active
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <GitBranch className="h-3.5 w-3.5 text-blue-500" />
              Git Sandbox
            </span>
            <Badge variant="info" className="text-[10px] px-1.5 py-0">
              Docker
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-purple-500" />
              Policy Gates
            </span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              Enforced
            </Badge>
          </div>
        </div>
      </nav>

      {/* Footer Profile / Version */}
      <div className="p-4 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between bg-slate-50/50">
        <div>
          <p className="font-semibold text-slate-700">Self-Hosted</p>
          <p className="text-[11px] text-slate-400">BuildPilot v0.1.0</p>
        </div>
        <div className="h-2 w-2 rounded-full bg-emerald-500" title="Connected to Control API" />
      </div>
    </aside>
  );
}

