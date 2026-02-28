/**
 * Tests for AgendaIntelligenceService: isAvailable, empty input, mocked LLM, error handling.
 */
const mockComplete = jest.fn();
jest.mock('./llm-client', () => ({
  LlmClient: jest.fn().mockImplementation(() => ({ complete: mockComplete })),
}));

import { AgendaIntelligenceService } from './agenda-intelligence';
import type { IAgendaItemInput } from './agenda-intelligence';

function makeItem(overrides: Partial<IAgendaItemInput> = {}): IAgendaItemInput {
  return {
    id: 'item-1',
    type: 'assignment',
    title: 'Math Homework',
    timeAt: '2025-10-01T17:00:00Z',
    importance: 'medium',
    labels: [],
    ...overrides,
  };
}

describe('AgendaIntelligenceService', () => {
  describe('isAvailable', () => {
    it('should return false when no API key', () => {
      const service = new AgendaIntelligenceService({});
      expect(service.isAvailable()).toBe(false);
    });

    it('should return true when apiKey is set', () => {
      const service = new AgendaIntelligenceService({ apiKey: 'sk-test' });
      expect(service.isAvailable()).toBe(true);
    });
  });

  describe('enhance', () => {
    beforeEach(() => {
      mockComplete.mockClear();
    });

    it('should return empty map when no API key', async () => {
      const service = new AgendaIntelligenceService({});
      const items = [makeItem()];
      const result = await service.enhance(items);
      expect(result.size).toBe(0);
    });

    it('should return empty map for empty items', async () => {
      const service = new AgendaIntelligenceService({ apiKey: 'sk-test' });
      const result = await service.enhance([]);
      expect(result.size).toBe(0);
    });

    it('should return parsed map when LLM returns valid JSON', async () => {
      mockComplete.mockResolvedValueOnce({
        content:
          '{"items":[{"id":"item-1","importance":"critical","labels":["needs-attention"],"aiSummary":"Due tomorrow"}]}',
      });

      const service = new AgendaIntelligenceService({ apiKey: 'sk-test' });
      const items = [makeItem({ id: 'item-1' })];

      const result = await service.enhance(items);

      expect(result.size).toBe(1);
      expect(result.get('item-1')?.importance).toBe('critical');
      expect(result.get('item-1')?.labels).toEqual(['needs-attention']);
      expect(result.get('item-1')?.aiSummary).toBe('Due tomorrow');
    });

    it('should process multiple items in batch', async () => {
      mockComplete.mockResolvedValueOnce({
        content: `{"items":[
          {"id":"a","importance":"high","labels":[],"aiSummary":"Math test"},
          {"id":"b","importance":"low","labels":[],"aiSummary":"Reading"}
        ]}`,
      });

      const service = new AgendaIntelligenceService({ apiKey: 'sk-test' });
      const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];

      const result = await service.enhance(items);

      expect(result.size).toBe(2);
      expect(result.get('a')?.importance).toBe('high');
      expect(result.get('b')?.importance).toBe('low');
    });

    it('should return empty map when LLM returns malformed JSON', async () => {
      mockComplete.mockResolvedValueOnce({ content: 'not json' });

      const service = new AgendaIntelligenceService({ apiKey: 'sk-test' });
      const items = [makeItem()];

      const result = await service.enhance(items);

      expect(result.size).toBe(0);
    });

    it('should return empty map when LLM throws', async () => {
      mockComplete.mockRejectedValueOnce(new Error('API error'));

      const service = new AgendaIntelligenceService({ apiKey: 'sk-test' });
      const items = [makeItem()];

      const result = await service.enhance(items);

      expect(result.size).toBe(0);
    });
  });
});
