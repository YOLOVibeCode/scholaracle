import { GlanceInsightService, type IGlanceInsightInput } from './glance-insight-service';
import type { LlmClient } from './llm-client';

function mockLlmClient(response: string): LlmClient {
  return {
    complete: jest.fn().mockResolvedValue({ content: response }),
  } as unknown as LlmClient;
}

describe('GlanceInsightService', () => {
  it('returns insight text from LLM', async () => {
    const svc = new GlanceInsightService({ llmClient: mockLlmClient('Focus on Math today.') });
    const input: IGlanceInsightInput = {
      studentName: 'Ava',
      gradeCount: 5,
      lowestGradePercent: 72,
      lowestGradeCourse: 'Math',
      missingCount: 2,
      upcomingCount: 3,
      missingTitles: ['Quiz 1', 'Homework 3'],
    };
    const result = await svc.generateInsight(input);
    expect(result).toBe('Focus on Math today.');
  });

  it('returns undefined when LLM returns empty', async () => {
    const svc = new GlanceInsightService({ llmClient: mockLlmClient('') });
    const input: IGlanceInsightInput = {
      studentName: 'Ava',
      gradeCount: 0,
      missingCount: 0,
      upcomingCount: 0,
      missingTitles: [],
    };
    const result = await svc.generateInsight(input);
    expect(result).toBeUndefined();
  });

  it('returns undefined on LLM error', async () => {
    const llm = {
      complete: jest.fn().mockRejectedValue(new Error('API error')),
    } as unknown as LlmClient;
    const svc = new GlanceInsightService({ llmClient: llm });
    const input: IGlanceInsightInput = {
      studentName: 'Ava',
      gradeCount: 0,
      missingCount: 0,
      upcomingCount: 0,
      missingTitles: [],
    };
    const result = await svc.generateInsight(input);
    expect(result).toBeUndefined();
  });

  it('includes missing titles in prompt', async () => {
    const llm = mockLlmClient('ok');
    const svc = new GlanceInsightService({ llmClient: llm });
    await svc.generateInsight({
      studentName: 'Ava',
      gradeCount: 3,
      missingCount: 2,
      upcomingCount: 1,
      missingTitles: ['Quiz 1', 'Essay'],
    });
    const call = (llm.complete as jest.Mock).mock.calls[0];
    const userContent = call[0][0].content as string;
    expect(userContent).toContain('Quiz 1');
    expect(userContent).toContain('Essay');
  });
});
