import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getTokenExp } from '@/lib/jwt';

const publicRoutes = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/admin/login',
  '/privacy',
  '/terms',
  '/support',
  '/pricing',
  '/cli-auth',
];
const authRoutes = ['/login', '/register', '/forgot-password', '/reset-password'];

/** If token expires within this many seconds, client may proactively refresh. */
const PROACTIVE_REFRESH_THRESHOLD_SEC = 2 * 60; // 2 minutes

/**
 * Middleware to protect routes and handle authentication.
 * Optionally decodes JWT exp and sets header when token is near expiry (client can refresh proactively).
 *
 * @param request - Next.js request
 * @returns NextResponse
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('auth_token')?.value;

  // Admin routes are protected client-side by admin auth (localStorage) and server-side by API RBAC.
  // Middleware only enforces parent auth cookie; allow /admin/* to pass through so /admin/login works.
  if (pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  // Check if route is public
  const isPublicRoute = publicRoutes.includes(pathname);
  const isAuthRoute = authRoutes.includes(pathname);

  // If user is authenticated and tries to access auth routes, redirect to dashboard
  if (token && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // If user is not authenticated and tries to access protected routes, redirect to login
  if (!token && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const res = NextResponse.next();
  // Optional: set header when token is close to expiry so client can proactively refresh
  if (token && !isPublicRoute) {
    const exp = getTokenExp(token);
    if (exp != null) {
      const nowSec = Math.floor(Date.now() / 1000);
      if (exp - nowSec < PROACTIVE_REFRESH_THRESHOLD_SEC && exp > nowSec) {
        res.headers.set('X-Token-Expires-Soon', '1');
      }
    }
  }
  return res;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};

