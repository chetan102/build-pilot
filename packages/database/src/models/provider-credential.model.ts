import mongoose, { Schema, Model } from 'mongoose';
import { LLMProviderType, LLMProviderKind } from '@buildpilot/domain';

export interface IProviderCredential {
  userId: string;
  provider: LLMProviderKind;
  apiKeyEncrypted: string;
  baseUrl?: string;
  defaultModel: string;
  availableModels: string[];
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export const ProviderCredentialSchema = new Schema<IProviderCredential>(
  {
    userId: { type: String, required: true, index: true },
    provider: { type: String, enum: Object.values(LLMProviderType), required: true },
    apiKeyEncrypted: { type: String, required: true },
    baseUrl: { type: String },
    defaultModel: { type: String, required: true },
    availableModels: { type: [String], default: [] },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

ProviderCredentialSchema.index({ userId: 1, provider: 1 }, { unique: true });

export const ProviderCredentialModel: Model<IProviderCredential> =
  mongoose.models.ProviderCredential ||
  mongoose.model<IProviderCredential>('ProviderCredential', ProviderCredentialSchema);
