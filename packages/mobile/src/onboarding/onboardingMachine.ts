import { extractHostname } from '../utils/urlNormalize';

export type OnboardingEntry = 'logged-out' | 'logged-in';

export type OnboardingStep = 'account' | 'children' | 'provider' | 'portal-url' | 'credentials';

export type OnboardingProvider = 'canvas' | 'skyward' | 'aeries';

export type AccountMode = 'create' | 'signin';

export interface IChildDraft {
  readonly key: string;
  readonly name: string;
  readonly grade: string;
}

export interface IOnboardingState {
  readonly entry: OnboardingEntry;
  readonly step: OnboardingStep;
  readonly accountMode: AccountMode;
  readonly parentName: string;
  readonly email: string;
  readonly password: string;
  readonly children: readonly IChildDraft[];
  readonly provider: OnboardingProvider | null;
  readonly portalUrl: string;
  readonly username: string;
  readonly portalPassword: string;
  readonly nextChildKey: number;
}

export type OnboardingAction =
  | { readonly type: 'set-account-mode'; readonly mode: AccountMode }
  | { readonly type: 'set-parent-name'; readonly value: string }
  | { readonly type: 'set-email'; readonly value: string }
  | { readonly type: 'set-password'; readonly value: string }
  | { readonly type: 'set-provider'; readonly provider: OnboardingProvider }
  | { readonly type: 'set-portal-url'; readonly value: string }
  | { readonly type: 'set-username'; readonly value: string }
  | { readonly type: 'set-portal-password'; readonly value: string }
  | { readonly type: 'next' }
  | { readonly type: 'back' };

const STEP_ORDER: readonly OnboardingStep[] = [
  'account',
  'children',
  'provider',
  'portal-url',
  'credentials',
];

function newChild(key: string): IChildDraft {
  return { key, name: '', grade: '' };
}

export function createInitialOnboardingState(entry: OnboardingEntry): IOnboardingState {
  return {
    entry,
    step: entry === 'logged-out' ? 'account' : 'children',
    accountMode: 'create',
    parentName: '',
    email: '',
    password: '',
    children: [newChild('c1')],
    provider: null,
    portalUrl: '',
    username: '',
    portalPassword: '',
    nextChildKey: 2,
  };
}

function namedChildren(state: IOnboardingState): readonly IChildDraft[] {
  return state.children.filter((c) => c.name.trim().length > 0);
}

export function canAdvance(state: IOnboardingState): boolean {
  switch (state.step) {
    case 'account':
      if (state.accountMode === 'signin') {
        return state.email.trim().length > 0 && state.password.length > 0;
      }
      return (
        state.parentName.trim().length > 0 &&
        state.email.trim().length > 0 &&
        state.password.length >= 8
      );
    case 'children':
      return namedChildren(state).length > 0;
    case 'provider':
      return state.provider != null;
    case 'portal-url':
      return extractHostname(state.portalUrl.trim()) !== '';
    case 'credentials':
      return state.username.trim().length > 0 && state.portalPassword.length > 0;
    default:
      return false;
  }
}

function stepIndex(step: OnboardingStep): number {
  return STEP_ORDER.indexOf(step);
}

export function reduceOnboarding(
  state: IOnboardingState,
  action: OnboardingAction
): IOnboardingState {
  switch (action.type) {
    case 'set-account-mode':
      return { ...state, accountMode: action.mode };
    case 'set-parent-name':
      return { ...state, parentName: action.value };
    case 'set-email':
      return { ...state, email: action.value };
    case 'set-password':
      return { ...state, password: action.value };
    case 'set-provider':
      return { ...state, provider: action.provider };
    case 'set-portal-url':
      return { ...state, portalUrl: action.value };
    case 'set-username':
      return { ...state, username: action.value };
    case 'set-portal-password':
      return { ...state, portalPassword: action.value };
    case 'next': {
      if (!canAdvance(state)) return state;
      const idx = stepIndex(state.step);
      const next = STEP_ORDER[idx + 1];
      return next ? { ...state, step: next } : state;
    }
    case 'back': {
      const idx = stepIndex(state.step);
      if (idx <= 0) return state;
      if (state.entry === 'logged-in' && state.step === 'children') return state;
      const prev = STEP_ORDER[idx - 1];
      return prev ? { ...state, step: prev } : state;
    }
    default:
      return state;
  }
}

export function addChild(state: IOnboardingState): IOnboardingState {
  const key = `c${state.nextChildKey}`;
  return {
    ...state,
    children: [...state.children, newChild(key)],
    nextChildKey: state.nextChildKey + 1,
  };
}

export function removeChild(state: IOnboardingState, key: string): IOnboardingState {
  if (state.children.length <= 1) return state;
  return { ...state, children: state.children.filter((c) => c.key !== key) };
}

export function updateChild(
  state: IOnboardingState,
  key: string,
  patch: Partial<Pick<IChildDraft, 'name' | 'grade'>>
): IOnboardingState {
  return {
    ...state,
    children: state.children.map((c) => (c.key === key ? { ...c, ...patch } : c)),
  };
}

export function namedChildDrafts(state: IOnboardingState): readonly IChildDraft[] {
  return namedChildren(state);
}
