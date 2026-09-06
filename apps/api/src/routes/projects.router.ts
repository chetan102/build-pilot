import { Router } from 'express';
import { projectController } from '../controllers/project.controller.js';

export const projectsRouter: Router = Router();

projectsRouter.post('/', (req, res, next) => projectController.createProject(req, res, next));
projectsRouter.get('/', (req, res, next) => projectController.listProjects(req, res, next));
projectsRouter.get('/:projectId', (req, res, next) => projectController.getProject(req, res, next));
projectsRouter.post('/:projectId/tasks', (req, res, next) => projectController.createProjectTask(req, res, next));
