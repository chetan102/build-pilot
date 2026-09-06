import { EventModel, IEvent } from '../models/event.model.js';

export class EventRepository {
  async create(data: Partial<IEvent>): Promise<IEvent> {
    return EventModel.create(data);
  }

  async listByTask(taskId: string): Promise<IEvent[]> {
    return EventModel.find({ taskId }).sort({ timestamp: 1 }).exec();
  }

  async listByRun(runId: string): Promise<IEvent[]> {
    return EventModel.find({ runId }).sort({ timestamp: 1 }).exec();
  }
}

export const eventRepository = new EventRepository();

