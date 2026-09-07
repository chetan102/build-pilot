import { Request, Response, NextFunction } from 'express';
import { taskService } from '../services/task.service.js';
import { ListTasksQuerySchema, CancelTaskSchema } from '../schemas/task.schema.js';

export class TaskController {
  async listTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = ListTasksQuerySchema.parse(req.query);
      const result = await taskService.listTasks(
        {
          projectId: query.projectId,
          repositoryId: query.repositoryId,
          status: query.status,
          search: query.search,
        },
        { page: query.page, limit: query.limit },
      );

      res.status(200).json({
        ...result,
        correlationId: req.correlationId,
      });
    } catch (err) {
      next(err);
    }
  }

  async getTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const taskId = String(req.params.taskId || '');
      const details = await taskService.getTaskDetails(taskId);

      res.status(200).json({
        ...details,
        correlationId: req.correlationId,
      });
    } catch (err) {
      next(err);
    }
  }

  async cancelTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const taskId = String(req.params.taskId || '');
      const input = CancelTaskSchema.parse(req.body);
      const task = await taskService.cancelTask(taskId, input.reason);

      res.status(200).json({
        task,
        correlationId: req.correlationId,
      });
    } catch (err) {
      next(err);
    }
  }

  async retryTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const taskId = String(req.params.taskId || '');
      const task = await taskService.retryTask(taskId);

      res.status(200).json({
        task,
        correlationId: req.correlationId,
      });
    } catch (err) {
      next(err);
    }
  }

  async streamTaskEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const taskId = String(req.params.taskId || '');
      
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      res.write(`data: ${JSON.stringify({ type: 'CONNECTED', taskId, timestamp: new Date().toISOString() })}\n\n`);

      const pastEvents = await taskService.listEvents(taskId);
      for (const evt of pastEvents) {
        res.write(`data: ${JSON.stringify(evt)}\n\n`);
      }

      const unsubscribe = taskService.subscribeEvents(taskId, (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      });

      const keepAliveTimer = setInterval(() => {
        res.write(': ping\n\n');
      }, 15000);

      req.on('close', () => {
        clearInterval(keepAliveTimer);
        unsubscribe();
        res.end();
      });
    } catch (err) {
      next(err);
    }
  }
}

export const taskController = new TaskController();

