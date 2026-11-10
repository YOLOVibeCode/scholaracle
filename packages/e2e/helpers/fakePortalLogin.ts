import type { Page } from '@playwright/test';

const FAKE_ORIGIN = process.env.FAKE_PORTAL_ORIGIN ?? 'http://127.0.0.1:2855';

export function fakePortalOrigin(): string {
  return FAKE_ORIGIN;
}

export async function loginFakePortal(
  page: Page,
  startPath: string,
  expectPathPart: string
): Promise<void> {
  await page.goto(`${FAKE_ORIGIN}${startPath}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="input-username"]', { timeout: 45_000 });
  await page.getByTestId('input-username').fill('demo');
  await page.getByTestId('input-password').fill('demo');
  await page.getByTestId('btn-submit').click();
  await page.waitForURL(new RegExp(expectPathPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
