import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { gitHubService } from '@buildpilot/github';
import { projectRepository } from '@buildpilot/database';
import { repositoryRepository } from '@buildpilot/database';
import { secretsManager } from '@buildpilot/shared';
import { createLogger } from '@buildpilot/observability';
import { webhooksRouter } from './webhooks.router.js';

const logger = createLogger({ serviceName: 'github-oauth-router' });
export const githubRouter: Router = Router();

// Mount webhooks router
githubRouter.use('/', webhooksRouter);

// Helper to extract GitHub token from request headers or environment
function extractGitHubToken(req: Request): string | undefined {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const candidate = authHeader.substring(7).trim();
    if (candidate.startsWith('ghp_') || candidate.startsWith('gho_') || candidate.startsWith('github_pat_')) {
      return candidate;
    }
  }

  const customHeader = req.headers['x-github-token'];
  if (typeof customHeader === 'string' && customHeader.trim()) {
    return customHeader.trim();
  }

  return process.env.GITHUB_TOKEN;
}

/**
 * GET /api/v1/github/oauth/authorize
 * Initiates GitHub OAuth authorization flow
 */
githubRouter.get('/oauth/authorize', (req: Request, res: Response) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri =
    process.env.GITHUB_OAUTH_REDIRECT_URI ||
    `${req.protocol}://${req.get('host')}/api/v1/github/oauth/callback`;
  const shouldRedirect = req.query.redirect === 'true';

  if (!clientId) {
    return res.status(200).json({
      configured: false,
      message: 'GITHUB_CLIENT_ID is not configured in .env. You can connect using a Personal Access Token directly.',
    });
  }

  const state = (req.query.state as string) || `bp_${Date.now()}`;
  const authUrl = gitHubService.getOAuthAuthorizationUrl({
    clientId,
    redirectUri,
    state,
    scope: 'repo,read:user,user:email',
  });

  if (shouldRedirect) {
    return res.redirect(authUrl);
  }

  return res.status(200).json({
    configured: true,
    url: authUrl,
  });
});

/**
 * GET /api/v1/github/oauth/callback
 * Handles OAuth callback redirect from GitHub
 */
githubRouter.get('/oauth/callback', async (req: Request, res: Response, next: NextFunction) => {
  const code = req.query.code as string;
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!code) {
    return res.redirect(`${appUrl}/projects?error=missing_code`);
  }

  if (!clientId || !clientSecret) {
    logger.error('Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET on OAuth callback');
    return res.redirect(`${appUrl}/projects?error=oauth_not_configured`);
  }

  try {
    const redirectUri =
      process.env.GITHUB_OAUTH_REDIRECT_URI ||
      `${req.protocol}://${req.get('host')}/api/v1/github/oauth/callback`;

    const tokenResult = await gitHubService.exchangeOAuthCode({
      clientId,
      clientSecret,
      code,
      redirectUri,
    });

    const userProfile = await gitHubService.getAuthenticatedUser(tokenResult.accessToken);

    logger.info({ user: userProfile.login }, 'Successfully authenticated GitHub user via OAuth');

    const redirectParams = new URLSearchParams({
      github_token: tokenResult.accessToken,
      github_user: userProfile.login,
      github_avatar: userProfile.avatarUrl,
      github_name: userProfile.name || userProfile.login,
    });

    return res.redirect(`${appUrl}/projects?${redirectParams.toString()}`);
  } catch (err: any) {
    logger.error({ err }, 'Failed to exchange GitHub OAuth code');
    return res.redirect(`${appUrl}/projects?error=${encodeURIComponent(err.message || 'oauth_exchange_failed')}`);
  }
});

/**
 * POST /api/v1/github/oauth/verify
 * Validates a GitHub token and returns user profile
 */
githubRouter.post('/oauth/verify', async (req: Request, res: Response) => {
  const token = req.body.token || extractGitHubToken(req);

  if (!token) {
    return res.status(400).json({
      valid: false,
      error: 'No GitHub token provided in body or Authorization header',
    });
  }

  try {
    const user = await gitHubService.getAuthenticatedUser(token);
    return res.status(200).json({
      valid: true,
      user,
    });
  } catch (err: any) {
    return res.status(401).json({
      valid: false,
      error: `Invalid GitHub token: ${err.message}`,
    });
  }
});

/**
 * GET /api/v1/github/user
 * Gets current authenticated GitHub user profile
 */
githubRouter.get('/user', async (req: Request, res: Response) => {
  const token = extractGitHubToken(req);

  if (!token) {
    return res.status(200).json({
      connected: false,
      user: null,
    });
  }

  try {
    const user = await gitHubService.getAuthenticatedUser(token);
    return res.status(200).json({
      connected: true,
      user,
    });
  } catch (err: any) {
    return res.status(200).json({
      connected: false,
      user: null,
      error: err.message,
    });
  }
});

/**
 * GET /api/v1/github/repos
 * Lists accessible GitHub repositories for the authenticated user
 */
githubRouter.get('/repos', async (req: Request, res: Response, next: NextFunction) => {
  const token = extractGitHubToken(req);

  if (!token) {
    return res.status(401).json({
      error: 'GitHub authentication required. Please connect via OAuth or provide a token.',
      repositories: [],
    });
  }

  try {
    const repos = await gitHubService.listUserRepositories(token);

    // Check existing projects to annotate which repos are already imported
    const existingProjects = await projectRepository.listActive();
    const importedMap = new Map<string, string>();
    for (const p of existingProjects) {
      if (p.githubRepoFullName) {
        importedMap.set(p.githubRepoFullName.toLowerCase(), (p as any)._id?.toString() || p.slug);
      }
    }

    const annotatedRepos = repos.map((repo) => {
      const existingProjectId = importedMap.get(repo.fullName.toLowerCase());
      return {
        ...repo,
        alreadyImported: !!existingProjectId,
        projectId: existingProjectId,
      };
    });

    return res.status(200).json({
      repositories: annotatedRepos,
      count: annotatedRepos.length,
    });
  } catch (err: any) {
    logger.error({ err }, 'Failed to list user repositories from GitHub');
    return res.status(500).json({
      error: `Failed to fetch GitHub repositories: ${err.message}`,
      repositories: [],
    });
  }
});

const ImportRepoSchema = z.object({
  repoFullName: z.string().min(1, 'Repository full name is required (e.g. owner/repo)'),
  name: z.string().optional(),
  description: z.string().optional(),
  defaultBranch: z.string().default('main'),
  token: z.string().optional(),
});

/**
 * POST /api/v1/github/repos/import
 * Imports a selected GitHub repository into BuildPilot as a Project
 */
githubRouter.post('/repos/import', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = ImportRepoSchema.parse(req.body);
    const token = body.token || extractGitHubToken(req);

    const [owner, repoName] = body.repoFullName.split('/');
    const projectName = body.name || repoName || body.repoFullName;
    const baseSlug = (repoName || projectName)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-');

    // Ensure unique slug
    let slug = baseSlug;
    const existingSlug = await projectRepository.findBySlug(slug);
    if (existingSlug) {
      slug = `${baseSlug}-${Date.now().toString().slice(-4)}`;
    }

    // Encrypt token for project at rest if provided
    let encryptedAccessToken: string | undefined;
    if (token) {
      try {
        encryptedAccessToken = secretsManager.encrypt(token);
      } catch (err) {
        logger.warn('Failed to encrypt token for project storage, skipping encryption at rest');
      }
    }

    // Create Project
    const project = await projectRepository.create({
      name: projectName,
      slug,
      description: body.description || `Imported from GitHub repository ${body.repoFullName}`,
      ownerId: owner || 'developer_1',
      active: true,
      githubRepoFullName: body.repoFullName,
      defaultBranch: body.defaultBranch || 'main',
      encryptedAccessToken,
    });

    // Create matching Repository record
    const repository = await repositoryRepository.create({
      projectId: (project as any)._id?.toString() || slug,
      githubInstallationId: 0,
      owner: owner || 'unknown',
      name: repoName || projectName,
      fullName: body.repoFullName,
      defaultBranch: body.defaultBranch || 'main',
      isPrivate: false,
    });

    logger.info(
      { projectId: (project as any)._id, repoFullName: body.repoFullName, slug },
      'Successfully imported GitHub repository into BuildPilot',
    );

    return res.status(201).json({
      success: true,
      project,
      repository,
      message: `Repository '${body.repoFullName}' imported successfully as project '${projectName}'`,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid repository import payload',
        details: err.errors,
      });
    }
    next(err);
  }
});
