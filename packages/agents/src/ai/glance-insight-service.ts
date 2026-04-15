import type { LlmClient } from './llm-client';

export interface IGlanceInsightInput {
  readonly studentName: string;
  readonly gradeCount: number;
  readonly lowestGradePercent?: number;
  readonly lowestGradeCourse?: string;
  readonly missingCount: number;
  readonly upcomingCount: number;
  readonly missingTitles: readonly string[];
}

export interface IGlanceInsightServiceConfig {
  readonly llmClient: LlmClient;
}

export class GlanceInsightService {
  private readonly _llm: LlmClient;

  constructor(config: IGlanceInsightServiceConfig) {
    this._llm = config.llmClient;
  }

  async generateInsight(input: IGlanceInsightInput): Promise<string | undefined> {
    const systemPrompt = [
      'You are a helpful academic advisor writing a daily snapshot summary for a parent or student.',
      'Your response must be 2-3 sentences max. Be encouraging but direct.',
      'Focus on: (1) the most important thing to address today, (2) any positive note, (3) one actionable suggestion.',
      'Do NOT list every item. Synthesize the big picture for the day.',
      'Do NOT use markdown formatting. Plain text only.',
    ].join(' ');

    const parts: string[] = [`Student: ${input.studentName}`];
    if (input.gradeCount > 0) {
      parts.push(`Tracking ${input.gradeCount} course(s).`);
      if (input.lowestGradePercent !== undefined && input.lowestGradeCourse) {
        parts.push(`Lowest grade: ${input.lowestGradePercent}% in ${input.lowestGradeCourse}.`);
      }
    }
    if (input.missingCount > 0) {
      parts.push(
        `${input.missingCount} missing assignment(s): ${input.missingTitles.slice(0, 5).join(', ')}.`
      );
    } else {
      parts.push('No missing assignments.');
    }
    if (input.upcomingCount > 0) {
      parts.push(`${input.upcomingCount} assignment(s) due in the next 7 days.`);
    }

    const userPrompt = `${parts.join('\n')}\n\nWrite a brief daily snapshot insight.`;

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
