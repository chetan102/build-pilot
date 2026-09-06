import mongoose from 'mongoose';
import { ProjectModel, IProject } from '../models/project.model.js';

export interface ListProjectsFilter {
  active?: boolean;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export class ProjectRepository {
  async create(data: Partial<IProject>): Promise<IProject> {
    return ProjectModel.create(data);
  }

  async findById(id: string): Promise<IProject | null> {
    if (!mongoose.isValidObjectId(id)) {
      return null;
    }
    return ProjectModel.findById(id).exec();
  }

  async findBySlug(slug: string): Promise<IProject | null> {
    return ProjectModel.findOne({ slug: slug.toLowerCase().trim() }).exec();
  }

  async findByIdOrSlug(idOrSlug: string): Promise<IProject | null> {
    const isObjectId = mongoose.isValidObjectId(idOrSlug);
    if (isObjectId) {
      return ProjectModel.findOne({
        $or: [{ _id: idOrSlug }, { slug: idOrSlug.toLowerCase().trim() }],
      }).exec();
    }
    return this.findBySlug(idOrSlug);
  }

  async list(
    filter: ListProjectsFilter = {},
    pagination: PaginationOptions = {},
  ): Promise<{ projects: IProject[]; total: number }> {
    const query: Record<string, unknown> = {};

    if (filter.active !== undefined) {
      query.active = filter.active;
    }

    const page = pagination.page && pagination.page > 0 ? pagination.page : 1;
    const limit = pagination.limit && pagination.limit > 0 ? pagination.limit : 20;
    const skip = (page - 1) * limit;

    const [projects, total] = await Promise.all([
      ProjectModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      ProjectModel.countDocuments(query).exec(),
    ]);

    return { projects, total };
  }

  async listActive(): Promise<IProject[]> {
    return ProjectModel.find({ active: true }).sort({ createdAt: -1 }).exec();
  }

  async update(id: string, data: Partial<IProject>): Promise<IProject | null> {
    if (!mongoose.isValidObjectId(id)) {
      return null;
    }
    return ProjectModel.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
  }

  async deleteById(id: string): Promise<boolean> {
    if (!mongoose.isValidObjectId(id)) {
      return false;
    }
    const res = await ProjectModel.findByIdAndDelete(id).exec();
    return res !== null;
  }
}

export const projectRepository = new ProjectRepository();
