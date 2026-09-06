import { Router, Request, Response } from 'express';
import { dbManager } from '@buildpilot/database';
import { redisConnectionManager } from '@buildpilot/queue';

export const healthRouter: Router = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'control-api',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get('/ready', async (_req: Request, res: Response) => {
  const [dbHealth, redisHealth] = await Promise.all([
    dbManager.healthCheck(),
    redisConnectionManager.healthCheck(),
  ]);

  const isReady = dbHealth.status === 'healthy' && redisHealth.status === 'healthy';

  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'not_ready',
    database: dbHealth,
    redis: redisHealth,
    timestamp: new Date().toISOString(),
  });
});
