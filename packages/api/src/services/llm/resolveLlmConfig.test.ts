import { resolveModelForRole } from '@scholaracle/agents';
import { resolveLlmConfig } from './resolveLlmConfig';

describe('resolveLlmConfig', () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it('prefers LITELLM_API_KEY over ANTHROPIC', () => {
    process.env['LITELLM_API_KEY'] = 'litellm-key';
    process.env['ANTHROPIC_API_KEY'] = 'anthropic-key';
    delete process.env['AI_MODEL'];
    delete process.env['AI_MODEL_MATCHING'];
    const cfg = resolveLlmConfig();
    expect(cfg?.apiKey).toBe('litellm-key');
    expect(cfg?.baseUrl).toBe('https://ai.noctusoft.com');
    expect(cfg?.model).toBe(resolveModelForRole('matching'));
  });

  it('falls back to ANTHROPIC_API_KEY', () => {
    delete process.env['LITELLM_API_KEY'];
    process.env['ANTHROPIC_API_KEY'] = 'anthropic-key';
    delete process.env['AI_MODEL'];
    delete process.env['AI_MODEL_MATCHING'];
    expect(resolveLlmConfig()?.apiKey).toBe('anthropic-key');
  });

  it('ignores the legacy AI_MODEL and uses AI_MODEL_MATCHING', () => {
    process.env['LITELLM_API_KEY'] = 'litellm-key';
    process.env['AI_MODEL'] = 'claude-sonnet-legacy';
    process.env['AI_MODEL_MATCHING'] = 'anthropic/claude-sonnet-5-5';
    const cfg = resolveLlmConfig();
    expect(cfg?.model).toBe('anthropic/claude-sonnet-5-5');
  });
});
