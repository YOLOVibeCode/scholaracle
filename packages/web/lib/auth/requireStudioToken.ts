import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { StudioAuthError } from '@/lib/api/studio';

/**
 * The student JWT for a studio page, or a redirect to login that comes back
 * to `redirectTo`. Pages call this first; they never read the cookie themselves.
 */
export async function requireStudioToken(redirectTo: string): Promise<string> {
  const token = (await cookies()).get('auth_token')?.value;
  if (token === undefined || token === '') {
    redirect(`/login?redirect=${redirectTo}`);
  }
  return token;
}

/**
 * Run a studio fetch with the page's token; an expired or wrong-role token
 * sends the student through /login/expired and back to `redirectTo`.
 */
export async function loadForStudio<T>(
  redirectTo: string,
  load: (token: string) => Promise<T>
): Promise<{ readonly token: string; readonly view: T }> {
  const token = await requireStudioToken(redirectTo);
  try {
    return { token, view: await load(token) };
  } catch (err) {
    if (err instanceof StudioAuthError) {
      redirect(`/login/expired?redirect=${redirectTo}`);
    }
    throw err;
  }
}
