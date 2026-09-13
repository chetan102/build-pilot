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
  [LLMProviderType.CUSTOM_OPENAI_COMPATIBLE]: 'claude-3-5-sonnet',
};

// GET /api/v1/providers - list configured and available providers
providersRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const credentials = await providerCredentialRepository.findByUserId('default-user');

    const configured = credentials.map((cred: any) => {
      let maskedKey = '';
      if (cred.apiKeyEncrypted) {
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
        id: cred._id?.toString() || cred.provider,
        credentialId: cred._id?.toString(),
        name: cred.name || `${cred.provider} Setup`,
        provider: cred.provider,
        description: cred.baseUrl ? `Endpoint: ${cred.baseUrl}` : `Native ${cred.provider} connection`,
        defaultModel: cred.defaultModel || DEFAULT_MODELS_MAP[cred.provider as LLMProviderKind] || 'default-model',
        availableModels: cred.availableModels || [cred.defaultModel],
        hasApiKey: Boolean(cred.apiKeyEncrypted),
        maskedApiKey: maskedKey || undefined,
        status: cred.isActive ? 'connected' : 'not_configured',
        isActive: Boolean(cred.isActive),
        baseUrl: cred.baseUrl,
      };
    });

    res.json({
      providers: configured,
      configuredProviders: configured,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/providers/:id/status - Toggle active/inactive
providersRouter.patch('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id || '');
    if (!id) {
      return res.status(400).json({ error: 'Provider ID is required' });
    }
    const { isActive } = req.body;
    const updated = await providerCredentialRepository.updateActiveStatus(
      id,
      Boolean(isActive),
      'default-user',
    );
    if (!updated) {
      return res.status(404).json({ error: `Provider credential ${id} not found` });
    }
    res.json({ success: true, id: (updated as any)._id?.toString(), isActive: updated.isActive });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/providers - Save / update provider credential
providersRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, name, provider, apiKey, defaultModel, availableModels, baseUrl } = req.body;
    if (!provider) {
      return res.status(400).json({ error: 'Valid provider type is required' });
    }

    let encryptedKey: string | undefined;
    if (apiKey && typeof apiKey === 'string' && apiKey.trim().length >= 4 && !apiKey.includes('••••')) {
      encryptedKey = secretsManager.encrypt(apiKey.trim());
    } else if (id) {
      // Retain existing key if editing without changing key
      const existing = await providerCredentialRepository.findById(id);
      if (existing) {
        encryptedKey = existing.apiKeyEncrypted;
      }
    }

    if (!encryptedKey) {
      return res.status(400).json({ error: 'A valid API key is required' });
    }

    const modelToUse = defaultModel || DEFAULT_MODELS_MAP[provider as LLMProviderKind] || 'gpt-4o';
    const modelsList = Array.isArray(availableModels) && availableModels.length > 0
      ? availableModels.map((m: string) => m.trim()).filter(Boolean)
      : [modelToUse];

    const title = name && name.trim().length > 0 ? name.trim() : `${provider} Setup`;

    const saved = await providerCredentialRepository.upsertCredential({
      id,
      userId: 'default-user',
      name: title,
      provider: provider as LLMProviderKind,
      apiKeyEncrypted: encryptedKey,
      baseUrl: baseUrl ? baseUrl.trim() : undefined,
      defaultModel: modelToUse,
      availableModels: modelsList,
      isActive: true,
    });

    res.json({
      success: true,
      message: `Credentials for "${title}" saved successfully.`,
      id: (saved as any)._id?.toString(),
      name: saved.name,
      provider: saved.provider,
      defaultModel: saved.defaultModel,
      availableModels: saved.availableModels,
      baseUrl: saved.baseUrl,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/providers/:id - Delete provider credential
providersRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id || '');
    if (!id) {
      return res.status(400).json({ error: 'Provider ID is required' });
    }
    const deleted = await providerCredentialRepository.deleteCredential(id, 'default-user');
    res.json({ success: deleted, message: `Removed provider credential` });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/providers/test - Test connection
providersRouter.post('/test', async (req: Request, res: Response) => {
  try {
    const { id, provider, apiKey, baseUrl, defaultModel } = req.body;
    let keyToTest = apiKey;

    if (!keyToTest || keyToTest.includes('••••')) {
      // Find from DB by id or provider
      const cred = id
        ? await providerCredentialRepository.findById(id)
        : await providerCredentialRepository.findActiveProvider('default-user', provider as LLMProviderKind);
      if (cred?.apiKeyEncrypted) {
        keyToTest = secretsManager.decrypt(cred.apiKeyEncrypted);
      }
    }

    if (!keyToTest || keyToTest.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'No API key provided or found in saved settings' });
    }

    const modelToUse = defaultModel || DEFAULT_MODELS_MAP[provider as LLMProviderKind] || 'gpt-4o';
    const providerInstance = providerFactory.create({
      providerType: provider as LLMProviderKind,
      apiKey: keyToTest.trim(),
      baseUrl: baseUrl ? baseUrl.trim() : undefined,
      defaultModel: modelToUse,
    });

    // Always perform a live test generation with the exact model name to verify key, endpoint, AND model availability
    const testRes = await providerInstance.generate({
      model: modelToUse,
      messages: [{ role: 'user', content: 'Ping' }],
      maxTokens: 5,
    });

    if (!testRes) {
      return res.status(400).json({
        success: false,
        error: `Provider did not return a response for model "${modelToUse}".`,
      });
    }

    res.json({
      success: true,
      message: `Successfully verified "${modelToUse}" on ${provider}!`,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
