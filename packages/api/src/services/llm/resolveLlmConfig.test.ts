import { resolveLlmConfig } from './resolveLlmConfig';

describe('resolveLlmConfig', () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it('prefers LITELLM_API_KEY over ANTHROPIC', () => {
    process.env['LITELLM_API_KEY'] = 'litellm-key';
    process.env['ANTHROPIC_API_KEY'] = 'anthropic-key';
    const cfg = resolveLlmConfig();
    expect(cfg?.apiKey).toBe('litellm-key');
    expect(cfg?.baseUrl).toBe('https://api.noctusoft.com/v1');
  });

  it('falls back to ANTHROPIC_API_KEY', () => {
    delete process.env['LITELLM_API_KEY'];
    process.env['ANTHROPIC_API_KEY'] = 'anthropic-key';
    expect(resolveLlmConfig()?.apiKey).toBe('anthropic-key');
  });
});
