export function needsOnboarding(params: {
  readonly isLoggedIn: boolean;
  readonly studentCount: number;
}): boolean {
  if (!params.isLoggedIn) return true;
  return params.studentCount === 0;
}
