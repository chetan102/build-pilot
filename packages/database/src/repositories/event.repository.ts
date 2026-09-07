import { EventEmitter } from 'events';
import { EventModel, IEvent } from '../models/event.model.js';

export class EventRepository extends EventEmitter {
  async create(data: Partial<IEvent>): Promise<IEvent> {
    const created = await EventModel.create(data);
    if (created.taskId) {
      this.emit(`task:${created.taskId}`, created);
      this.emit('task:any', created);
    }
    return created;
  }

  async listByTask(taskId: string): Promise<IEvent[]> {
    return EventModel.find({ taskId }).sort({ timestamp: 1 }).exec();
  }

  async listByRun(runId: string): Promise<IEvent[]> {
    return EventModel.find({ runId }).sort({ timestamp: 1 }).exec();
  }

  subscribeTask(taskId: string, handler: (event: IEvent) => void): () => void {
    const eventKey = `task:${taskId}`;
    this.on(eventKey, handler);
    return () => this.off(eventKey, handler);
  }
}

export const eventRepository = new EventRepository();

