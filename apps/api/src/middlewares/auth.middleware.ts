import { Request, Response, NextFunction } from 'express';

export function createAuthMiddleware(options: { apiKey?: string; bypassPaths?: string[] } = {}) {
  const expectedApiKey = options.apiKey || process.env.BUILDPILOT_API_KEY;
  const bypassPaths = options.bypassPaths || ['/health', '/ready', '/metrics', '/api/v1/github/webhooks'];

  return (req: Request, res: Response, next: NextFunction): void => {
    // If no API key is configured or path is public, allow request
    if (!expectedApiKey || bypassPaths.some((p) => req.path.startsWith(p))) {
      return next();
    }

    const authHeader = req.headers['authorization'] || '';
    const apiKeyHeader = req.headers['x-api-key'] || '';

    let providedKey = '';
    if (typeof apiKeyHeader === 'string' && apiKeyHeader) {
      providedKey = apiKeyHeader;
    } else if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      providedKey = authHeader.slice(7).trim();
    }

    if (!providedKey || providedKey !== expectedApiKey) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Invalid or missing API key',
        correlationId: (req as any).correlationId,
      });
      return;
    }

    next();
  };
}
