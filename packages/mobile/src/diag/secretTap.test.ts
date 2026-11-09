jest.mock('./gate', () => ({ unlockDiag: jest.fn(() => Promise.resolve()) }));
jest.mock('./panel', () => ({ openDiagPanel: jest.fn() }));

import { unlockDiag } from './gate';
import { openDiagPanel } from './panel';
import { registerDiagSecretTap } from './secretTap';

describe('registerDiagSecretTap', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    jest.advanceTimersByTime(5000);
  });
  afterEach(() => jest.useRealTimers());

  it('unlocks and opens the panel on the seventh quick tap', async () => {
    for (let i = 0; i < 6; i++) registerDiagSecretTap();
    expect(unlockDiag).not.toHaveBeenCalled();
    registerDiagSecretTap();
    expect(unlockDiag).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(openDiagPanel).toHaveBeenCalledTimes(1);
  });

  it('resets the count after a 2 s pause', () => {
    for (let i = 0; i < 6; i++) registerDiagSecretTap();
    jest.advanceTimersByTime(2100);
    registerDiagSecretTap();
    expect(unlockDiag).not.toHaveBeenCalled();
  });
});
