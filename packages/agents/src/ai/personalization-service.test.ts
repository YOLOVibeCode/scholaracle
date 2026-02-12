import { AgentType } from '@scholaracle/contracts';
import { PersonalizationService } from './personalization-service';
import { LlmClient } from './llm-client';

jest.mock('./llm-client');
const MockLlmClient = LlmClient as jest.MockedClass<typeof LlmClient>;

describe('PersonalizationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isAvailable', () => {
    it('should return false when no apiKey is provided', () => {
      const svc = new PersonalizationService({});
      expect(svc.isAvailable()).toBe(false);
    });

    it('should return false when explicitly disabled', () => {
      const svc = new PersonalizationService({ apiKey: 'key', enabled: false });
      expect(svc.isAvailable()).toBe(false);
    });

    it('should return true when apiKey is provided and enabled', () => {
      const svc = new PersonalizationService({ apiKey: 'key' });
      expect(svc.isAvailable()).toBe(true);
    });
  });

  describe('enhance', () => {
    const input = {
      subject: 'Assignment Due Tomorrow',
      body: 'Math: HW3\nDue: Oct 15\nValue: 50 points',
      alertType: 'deadline',
      agentType: AgentType.STUDENT,
      tone: 'casual' as const,
    };

    it('should return original content when not available', async () => {
      const svc = new PersonalizationService({});
      const result = await svc.enhance(input);

      expect(result.subject).toBe(input.subject);
      expect(result.body).toBe(input.body);
      expect(result.wasPersonalized).toBe(false);
    });

    it('should return personalized content from LLM', async () => {
      const mockComplete = jest.fn().mockResolvedValue({
        content: `Subject: Hey, HW3 is due tomorrow!
Body:
Your Math HW3 is due Oct 15 - that's tomorrow!
It's worth 50 points, so get it done!`,
        usage: { inputTokens: 50, outputTokens: 30 },
      });

      MockLlmClient.mockImplementation(
        () =>
          ({
            complete: mockComplete,
            model: 'test-model',
          }) as unknown as LlmClient
      );

      const svc = new PersonalizationService({ apiKey: 'key' });
      const result = await svc.enhance(input);

      expect(result.wasPersonalized).toBe(true);
      expect(result.subject).toBe('Hey, HW3 is due tomorrow!');
      expect(result.body).toContain('Math HW3');
    });

    it('should cache results for identical inputs', async () => {
      const mockComplete = jest.fn().mockResolvedValue({
        content: `Subject: Personalized
Body:
Personalized body`,
        usage: { inputTokens: 10, outputTokens: 5 },
      });

      MockLlmClient.mockImplementation(
        () =>
          ({
            complete: mockComplete,
            model: 'test-model',
          }) as unknown as LlmClient
      );

      const svc = new PersonalizationService({ apiKey: 'key' });
      await svc.enhance(input);
      await svc.enhance(input);

      // Should only call LLM once
      expect(mockComplete).toHaveBeenCalledTimes(1);
    });

    it('should fall back gracefully on LLM error', async () => {
      MockLlmClient.mockImplementation(
        () =>
          ({
            complete: jest.fn().mockRejectedValue(new Error('API timeout')),
            model: 'test-model',
          }) as unknown as LlmClient
      );

      const svc = new PersonalizationService({ apiKey: 'key' });
      const result = await svc.enhance(input);

      expect(result.wasPersonalized).toBe(false);
      expect(result.subject).toBe(input.subject);
      expect(result.body).toBe(input.body);
    });

    it('should fall back when LLM returns unparseable response', async () => {
      MockLlmClient.mockImplementation(
        () =>
          ({
            complete: jest.fn().mockResolvedValue({
              content: 'Just some random text without proper format',
              usage: { inputTokens: 10, outputTokens: 5 },
            }),
            model: 'test-model',
          }) as unknown as LlmClient
      );

      const svc = new PersonalizationService({ apiKey: 'key' });
      const result = await svc.enhance(input);

      expect(result.wasPersonalized).toBe(false);
      expect(result.subject).toBe(input.subject);
    });
  });
});
