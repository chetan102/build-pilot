import { ProviderCredentialModel, IProviderCredential } from '../models/provider-credential.model.js';
import { LLMProviderKind } from '@buildpilot/domain';

export class ProviderCredentialRepository {
  async findByUserId(userId: string = 'default-user'): Promise<IProviderCredential[]> {
    return ProviderCredentialModel.find({ userId }).lean();
  }

  async findActiveProvider(userId: string = 'default-user', provider?: LLMProviderKind): Promise<IProviderCredential | null> {
    const query: any = { userId, isActive: true };
    if (provider) {
      query.provider = provider;
    }
    return ProviderCredentialModel.findOne(query).lean();
  }

  async upsertCredential(data: {
    userId?: string;
    provider: LLMProviderKind;
    apiKeyEncrypted: string;
    baseUrl?: string;
    defaultModel: string;
    availableModels?: string[];
    isActive?: boolean;
  }): Promise<IProviderCredential> {
    const userId = data.userId || 'default-user';
    return ProviderCredentialModel.findOneAndUpdate(
      { userId, provider: data.provider },
      {
        ...data,
        userId,
        isActive: data.isActive ?? true,
      },
      { upsert: true, new: true },
    ).lean() as unknown as IProviderCredential;
  }

  async updateActiveStatus(provider: LLMProviderKind, isActive: boolean, userId: string = 'default-user'): Promise<IProviderCredential | null> {
    return ProviderCredentialModel.findOneAndUpdate(
      { userId, provider },
      { isActive },
      { new: true },
    ).lean() as unknown as IProviderCredential | null;
  }

  async deleteCredential(provider: LLMProviderKind, userId: string = 'default-user'): Promise<boolean> {
    const result = await ProviderCredentialModel.deleteOne({ userId, provider });
    return result.deletedCount > 0;
  }
}

export const providerCredentialRepository = new ProviderCredentialRepository();

