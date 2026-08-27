import { NextResponse, type NextRequest } from 'next/server';

/**
 * Clears the session cookie then sends the user to /login.
 * Used when a student JWT is still valid but studio bind-check failed (revoked login).
 */
export function GET(request: NextRequest): NextResponse {
  const redirectTo = request.nextUrl.searchParams.get('redirect') ?? '/studio';
  const login = new URL('/login', request.nextUrl.origin);
  login.searchParams.set('reason', 'session_expired');
  login.searchParams.set('redirect', redirectTo);
  const res = NextResponse.redirect(login);
  res.cookies.set('auth_token', '', { path: '/', maxAge: 0, sameSite: 'lax' });
  return res;
}
