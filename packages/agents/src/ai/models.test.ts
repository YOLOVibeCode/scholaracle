import { resolveModelForRole } from './models';

describe('resolveModelForRole', () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it('returns defaults when env is unset', () => {
    delete process.env['AI_MODEL_MATCHING'];
    delete process.env['AI_MODEL_TRIAGE'];
    delete process.env['AI_MODEL_PATCH'];
    delete process.env['AI_MODEL_ESCALATE'];
    expect(resolveModelForRole('matching')).toBe('claude-sonnet-5-5');
    expect(resolveModelForRole('triage')).toBe('claude-haiku-5-5');
    expect(resolveModelForRole('patch')).toBe('claude-sonnet-5-5');
    expect(resolveModelForRole('escalate')).toBe('claude-opus-5-5');
  });

  it('honors AI_MODEL_<ROLE>', () => {
    process.env['AI_MODEL_TRIAGE'] = 'custom-triage';
    expect(resolveModelForRole('triage')).toBe('custom-triage');
  });
});
