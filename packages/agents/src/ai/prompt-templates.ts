import { AgentType } from '@scholaracle/contracts';

export type PersonalizationTone = 'formal' | 'casual' | 'encouraging';

export interface IPromptContext {
  readonly alertType: string;
  readonly agentType: AgentType;
  readonly tone: PersonalizationTone;
  readonly subject: string;
  readonly body: string;
  readonly context?: Record<string, unknown>;
}

const TONE_DESCRIPTIONS: Record<PersonalizationTone, string> = {
  formal: 'Professional and respectful. Use proper language, avoid slang.',
  casual: 'Friendly and approachable. Use conversational language.',
  encouraging: 'Warm and supportive. Emphasize positive aspects and motivation.',
};

const AGENT_DESCRIPTIONS: Record<AgentType, string> = {
  [AgentType.STUDENT]: 'a student who needs clear, actionable information',
  [AgentType.PARENT]:
    "a parent who wants to understand their child's academic situation and how to help",
};

/**
 * Builds a system prompt for notification personalization.
 */
export function buildPersonalizationSystemPrompt(
  tone: PersonalizationTone,
  agentType: AgentType
): string {
  return `You are a notification personalization assistant for a school management app called Scholaracle.

Your job is to rewrite notification content to match the user's preferred communication style.

Target audience: ${AGENT_DESCRIPTIONS[agentType]}
Tone: ${TONE_DESCRIPTIONS[tone]}

Rules:
- Keep the core information intact (dates, grades, names, numbers)
- Do NOT add information that isn't in the original
- Keep it concise — no longer than the original
- Return ONLY the rewritten content, no explanations
- Preserve any action items or calls to action`;
}

/**
 * Builds the user message for personalizing a notification.
 */
export function buildPersonalizationUserPrompt(ctx: IPromptContext): string {
  let prompt = `Rewrite this ${ctx.alertType} notification in a ${ctx.tone} tone.

Subject: ${ctx.subject}
Body:
${ctx.body}`;

  if (ctx.context && Object.keys(ctx.context).length > 0) {
    prompt += `\n\nAdditional context: ${JSON.stringify(ctx.context)}`;
  }

  prompt += '\n\nReturn the result as:\nSubject: <rewritten subject>\nBody:\n<rewritten body>';

  return prompt;
}

/**
 * Builds a prompt for generating recommendation descriptions.
 */
export function buildRecommendationPrompt(
  recommendationType: string,
  studentContext: string
): string {
  return `Generate a brief, actionable recommendation for a student.

Type: ${recommendationType}
Context: ${studentContext}

Provide a 1-2 sentence recommendation that is specific and actionable. Return ONLY the recommendation text.`;
}

/**
 * Parses the LLM response for personalized subject and body.
 */
export function parsePersonalizationResponse(
  response: string
): { subject: string; body: string } | undefined {
  const subjectMatch = response.match(/^Subject:\s*(.+)$/m);
  const bodyMatch = response.match(/^Body:\n([\s\S]+)$/m);

  if (!subjectMatch?.[1] || !bodyMatch?.[1]) {
    return undefined;
  }

  return {
    subject: subjectMatch[1].trim(),
    body: bodyMatch[1].trim(),
  };
}
