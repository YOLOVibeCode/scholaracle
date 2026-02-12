export interface ILlmMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface ILlmRequest {
  readonly model: string;
  readonly messages: readonly ILlmMessage[];
  readonly maxTokens: number;
  readonly system?: string;
}

export interface ILlmResponse {
  readonly content: string;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  };
}

export interface ILlmClientConfig {
  readonly apiKey: string;
  readonly model?: string;
  readonly baseUrl?: string;
}

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_BASE_URL = 'https://api.anthropic.com';

/**
 * Thin wrapper over the Anthropic Messages API.
 * Uses fetch directly — no SDK dependency.
 */
export class LlmClient {
  private readonly _apiKey: string;
  private readonly _model: string;
  private readonly _baseUrl: string;

  constructor(config: ILlmClientConfig) {
    this._apiKey = config.apiKey;
    this._model = config.model ?? DEFAULT_MODEL;
    this._baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  public async complete(
    messages: readonly ILlmMessage[],
    options?: { maxTokens?: number; system?: string }
  ): Promise<ILlmResponse> {
    const maxTokens = options?.maxTokens ?? 512;

    const body: Record<string, unknown> = {
      model: this._model,
      max_tokens: maxTokens,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };

    if (options?.system) {
      body['system'] = options.system;
    }

    const res = await fetch(`${this._baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this._apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LLM API error ${res.status}: ${text}`);
    }

    const json = (await res.json()) as {
      content: { type: string; text: string }[];
      usage: { input_tokens: number; output_tokens: number };
    };

    const textBlock = json.content.find((b) => b.type === 'text');

    return {
      content: textBlock?.text ?? '',
      usage: {
        inputTokens: json.usage.input_tokens,
        outputTokens: json.usage.output_tokens,
      },
    };
  }

  public get model(): string {
    return this._model;
  }
}
