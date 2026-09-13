import { ProviderCredentialModel, IProviderCredential } from '../models/provider-credential.model.js';
import { LLMProviderKind } from '@buildpilot/domain';

export class ProviderCredentialRepository {
  async findByUserId(userId: string = 'default-user'): Promise<IProviderCredential[]> {
    return ProviderCredentialModel.find({ userId }).sort({ createdAt: -1 }).lean();
  }

  async findById(id: string): Promise<IProviderCredential | null> {
    return ProviderCredentialModel.findById(id).lean();
  }

  async findActiveProvider(userId: string = 'default-user', provider?: LLMProviderKind, id?: string): Promise<IProviderCredential | null> {
    const query: any = { userId, isActive: true };
    if (id) {
      return ProviderCredentialModel.findOne({ _id: id, ...query }).lean();
    }
    if (provider) {
      query.provider = provider;
    }
    return ProviderCredentialModel.findOne(query).sort({ updatedAt: -1 }).lean();
  }

  async upsertCredential(data: {
    id?: string;
    userId?: string;
    name?: string;
    provider: LLMProviderKind;
    apiKeyEncrypted: string;
    baseUrl?: string;
    defaultModel: string;
    availableModels?: string[];
    isActive?: boolean;
  }): Promise<IProviderCredential> {
    const userId = data.userId || 'default-user';
    const name = data.name || `${data.provider} Setup`;

    if (data.id) {
      return ProviderCredentialModel.findByIdAndUpdate(
        data.id,
        {
          ...data,
          name,
          userId,
          isActive: data.isActive ?? true,
        },
        { new: true },
      ).lean() as unknown as IProviderCredential;
    }

    // Try finding by name + userId
    const existing = await ProviderCredentialModel.findOne({ userId, name });
    if (existing) {
      return ProviderCredentialModel.findByIdAndUpdate(
        existing._id,
        {
          ...data,
          name,
          userId,
          isActive: data.isActive ?? true,
        },
        { new: true },
      ).lean() as unknown as IProviderCredential;
    }

    return ProviderCredentialModel.create({
      ...data,
      name,
      userId,
      isActive: data.isActive ?? true,
    }) as unknown as IProviderCredential;
  }

  async updateActiveStatus(idOrProvider: string, isActive: boolean, userId: string = 'default-user'): Promise<IProviderCredential | null> {
    let query: any = { userId };
    if (idOrProvider.length === 24 && /^[0-9a-fA-F]+$/.test(idOrProvider)) {
      query._id = idOrProvider;
    } else {
      query.provider = idOrProvider;
    }

    return ProviderCredentialModel.findOneAndUpdate(
      query,
      { isActive },
      { new: true },
    ).lean() as unknown as IProviderCredential | null;
  }

  async deleteCredential(idOrProvider: string, userId: string = 'default-user'): Promise<boolean> {
    let query: any = { userId };
    if (idOrProvider.length === 24 && /^[0-9a-fA-F]+$/.test(idOrProvider)) {
      query._id = idOrProvider;
    } else {
      query.provider = idOrProvider;
    }

    const result = await ProviderCredentialModel.deleteOne(query);
    return result.deletedCount > 0;
  }
}

export const providerCredentialRepository = new ProviderCredentialRepository();

