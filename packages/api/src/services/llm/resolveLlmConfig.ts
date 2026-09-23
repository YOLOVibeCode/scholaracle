export interface IResolvedLlmConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model?: string;
}

const DEFAULT_LITELLM_BASE = 'https://api.noctusoft.com/v1';
const DEFAULT_ANTHROPIC_BASE = 'https://api.anthropic.com';

/** Resolve server-side LLM credentials (LiteLLM proxy preferred). */
export function resolveLlmConfig(): IResolvedLlmConfig | null {
  const litellmKey = process.env['LITELLM_API_KEY']?.trim();
  if (litellmKey) {
    return {
      apiKey: litellmKey,
      baseUrl: process.env['LITELLM_BASE_URL']?.trim() || DEFAULT_LITELLM_BASE,
      model: process.env['AI_MODEL']?.trim(),
    };
  }
  const anthropicKey =
    process.env['ANTHROPIC_API_KEY']?.trim() || process.env['AI_API_KEY']?.trim();
  if (anthropicKey) {
    return {
      apiKey: anthropicKey,
      baseUrl: DEFAULT_ANTHROPIC_BASE,
      model: process.env['AI_MODEL']?.trim(),
    };
  }
  return null;
}
