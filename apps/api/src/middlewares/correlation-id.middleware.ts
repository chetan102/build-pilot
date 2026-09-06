import { Request, Response, NextFunction } from 'express';
import { generateCorrelationId } from '@buildpilot/shared';

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId =
    (req.headers['x-correlation-id'] as string) || generateCorrelationId('req');

  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  next();
}
