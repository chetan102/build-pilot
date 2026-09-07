import { Router, Request, Response, NextFunction } from 'express';
import {
  verifyWebhookSignature,
  isIssueEligible,
  GitHubIssuePayload,
  gitHubService,
} from '@buildpilot/github';
import {
  projectRepository,
  taskRepository,
  eventRepository,
} from '@buildpilot/database';
import { taskQueueManager } from '../queue.js';
import { TaskStatus, LLMProviderType } from '@buildpilot/domain';
import { createLogger } from '@buildpilot/observability';

const logger = createLogger({ serviceName: 'github-webhook-router' });

export const webhooksRouter: Router = Router();

webhooksRouter.post(
  '/webhooks',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const deliveryId = (req.headers['x-github-delivery'] as string) || `del_${Date.now()}`;
    const eventType = (req.headers['x-github-event'] as string) || 'unknown';
    const signature = req.headers['x-hub-signature-256'] as string | undefined;

    logger.info(
      { deliveryId, eventType, correlationId: req.correlationId },
      'Received incoming GitHub webhook',
    );

    // 1. Signature verification if secret is configured
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (webhookSecret && signature) {
      const isValid = verifyWebhookSignature(JSON.stringify(req.body), signature, webhookSecret);
      if (!isValid) {
        logger.warn({ deliveryId }, 'Invalid GitHub webhook signature');
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
      }
    }

    // 2. Persist raw webhook event
    await eventRepository.create({
      type: 'GITHUB_WEBHOOK_RECEIVED',
      payload: {
        deliveryId,
        eventType,
        action: req.body.action,
        repo: req.body.repository?.full_name,
      },
      level: 'info',
    });

    // 3. Handle Issue Intake
    if (eventType === 'issues') {
      const payload = req.body as GitHubIssuePayload;
      const action = payload.action;

      if ((action === 'opened' || action === 'labeled') && isIssueEligible(payload)) {
        const repoFullName = payload.repository.full_name;
        const repoOwner = payload.repository.owner.login;
        const repoName = payload.repository.name;
        const issue = payload.issue || {
          number: payload.number || 1,
          title: 'GitHub Issue',
          body: '',
          html_url: `https://github.com/${repoFullName}/issues/${payload.number || 1}`,
        };

        const projectSlug = repoFullName.toLowerCase().replace(/[^a-z0-9]/g, '-');

        // Find or create project
        let project = await projectRepository.findBySlug(projectSlug);
        if (!project) {
          project = await projectRepository.create({
            name: repoFullName,
            slug: projectSlug,
            ownerId: repoOwner,
            active: true,
          });
        }

        const projectId = (project as any)._id?.toString() || projectSlug;
        const branchName = `buildpilot/task-${issue.number}-${Date.now().toString(36)}`;

        // Create Task in MongoDB
        const task = await taskRepository.create({
          projectId,
          repositoryId: repoFullName,
          issueNumber: issue.number,
          title: issue.title,
          description: issue.body || 'No description provided.',
          status: TaskStatus.QUEUED,
          branch: branchName,
          baseBranch: payload.repository.default_branch || 'main',
          tags: ['github', 'webhook'],
          metadata: {
            source: 'GITHUB_ISSUE',
            githubIssueUrl: issue.html_url,
            deliveryId,
          },
        });

        const taskId = (task as any)._id?.toString() || `task_${Date.now()}`;
        const runId = `run_${Date.now().toString(36)}`;

        // Enqueue into BullMQ
        await taskQueueManager.enqueueTask({
          taskId,
          runId,
          projectId,
          repositoryId: repoFullName,
          issueNumber: issue.number,
          title: task.title,
          description: task.description,
          branch: branchName,
          baseBranch: payload.repository.default_branch || 'main',
          provider: LLMProviderType.OPENROUTER,
          model: 'anthropic/claude-3.5-sonnet',
          maxSteps: 30,
          correlationId: req.correlationId,
        });

        // Post acknowledgment comment on GitHub issue
        try {
          if (process.env.GITHUB_TOKEN) {
            await gitHubService.createIssueComment(
              repoOwner,
              repoName,
              issue.number,
              `🤖 **BuildPilot Control Plane** has picked up this task!\n- Task ID: \`${taskId}\`\n- Branch: \`${branchName}\`\n- Tracking real-time progress.`,
            );
          }
        } catch (err) {
          logger.warn({ err }, 'Failed to post GitHub acknowledgment comment (non-fatal)');
        }

        res.status(201).json({
          received: true,
          action: 'TASK_CREATED',
          taskId,
          projectId,
        });
        return;
      }
    }

    res.status(200).json({ received: true, event: eventType, action: req.body.action || 'ignored' });
  },
);
