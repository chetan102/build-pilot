import { ProjectModel, IProject } from '../models/project.model.js';

export class ProjectRepository {
  async create(data: Partial<IProject>): Promise<IProject> {
    return ProjectModel.create(data);
  }

  async findById(id: string): Promise<IProject | null> {
    return ProjectModel.findById(id).exec();
  }

  async findBySlug(slug: string): Promise<IProject | null> {
    return ProjectModel.findOne({ slug }).exec();
  }

  async listActive(): Promise<IProject[]> {
    return ProjectModel.find({ active: true }).sort({ createdAt: -1 }).exec();
  }

  async update(id: string, data: Partial<IProject>): Promise<IProject | null> {
    return ProjectModel.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
  }

  async deleteById(id: string): Promise<boolean> {
    const res = await ProjectModel.findByIdAndDelete(id).exec();
    return res !== null;
  }
}

export const projectRepository = new ProjectRepository();
