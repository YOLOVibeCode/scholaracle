import { AgentType } from '@scholaracle/contracts';

export interface IPersonalizationInput {
  readonly subject: string;
  readonly body: string;
  readonly alertType: string;
  readonly agentType: AgentType;
  readonly tone: 'formal' | 'casual' | 'encouraging';
  readonly context?: Record<string, unknown>;
}

export interface IPersonalizationResult {
  readonly subject: string;
  readonly body: string;
  readonly wasPersonalized: boolean;
}

/**
 * Enhances notification content with AI-powered personalization.
 * Falls back gracefully to original content if AI is unavailable or disabled.
 */
export interface IPersonalizationService {
  /**
   * Enhance notification content based on user preferences and context.
   *
   * @param input - The template output and personalization context
   * @returns Enhanced content, or original content if personalization fails
   */
  enhance(input: IPersonalizationInput): Promise<IPersonalizationResult>;

  /**
   * Whether the personalization service is available and enabled.
   */
  isAvailable(): boolean;
}
