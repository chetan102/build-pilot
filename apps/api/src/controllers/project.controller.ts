import { Request, Response, NextFunction } from 'express';
import { projectService } from '../services/project.service.js';
import { CreateProjectSchema, ListProjectsQuerySchema } from '../schemas/project.schema.js';
import { CreateTaskSchema } from '../schemas/task.schema.js';

export class ProjectController {
  async createProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = CreateProjectSchema.parse(req.body);
      const project = await projectService.createProject(input);

      res.status(201).json({
        project,
        correlationId: req.correlationId,
      });
    } catch (err) {
      next(err);
    }
  }

  async listProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = ListProjectsQuerySchema.parse(req.query);
      const result = await projectService.listProjects(
        { active: query.active },
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

  async getProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const projectId = String(req.params.projectId || '');
      const project = await projectService.getProject(projectId);

      res.status(200).json({
        project,
        correlationId: req.correlationId,
      });
    } catch (err) {
      next(err);
    }
  }

  async createProjectTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const projectId = String(req.params.projectId || '');
      const input = CreateTaskSchema.parse(req.body);
      const task = await projectService.createTaskForProject(projectId, input);

      res.status(201).json({
        task,
        correlationId: req.correlationId,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const projectController = new ProjectController();

