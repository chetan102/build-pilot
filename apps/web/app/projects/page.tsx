'use client';

import * as React from 'react';
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
  Layers,
  Play,
  X,
  FolderGit2,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';
import {
  fetchProjects,
  fetchGitHubUser,
  fetchGitHubRepositories,
  importGitHubRepository,
  createTaskForProject,
  verifyGitHubToken,
  fetchGitHubOAuthAuthorize,
  GitHubRepoSummary,
  GitHubUser,
  ProjectSummary,
} from '@/lib/api-client';

export default function ProjectsPage() {
  const [projects, setProjects] = React.useState<ProjectSummary[]>([]);
  const [loadingProjects, setLoadingProjects] = React.useState(true);
  const [githubUser, setGithubUser] = React.useState<GitHubUser | null>(null);
  const [githubToken, setGithubToken] = React.useState<string>('');
  const [repos, setRepos] = React.useState<GitHubRepoSummary[]>([]);
  const [loadingRepos, setLoadingRepos] = React.useState(false);
  const [repoSearch, setRepoSearch] = React.useState('');
  const [importingRepo, setImportingRepo] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Manual token modal
  const [showTokenModal, setShowTokenModal] = React.useState(false);
  const [tokenInput, setTokenInput] = React.useState('');
  const [verifyingToken, setVerifyingToken] = React.useState(false);

  // Quick Task Creation Modal
  const [selectedProjectForTask, setSelectedProjectForTask] = React.useState<ProjectSummary | null>(null);
  const [taskTitle, setTaskTitle] = React.useState('');
  const [taskDescription, setTaskDescription] = React.useState('');
  const [creatingTask, setCreatingTask] = React.useState(false);

  // 1. Initial Load & OAuth URL check
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('github_token');
      const urlUser = urlParams.get('github_user');
      const urlAvatar = urlParams.get('github_avatar');
      const urlError = urlParams.get('error');

      if (urlError) {
        setErrorMessage(`GitHub OAuth Error: ${urlError}`);
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
  }, []);

  // 2. Load GitHub profile & repos when token is set
  React.useEffect(() => {
    if (githubToken) {
      loadGitHubData(githubToken);
    } else {
      checkServerGitHubConnection();
    }
  }, [githubToken]);

  async function loadProjectsList() {
    try {
      setLoadingProjects(true);
      const data = await fetchProjects();
      setProjects(data.projects || []);
    } catch (err: any) {
      console.warn('Could not fetch projects list:', err);
    } finally {
      setLoadingProjects(false);
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
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to connect to GitHub');
    } finally {
      setLoadingRepos(false);
    }
  }

  async function loadReposList(token: string) {
    try {
      setLoadingRepos(true);
      const res = await fetchGitHubRepositories(token);
      setRepos(res.repositories || []);
    } catch (err: any) {
      console.warn('Could not list repos:', err);
    } finally {
      setLoadingRepos(false);
    }
  }

  // Connect via OAuth
  async function handleConnectOAuth() {
    try {
      setErrorMessage(null);
      const data = await fetchGitHubOAuthAuthorize();
      if (data.configured && data.url) {
        window.location.href = data.url;
      } else {
        setShowTokenModal(true);
      }
    } catch {
      setShowTokenModal(true);
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
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to verify GitHub token');
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
        setSelectedProjectForTask(res.project);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to import repository');
    } finally {
      setImportingRepo(null);
    }
  }

  // Create Task for Project
  async function handleCreateTask() {
    if (!selectedProjectForTask || !taskTitle.trim()) return;
    try {
      setCreatingTask(true);
      setErrorMessage(null);
      const projectId = (selectedProjectForTask as any)._id || selectedProjectForTask.slug || selectedProjectForTask.id;
      const res = await createTaskForProject(projectId, {
        title: taskTitle.trim(),
        description: taskDescription.trim() || undefined,
        repositoryId: (selectedProjectForTask as any).githubRepoFullName || selectedProjectForTask.name,
        baseBranch: selectedProjectForTask.defaultBranch || 'main',
      });

      const taskId = (res.task as any)._id || res.task.id;
      window.location.href = `/tasks/${taskId}`;
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create task');
      setCreatingTask(false);
    }
  }

  const filteredRepos = repos.filter(
    (r) =>
      r.fullName.toLowerCase().includes(repoSearch.toLowerCase()) ||
      (r.description && r.description.toLowerCase().includes(repoSearch.toLowerCase())),
  );

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FolderGit2 className="h-6 w-6 text-indigo-600" />
            Projects & GitHub Integration
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Connect your GitHub account via OAuth or Token, select repositories, and launch autonomous AI engineering tasks.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {githubUser ? (
            <div className="flex items-center gap-3 bg-white border border-slate-200 px-3.5 py-1.5 rounded-xl shadow-xs">
              <img
                src={githubUser.avatarUrl}
                alt={githubUser.login}
                className="w-6 h-6 rounded-full ring-1 ring-slate-300"
              />
              <div className="text-xs">
                <span className="font-bold text-slate-900 block">@{githubUser.login}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDisconnect}
                className="h-6 px-1.5 text-xs text-slate-400 hover:text-red-600 ml-1"
                title="Disconnect GitHub"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={handleConnectOAuth}
              className="gap-2 text-xs bg-slate-900 hover:bg-slate-800 text-white shadow-sm h-8 px-3.5 font-semibold"
            >
              <Github className="h-4 w-4" />
              <span>Connect GitHub (OAuth)</span>
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowTokenModal(true)}
            className="text-xs gap-1.5 text-slate-700 bg-white h-8 px-3"
            title="Configure token directly"
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span>Token</span>
          </Button>
        </div>
      </div>

      {/* Alert Messages */}
      {errorMessage && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center justify-between font-medium">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-red-500 hover:text-red-700 font-bold text-base px-1">×</button>
        </div>
      )}
      {successMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center justify-between font-medium">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700 font-bold text-base px-1">×</button>
        </div>
      )}

      {/* GitHub Repository Selector Section */}
      <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50/50 via-white to-slate-50/50 shadow-xs rounded-2xl">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Github className="h-4 w-4 text-indigo-600" />
                Select & Import GitHub Repositories
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Choose any repository from your GitHub account to import and track with BuildPilot.
              </CardDescription>
            </div>

            {githubUser && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadGitHubData(githubToken)}
                disabled={loadingRepos}
                className="h-8 text-xs gap-1.5 bg-white shadow-xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingRepos ? 'animate-spin text-indigo-500' : ''}`} />
                <span>Refresh Repos</span>
              </Button>
            )}
          </div>

          {/* Search bar if connected */}
          {githubUser && (
            <div className="pt-3">
              <div className="relative">
                <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search and filter repositories by name, owner, or description..."
                  value={repoSearch}
                  onChange={(e) => setRepoSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-xs"
                />
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="pt-2">
          {!githubUser ? (
            <div className="text-center py-10 px-4 bg-white/90 rounded-2xl border border-dashed border-slate-200">
              <div className="h-12 w-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center mx-auto mb-3 shadow-sm">
                <Github className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Connect Your GitHub Account</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5 leading-relaxed">
                Authorize BuildPilot to access your repositories, issues, and pull requests to start autonomous AI development.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  onClick={handleConnectOAuth}
                  className="gap-2 text-xs bg-slate-900 hover:bg-slate-800 text-white h-9 px-4 font-semibold"
                >
                  <Github className="h-4 w-4" />
                  <span>Authorize with GitHub (OAuth)</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowTokenModal(true)}
                  className="text-xs gap-1.5 h-9 px-4 bg-white"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>Use Personal Access Token</span>
                </Button>
              </div>
            </div>
          ) : loadingRepos ? (
            <div className="py-14 text-center text-xs text-slate-400">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-500" />
              <span>Fetching your GitHub repositories...</span>
            </div>
          ) : filteredRepos.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              {repoSearch ? 'No matching repositories found.' : 'No repositories found under this account.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 max-h-[420px] overflow-y-auto pr-1">
              {filteredRepos.map((repo) => {
                const isImporting = importingRepo === repo.fullName;
                return (
                  <div
                    key={repo.id}
                    className="p-4 bg-white border border-slate-200/90 rounded-xl flex flex-col justify-between hover:border-indigo-300 hover:shadow-xs transition"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-bold text-xs text-slate-900 truncate">
                          {repo.isPrivate ? (
                            <span title="Private Repository">
                              <Lock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            </span>
                          ) : (
                            <span title="Public Repository">
                              <Globe className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            </span>
                          )}
                          <span className="truncate">{repo.fullName}</span>
                        </div>
                        {repo.alreadyImported && (
                          <Badge variant="success" className="text-[10px] gap-1 shrink-0 font-bold">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Imported
                          </Badge>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-500 line-clamp-2 min-h-[1.5rem]">
                        {repo.description || 'No description provided.'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-100 text-[11px] text-slate-500">
                      <div className="flex items-center gap-3">
                        {repo.language && (
                          <span className="font-semibold text-slate-700">{repo.language}</span>
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

                      {repo.alreadyImported ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const found = projects.find((p) => p.name === repo.name || (p as any).githubRepoFullName === repo.fullName);
                            if (found) setSelectedProjectForTask(found);
                          }}
                          className="h-7 text-[11px] text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 font-bold gap-1 px-2.5"
                        >
                          <Play className="h-3 w-3 fill-indigo-600" />
                          <span>Run Task</span>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleImportRepository(repo)}
                          disabled={isImporting}
                          className="h-7 text-[11px] bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1 px-3 shadow-xs"
                        >
                          {isImporting ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            <Plus className="h-3 w-3" />
                          )}
                          <span>Import Repo</span>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active BuildPilot Projects Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-tight uppercase text-slate-500 flex items-center gap-2">
            Active Tracked Projects ({projects.length})
          </h2>
          <Button
            size="sm"
            variant="outline"
            onClick={loadProjectsList}
            className="h-7 text-xs gap-1.5 bg-white"
          >
            <RefreshCw className={`h-3 w-3 ${loadingProjects ? 'animate-spin text-indigo-500' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>

        {loadingProjects ? (
          <div className="py-10 text-center text-xs text-slate-400">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
            No projects imported yet. Select and import a repository above to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map((project) => (
              <Card key={project.id || (project as any)._id} className="border-slate-200/90 shadow-xs hover:shadow-md transition rounded-2xl bg-white">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Github className="h-4 w-4 text-slate-700" />
                      {project.name}
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {(project as any).githubRepoFullName || project.slug}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs text-slate-500">
                    {project.description || 'Tracked repository project'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-2 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-600 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-slate-400 block text-[10px] font-medium">Default Branch</span>
                      <span className="font-bold text-slate-800">
                        {(project as any).defaultBranch || 'main'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] font-medium">Status</span>
                      <span className="font-bold text-emerald-600 flex items-center gap-1">
                        <Radio className="h-2 w-2 animate-pulse fill-emerald-500" />
                        Active
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] font-medium">Created</span>
                      <span className="font-semibold text-slate-700">{formatDate(project.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <Link
                      href={`/tasks?projectId=${(project as any)._id || project.id || project.slug}`}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1"
                    >
                      <span>View Tasks</span>
                      <ArrowRight className="h-3 w-3" />
                    </Link>

                    <Button
                      size="sm"
                      onClick={() => setSelectedProjectForTask(project)}
                      className="h-8 text-xs bg-slate-900 hover:bg-slate-800 text-white gap-1.5 font-semibold px-3"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                      <span>Start AI Task</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Direct GitHub Token Entry */}
      {showTokenModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-indigo-600" />
                Connect GitHub with Token
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
                  className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white h-8 px-3.5 font-semibold"
                >
                  {verifyingToken ? 'Verifying...' : 'Save & Connect'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Quick AI Task Launcher */}
      {selectedProjectForTask && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  Launch Autonomous Task
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Target: <span className="font-bold text-slate-800">{selectedProjectForTask.name}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedProjectForTask(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Task Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Fix database timeout in connection pool"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Description / Instructions (Optional)</label>
                <textarea
                  rows={3}
                  placeholder="Provide specific requirements, error traces, or acceptance criteria..."
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedProjectForTask(null)}
                className="text-xs h-8"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateTask}
                disabled={creatingTask || !taskTitle.trim()}
                className="text-xs bg-slate-900 hover:bg-slate-800 text-white gap-1.5 h-8 px-4 font-semibold"
              >
                {creatingTask ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                )}
                <span>{creatingTask ? 'Dispatching...' : 'Dispatch Agent Task'}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
