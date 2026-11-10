import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { log } from '../diag';

/** Report a render-time crash through the on-device diag logger (no external SDK). */
export function reportBoundaryError(error: unknown, componentStack?: string | null): void {
  const err = error instanceof Error ? error : new Error(String(error));
  log('error', 'err', `render crash: ${err.name}: ${err.message}`, {
    stack: err.stack ?? null,
    componentStack: componentStack ?? null,
  });
}

interface IProps {
  readonly children?: React.ReactNode;
}

interface IState {
  readonly hasError: boolean;
}

/**
 * Root error boundary. A render crash shows a friendly screen instead of a
 * white screen / app exit; "Try again" remounts the tree. Rendered outside
 * every provider, so it uses only plain React Native primitives.
 */
export class AppErrorBoundary extends React.Component<IProps, IState> {
  state: IState = { hasError: false };

  static getDerivedStateFromError(): IState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }): void {
    reportBoundaryError(error, info.componentStack);
  }

  readonly reset = (): void => {
    this.setState({ hasError: false });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.wrap} testID="error-boundary-fallback">
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          Scholarmancy hit an unexpected problem. Your data is safe. Try again, and if it keeps
          happening, close and reopen the app.
        </Text>
        <Pressable
          style={styles.button}
          onPress={this.reset}
          accessibilityRole="button"
          testID="error-boundary-retry"
        >
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#f8f9fa',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#212529', marginBottom: 12 },
  body: { fontSize: 15, color: '#495057', textAlign: 'center', marginBottom: 24 },
  button: {
    backgroundColor: '#4361ee',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
