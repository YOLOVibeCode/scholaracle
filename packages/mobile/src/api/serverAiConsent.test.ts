import { fetchServerAiConsent, updateServerAiConsent } from './serverAiConsent';

jest.mock('./client', () => ({
  apiClient: {
    getConsents: jest.fn(),
    setServerAiConsent: jest.fn(),
  },
}));

const { apiClient } = jest.requireMock('./client') as {
  apiClient: {
    getConsents: jest.Mock;
    setServerAiConsent: jest.Mock;
  };
};

describe('serverAiConsent API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetchServerAiConsent returns serverAi from client', async () => {
    apiClient.getConsents.mockResolvedValue({ serverAi: true });
    await expect(fetchServerAiConsent()).resolves.toBe(true);
  });

  it('updateServerAiConsent delegates to client', async () => {
    apiClient.setServerAiConsent.mockResolvedValue({ serverAi: false });
    await expect(updateServerAiConsent(false)).resolves.toBe(false);
    expect(apiClient.setServerAiConsent).toHaveBeenCalledWith(false);
  });
});
