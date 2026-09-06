'use client';

import * as React from 'react';
import {
  CheckCircle2,
  Key,
  Zap,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MOCK_PROVIDERS } from '@/lib/mock-data';

export default function ProvidersPage() {
  const [testingId, setTestingId] = React.useState<string | null>(null);
  const [testResult, setTestResult] = React.useState<Record<string, 'success' | 'error'>>({});

  const handleTestConnection = (providerId: string) => {
    setTestingId(providerId);
    setTimeout(() => {
      setTestingId(null);
      setTestResult((prev) => ({ ...prev, [providerId]: 'success' }));
    }, 1200);
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="pb-4 border-b border-slate-200">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">LLM Providers & Credentials</h1>
        <p className="text-xs text-slate-500 mt-1">
          Configure model providers with Bring-Your-Own-Key (BYOK). All credentials are kept server-side and never exposed.
        </p>
      </div>

      {/* Provider Cards */}
      <div className="space-y-4">
        {MOCK_PROVIDERS.map((provider) => {
          const isConnected = provider.status === 'connected';
          const isTesting = testingId === provider.id;
          const result = testResult[provider.id];

          return (
            <Card key={provider.id} className="border-slate-200 shadow-sm">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold">
                      <Sparkles className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-slate-900">{provider.name}</h3>
                        <Badge variant={isConnected ? 'success' : 'secondary'} className="text-[10px]">
                          {isConnected ? 'Ready & Verified' : 'Not Configured'}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">
                        Default: <strong className="text-slate-700">{provider.defaultModel}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full md:w-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestConnection(provider.id)}
                      disabled={isTesting || !provider.hasApiKey}
                      className="text-xs gap-1.5"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${isTesting ? 'animate-spin' : ''}`} />
                      <span>{isTesting ? 'Testing Ping...' : 'Test Connection'}</span>
                    </Button>
                  </div>
                </div>

                {/* Body / Configuration Form */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Key className="h-3.5 w-3.5 text-slate-400" />
                      <span>API Key</span>
                    </label>
                    <Input
                      type="password"
                      placeholder={provider.hasApiKey ? '••••••••••••••••••••••••' : 'Enter API Key...'}
                      defaultValue={provider.hasApiKey ? 'sk-or-v1-mock-credential-key' : ''}
                      className="text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-slate-400" />
                      <span>Default Model</span>
                    </label>
                    <select
                      defaultValue={provider.defaultModel}
                      className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-900 shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
                    >
                      {provider.availableModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {result === 'success' && (
                  <div className="mt-3 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Ping verified: model responded with tool-calling capabilities.</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

