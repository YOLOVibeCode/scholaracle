import React from 'react';
import { getEntries, resetDiagStoreForTests } from '../diag';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (spec: { ios?: unknown }) => spec.ios },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  Linking: { openURL: jest.fn(async () => true) },
  StyleSheet: { create: <T>(styles: T): T => styles },
}));

import { AppErrorBoundary, reportBoundaryError } from './AppErrorBoundary';
import { DEFAULT_UPDATE_MESSAGE, UpdateRequiredScreen } from './UpdateRequiredScreen';
import { Linking } from 'react-native';

type TestNode = React.ReactElement<{ testID?: string; onPress?: () => void; children?: unknown }>;

function findByTestId(node: unknown, testID: string): TestNode | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findByTestId(child, testID);
      if (hit) return hit;
    }
    return null;
  }
  if (!React.isValidElement(node)) return null;
  const el = node as TestNode;
  if (el.props.testID === testID) return el;
  return findByTestId(el.props.children, testID);
}

function textOf(node: unknown): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement(node)) return textOf((node as TestNode).props.children);
  return '';
}

beforeEach(() => resetDiagStoreForTests());

describe('AppErrorBoundary', () => {
  it('flags an error state from getDerivedStateFromError', () => {
    expect(AppErrorBoundary.getDerivedStateFromError()).toEqual({ hasError: true });
  });

  it('renders children when healthy', () => {
    const child = React.createElement('Text', null, 'ok');
    const boundary = new AppErrorBoundary({ children: child });
    expect(boundary.render()).toBe(child);
  });

  it('renders the friendly fallback with a Try again button after a crash', () => {
    const boundary = new AppErrorBoundary({ children: null });
    boundary.state = { hasError: true };
    const tree = boundary.render();
    expect(findByTestId(tree, 'error-boundary-fallback')).not.toBeNull();
    expect(textOf(tree)).toContain('Something went wrong');
    expect(textOf(tree)).toContain('Try again');
    // The raw error must never be shown to the user.
    expect(textOf(tree)).not.toContain('boom');
  });

  it('Try again resets the error state', () => {
    const boundary = new AppErrorBoundary({ children: null });
    boundary.state = { hasError: true };
    const setState = jest.fn();
    boundary.setState = setState;
    findByTestId(boundary.render(), 'error-boundary-retry')?.props.onPress?.();
    expect(setState).toHaveBeenCalledWith({ hasError: false });
  });

  it('reports the crash through the diag logger on componentDidCatch', () => {
    const boundary = new AppErrorBoundary({ children: null });
    boundary.componentDidCatch(new Error('boom'), { componentStack: '\n  at Screen' });
    const [entry] = getEntries(['err']);
    expect(entry?.level).toBe('error');
    expect(entry?.msg).toContain('render crash: Error: boom');
    expect(entry?.data?.['componentStack']).toContain('at Screen');
  });

  it('wraps non-Error throwables', () => {
    reportBoundaryError('plain string');
    expect(getEntries(['err'])[0]?.msg).toContain('plain string');
  });
});

describe('UpdateRequiredScreen', () => {
  it('shows the server message and opens the store link', () => {
    const tree = UpdateRequiredScreen({
      message: 'Update now.',
      storeUrl: 'https://store.test/app',
    });
    expect(textOf(tree)).toContain('Update required');
    expect(textOf(tree)).toContain('Update now.');
    findByTestId(tree, 'update-required-store')?.props.onPress?.();
    expect(Linking.openURL).toHaveBeenCalledWith('https://store.test/app');
  });

  it('falls back to default copy and hides the button without a store link', () => {
    const tree = UpdateRequiredScreen({ message: null, storeUrl: null });
    expect(textOf(tree)).toContain(DEFAULT_UPDATE_MESSAGE);
    expect(findByTestId(tree, 'update-required-store')).toBeNull();
  });
});
