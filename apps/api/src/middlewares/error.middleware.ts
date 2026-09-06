import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  DomainError,
  InvalidStateTransitionError,
  EntityNotFoundError,
  PermissionDeniedError,
} from '@buildpilot/domain';
import { DatabaseConnectionError } from '@buildpilot/database';
import { Logger } from '@buildpilot/observability';

export function createErrorHandler(logger: Logger) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const correlationId = req.correlationId;

    if (err instanceof ZodError) {
      logger.warn({ err: err.errors, correlationId }, 'Request validation failed');
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request payload or query parameters',
        details: err.errors,
        correlationId,
      });
      return;
    }

    if (err instanceof EntityNotFoundError) {
      logger.warn({ err: err.message, correlationId }, 'Entity not found');
      res.status(404).json({
        error: err.code,
        message: err.message,
        entityType: err.entityType,
        entityId: err.entityId,
        correlationId,
      });
      return;
    }

    if (err instanceof InvalidStateTransitionError) {
      logger.warn({ err: err.message, correlationId }, 'Invalid state transition');
      res.status(409).json({
        error: err.code,
        message: err.message,
        fromStatus: err.fromStatus,
        toStatus: err.toStatus,
        correlationId,
      });
      return;
    }

    if (err instanceof PermissionDeniedError) {
      logger.warn({ err: err.message, correlationId }, 'Permission denied');
      res.status(403).json({
        error: err.code,
        message: err.message,
        permissionClass: err.permissionClass,
        action: err.action,
        correlationId,
      });
      return;
    }

    if (err instanceof DatabaseConnectionError) {
      logger.error({ err: err.message, correlationId }, 'Database unavailable');
      res.status(503).json({
        error: err.code,
        message: 'Database service is currently unavailable. Please retry shortly.',
        correlationId,
      });
      return;
    }

    if (err instanceof DomainError) {
      logger.warn({ err: err.message, correlationId }, 'Domain error occurred');
      res.status(400).json({
        error: err.code,
        message: err.message,
        correlationId,
      });
      return;
    }

    const message = err instanceof Error ? err.message : 'Internal Server Error';
    logger.error({ err, correlationId }, 'Unhandled server error');

    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : message,
      correlationId,
    });
  };
}
