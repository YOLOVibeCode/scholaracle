import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicRoutes = ['/', '/login', '/register', '/admin/login', '/privacy', '/terms', '/support', '/pricing'];
const authRoutes = ['/login', '/register'];

/**
 * Middleware to protect routes and handle authentication.
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

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};

