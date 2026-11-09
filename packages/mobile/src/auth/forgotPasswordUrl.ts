import { laneFrom, resolveApiBaseUrl } from '../version/deployStamp';

/**
 * Web page that sends the reset email. Passwords reset on the website (the emailed link opens a
 * web page), so the phone app just opens it in the browser for the environment this build talks
 * to. Built with string helpers only: the URL API is banned in RN.
 */
export function forgotPasswordUrl(email?: string, apiUrl?: string): string {
  const lane = laneFrom(resolveApiBaseUrl(apiUrl));
  const origin =
    lane === 'uat'
      ? 'https://web-uat.scholarmancy.com'
      : lane === 'dev'
        ? 'http://localhost:2800'
        : 'https://scholarmancy.com';
  const trimmed = (email ?? '').trim();
  return `${origin}/forgot-password${trimmed ? `?email=${encodeURIComponent(trimmed)}` : ''}`;
}
