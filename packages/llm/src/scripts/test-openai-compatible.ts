import { OpenAICompatibleProvider } from '../openai-compatible.js';
import { LLMRequest, ToolDefinition } from '../types.js';
import { LLMProviderType } from '@buildpilot/domain';

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o';

  console.log(`🚀 Initializing OpenAICompatibleProvider with endpoint: ${baseUrl}, model: ${model}`);

  const provider = new OpenAICompatibleProvider('openai:cli', {
    providerType: LLMProviderType.OPENAI,
    apiKey: apiKey || 'mock-key',
    baseUrl,
    defaultModel: model,
  });

  const tools: ToolDefinition[] = [
    {
      name: 'replace_file_content',
      description: 'Edits target file content',
      parameters: {
        type: 'object',
        properties: {
          targetFile: { type: 'string', description: 'Absolute or relative path to file' },
          instruction: { type: 'string', description: 'Brief description of edit' },
        },
        required: ['targetFile', 'instruction'],
      },
    },
  ];

  const request: LLMRequest = {
    model,
    systemPrompt: 'You are an autonomous AI engineering agent. Use tool calls to fulfill the user request.',
    messages: [
      {
        role: 'user',
        content: 'Please edit file "src/server.ts" to add error handling middleware.',
      },
    ],
    tools,
    toolChoice: 'auto',
    temperature: 0.1,
  };

  console.log('📤 Sending prompt with tool definitions...');
  try {
    const response = await provider.generate(request);
    console.log('\n✅ Received Normalized LLM Response:');
    console.log(JSON.stringify(response, null, 2));

    if (response.toolCalls && response.toolCalls.length > 0) {
      console.log(`\n🛠️  Parsed ${response.toolCalls.length} tool call(s):`);
      for (const tc of response.toolCalls) {
        console.log(`- [${tc.id}] Function: ${tc.name}`);
        console.log(`  Arguments:`, tc.arguments);
      }
    }
  } catch (err: any) {
    console.error('❌ Request error:', err.message, err.code);
    if (!apiKey) {
      console.log('💡 Note: Set OPENAI_API_KEY or OPENAI_BASE_URL (e.g. for Ollama) in your environment to execute live network calls.');
    }
  }
}

if (process.env.NODE_ENV !== 'test') {
  main().catch(console.error);
}

