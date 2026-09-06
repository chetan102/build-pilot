import { RepositoryModel, IRepository } from '../models/repository.model.js';

export class RepositoryRepository {
  async create(data: Partial<IRepository>): Promise<IRepository> {
    return RepositoryModel.create(data);
  }

  async findById(id: string): Promise<IRepository | null> {
    return RepositoryModel.findById(id).exec();
  }

  async findByFullName(fullName: string): Promise<IRepository | null> {
    return RepositoryModel.findOne({ fullName }).exec();
  }

  async listByProject(projectId: string): Promise<IRepository[]> {
    return RepositoryModel.find({ projectId }).sort({ createdAt: -1 }).exec();
  }

  async deleteById(id: string): Promise<boolean> {
    const res = await RepositoryModel.findByIdAndDelete(id).exec();
    return res !== null;
  }
}

export const repositoryRepository = new RepositoryRepository();
