import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { createLogger } from '@buildpilot/observability';
import { generateCorrelationId } from '@buildpilot/shared';

export function createApp(): Express {
  const logger = createLogger({ serviceName: 'control-api' });
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Attach correlation ID and logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId = (req.headers['x-correlation-id'] as string) || generateCorrelationId('req');
    res.setHeader('x-correlation-id', correlationId);
    (req as Request & { correlationId?: string }).correlationId = correlationId;
    next();
  });

  if (process.env.NODE_ENV !== 'test') {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => (req as Request & { correlationId?: string }).correlationId || generateCorrelationId('req'),
      }),
    );
  }

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'control-api',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/ready', (_req: Request, res: Response) => {
    res.json({ status: 'ready' });
  });

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'Unhandled request error');
    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message,
    });
  });

  return app;
}

