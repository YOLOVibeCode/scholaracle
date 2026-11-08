import { applySendGridBaseUrl } from './server';

describe('applySendGridBaseUrl', () => {
  it('points the shared SendGrid client at the relay', () => {
    const setDefaultRequest = jest.fn();
    applySendGridBaseUrl({ client: { setDefaultRequest } }, 'https://api.sendgrid.noctusoft.com');
    expect(setDefaultRequest).toHaveBeenCalledWith('baseUrl', 'https://api.sendgrid.noctusoft.com');
  });

  it('leaves the client alone when no base URL is configured', () => {
    const setDefaultRequest = jest.fn();
    applySendGridBaseUrl({ client: { setDefaultRequest } }, undefined);
    expect(setDefaultRequest).not.toHaveBeenCalled();
  });
});
