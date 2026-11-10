import { expect, type Locator } from '@playwright/test';

/**
 * Drive ConnectProviderWizard through platform pick + portal URL (phone-connect flow).
 * Portal username/password fields were removed; school login stays on-device.
 */
export async function completeConnectProviderWizard(
  connectWizard: Locator,
  options: { loginUrl: string; studentNameHint?: string }
): Promise<void> {
  await connectWizard.locator('[data-testid="platform-canvas"]').click();

  await expect(connectWizard.locator('[data-testid="connect-provider-login-url"]')).toBeVisible({
    timeout: 10_000,
  });
  await connectWizard.locator('[data-testid="connect-provider-login-url"]').fill(options.loginUrl);
  if (options.studentNameHint) {
    await connectWizard
      .locator('[data-testid="connect-provider-student-name-hint"]')
      .fill(options.studentNameHint);
  }
  await connectWizard.locator('[data-testid="connect-provider-continue"]').click();
  await expect(connectWizard).not.toBeVisible({ timeout: 10_000 });
}
