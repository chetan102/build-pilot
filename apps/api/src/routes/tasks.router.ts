import { Router } from 'express';
import { taskController } from '../controllers/task.controller.js';

export const tasksRouter: Router = Router();

tasksRouter.get('/', (req, res, next) => taskController.listTasks(req, res, next));
tasksRouter.get('/:taskId', (req, res, next) => taskController.getTask(req, res, next));
tasksRouter.post('/:taskId/cancel', (req, res, next) => taskController.cancelTask(req, res, next));
tasksRouter.post('/:taskId/retry', (req, res, next) => taskController.retryTask(req, res, next));
