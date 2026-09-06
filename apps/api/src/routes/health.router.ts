import { Router, Request, Response } from 'express';
import { dbManager } from '@buildpilot/database';

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
  const dbHealth = await dbManager.healthCheck();

  if (dbHealth.status === 'healthy') {
    res.status(200).json({
      status: 'ready',
      database: dbHealth,
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: 'not_ready',
      database: dbHealth,
      timestamp: new Date().toISOString(),
    });
  }
});
