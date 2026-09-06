import { LLMProviderKind, LLMProviderType } from '@buildpilot/domain';
import { LLMProvider } from './interfaces.js';
import { ProviderConfig, ProviderConfigSchema } from './types.js';
import { InvalidRequestError } from './errors.js';
import { MockLLMProvider } from './base-provider.js';
import { OpenRouterProvider } from './openrouter.js';

export type ProviderConstructor = new (id: string, config: ProviderConfig) => LLMProvider;
export type ProviderFactoryFn = (config: ProviderConfig) => LLMProvider;

export class ProviderFactory {
  private registry = new Map<string, ProviderConstructor | ProviderFactoryFn>();
  private instanceCache = new Map<string, LLMProvider>();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    // Default registration for Mock Provider
    this.register('MOCK', (config) => new MockLLMProvider('mock:default', config));

    // Default registration for OpenRouter Provider
    this.register(LLMProviderType.OPENROUTER, (config) => {
      const id = `openrouter:${config.defaultModel || 'default'}`;
      return new OpenRouterProvider(id, config);
    });
  }

  /**
   * Register a provider constructor or factory function for a provider type
   */
  register(
    providerType: LLMProviderKind | string,
    creator: ProviderConstructor | ProviderFactoryFn,
  ): void {
    const key = String(providerType).toUpperCase();
    this.registry.set(key, creator);
  }

  /**
   * Unregister a provider type
   */
  unregister(providerType: LLMProviderKind | string): boolean {
    const key = String(providerType).toUpperCase();
    return this.registry.delete(key);
  }

  /**
   * Checks if a provider type is registered
   */
  has(providerType: LLMProviderKind | string): boolean {
    const key = String(providerType).toUpperCase();
    return this.registry.has(key);
  }

  /**
   * Lists all currently registered provider types
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * Creates a new LLMProvider instance according to the config
   */
  create(config: ProviderConfig): LLMProvider {
    // Validate config
    const validated = ProviderConfigSchema.safeParse(config);
    if (!validated.success) {
      throw new InvalidRequestError(
        `Invalid ProviderConfig: ${validated.error.errors.map((e) => e.message).join(', ')}`,
        {
          param: 'config',
        },
      );
    }

    const key = String(config.providerType).toUpperCase();
    const creator = this.registry.get(key);

    if (!creator) {
      throw new InvalidRequestError(
        `Unsupported LLM provider type '${config.providerType}'. Registered providers: ${this.getRegisteredTypes().join(', ')}`,
        {
          provider: config.providerType,
          param: 'providerType',
        },
      );
    }

    // Check if constructor or factory function
    try {
      if (typeof creator === 'function' && creator.prototype && creator.prototype.constructor === creator) {
        const id = `${key.toLowerCase()}:${config.defaultModel || 'default'}`;
        return new (creator as ProviderConstructor)(id, config);
      } else {
        return (creator as ProviderFactoryFn)(config);
      }
    } catch (err: any) {
      if (err instanceof InvalidRequestError) throw err;
      throw new InvalidRequestError(`Failed to instantiate LLM provider '${key}': ${err.message}`, {
        provider: key,
        rawError: err,
      });
    }
  }

  /**
   * Returns a cached provider or creates a new one based on cache key
   */
  getOrCreate(config: ProviderConfig): LLMProvider {
    const cacheKey = `${String(config.providerType).toUpperCase()}__${config.apiKey || ''}__${config.baseUrl || ''}__${config.defaultModel || ''}`;
    let instance = this.instanceCache.get(cacheKey);
    if (!instance) {
      instance = this.create(config);
      this.instanceCache.set(cacheKey, instance);
    }
    return instance;
  }

  /**
   * Clears cached instances
   */
  clearCache(): void {
    this.instanceCache.clear();
  }

  /**
   * Resets registry to defaults
   */
  reset(): void {
    this.registry.clear();
    this.instanceCache.clear();
    this.registerDefaults();
  }
}

export const providerFactory = new ProviderFactory();
