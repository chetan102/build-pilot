import express, { Express } from 'express';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { createLogger, Logger } from '@buildpilot/observability';
import { correlationIdMiddleware } from './middlewares/correlation-id.middleware.js';
import { notFoundMiddleware } from './middlewares/not-found.middleware.js';
import { createErrorHandler } from './middlewares/error.middleware.js';
import { healthRouter } from './routes/health.router.js';
import { projectsRouter } from './routes/projects.router.js';
import { tasksRouter } from './routes/tasks.router.js';
import { githubRouter } from './routes/github.router.js';

export interface AppOptions {
  logger?: Logger;
  routes?: Array<{ path: string; handler: express.Router | express.RequestHandler }>;
}

export function createApp(options: AppOptions = {}): Express {
  const logger = options.logger || createLogger({ serviceName: 'control-api' });
  const app = express();

  // Basic security & parsing middleware
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Attach Correlation ID
  app.use(correlationIdMiddleware);

  // Structured request logging
  if (process.env.NODE_ENV !== 'test') {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => req.correlationId,
        autoLogging: {
          ignore: (req) => req.url === '/health',
        },
      }),
    );
  }

  // Health and Readiness
  app.use('/', healthRouter);

  // Core API v1 routes
  app.use('/api/v1/projects', projectsRouter);
  app.use('/api/v1/tasks', tasksRouter);
  app.use('/api/v1/github', githubRouter);

  // Custom / feature routes
  if (options.routes) {
    for (const route of options.routes) {
      app.use(route.path, route.handler);
    }
  }

  // 404 Fallback
  app.use(notFoundMiddleware);

  // Global Error Handler
  app.use(createErrorHandler(logger));

  return app;
}
