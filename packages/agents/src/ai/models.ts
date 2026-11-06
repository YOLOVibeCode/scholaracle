/** Model id for a server-side LLM use case; env override `AI_MODEL_<ROLE>`. */

export type AiRole = 'matching' | 'triage' | 'patch' | 'escalate';

const DEFAULT_BY_ROLE: Readonly<Record<AiRole, string>> = {
  matching: 'claude-sonnet-5-5',
  triage: 'claude-haiku-5-5',
  patch: 'claude-sonnet-5-5',
  escalate: 'claude-opus-5-5',
};

const ENV_KEY_BY_ROLE: Readonly<Record<AiRole, string>> = {
  matching: 'AI_MODEL_MATCHING',
  triage: 'AI_MODEL_TRIAGE',
  patch: 'AI_MODEL_PATCH',
  escalate: 'AI_MODEL_ESCALATE',
};

export function resolveModelForRole(role: AiRole): string {
  const fromEnv = process.env[ENV_KEY_BY_ROLE[role]]?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }
  return DEFAULT_BY_ROLE[role];
}
