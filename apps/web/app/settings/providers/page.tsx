'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  Plus,
  Key,
  Zap,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  Edit3,
  X,
  Server,
  Check,
  ShieldCheck,
  Globe,
  Layers,
  Power,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  fetchProviders,
  saveProviderCredential,
  deleteProviderCredential,
  testProviderConnection,
  toggleProviderActive,
  ProviderConfigSummary,
} from '@/lib/api-client';

const PRESET_SUGGESTIONS: Record<string, string[]> = {
  OPENROUTER: [
    'anthropic/claude-3.5-sonnet',
    'deepseek/deepseek-r1',
    'openai/gpt-4o',
    'meta-llama/llama-3.3-70b-instruct',
    'qwen/qwen-2.5-coder-32b-instruct',
  ],
  OPENAI: [
    'gpt-4o',
    'gpt-4o-mini',
    'o1-mini',
    'o1-preview',
  ],
  GEMINI: [
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-2.0-flash-exp',
  ],
  ANTHROPIC: [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
  ],
  CUSTOM_OPENAI_COMPATIBLE: [
    'llama-3.3-70b-versatile',
    'mixtral-8x7b-32768',
    'codellama',
  ],
};

const PROVIDER_METADATA: Record<string, { name: string; description: string; defaultBaseUrl?: string }> = {
  OPENROUTER: {
    name: 'OpenRouter',
    description: 'Universal AI gateway for Claude 3.5 Sonnet, DeepSeek R1, Llama 3, and 100+ models.',
  },
  OPENAI: {
    name: 'OpenAI',
    description: 'Direct GPT-4o, GPT-4o-mini, and o1 reasoning models from OpenAI.',
  },
  GEMINI: {
    name: 'Google Gemini',
    description: 'High-performance Gemini 1.5 Pro & Gemini 1.5 Flash models from Google AI.',
  },
  ANTHROPIC: {
    name: 'Anthropic Claude',
    description: 'Direct Claude 3.5 Sonnet and Haiku models via Anthropic API.',
  },
  CUSTOM_OPENAI_COMPATIBLE: {
    name: 'Custom OpenAI-Compatible / Ollama / Groq',
    description: 'Connect any OpenAI-compatible API endpoint, local Ollama, Groq, or vLLM server.',
    defaultBaseUrl: 'http://localhost:11434/v1',
  },
};

export default function ProvidersPage() {
  const [providers, setProviders] = React.useState<ProviderConfigSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [pageMessage, setPageMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [mounted, setMounted] = React.useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [selectedProvider, setSelectedProvider] = React.useState('OPENROUTER');
  const [apiKeyInput, setApiKeyInput] = React.useState('');
  const [baseUrlInput, setBaseUrlInput] = React.useState('');
  const [customModelInput, setCustomModelInput] = React.useState('');
  const [modelList, setModelList] = React.useState<string[]>([]);
  const [defaultModel, setDefaultModel] = React.useState('');

  // Modal testing & saving state
  const [isTesting, setIsTesting] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [modalStatus, setModalStatus] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const loadProviders = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchProviders();
      setProviders(res.providers || []);
    } catch (err: any) {
      console.warn('Could not fetch providers:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  // Open modal for a new or existing provider
  const handleOpenModal = (providerId: string = 'OPENROUTER') => {
    const existing = providers.find((p) => p.id === providerId);
    setSelectedProvider(providerId);
    setApiKeyInput('');
    setBaseUrlInput(existing?.baseUrl || PROVIDER_METADATA[providerId]?.defaultBaseUrl || '');
    setModalStatus(null);
    setCustomModelInput('');

    if (existing && existing.availableModels && existing.availableModels.length > 0) {
      setModelList([...existing.availableModels]);
      setDefaultModel(existing.defaultModel || existing.availableModels[0] || '');
    } else {
      // For OpenRouter, start completely clean so user adds their own models
      if (providerId === 'OPENROUTER') {
        setModelList([]);
        setDefaultModel('');
      } else {
        const presets = PRESET_SUGGESTIONS[providerId] || [];
        setModelList([...presets]);
        setDefaultModel(presets[0] || '');
      }
    }

    setIsModalOpen(true);
  };

  const handleProviderChange = (newProvider: string) => {
    setSelectedProvider(newProvider);
    setModalStatus(null);
    setBaseUrlInput(PROVIDER_METADATA[newProvider]?.defaultBaseUrl || '');
    const existing = providers.find((p) => p.id === newProvider);
    if (existing && existing.availableModels && existing.availableModels.length > 0) {
      setModelList([...existing.availableModels]);
      setDefaultModel(existing.defaultModel || existing.availableModels[0] || '');
    } else {
      if (newProvider === 'OPENROUTER') {
        setModelList([]);
        setDefaultModel('');
      } else {
        const presets = PRESET_SUGGESTIONS[newProvider] || [];
        setModelList([...presets]);
        setDefaultModel(presets[0] || '');
      }
    }
  };

  const handleAddModel = (modelName: string) => {
    const clean = modelName.trim();
    if (!clean) return;
    if (modelList.includes(clean)) {
      setCustomModelInput('');
      return;
    }
    const updated = [...modelList, clean];
    setModelList(updated);
    if (!defaultModel || !updated.includes(defaultModel)) {
      setDefaultModel(clean);
    }
    setCustomModelInput('');
  };

  const handleRemoveModel = (modelToRemove: string) => {
    const updated = modelList.filter((m) => m !== modelToRemove);
    setModelList(updated);
    if (defaultModel === modelToRemove) {
      setDefaultModel(updated[0] || '');
    }
  };

  const handleTestConnectionInModal = async () => {
    const key = apiKeyInput.trim();
    const existing = providers.find((p) => p.id === selectedProvider);

    if (!key && !existing?.hasApiKey) {
      setModalStatus({
        type: 'error',
        message: 'Please enter an API Key to test connection.',
      });
      return;
    }

    setIsTesting(true);
    setModalStatus(null);

    try {
      const res = await testProviderConnection({
        provider: selectedProvider,
        apiKey: key || undefined,
        defaultModel: defaultModel || modelList[0] || 'default',
        baseUrl: baseUrlInput.trim() || undefined,
      });

      setModalStatus({
        type: 'success',
        message: res.message || 'Connection test passed! Provider responded successfully.',
      });
    } catch (err: any) {
      setModalStatus({
        type: 'error',
        message: err.message || 'Connection test failed. Please check API key.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveModal = async () => {
    const key = apiKeyInput.trim();
    const existing = providers.find((p) => p.id === selectedProvider);

    if (!key && !existing?.hasApiKey) {
      setModalStatus({
        type: 'error',
        message: 'API Key is required to configure this provider.',
      });
      return;
    }

    if (modelList.length === 0) {
      setModalStatus({
        type: 'error',
        message: 'Please add at least one model name for this provider.',
      });
      return;
    }

    setIsSaving(true);
    setModalStatus(null);

    try {
      await saveProviderCredential({
        provider: selectedProvider,
        apiKey: key || 'UNCHANGED',
        defaultModel: defaultModel || modelList[0] || 'default',
        availableModels: modelList,
        baseUrl: baseUrlInput.trim() || undefined,
      });

      setPageMessage({
        type: 'success',
        text: `Successfully configured ${PROVIDER_METADATA[selectedProvider]?.name || selectedProvider}!`,
      });
      setIsModalOpen(false);
      await loadProviders();
    } catch (err: any) {
      setModalStatus({
        type: 'error',
        message: err.message || 'Failed to save provider credential.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (providerId: string, currentActive: boolean) => {
    try {
      const targetState = !currentActive;
      await toggleProviderActive(providerId, targetState);
      setPageMessage({
        type: 'success',
        text: `${PROVIDER_METADATA[providerId]?.name || providerId} is now ${targetState ? 'ACTIVE' : 'INACTIVE'}.`,
      });
      await loadProviders();
    } catch (err: any) {
      setPageMessage({ type: 'error', text: err.message || 'Failed to toggle status.' });
    }
  };

  const handleDeleteProvider = async (providerId: string) => {
    if (!confirm(`Are you sure you want to remove credentials for ${providerId}?`)) return;
    try {
      await deleteProviderCredential(providerId);
      setPageMessage({ type: 'success', text: `Removed credentials for ${providerId}.` });
      await loadProviders();
    } catch (err: any) {
      setPageMessage({ type: 'error', text: err.message || 'Failed to delete provider.' });
    }
  };

  // Only show providers that have actually been configured by the user
  const configuredProviders = providers.filter((p) => p.hasApiKey);

  // Modal JSX (portal to document.body so backdrop covers 100% of the viewport)
  const modalContent = isModalOpen && mounted ? createPortal(
    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 space-y-4 border border-slate-200 max-h-[90vh] overflow-y-auto relative animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-slate-900 text-white flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {providers.find((p) => p.id === selectedProvider)?.hasApiKey
                  ? `Edit ${PROVIDER_METADATA[selectedProvider]?.name || selectedProvider}`
                  : 'Add LLM Provider'}
              </h3>
              <p className="text-xs text-slate-500">
                Configure API key and add custom models by text.
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsModalOpen(false)}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Provider Selection */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5 text-indigo-600" />
            <span>AI Provider</span>
          </label>
          <select
            value={selectedProvider}
            onChange={(e) => handleProviderChange(e.target.value)}
            className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs text-slate-900 shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
          >
            <option value="OPENROUTER">OpenRouter (Claude 3.5 Sonnet, DeepSeek R1, Llama 3, Qwen, etc.)</option>
            <option value="OPENAI">OpenAI (Direct GPT-4o, GPT-4o-mini, o1)</option>
            <option value="GEMINI">Google Gemini (Gemini 1.5 Pro & Flash)</option>
            <option value="ANTHROPIC">Anthropic Claude (Direct Sonnet & Haiku)</option>
            <option value="CUSTOM_OPENAI_COMPATIBLE">Custom OpenAI-Compatible / Local Ollama / Groq</option>
          </select>
        </div>

        {/* API Key Input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5 text-indigo-600" />
              <span>API Key *</span>
            </label>
            {providers.find((p) => p.id === selectedProvider)?.maskedApiKey && (
              <span className="text-[10px] font-mono text-slate-400">
                Saved: {providers.find((p) => p.id === selectedProvider)?.maskedApiKey}
              </span>
            )}
          </div>
          <Input
            type="password"
            placeholder={
              providers.find((p) => p.id === selectedProvider)?.hasApiKey
                ? '•••••••••••••••• (leave blank to keep current key)'
                : 'Paste API Key (e.g. sk-or-v1-..., sk-..., AIzaSy...)'
            }
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            className="text-xs font-mono rounded-xl"
          />
        </div>

        {/* Optional Base URL */}
        {(selectedProvider === 'CUSTOM_OPENAI_COMPATIBLE' || baseUrlInput) && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-indigo-600" />
              <span>Base URL (Optional)</span>
            </label>
            <Input
              type="text"
              placeholder="e.g. http://localhost:11434/v1 or https://api.groq.com/openai/v1"
              value={baseUrlInput}
              onChange={(e) => setBaseUrlInput(e.target.value)}
              className="text-xs font-mono rounded-xl"
            />
          </div>
        )}

        {/* Models Configuration */}
        <div className="space-y-2.5 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              <span>Custom Models (Add models by typing text)</span>
            </label>
            <span className="text-[10px] text-slate-400">Click a tag to set Default</span>
          </div>

          {/* Text input to add custom model */}
          <div className="flex items-center gap-2">
            <Input
              type="text"
              placeholder="Type model name (e.g. deepseek/deepseek-r1, anthropic/claude-3.5-sonnet)..."
              value={customModelInput}
              onChange={(e) => setCustomModelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddModel(customModelInput);
                }
              }}
              className="text-xs font-mono rounded-xl flex-1"
            />
            <Button
              type="button"
              size="sm"
              onClick={() => handleAddModel(customModelInput)}
              disabled={!customModelInput.trim()}
              className="text-xs bg-slate-900 hover:bg-slate-800 text-white px-3 font-semibold rounded-xl h-9"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              <span>Add</span>
            </Button>
          </div>

          {/* Quick presets suggestions */}
          {PRESET_SUGGESTIONS[selectedProvider] && (
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 font-medium">Quick Suggestions (Click to Add):</span>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_SUGGESTIONS[selectedProvider]!.filter((s) => !modelList.includes(s)).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleAddModel(preset)}
                    className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 border border-slate-200 transition flex items-center gap-1"
                  >
                    <Plus className="h-2.5 w-2.5 text-slate-400" />
                    <span>{preset}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Configured Models List Chips */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
              Configured Models ({modelList.length}):
            </span>
            
            {modelList.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">
                No models added yet. Type a model name above (e.g. <code>anthropic/claude-3.5-sonnet</code>) and click Add.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {modelList.map((m) => {
                  const isDefault = defaultModel === m;
                  return (
                    <div
                      key={m}
                      onClick={() => setDefaultModel(m)}
                      className={`group cursor-pointer px-2.5 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 transition border ${
                        isDefault
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs font-bold'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      <span>{m}</span>
                      {isDefault && (
                        <span className="text-[9px] uppercase bg-white/20 px-1 py-0.2 rounded text-white font-sans font-bold">
                          Default
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveModel(m);
                        }}
                        className={`p-0.5 rounded hover:bg-black/10 ${isDefault ? 'text-white' : 'text-slate-400 hover:text-red-600'}`}
                        title="Remove model"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Status / Alerts */}
        {modalStatus && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 font-medium ${
              modalStatus.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {modalStatus.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
            )}
            <span>{modalStatus.message}</span>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestConnectionInModal}
            disabled={isTesting}
            className="text-xs gap-1.5 h-9 bg-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${isTesting ? 'animate-spin text-indigo-600' : ''}`} />
            <span>{isTesting ? 'Testing...' : 'Test Connection'}</span>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsModalOpen(false)}
              className="text-xs h-9"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveModal}
              disabled={isSaving}
              className="text-xs bg-slate-900 hover:bg-slate-800 text-white gap-1.5 h-9 px-4 font-semibold rounded-xl"
            >
              {isSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              <span>{isSaving ? 'Saving...' : 'Save Provider'}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-indigo-600" />
            LLM Providers & Credentials
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Configure model providers with Bring-Your-Own-Key (BYOK). Credentials are encrypted with AES-256 and used for autonomous task execution.
          </p>
        </div>

        <Button
          onClick={() => handleOpenModal('OPENROUTER')}
          className="gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs h-9 px-4 rounded-xl shadow-xs"
        >
          <Plus className="h-4 w-4 text-amber-300" />
          <span>Add LLM Provider</span>
        </Button>
      </div>

      {/* Global Alerts */}
      {pageMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between font-medium ${
            pageMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {pageMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600" />
            )}
            <span>{pageMessage.text}</span>
          </div>
          <button onClick={() => setPageMessage(null)} className="font-bold text-slate-400 hover:text-slate-700">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main Section */}
      {loading ? (
        <div className="py-20 text-center text-xs text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-600" />
          <span>Loading provider credentials...</span>
        </div>
      ) : configuredProviders.length === 0 ? (
        /* Clean Empty State when no provider configured yet */
        <div className="text-center py-16 px-6 bg-white rounded-2xl border border-dashed border-slate-300 shadow-xs max-w-2xl mx-auto space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto shadow-xs">
            <Sparkles className="h-8 w-8" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-slate-900">No LLM Providers Configured Yet</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              BuildPilot requires an active AI provider key to run autonomous tasks, write code, and verify tests. Click below to configure your OpenRouter, OpenAI, Google Gemini, or Anthropic key.
            </p>
          </div>

          <div className="pt-2">
            <Button
              onClick={() => handleOpenModal('OPENROUTER')}
              className="gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs h-10 px-5 rounded-xl shadow-sm"
            >
              <Plus className="h-4 w-4 text-amber-300" />
              <span>Add Your First LLM Provider</span>
            </Button>
          </div>

          <div className="pt-6 border-t border-slate-100 flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" />
              AES-256 Encrypted
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              Custom Text Models
            </span>
            <span className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-slate-500" />
              Active / Inactive Gating
            </span>
          </div>
        </div>
      ) : (
        /* Configured Providers Cards List (ONLY configured ones) */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Active Configured Providers ({configuredProviders.length})
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {configuredProviders.map((provider) => {
              const meta = PROVIDER_METADATA[provider.id] || { name: provider.name, description: provider.description };
              const isActive = provider.isActive !== false;

              return (
                <Card
                  key={provider.id}
                  className={`border rounded-2xl shadow-xs transition bg-white ${
                    isActive ? 'border-indigo-200 ring-1 ring-indigo-50' : 'border-slate-200 opacity-75 bg-slate-50/50'
                  }`}
                >
                  <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                    <div className="space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`h-9 w-9 rounded-xl flex items-center justify-center font-bold ${
                              isActive ? 'bg-indigo-600 text-white' : 'bg-slate-300 text-slate-600'
                            }`}
                          >
                            <Sparkles className="h-4 w-4" />
                          </div>
                          <div>
                            <h3 className="font-bold text-sm text-slate-900">{meta.name}</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge
                                variant={isActive ? 'success' : 'secondary'}
                                className="text-[10px] font-bold"
                              >
                                {isActive ? '✓ Active & Available' : 'Inactive (Disabled)'}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {/* Active / Inactive Toggle */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleActive(provider.id, isActive)}
                            className={`h-7 px-2.5 text-xs font-semibold gap-1.5 rounded-lg border ${
                              isActive
                                ? 'text-emerald-700 bg-emerald-50/60 border-emerald-200 hover:bg-emerald-100'
                                : 'text-slate-600 bg-slate-100 border-slate-200 hover:bg-slate-200'
                            }`}
                            title={isActive ? 'Click to deactivate provider' : 'Click to activate provider'}
                          >
                            <Power className={`h-3 w-3 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                            <span>{isActive ? 'Active' : 'Inactive'}</span>
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenModal(provider.id)}
                            className="h-7 px-2 text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                            title="Edit provider & models"
                          >
                            <Edit3 className="h-3.5 w-3.5 mr-1" />
                            <span>Edit</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteProvider(provider.id)}
                            className="h-7 px-2 text-xs text-red-600 hover:text-red-800 hover:bg-red-50"
                            title="Delete credentials"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      <p className="text-xs text-slate-500 leading-relaxed">{meta.description}</p>

                      {/* Config Details */}
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2 text-xs">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400 font-medium">API Key:</span>
                          <span className="font-mono text-slate-700 font-semibold">{provider.maskedApiKey}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400 font-medium">Default Model:</span>
                          <span className="font-bold text-indigo-700 font-mono bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                            {provider.defaultModel}
                          </span>
                        </div>
                        
                        {/* Models Chips */}
                        <div className="pt-1.5 border-t border-slate-200/60">
                          <span className="text-[10px] text-slate-400 block mb-1 font-medium">
                            Configured Models ({provider.availableModels.length}):
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {provider.availableModels.map((m) => (
                              <span
                                key={m}
                                className="text-[10px] font-mono px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-200"
                              >
                                {m}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenModal(provider.id)}
                        className="w-full text-xs font-semibold gap-1.5 h-8 bg-white border-slate-200 hover:border-indigo-300"
                      >
                        <Edit3 className="h-3.5 w-3.5 text-slate-500" />
                        <span>Manage Keys & Custom Models</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Render Modal via Portal to document.body */}
      {modalContent}
    </div>
  );
}
