import { resolveLlmConfig as resolveForRole, type ILlmConfig } from '@scholaracle/agents';

export type IResolvedLlmConfig = ILlmConfig;

/** Server-side LLM config for material matching and vision (relay preferred). */
export function resolveLlmConfig(): IResolvedLlmConfig | null {
  return resolveForRole('matching');
}
