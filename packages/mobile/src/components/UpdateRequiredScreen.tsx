import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

interface IProps {
  readonly message: string | null;
  readonly storeUrl: string | null;
}

export const DEFAULT_UPDATE_MESSAGE =
  'This version of Scholarmancy is no longer supported. Please update to keep syncing your school data.';

/** Blocking screen shown when the binary is older than the server's minimum version. */
export function UpdateRequiredScreen({ message, storeUrl }: IProps): React.ReactElement {
  return (
    <View style={styles.wrap} testID="update-required">
      <Text style={styles.title}>Update required</Text>
      <Text style={styles.body}>{message ?? DEFAULT_UPDATE_MESSAGE}</Text>
      {storeUrl ? (
        <Pressable
          style={styles.button}
          onPress={() => void Linking.openURL(storeUrl)}
          accessibilityRole="button"
          testID="update-required-store"
        >
          <Text style={styles.buttonText}>Open the store</Text>
        </Pressable>
      ) : null}
    </View>
  );
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
