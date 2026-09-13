'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  Github,
  Radio,
  Plus,
  ExternalLink,
  Search,
  CheckCircle2,
  Lock,
  Globe,
  Star,
  RefreshCw,
  Sparkles,
  ArrowRight,
  GitBranch,
  KeyRound,
  LogOut,
  Play,
  X,
  FolderGit2,
  ShieldCheck,
  Zap,
  AlertCircle,
  Settings,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  fetchProjects,
  fetchGitHubUser,
  fetchGitHubRepositories,
  fetchGitHubIssues,
  importGitHubRepository,
  createTaskForProject,
  verifyGitHubToken,
  fetchGitHubOAuthAuthorize,
  fetchProviders,
  GitHubRepoSummary,
  GitHubIssueSummary,
  GitHubUser,
  ProjectSummary,
  ProviderConfigSummary,
} from '@/lib/api-client';

export default function ProjectsPage() {
  const [mounted, setMounted] = React.useState(false);
  const [projects, setProjects] = React.useState<ProjectSummary[]>([]);
  const [loadingProjects, setLoadingProjects] = React.useState(true);
  const [projectSearch, setProjectSearch] = React.useState('');

  // GitHub Connection State
  const [githubUser, setGithubUser] = React.useState<GitHubUser | null>(null);
  const [githubToken, setGithubToken] = React.useState<string>('');
  const [repos, setRepos] = React.useState<GitHubRepoSummary[]>([]);
  const [loadingRepos, setLoadingRepos] = React.useState(false);
  const [repoSearch, setRepoSearch] = React.useState('');
  const [importingRepo, setImportingRepo] = React.useState<string | null>(null);
  const [connectingOAuth, setConnectingOAuth] = React.useState(false);

  // Global Alerts
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Modals
  const [showImportModal, setShowImportModal] = React.useState(false);
  const [showTokenModal, setShowTokenModal] = React.useState(false);
  const [tokenInput, setTokenInput] = React.useState('');
  const [verifyingToken, setVerifyingToken] = React.useState(false);

  // Providers & Task Launcher State
  const [providers, setProviders] = React.useState<ProviderConfigSummary[]>([]);
  const [loadingProviders, setLoadingProviders] = React.useState(false);
  const [selectedProjectForTask, setSelectedProjectForTask] = React.useState<ProjectSummary | null>(null);
  const [taskTitle, setTaskTitle] = React.useState('');
  const [taskDescription, setTaskDescription] = React.useState('');
  const [taskBranch, setTaskBranch] = React.useState('main');
  const [taskProvider, setTaskProvider] = React.useState('OPENROUTER');
  const [taskModel, setTaskModel] = React.useState('');
  const [creatingTask, setCreatingTask] = React.useState(false);
  const [projectIssues, setProjectIssues] = React.useState<GitHubIssueSummary[]>([]);
  const [loadingIssues, setLoadingIssues] = React.useState(false);
  const [selectedIssueNumber, setSelectedIssueNumber] = React.useState<number | null>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // 1. Initial Load & OAuth URL check
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('github_token');
      const urlUser = urlParams.get('github_user');
      const urlAvatar = urlParams.get('github_avatar');
      const urlError = urlParams.get('error');

      if (urlError) {
        if (urlError === 'missing_github_client_id' || urlError === 'oauth_not_configured') {
          setErrorMessage(
            'GitHub OAuth App is not configured yet in .env (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET). You can also connect with a Personal Access Token.',
          );
        } else {
          setErrorMessage(`GitHub OAuth Error: ${urlError}`);
        }
      }

      if (urlToken) {
        localStorage.setItem('bp_github_token', urlToken);
        setGithubToken(urlToken);
        if (urlUser) {
          setGithubUser({
            id: 0,
            login: urlUser,
            avatarUrl: urlAvatar || '',
            htmlUrl: `https://github.com/${urlUser}`,
          });
        }
        window.history.replaceState({}, document.title, window.location.pathname);
        setSuccessMessage(`Connected successfully to GitHub as @${urlUser || 'user'}!`);
      } else {
        const storedToken = localStorage.getItem('bp_github_token');
        if (storedToken) {
          setGithubToken(storedToken);
        }
      }
    }

    loadProjectsList();
    loadProvidersList();
  }, []);

  // 2. Load GitHub profile & repos when token is set
  React.useEffect(() => {
    if (githubToken) {
      loadGitHubData(githubToken);
    } else {
      checkServerGitHubConnection();
    }
  }, [githubToken]);

  // Sync default branch and fetch open GitHub issues when project is selected for task
  React.useEffect(() => {
    if (selectedProjectForTask) {
      setTaskBranch(selectedProjectForTask.defaultBranch || 'main');
      setTaskTitle('');
      setTaskDescription('');
      setSelectedIssueNumber(null);

      const repoFullName =
        (selectedProjectForTask as { githubRepoFullName?: string }).githubRepoFullName ||
        selectedProjectForTask.name;

      if (repoFullName && repoFullName.includes('/')) {
        const [owner, repo] = repoFullName.split('/');
        if (owner && repo) {
          setLoadingIssues(true);
          fetchGitHubIssues(owner, repo, githubToken)
            .then((res) => setProjectIssues(res.issues || []))
            .catch(() => setProjectIssues([]))
            .finally(() => setLoadingIssues(false));
        }
      } else {
        setProjectIssues([]);
      }
    } else {
      setProjectIssues([]);
      setSelectedIssueNumber(null);
    }
  }, [selectedProjectForTask, githubToken]);

  async function loadProjectsList() {
    try {
      setLoadingProjects(true);
      const data = await fetchProjects();
      setProjects(data.projects || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('Could not fetch projects list:', msg);
    } finally {
      setLoadingProjects(false);
    }
  }

  async function loadProvidersList() {
    try {
      setLoadingProviders(true);
      const res = await fetchProviders();
      const allProviders = res.providers || [];
      setProviders(allProviders);

      // Select first active provider with an API key by default
      const active = allProviders.filter((p) => p.hasApiKey && p.isActive !== false);
      if (active.length > 0) {
        setTaskProvider(active[0].id);
        const defaultM = active[0].defaultModel || active[0].availableModels?.[0] || '';
        setTaskModel(defaultM);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('Could not fetch providers:', msg);
    } finally {
      setLoadingProviders(false);
    }
  }

  async function checkServerGitHubConnection() {
    try {
      const res = await fetchGitHubUser();
      if (res.connected && res.user) {
        setGithubUser(res.user);
        loadReposList('');
      }
    } catch {
      // Not connected on server
    }
  }

  async function loadGitHubData(token: string) {
    try {
      setLoadingRepos(true);
      const userRes = await fetchGitHubUser(token);
      if (userRes.connected && userRes.user) {
        setGithubUser(userRes.user);
      }
      await loadReposList(token);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg || 'Failed to connect to GitHub');
    } finally {
      setLoadingRepos(false);
    }
  }

  async function loadReposList(token: string) {
    try {
      setLoadingRepos(true);
      const res = await fetchGitHubRepositories(token);
      setRepos(res.repositories || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('Could not list repos:', msg);
    } finally {
      setLoadingRepos(false);
    }
  }

  // Connect via Direct OAuth
  async function handleConnectOAuth() {
    try {
      setConnectingOAuth(true);
      setErrorMessage(null);
      const data = await fetchGitHubOAuthAuthorize();
      if (data.configured && data.url) {
        window.location.href = data.url;
        return;
      }
      if (!data.configured) {
        setErrorMessage(
          'GitHub OAuth App is not configured in .env (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET). Please add your GitHub OAuth App credentials or connect using your Personal Access Token.',
        );
      }
    } catch {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      window.location.href = `${apiBase}/api/v1/github/oauth/authorize?redirect=true`;
    } finally {
      setConnectingOAuth(false);
    }
  }

  // Connect via Personal Access Token
  async function handleVerifyAndSaveToken() {
    if (!tokenInput.trim()) return;
    try {
      setVerifyingToken(true);
      setErrorMessage(null);
      const res = await verifyGitHubToken(tokenInput.trim());
      if (res.valid && res.user) {
        localStorage.setItem('bp_github_token', tokenInput.trim());
        setGithubToken(tokenInput.trim());
        setGithubUser(res.user);
        setShowTokenModal(false);
        setTokenInput('');
        setSuccessMessage(`Connected successfully to GitHub as @${res.user.login}!`);
      } else {
        setErrorMessage(res.error || 'Invalid token. Please check your token scopes.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg || 'Failed to verify GitHub token');
    } finally {
      setVerifyingToken(false);
    }
  }

  function handleDisconnect() {
    localStorage.removeItem('bp_github_token');
    setGithubToken('');
    setGithubUser(null);
    setRepos([]);
    setSuccessMessage('Disconnected from GitHub');
  }

  // Import Repo
  async function handleImportRepository(repo: GitHubRepoSummary) {
    try {
      setImportingRepo(repo.fullName);
      setErrorMessage(null);
      const res = await importGitHubRepository({
        repoFullName: repo.fullName,
        name: repo.name,
        description: repo.description || undefined,
        defaultBranch: repo.defaultBranch || 'main',
        token: githubToken || undefined,
      });

      setSuccessMessage(res.message || `Imported ${repo.fullName} successfully!`);
      await loadProjectsList();
      await loadReposList(githubToken);

      if (res.project) {
        setShowImportModal(false);
        setSelectedProjectForTask(res.project);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg || 'Failed to import repository');
    } finally {
      setImportingRepo(null);
    }
  }

  // Create Autonomous Task
  async function handleCreateTask() {
    if (!selectedProjectForTask || !taskTitle.trim()) return;
    try {
      setCreatingTask(true);
      setErrorMessage(null);

      const projectId =
        (selectedProjectForTask as { _id?: string; slug?: string; id?: string })._id ||
        selectedProjectForTask.slug ||
        selectedProjectForTask.id;

      const res = await createTaskForProject(projectId, {
        title: taskTitle.trim(),
        description: taskDescription.trim() || undefined,
        repositoryId:
          (selectedProjectForTask as { githubRepoFullName?: string }).githubRepoFullName ||
          selectedProjectForTask.name,
        issueNumber: selectedIssueNumber || undefined,
        baseBranch: taskBranch || selectedProjectForTask.defaultBranch || 'main',
        metadata: {
          provider: taskProvider,
          model: taskModel,
          githubToken: githubToken || undefined,
          githubIssueNumber: selectedIssueNumber || undefined,
        },
      });

      const taskId = (res.task as { _id?: string; id?: string })._id || res.task.id;
      window.location.href = `/tasks/${taskId}`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg || 'Failed to create task');
      setCreatingTask(false);
    }
  }

  const activeProviders = providers.filter((p) => p.hasApiKey && p.isActive !== false);
  const selectedProviderConfig = providers.find((p) => p.id === taskProvider);

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(projectSearch.toLowerCase())) ||
      (p.githubRepoFullName && p.githubRepoFullName.toLowerCase().includes(projectSearch.toLowerCase())),
  );

  const filteredRepos = repos.filter(
    (r) =>
      r.fullName.toLowerCase().includes(repoSearch.toLowerCase()) ||
      (r.description && r.description.toLowerCase().includes(repoSearch.toLowerCase())),
  );

  // Modal 1: Import Repository Modal JSX
  const importModalContent =
    showImportModal && mounted
      ? createPortal(
          <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4 border border-slate-200 max-h-[90vh] overflow-y-auto relative animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
                    <Github className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Import GitHub Repository</h3>
                    <p className="text-xs text-slate-500">
                      Select any repository from your GitHub account to track with BuildPilot.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {githubUser && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadGitHubData(githubToken)}
                      disabled={loadingRepos}
                      className="h-8 text-xs gap-1.5 bg-white shadow-xs"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${loadingRepos ? 'animate-spin text-indigo-500' : ''}`} />
                      <span>Refresh</span>
                    </Button>
                  )}
                  <button
                    onClick={() => setShowImportModal(false)}
                    className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* GitHub Connected or Connect View */}
              {!githubUser ? (
                <div className="text-center py-10 px-4 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 space-y-4">
                  <div className="h-12 w-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center mx-auto shadow-md">
                    <Github className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-900">GitHub Connection Required</h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                      Connect your GitHub account via OAuth or Personal Access Token to browse and import your repositories.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                    <Button
                      onClick={handleConnectOAuth}
                      disabled={connectingOAuth}
                      className="gap-2 text-xs bg-slate-900 hover:bg-slate-800 text-white h-9 px-4 font-semibold shadow-sm rounded-xl"
                    >
                      {connectingOAuth ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
                      <span>{connectingOAuth ? 'Redirecting...' : 'Authorize GitHub (OAuth)'}</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowImportModal(false);
                        setShowTokenModal(true);
                      }}
                      className="text-xs gap-1.5 h-9 px-3.5 bg-white border-slate-200 rounded-xl"
                    >
                      <KeyRound className="h-3.5 w-3.5 text-slate-500" />
                      <span>Use Token</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Search bar */}
                  <div className="relative">
                    <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search repositories by name, owner, or description..."
                      value={repoSearch}
                      onChange={(e) => setRepoSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50/60 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    />
                  </div>

                  {/* Repos list */}
                  {loadingRepos ? (
                    <div className="py-16 text-center text-xs text-slate-400">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-500" />
                      <span>Fetching repositories from GitHub...</span>
                    </div>
                  ) : filteredRepos.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                      {repoSearch ? 'No matching repositories found.' : 'No repositories found under this account.'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
                      {filteredRepos.map((repo) => {
                        const isImporting = importingRepo === repo.fullName;
                        return (
                          <div
                            key={repo.id}
                            className="p-3.5 bg-white border border-slate-200/90 rounded-xl flex items-center justify-between hover:border-indigo-300 hover:shadow-xs transition gap-3"
                          >
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                {repo.isPrivate ? (
                                  <span title="Private">
                                    <Lock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                  </span>
                                ) : (
                                  <span title="Public">
                                    <Globe className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                  </span>
                                )}
                                <span className="font-bold text-xs text-slate-900 truncate">{repo.fullName}</span>
                                {repo.alreadyImported && (
                                  <Badge variant="success" className="text-[9px] gap-1 shrink-0 font-bold py-0 h-4">
                                    <CheckCircle2 className="h-2.5 w-2.5" />
                                    Imported
                                  </Badge>
                                )}
                              </div>

                              <p className="text-[11px] text-slate-500 truncate">
                                {repo.description || 'No description provided.'}
                              </p>

                              <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-0.5">
                                {repo.language && (
                                  <span className="font-semibold text-slate-600">{repo.language}</span>
                                )}
                                <span className="flex items-center gap-1">
                                  <GitBranch className="h-3 w-3 text-slate-400" />
                                  {repo.defaultBranch}
                                </span>
                                {repo.stargazersCount !== undefined && repo.stargazersCount > 0 && (
                                  <span className="flex items-center gap-1">
                                    <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                                    {repo.stargazersCount}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="shrink-0">
                              {repo.alreadyImported ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setShowImportModal(false);
                                    const found = projects.find(
                                      (p) =>
                                        p.name === repo.name ||
                                        (p as { githubRepoFullName?: string }).githubRepoFullName === repo.fullName,
                                    );
                                    if (found) setSelectedProjectForTask(found);
                                  }}
                                  className="h-8 text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 font-bold gap-1 px-3"
                                >
                                  <Play className="h-3 w-3 fill-indigo-600" />
                                  <span>Run Task</span>
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() => handleImportRepository(repo)}
                                  disabled={isImporting}
                                  className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1.5 px-3.5 shadow-xs rounded-xl"
                                >
                                  {isImporting ? (
                                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Plus className="h-3.5 w-3.5" />
                                  )}
                                  <span>Import</span>
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  // Modal 2: Launch Autonomous Task Modal JSX
  const launchTaskModalContent =
    selectedProjectForTask && mounted
      ? createPortal(
          <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 border border-slate-200 max-h-[90vh] overflow-y-auto relative animate-in fade-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
                    <Sparkles className="h-5 w-5 text-amber-300" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Launch Autonomous AI Task</h3>
                    <p className="text-xs text-slate-500">
                      Target Project: <span className="font-bold text-slate-800">{selectedProjectForTask.name}</span>
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedProjectForTask(null)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Form Content */}
              <div className="space-y-4">
                {/* GitHub Issues Auto-Sync (OAuth Connected) */}
                <div className="p-3.5 bg-indigo-50/70 border border-indigo-200/80 rounded-2xl space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                      <Github className="h-3.5 w-3.5 text-indigo-700" />
                      <span>Pick from GitHub Issues ({projectIssues.length})</span>
                    </span>
                    {loadingIssues ? (
                      <span className="text-[11px] text-indigo-600 flex items-center gap-1">
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        Fetching issues...
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono font-semibold text-indigo-700 bg-indigo-100/80 px-2 py-0.5 rounded-md">
                        🏷️ Filter Tag: <code className="font-bold">buildpilot</code>
                      </span>
                    )}
                  </div>

                  {projectIssues.length > 0 ? (
                    <div className="space-y-1.5">
                      <select
                        value={selectedIssueNumber ? String(selectedIssueNumber) : ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) {
                            setSelectedIssueNumber(null);
                            return;
                          }
                          const num = parseInt(val, 10);
                          const issue = projectIssues.find((i) => i.number === num);
                          if (issue) {
                            setSelectedIssueNumber(issue.number);
                            setTaskTitle(issue.title);
                            setTaskDescription(issue.body || `Resolves GitHub issue #${issue.number}`);
                          }
                        }}
                        className="w-full h-9 rounded-xl border border-indigo-200 bg-white px-3 py-1 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                      >
                        <option value="">-- Select a GitHub issue to auto-populate --</option>
                        {projectIssues.map((issue) => {
                          const hasBuildpilotTag = issue.labels?.some(
                            (l) => l.name.toLowerCase() === 'buildpilot',
                          );
                          const tagLabels = issue.labels?.map((l) => l.name).join(', ');
                          return (
                            <option key={issue.id} value={issue.number}>
                              {hasBuildpilotTag ? '⭐ [buildpilot] ' : ''}#{issue.number}: {issue.title}{' '}
                              {tagLabels ? `(${tagLabels})` : ''}
                            </option>
                          );
                        })}
                      </select>

                      <div className="p-2 bg-indigo-100/50 rounded-lg text-[11px] text-indigo-900 leading-normal flex items-start gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-indigo-600 shrink-0 mt-0.5" />
                        <span>
                          <strong>Smart Tag Filter:</strong> Add the label <code className="bg-white px-1 py-0.2 rounded font-bold font-mono text-indigo-700">buildpilot</code> to any GitHub issue so the AI prioritizes it for autonomous resolution.
                        </span>
                      </div>
                    </div>
                  ) : !loadingIssues ? (
                    <p className="text-[11px] text-slate-500 italic">
                      No open issues found in this repository. You can enter task details manually below or create an issue tagged with <code className="font-mono font-bold text-indigo-600">buildpilot</code> on GitHub.
                    </p>
                  ) : null}
                </div>

                {/* Task Title */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">Task Title *</label>
                  <input
                    type="text"
                    placeholder="e.g. Implement OAuth login or fix connection retry timeout"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  />
                </div>

                {/* Instructions */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Detailed Instructions / Acceptance Criteria (Optional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Describe specific files to edit, acceptance criteria, or error traces..."
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed font-normal"
                  />
                </div>

                {/* Target Branch */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <GitBranch className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Base Branch</span>
                  </label>
                  <input
                    type="text"
                    value={taskBranch}
                    onChange={(e) => setTaskBranch(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* AI Provider & Model Config */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-amber-500" />
                      <span>AI Model Configuration</span>
                    </span>
                    <Link
                      href="/settings/providers"
                      className="text-[11px] text-indigo-600 hover:underline font-semibold flex items-center gap-1"
                    >
                      <Settings className="h-3 w-3" />
                      <span>Manage Providers</span>
                    </Link>
                  </div>

                  {loadingProviders ? (
                    <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                      <span>Loading active providers...</span>
                    </div>
                  ) : activeProviders.length === 0 ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">No Active LLM Providers Configured</p>
                          <p className="text-[11px] text-amber-800 mt-0.5">
                            Please configure an active AI provider (OpenRouter, OpenAI, Gemini, etc.) in Settings before launching tasks.
                          </p>
                        </div>
                      </div>
                      <Link href="/settings/providers">
                        <Button size="sm" className="text-xs w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold h-8 rounded-lg mt-1">
                          Configure LLM Providers
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Provider Selector */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 block">Active Provider</label>
                        <select
                          value={taskProvider}
                          onChange={(e) => {
                            const newProv = e.target.value;
                            setTaskProvider(newProv);
                            const cfg = activeProviders.find((p) => p.id === newProv);
                            if (cfg) {
                              setTaskModel(cfg.defaultModel || cfg.availableModels?.[0] || '');
                            }
                          }}
                          className="w-full h-9 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                        >
                          {activeProviders.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Model Selector / Input */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 block">Model</label>
                        {selectedProviderConfig &&
                        selectedProviderConfig.availableModels &&
                        selectedProviderConfig.availableModels.length > 0 ? (
                          <select
                            value={taskModel}
                            onChange={(e) => setTaskModel(e.target.value)}
                            className="w-full h-9 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                          >
                            {selectedProviderConfig.availableModels.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            placeholder="e.g. anthropic/claude-3.5-sonnet"
                            value={taskModel}
                            onChange={(e) => setTaskModel(e.target.value)}
                            className="w-full h-9 px-3 border border-slate-200 rounded-xl text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        )}
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-slate-400 flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Using securely stored AES-256 encrypted provider credentials from Settings.</span>
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedProjectForTask(null)}
                  className="text-xs h-9"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateTask}
                  disabled={creatingTask || !taskTitle.trim() || activeProviders.length === 0}
                  className="text-xs bg-slate-900 hover:bg-slate-800 text-white gap-2 h-9 px-4 font-semibold rounded-xl shadow-xs"
                >
                  {creatingTask ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                  )}
                  <span>{creatingTask ? 'Dispatching Task...' : 'Dispatch Autonomous Task'}</span>
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  // Modal 3: Direct GitHub Token Entry Modal JSX
  const tokenModalContent =
    showTokenModal && mounted
      ? createPortal(
          <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200 relative animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-indigo-600" />
                  Connect GitHub Token
                </h3>
                <button
                  onClick={() => setShowTokenModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                Enter your GitHub Personal Access Token (<code className="text-indigo-600 font-mono">ghp_...</code>) with <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">repo</code> and <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">read:user</code> scopes.
              </p>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">Personal Access Token</label>
                <input
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo,read:user,user:email&description=BuildPilot%20Agent"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1 font-semibold"
                >
                  <span>Generate token on GitHub</span>
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowTokenModal(false)}
                    className="text-xs h-8"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleVerifyAndSaveToken}
                    disabled={verifyingToken || !tokenInput.trim()}
                    className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white h-8 px-3.5 font-semibold rounded-xl"
                  >
                    {verifyingToken ? 'Verifying...' : 'Save & Connect'}
                  </Button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FolderGit2 className="h-6 w-6 text-indigo-600" />
            Projects & Repositories
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage your imported GitHub repositories and dispatch autonomous AI tasks.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* GitHub Connection Pill */}
          {githubUser ? (
            <div className="flex items-center gap-2.5 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-xs">
              <img
                src={githubUser.avatarUrl}
                alt={githubUser.login}
                className="w-5 h-5 rounded-full ring-1 ring-slate-300"
              />
              <span className="font-bold text-xs text-slate-900">@{githubUser.login}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDisconnect}
                className="h-6 px-1.5 text-xs text-slate-400 hover:text-red-600 ml-1"
                title="Disconnect GitHub"
              >
                <LogOut className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                onClick={handleConnectOAuth}
                disabled={connectingOAuth}
                className="gap-2 text-xs bg-slate-900 hover:bg-slate-800 text-white shadow-xs h-8 px-3.5 font-semibold rounded-xl"
              >
                {connectingOAuth ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-white" /> : <Github className="h-3.5 w-3.5" />}
                <span>{connectingOAuth ? 'Connecting...' : 'Connect GitHub'}</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowTokenModal(true)}
                className="text-xs gap-1.5 text-slate-700 bg-white h-8 px-2.5 rounded-xl"
                title="Configure token directly"
              >
                <KeyRound className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* Import Repository Button */}
          <Button
            size="sm"
            onClick={() => setShowImportModal(true)}
            className="gap-2 text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs h-8 px-3.5 font-semibold rounded-xl"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Import Repository</span>
          </Button>
        </div>
      </div>

      {/* Alert Messages */}
      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-start justify-between gap-3 font-medium">
          <div className="space-y-1">
            <span className="font-bold block">Notice</span>
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-500 hover:text-red-700 font-bold text-base px-1">
            ×
          </button>
        </div>
      )}
      {successMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center justify-between font-medium">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700 font-bold text-base px-1">
            ×
          </button>
        </div>
      )}

      {/* Main Content: Imported Projects */}
      <div className="space-y-4">
        {/* Section Header & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold tracking-tight uppercase text-slate-500">
              Tracked Projects ({projects.length})
            </h2>
          </div>

          <div className="flex items-center gap-2.5">
            {projects.length > 0 && (
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter projects..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                />
              </div>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={loadProjectsList}
              className="h-8 text-xs gap-1.5 bg-white rounded-xl shadow-xs"
            >
              <RefreshCw className={`h-3 w-3 ${loadingProjects ? 'animate-spin text-indigo-500' : ''}`} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>

        {/* Projects Cards Grid */}
        {loadingProjects ? (
          <div className="py-20 text-center text-xs text-slate-400">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-500" />
            <span>Loading projects...</span>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-16 px-6 bg-white rounded-2xl border border-dashed border-slate-300 shadow-xs max-w-2xl mx-auto space-y-4">
            <div className="h-16 w-16 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto shadow-xs">
              <FolderGit2 className="h-8 w-8" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-slate-900">
                {projectSearch ? 'No Matching Projects' : 'No Projects Imported Yet'}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                {projectSearch
                  ? 'Try searching with a different keyword or clear the search bar.'
                  : 'Import a GitHub repository to track issues, view branch status, and dispatch autonomous AI coding tasks.'}
              </p>
            </div>

            {!projectSearch && (
              <div className="pt-2">
                <Button
                  onClick={() => setShowImportModal(true)}
                  className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs h-10 px-5 rounded-xl shadow-xs"
                >
                  <Plus className="h-4 w-4" />
                  <span>Import Your First Repository</span>
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProjects.map((project) => {
              const projectId =
                (project as { _id?: string })._id || project.id || project.slug;
              const repoFullName =
                (project as { githubRepoFullName?: string }).githubRepoFullName || project.slug;
              const stats = project.stats || {
                totalTasks: 0,
                completedTasks: 0,
                activeTasks: 0,
                failedTasks: 0,
              };

              return (
                <Card
                  key={projectId}
                  className="border-slate-200/90 shadow-xs hover:shadow-md transition rounded-2xl bg-white flex flex-col justify-between"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2 truncate">
                          <Github className="h-4 w-4 text-slate-700 shrink-0" />
                          <span className="truncate">{project.name}</span>
                        </CardTitle>
                        <span className="text-[11px] font-mono text-slate-500 block truncate">{repoFullName}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-mono shrink-0 bg-slate-50">
                        {project.defaultBranch || 'main'}
                      </Badge>
                    </div>

                    <CardDescription className="text-xs text-slate-500 pt-1 line-clamp-2">
                      {project.description || 'Imported repository tracked with BuildPilot.'}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="pt-2 space-y-3">
                    {/* Live Task Stats Dashboard */}
                    <div className="grid grid-cols-4 gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-center">
                      <div className="p-1">
                        <span className="text-[10px] text-slate-400 block font-medium">Total</span>
                        <span className="font-bold text-xs text-slate-800">{stats.totalTasks}</span>
                      </div>
                      <div className="p-1">
                        <span className="text-[10px] text-slate-400 block font-medium">Active</span>
                        <span
                          className={`font-bold text-xs ${
                            stats.activeTasks > 0 ? 'text-indigo-600 flex items-center justify-center gap-1' : 'text-slate-700'
                          }`}
                        >
                          {stats.activeTasks > 0 && <Radio className="h-2 w-2 animate-pulse fill-indigo-600" />}
                          {stats.activeTasks}
                        </span>
                      </div>
                      <div className="p-1">
                        <span className="text-[10px] text-slate-400 block font-medium">Completed</span>
                        <span className="font-bold text-xs text-emerald-600">{stats.completedTasks}</span>
                      </div>
                      <div className="p-1">
                        <span className="text-[10px] text-slate-400 block font-medium">Failed</span>
                        <span className="font-bold text-xs text-slate-600">{stats.failedTasks}</span>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between pt-1">
                      <Link
                        href={`/tasks?projectId=${projectId}`}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 transition"
                      >
                        <span>View Tasks</span>
                        <ArrowRight className="h-3 w-3" />
                      </Link>

                      <Button
                        size="sm"
                        onClick={() => setSelectedProjectForTask(project)}
                        className="h-8 text-xs bg-slate-900 hover:bg-slate-800 text-white gap-1.5 font-semibold px-3.5 rounded-xl shadow-xs"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                        <span>Launch Task</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Render Modals via Portal to document.body */}
      {importModalContent}
      {launchTaskModalContent}
      {tokenModalContent}
    </div>
  );
}
