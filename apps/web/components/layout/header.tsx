'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Github, Radio, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Header() {
  const pathname = usePathname();

  const getPageTitle = (path: string | null) => {
    if (!path || path === '/' || path === '/dashboard') return 'Engineering Dashboard';
    if (path.startsWith('/tasks')) return 'Autonomous Task Backlog';
    if (path.startsWith('/projects')) return 'Projects & Repositories';
    if (path.startsWith('/settings/providers')) return 'AI Model Providers';
    return 'Control Plane';
  };

  return (
    <header className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Title & Live Stream Indicator */}
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold tracking-tight text-slate-900">
          {getPageTitle(pathname)}
        </h1>
        <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
          <Radio className="h-3 w-3 animate-pulse text-emerald-600" />
          <span>Live SSE Stream</span>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-3">
        <a
          href="https://github.com/chetan102/build-pilot"
          target="_blank"
          rel="noreferrer"
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <Github className="h-3.5 w-3.5" />
          <span>GitHub App Connected</span>
        </a>

        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>

        <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />

        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-slate-900 text-white font-semibold flex items-center justify-center text-xs">
            BP
          </div>
        </div>
      </div>
    </header>
  );
}

