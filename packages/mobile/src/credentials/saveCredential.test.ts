import * as SecureStore from 'expo-secure-store';
import { saveCredential } from './saveCredential';

describe('saveCredential', () => {
  beforeEach(() => {
    (SecureStore.setItemAsync as jest.Mock).mockClear();
  });

  it('writes with WHEN_UNLOCKED_THIS_DEVICE_ONLY', async () => {
    await saveCredential('slc_creds_canvas_school.example.com', '{"password":"x"}');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'slc_creds_canvas_school.example.com',
      '{"password":"x"}',
      { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }
    );
  });
});
