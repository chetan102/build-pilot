import { Router, Request, Response, NextFunction } from 'express';
import { providerCredentialRepository } from '@buildpilot/database';
import { LLMProviderType, LLMProviderKind } from '@buildpilot/domain';
import { secretsManager } from '@buildpilot/shared';
import { providerFactory } from '@buildpilot/llm';

export const providersRouter: Router = Router();

const DEFAULT_MODELS_MAP: Record<string, string> = {
  [LLMProviderType.OPENAI]: 'gpt-4o',
  [LLMProviderType.GEMINI]: 'gemini-1.5-pro',
  [LLMProviderType.ANTHROPIC]: 'claude-3-5-sonnet-20241022',
  [LLMProviderType.OPENROUTER]: 'anthropic/claude-3.5-sonnet',
  [LLMProviderType.CUSTOM_OPENAI_COMPATIBLE]: 'default-model',
};

// GET /api/v1/providers - list configured providers
providersRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const credentials = await providerCredentialRepository.findByUserId('default-user');
    
    // Map with default list of supported providers
    const supportedProviders = [
      {
        id: LLMProviderType.OPENAI,
        name: 'OpenAI',
        description: 'Direct GPT-4o, GPT-4o-mini, and o1 models',
        defaultModel: 'gpt-4o',
        availableModels: ['gpt-4o', 'gpt-4o-mini', 'o1-mini', 'o1-preview'],
      },
      {
        id: LLMProviderType.GEMINI,
        name: 'Google Gemini',
        description: 'Direct Gemini 1.5 Pro & Gemini 1.5 Flash models',
        defaultModel: 'gemini-1.5-pro',
        availableModels: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash-exp'],
      },
      {
        id: LLMProviderType.ANTHROPIC,
        name: 'Anthropic Claude',
        description: 'Direct Claude 3.5 Sonnet & Claude 3.5 Haiku',
        defaultModel: 'claude-3-5-sonnet-20241022',
        availableModels: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
      },
      {
        id: LLMProviderType.OPENROUTER,
        name: 'OpenRouter',
        description: 'Access 100+ AI models including Claude 3.5 Sonnet, DeepSeek R1, and Llama 3',
        defaultModel: 'anthropic/claude-3.5-sonnet',
        availableModels: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'deepseek/deepseek-r1', 'meta-llama/llama-3.3-70b-instruct'],
      },
    ];

    const result = supportedProviders.map((sp) => {
      const cred = credentials.find((c) => c.provider === sp.id);
      let maskedKey = '';
      if (cred?.apiKeyEncrypted) {
        try {
          const decrypted = secretsManager.decrypt(cred.apiKeyEncrypted);
          if (decrypted.length > 8) {
            maskedKey = `${decrypted.slice(0, 4)}••••••••${decrypted.slice(-4)}`;
          } else {
            maskedKey = '••••••••';
          }
        } catch {
          maskedKey = '••••••••';
        }
      }

      return {
        ...sp,
        hasApiKey: Boolean(cred?.apiKeyEncrypted),
        maskedApiKey: maskedKey || undefined,
        status: cred?.isActive ? 'connected' : 'not_configured',
        isActive: cred ? Boolean(cred.isActive) : false,
        defaultModel: cred?.defaultModel || sp.defaultModel,
        availableModels: (cred?.availableModels && cred.availableModels.length > 0) ? cred.availableModels : sp.availableModels,
        baseUrl: cred?.baseUrl,
      };
    });

    res.json({ providers: result });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/providers/:provider/status - Toggle active/inactive
providersRouter.patch('/:provider/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { provider } = req.params;
    const { isActive } = req.body;
    const updated = await providerCredentialRepository.updateActiveStatus(
      provider as LLMProviderKind,
      Boolean(isActive),
      'default-user',
    );
    if (!updated) {
      return res.status(404).json({ error: `Provider ${provider} not found or not configured` });
    }
    res.json({ success: true, provider: updated.provider, isActive: updated.isActive });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/providers - Save / update provider credential
providersRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { provider, apiKey, defaultModel, availableModels, baseUrl } = req.body;
    if (!provider || !apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 5) {
      return res.status(400).json({ error: 'Valid provider and apiKey are required' });
    }

    const encryptedKey = secretsManager.encrypt(apiKey.trim());
    const modelToUse = defaultModel || DEFAULT_MODELS_MAP[provider as LLMProviderKind] || 'default';
    const modelsList = Array.isArray(availableModels) && availableModels.length > 0
      ? availableModels.map((m: string) => m.trim()).filter(Boolean)
      : [modelToUse];

    const saved = await providerCredentialRepository.upsertCredential({
      userId: 'default-user',
      provider: provider as LLMProviderKind,
      apiKeyEncrypted: encryptedKey,
      baseUrl: baseUrl ? baseUrl.trim() : undefined,
      defaultModel: modelToUse,
      availableModels: modelsList,
      isActive: true,
    });

    res.json({
      success: true,
      message: `API Key for ${provider} saved securely.`,
      provider: saved.provider,
      defaultModel: saved.defaultModel,
      availableModels: saved.availableModels,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/providers/:provider - Delete provider credential
providersRouter.delete('/:provider', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { provider } = req.params;
    await providerCredentialRepository.deleteCredential(provider as LLMProviderKind, 'default-user');
    res.json({ success: true, message: `Removed credentials for ${provider}` });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/providers/test - Test connection
providersRouter.post('/test', async (req: Request, res: Response) => {
  try {
    const { provider, apiKey, baseUrl, defaultModel } = req.body;
    let keyToTest = apiKey;

    if (!keyToTest) {
      // Find from DB
      const cred = await providerCredentialRepository.findActiveProvider('default-user', provider as LLMProviderKind);
      if (cred?.apiKeyEncrypted) {
        keyToTest = secretsManager.decrypt(cred.apiKeyEncrypted);
      }
    }

    if (!keyToTest || keyToTest.trim().length < 5) {
      return res.status(400).json({ success: false, error: 'No API key provided or found in saved settings' });
    }

    const modelToUse = defaultModel || DEFAULT_MODELS_MAP[provider as LLMProviderKind] || 'default';
    const providerInstance = providerFactory.create({
      providerType: provider as LLMProviderKind,
      apiKey: keyToTest.trim(),
      baseUrl: baseUrl ? baseUrl.trim() : undefined,
      defaultModel: modelToUse,
    });

    let isValid = true;
    if (typeof providerInstance.validateConnection === 'function') {
      isValid = await providerInstance.validateConnection();
    } else {
      await providerInstance.generate({
        model: modelToUse,
        messages: [{ role: 'user', content: 'Ping' }],
        maxTokens: 5,
      });
    }

    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Provider connection validation failed. Please check your API key.',
      });
    }

    res.json({
      success: true,
      message: `Successfully verified API Key for ${provider}!`,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
