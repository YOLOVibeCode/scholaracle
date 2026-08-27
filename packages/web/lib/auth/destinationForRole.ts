export type AuthRole = 'parent' | 'student';

const AUTH_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password'];

function isStudioPath(pathname: string): boolean {
  return pathname === '/studio' || pathname.startsWith('/studio/');
}

function isDashboardPath(pathname: string): boolean {
  return pathname === '/dashboard' || pathname.startsWith('/dashboard/');
}

function isSafeInternalPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\');
}

/**
 * Where middleware should send this request, or null to continue.
 * `role` is undefined when the request is unauthenticated.
 */
export function destinationForRole(role: AuthRole | undefined, pathname: string): string | null {
  if (role === 'student') {
    if (AUTH_ROUTES.includes(pathname) || isDashboardPath(pathname)) {
      return '/studio';
    }
    return null;
  }
  if (role === 'parent') {
    if (AUTH_ROUTES.includes(pathname) || isStudioPath(pathname)) {
      return '/dashboard';
    }
    return null;
  }
  if (isStudioPath(pathname)) {
    return `/login?redirect=${encodeURIComponent(pathname)}`;
  }
  return null;
}

/** Post-login navigation: honor safe redirects that match the user's role. */
export function postLoginDestination(
  role: AuthRole | undefined,
  redirectTo: string | null
): string {
  if (role === 'student') {
    if (redirectTo && isSafeInternalPath(redirectTo) && isStudioPath(redirectTo)) {
      return redirectTo;
    }
    return '/studio';
  }
  if (
    redirectTo &&
    isSafeInternalPath(redirectTo) &&
    !isStudioPath(redirectTo) &&
    !AUTH_ROUTES.includes(redirectTo)
  ) {
    return redirectTo;
  }
  return '/dashboard';
}
