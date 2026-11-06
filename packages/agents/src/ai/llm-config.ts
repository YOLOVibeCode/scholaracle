import { resolveModelForRole, type AiRole } from './models';

/** Where and how a server-side LLM call is made. */
export interface ILlmConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
}

/** The Noctusoft LLM relay (LiteLLM behind the ai.noctusoft.com gateway). `LlmClient` appends `/v1/messages`. */
export const DEFAULT_RELAY_BASE_URL = 'https://ai.noctusoft.com';
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

/**
 * Resolve the LLM endpoint for a role. The relay key (`LITELLM_API_KEY`) wins, with
 * `LITELLM_BASE_URL` (default the relay); a direct Anthropic key is the fallback.
 * Returns null when no key is configured, so callers can skip AI features cleanly.
 */
export function resolveLlmConfig(role: AiRole): ILlmConfig | null {
  const relayKey = process.env['LITELLM_API_KEY']?.trim();
  if (relayKey) {
    return {
      apiKey: relayKey,
      baseUrl: process.env['LITELLM_BASE_URL']?.trim() || DEFAULT_RELAY_BASE_URL,
      model: resolveModelForRole(role),
    };
  }
  const anthropicKey =
    process.env['ANTHROPIC_API_KEY']?.trim() || process.env['AI_API_KEY']?.trim();
  if (anthropicKey) {
    return { apiKey: anthropicKey, baseUrl: ANTHROPIC_BASE_URL, model: resolveModelForRole(role) };
  }
  return null;
}
