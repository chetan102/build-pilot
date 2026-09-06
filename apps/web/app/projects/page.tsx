'use client';

import * as React from 'react';
import {
  Github,
  Radio,
  Plus,
  ExternalLink,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MOCK_PROJECTS, MOCK_REPOSITORIES } from '@/lib/mock-data';
import { formatDate } from '@/lib/utils';

export default function ProjectsPage() {
  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Projects & Repositories</h1>
          <p className="text-xs text-slate-500">
            Configure tracked GitHub repositories, webhooks, and engineering workspace boundaries
          </p>
        </div>

        <Button size="sm" className="gap-1.5 text-xs bg-slate-900 text-white">
          <Plus className="h-3.5 w-3.5" />
          <span>Add Project</span>
        </Button>
      </div>

      {/* Projects Overview */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-slate-900 tracking-tight uppercase text-slate-500">
          Projects ({MOCK_PROJECTS.length})
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {MOCK_PROJECTS.map((project) => (
            <Card key={project.id} className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold text-slate-900">
                    {project.name}
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px]">
                    {project.repositoryCount} Repositories
                  </Badge>
                </div>
                <CardDescription className="text-xs text-slate-500">
                  {project.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="flex items-center justify-between text-xs text-slate-600 p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Active Tasks</span>
                    <span className="font-bold text-slate-800">{project.activeTaskCount}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Completed PRs</span>
                    <span className="font-bold text-slate-800">{project.completedTaskCount}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Created</span>
                    <span className="font-semibold text-slate-700">{formatDate(project.createdAt)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Connected GitHub Repositories */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-tight uppercase text-slate-500">
            Connected GitHub Repositories ({MOCK_REPOSITORIES.length})
          </h2>
          <a
            href="https://github.com/apps"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium"
          >
            <span>Configure GitHub App</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="space-y-3">
          {MOCK_REPOSITORIES.map((repo) => (
            <Card key={repo.id} className="border-slate-200 shadow-sm">
              <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Github className="h-4 w-4 text-slate-800" />
                    <h3 className="font-bold text-sm text-slate-900">{repo.fullName}</h3>
                    <Badge variant="success" className="text-[10px] gap-1">
                      <Radio className="h-2.5 w-2.5 animate-pulse" />
                      Webhook Listening
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>Default: <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px] text-slate-700">{repo.defaultBranch}</code></span>
                    <span>Installation: <code className="text-slate-400 text-[11px]">{repo.githubInstallationId}</code></span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <div className="text-right hidden sm:block">
                    <span className="text-slate-400 block text-[11px]">Total Runs</span>
                    <span className="font-bold text-slate-800">{repo.totalRuns}</span>
                  </div>
                  <Button variant="outline" size="sm" className="text-xs">
                    Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

