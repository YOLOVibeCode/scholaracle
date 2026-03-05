import type { IEmailDigestPendingItem } from '@scholaracle/database';
import type { LlmClient } from './llm-client';

export interface IDigestInsightServiceConfig {
  readonly llmClient: LlmClient;
}

/**
 * Generates AI-powered insight paragraphs for email digest batches.
 * The insight summarizes the alerts, highlights priorities, and suggests actions.
 */
export class DigestInsightService {
  private readonly _llm: LlmClient;

  constructor(config: IDigestInsightServiceConfig) {
    this._llm = config.llmClient;
  }

  async generateInsight(
    items: readonly IEmailDigestPendingItem[],
    studentName?: string
  ): Promise<string | undefined> {
    if (items.length === 0) return undefined;

    const alertSummaries = items.map((item) => {
      const parts = [item.alertType, item.severity];
      if (item.courseName) parts.push(`course: ${item.courseName}`);
      if (item.assignmentTitle) parts.push(`assignment: ${item.assignmentTitle}`);
      parts.push(item.subject);
      return parts.join(' | ');
    });

    const systemPrompt = [
      'You are a helpful academic advisor summarizing a student digest for a parent or student.',
      'Your response must be 2-3 sentences max. Be encouraging but direct.',
      'Focus on: (1) the most urgent item to address first, (2) any positive trends, (3) one actionable suggestion.',
      'Do NOT list every alert. Synthesize the big picture.',
      'Do NOT use markdown formatting. Plain text only.',
    ].join(' ');

    const userPrompt = [
      studentName ? `Student: ${studentName}` : '',
      `${items.length} alert(s):`,
      alertSummaries.join('\n'),
      '',
      'Write a brief, actionable insight paragraph for the digest email.',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const response = await this._llm.complete([{ role: 'user' as const, content: userPrompt }], {
        maxTokens: 150,
        system: systemPrompt,
      });
      const text = response.content.trim();
      return text.length > 0 ? text : undefined;
    } catch {
      return undefined;
    }
  }
}
