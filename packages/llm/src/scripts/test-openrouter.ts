import { OpenRouterProvider } from '../openrouter.js';
import { LLMRequest, ToolDefinition } from '../types.js';
import { LLMProviderType } from '@buildpilot/domain';

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.log('ℹ️  No OPENROUTER_API_KEY found in environment. Running in mock demonstration mode.');
  }

  const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
  console.log(`🚀 Initializing OpenRouterProvider with model: ${model}`);

  const provider = new OpenRouterProvider('openrouter:cli', {
    providerType: LLMProviderType.OPENROUTER,
    apiKey: apiKey || 'mock-key',
    defaultModel: model,
  });

  const tools: ToolDefinition[] = [
    {
      name: 'get_weather',
      description: 'Get the current weather for a given city',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'The city name' },
          unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
        },
        required: ['city'],
      },
    },
    {
      name: 'read_code_file',
      description: 'Reads the source content of a codebase file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path to file' },
        },
        required: ['path'],
      },
    },
  ];

  const request: LLMRequest = {
    model,
    systemPrompt: 'You are an autonomous AI engineering agent. Use tool calls to fulfill the user request.',
    messages: [
      {
        role: 'user',
        content: 'Please read the file at path "src/index.ts" to check the exports.',
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
      console.log('💡 Note: Set OPENROUTER_API_KEY in your .env or shell to execute live network calls.');
    }
  }
}

if (process.env.NODE_ENV !== 'test') {
  main().catch(console.error);
}

