import { RepositoryKnowledgeModel, IRepositoryKnowledge } from '../models/repository-knowledge.model.js';

export class RepositoryKnowledgeRepository {
  async findByRepositoryId(repositoryId: string): Promise<IRepositoryKnowledge | null> {
    return RepositoryKnowledgeModel.findOne({ repositoryId }).exec();
  }

  async upsert(repositoryId: string, data: Partial<IRepositoryKnowledge>): Promise<IRepositoryKnowledge> {
    const updated = await RepositoryKnowledgeModel.findOneAndUpdate(
      { repositoryId },
      { $set: data },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    ).exec();
    // `upsert: true, new: true` guarantees a document is returned — non-null assertion is safe
    return updated!;
  }

  async invalidate(repositoryId: string): Promise<boolean> {
    const result = await RepositoryKnowledgeModel.deleteOne({ repositoryId }).exec();
    return result.deletedCount > 0;
  }

  async addLearning(repositoryId: string, learning: string): Promise<IRepositoryKnowledge | null> {
    // Use atomic $push + $slice to avoid read-modify-write race conditions
    // when multiple workers complete tasks for the same repository simultaneously.
    return RepositoryKnowledgeModel.findOneAndUpdate(
      { repositoryId },
      { $push: { pastLearnings: { $each: [learning], $slice: -20 } } },
      { new: true }
    ).exec();
  }

  async isValid(repositoryId: string, currentCommitSha: string): Promise<boolean> {
    const doc = await RepositoryKnowledgeModel.findOne({ repositoryId }).exec();
    if (!doc) return false;

    if (doc.commitSha !== currentCommitSha) return false;
    // Guard against null/undefined expiresAt (null <= new Date() is truthy in JS)
    if (!doc.expiresAt || new Date(doc.expiresAt) <= new Date()) return false;

    return true;
  }
}

export const repositoryKnowledgeRepository = new RepositoryKnowledgeRepository();
