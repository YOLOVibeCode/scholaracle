import type {
  IPersonalizationService,
  IPersonalizationInput,
  IPersonalizationResult,
} from '@scholaracle/interfaces';
import { LlmClient } from './llm-client';
import { ResponseCache } from './response-cache';
import {
  buildPersonalizationSystemPrompt,
  buildPersonalizationUserPrompt,
  parsePersonalizationResponse,
} from './prompt-templates';

export interface IPersonalizationServiceConfig {
  readonly apiKey?: string;
  readonly model?: string;
  readonly enabled?: boolean;
  readonly cacheTtlMs?: number;
}

/**
 * AI-powered notification personalization service.
 * Wraps template output with LLM enhancement, with graceful fallback.
 */
export class PersonalizationService implements IPersonalizationService {
  private readonly _client: LlmClient | undefined;
  private readonly _cache: ResponseCache<IPersonalizationResult>;
  private readonly _enabled: boolean;

  constructor(config: IPersonalizationServiceConfig = {}) {
    this._enabled = config.enabled !== false && !!config.apiKey;

    if (this._enabled && config.apiKey) {
      this._client = new LlmClient({
        apiKey: config.apiKey,
        model: config.model,
      });
    }

    this._cache = new ResponseCache<IPersonalizationResult>(config.cacheTtlMs ?? 5 * 60 * 1000);
  }

  public isAvailable(): boolean {
    return this._enabled && this._client !== undefined;
  }

  public async enhance(input: IPersonalizationInput): Promise<IPersonalizationResult> {
    // If not available, return original content
    if (!this.isAvailable() || !this._client) {
      return {
        subject: input.subject,
        body: input.body,
        wasPersonalized: false,
      };
    }

    // Check cache
    const cacheKey = this._buildCacheKey(input);
    const cached = this._cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const systemPrompt = buildPersonalizationSystemPrompt(input.tone, input.agentType);
      const userPrompt = buildPersonalizationUserPrompt({
        alertType: input.alertType,
        agentType: input.agentType,
        tone: input.tone,
        subject: input.subject,
        body: input.body,
        context: input.context,
      });

      const response = await this._client.complete([{ role: 'user', content: userPrompt }], {
        maxTokens: 512,
        system: systemPrompt,
      });

      const parsed = parsePersonalizationResponse(response.content);

      if (!parsed) {
        // LLM returned unparseable response — fall back
        return {
          subject: input.subject,
          body: input.body,
          wasPersonalized: false,
        };
      }

      const result: IPersonalizationResult = {
        subject: parsed.subject,
        body: parsed.body,
        wasPersonalized: true,
      };

      this._cache.set(cacheKey, result);
      return result;
    } catch {
      // Graceful fallback on any error
      return {
        subject: input.subject,
        body: input.body,
        wasPersonalized: false,
      };
    }
  }

  private _buildCacheKey(input: IPersonalizationInput): string {
    return `${input.alertType}:${input.agentType}:${input.tone}:${input.subject}:${input.body}`;
  }
}
