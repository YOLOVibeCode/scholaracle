/**
 * Passwords for E2E parent fixtures seeded via /api/seed — kept out of seed.ts
 * so the route file contains no password literals (M3-07).
 */
export const SEED_TEST_PARENT_PASSWORD = 'TestPass123!' as const;

/** Local E2E admin MFA — literals live here so seed.ts stays password-free (M3-07). */
export const SEED_DEFAULT_ADMIN_PASSWORD = 'Admin123!' as const;
export const SEED_DEFAULT_ADMIN_MFA_SECRET = 'JBSWY3DPEHPK3PXP' as const;
