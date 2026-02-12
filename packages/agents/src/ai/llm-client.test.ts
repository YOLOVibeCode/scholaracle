import { LlmClient } from './llm-client';

const originalFetch = globalThis.fetch;

function mockFetch(response: { status: number; body: unknown; ok?: boolean }) {
  const isOk = response.ok ?? (response.status >= 200 && response.status < 300);
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: isOk,
    status: response.status,
    text: jest.fn().mockResolvedValue(JSON.stringify(response.body)),
    json: jest.fn().mockResolvedValue(response.body),
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('LlmClient', () => {
  const client = new LlmClient({
    apiKey: 'test-key',
    model: 'claude-test',
    baseUrl: 'https://api.test.com',
  });

  describe('complete', () => {
    it('should send correct request headers and body', async () => {
      mockFetch({
        status: 200,
        body: {
          content: [{ type: 'text', text: 'Hello!' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      });

      await client.complete([{ role: 'user', content: 'Hi' }], {
        maxTokens: 256,
        system: 'Be helpful.',
      });

      const fetchMock = globalThis.fetch as jest.Mock;
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'content-type': 'application/json',
            'x-api-key': 'test-key',
            'anthropic-version': '2023-06-01',
          }),
        })
      );

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
      expect(body['model']).toBe('claude-test');
      expect(body['max_tokens']).toBe(256);
      expect(body['system']).toBe('Be helpful.');
      expect(body['messages']).toEqual([{ role: 'user', content: 'Hi' }]);
    });

    it('should return parsed response content and usage', async () => {
      mockFetch({
        status: 200,
        body: {
          content: [{ type: 'text', text: 'The answer is 42.' }],
          usage: { input_tokens: 15, output_tokens: 8 },
        },
      });

      const result = await client.complete([{ role: 'user', content: 'What?' }]);

      expect(result.content).toBe('The answer is 42.');
      expect(result.usage.inputTokens).toBe(15);
      expect(result.usage.outputTokens).toBe(8);
    });

    it('should throw on non-ok response', async () => {
      mockFetch({
        status: 429,
        ok: false,
        body: { error: 'rate_limited' },
      });

      await expect(client.complete([{ role: 'user', content: 'test' }])).rejects.toThrow(
        'LLM API error 429'
      );
    });

    it('should handle response with no text block', async () => {
      mockFetch({
        status: 200,
        body: {
          content: [{ type: 'image', source: {} }],
          usage: { input_tokens: 5, output_tokens: 0 },
        },
      });

      const result = await client.complete([{ role: 'user', content: 'test' }]);
      expect(result.content).toBe('');
    });

    it('should use default maxTokens of 512', async () => {
      mockFetch({
        status: 200,
        body: {
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 5, output_tokens: 1 },
        },
      });

      await client.complete([{ role: 'user', content: 'test' }]);

      const fetchMock = globalThis.fetch as jest.Mock;
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
      expect(body['max_tokens']).toBe(512);
    });
  });

  describe('model', () => {
    it('should return the configured model', () => {
      expect(client.model).toBe('claude-test');
    });

    it('should use default model when not specified', () => {
      const defaultClient = new LlmClient({ apiKey: 'key' });
      expect(defaultClient.model).toBe('claude-sonnet-4-20250514');
    });
  });
});
