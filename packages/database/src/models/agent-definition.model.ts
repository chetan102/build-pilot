import mongoose, { Schema, Model } from 'mongoose';

export interface IAgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  defaultModel: string;
  maxSteps: number;
  temperature: number;
  isDefault: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export const AgentDefinitionSchema = new Schema<IAgentDefinition>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, required: true },
    systemPrompt: { type: String, required: true },
    tools: { type: [String], default: [] },
    defaultModel: { type: String, default: 'anthropic/claude-3.5-sonnet' },
    maxSteps: { type: Number, default: 30 },
    temperature: { type: Number, default: 0.2 },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const AgentDefinitionModel: Model<IAgentDefinition> =
  mongoose.models.AgentDefinition ||
  mongoose.model<IAgentDefinition>('AgentDefinition', AgentDefinitionSchema);
