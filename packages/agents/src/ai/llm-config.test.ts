import { resolveLlmConfig, DEFAULT_RELAY_BASE_URL } from './llm-config';

const KEYS = [
  'LITELLM_API_KEY',
  'LITELLM_BASE_URL',
  'ANTHROPIC_API_KEY',
  'AI_API_KEY',
  'AI_MODEL_TRIAGE',
  'AI_MODEL_INSIGHTS',
];

describe('resolveLlmConfig', () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('returns null when no key is configured', () => {
    expect(resolveLlmConfig('triage')).toBeNull();
  });

  it('prefers the relay key and defaults to the relay gateway base URL', () => {
    process.env['LITELLM_API_KEY'] = 'relay-key';
    process.env['ANTHROPIC_API_KEY'] = 'direct-key';
    expect(resolveLlmConfig('triage')).toEqual({
      apiKey: 'relay-key',
      baseUrl: DEFAULT_RELAY_BASE_URL,
      model: 'claude-haiku-5-5',
    });
    expect(DEFAULT_RELAY_BASE_URL).toBe('https://ai.noctusoft.com');
  });

  it('honors LITELLM_BASE_URL and per-role model overrides', () => {
    process.env['LITELLM_API_KEY'] = 'relay-key';
    process.env['LITELLM_BASE_URL'] = 'https://relay.example.test';
    process.env['AI_MODEL_INSIGHTS'] = 'anthropic/claude-sonnet-5-5';
    expect(resolveLlmConfig('insights')).toEqual({
      apiKey: 'relay-key',
      baseUrl: 'https://relay.example.test',
      model: 'anthropic/claude-sonnet-5-5',
    });
  });

  it('falls back to a direct Anthropic key', () => {
    process.env['AI_API_KEY'] = 'direct-key';
    expect(resolveLlmConfig('insights')).toEqual({
      apiKey: 'direct-key',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-5-5',
    });
  });
});
