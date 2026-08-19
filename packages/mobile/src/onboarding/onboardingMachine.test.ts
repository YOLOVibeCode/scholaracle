import {
  addChild,
  canAdvance,
  createInitialOnboardingState,
  reduceOnboarding,
  removeChild,
  updateChild,
} from './onboardingMachine';

describe('onboardingMachine', () => {
  it('starts at account for a logged-out first run', () => {
    const state = createInitialOnboardingState('logged-out');
    expect(state.step).toBe('account');
    expect(state.accountMode).toBe('create');
    expect(state.children).toHaveLength(1);
  });

  it('starts at children when the parent already has an account', () => {
    expect(createInitialOnboardingState('logged-in').step).toBe('children');
  });

  it('blocks create-account advance without name, email, or an 8-char password', () => {
    let state = createInitialOnboardingState('logged-out');
    expect(canAdvance(state)).toBe(false);
    state = reduceOnboarding(state, { type: 'set-parent-name', value: 'Ricardo' });
    state = reduceOnboarding(state, { type: 'set-email', value: 'r@example.com' });
    state = reduceOnboarding(state, { type: 'set-password', value: 'short' });
    expect(canAdvance(state)).toBe(false);
    state = reduceOnboarding(state, { type: 'set-password', value: 'password12' });
    expect(canAdvance(state)).toBe(true);
  });

  it('requires at least one named child before leaving children', () => {
    let state = createInitialOnboardingState('logged-in');
    expect(canAdvance(state)).toBe(false);
    state = updateChild(state, state.children[0]!.key, { name: 'Gideon' });
    expect(canAdvance(state)).toBe(true);
  });

  it('adds a second child and will not remove the last remaining row', () => {
    let state = createInitialOnboardingState('logged-in');
    state = updateChild(state, state.children[0]!.key, { name: 'Gideon' });
    state = addChild(state);
    expect(state.children).toHaveLength(2);
    state = updateChild(state, state.children[1]!.key, { name: 'Christian' });
    state = removeChild(state, state.children[0]!.key);
    expect(state.children).toHaveLength(1);
    expect(state.children[0]?.name).toBe('Christian');
    const same = removeChild(state, state.children[0]!.key);
    expect(same.children).toHaveLength(1);
  });

  it('walks account → children → provider → portal-url → credentials', () => {
    let state = createInitialOnboardingState('logged-out');
    state = reduceOnboarding(state, { type: 'set-parent-name', value: 'Ricardo' });
    state = reduceOnboarding(state, { type: 'set-email', value: 'r@example.com' });
    state = reduceOnboarding(state, { type: 'set-password', value: 'password12' });
    state = reduceOnboarding(state, { type: 'next' });
    expect(state.step).toBe('children');
    state = updateChild(state, state.children[0]!.key, { name: 'Gideon' });
    state = reduceOnboarding(state, { type: 'next' });
    expect(state.step).toBe('provider');
    state = reduceOnboarding(state, { type: 'set-provider', provider: 'skyward' });
    state = reduceOnboarding(state, { type: 'next' });
    expect(state.step).toBe('portal-url');
    state = reduceOnboarding(state, {
      type: 'set-portal-url',
      value: 'https://skyward.iscorp.com',
    });
    state = reduceOnboarding(state, { type: 'next' });
    expect(state.step).toBe('credentials');
    expect(canAdvance(state)).toBe(false);
    state = reduceOnboarding(state, { type: 'set-username', value: 'parent' });
    state = reduceOnboarding(state, { type: 'set-portal-password', value: 'secret' });
    expect(canAdvance(state)).toBe(true);
  });

  it('rejects a portal URL without a hostname', () => {
    let state = createInitialOnboardingState('logged-in');
    state = updateChild(state, state.children[0]!.key, { name: 'Gideon' });
    state = reduceOnboarding(state, { type: 'next' });
    state = reduceOnboarding(state, { type: 'set-provider', provider: 'skyward' });
    state = reduceOnboarding(state, { type: 'next' });
    state = reduceOnboarding(state, { type: 'set-portal-url', value: 'not-a-url' });
    expect(canAdvance(state)).toBe(false);
  });

  it('goes back without losing child names', () => {
    let state = createInitialOnboardingState('logged-in');
    state = updateChild(state, state.children[0]!.key, { name: 'Gideon' });
    state = reduceOnboarding(state, { type: 'next' });
    state = reduceOnboarding(state, { type: 'back' });
    expect(state.step).toBe('children');
    expect(state.children[0]?.name).toBe('Gideon');
  });
});
