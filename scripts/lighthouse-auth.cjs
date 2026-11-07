/**
 * Lighthouse CI puppeteer script: parent login before each authenticated URL.
 */
const EMAIL = process.env.LHCI_PARENT_EMAIL || 'test.parent@example.com';
const PASSWORD = process.env.LHCI_PARENT_PASSWORD || 'TestPass123!';
const API_BASE = process.env.LHCI_API_BASE_URL || 'http://127.0.0.1:2801/api';

module.exports = async (browser, { url }) => {
  const page = await browser.newPage();
  const origin = new URL(url).origin;

  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!loginRes.ok) {
    throw new Error(`Lighthouse auth login failed: ${loginRes.status}`);
  }
  const body = await loginRes.json();
  const token = body.token;
  if (!token) {
    throw new Error('Lighthouse auth: missing token in login response');
  }

  await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    (accessToken) => {
      localStorage.setItem('auth_token', accessToken);
      localStorage.setItem('remember_me', 'true');
      document.cookie = `auth_token=${accessToken}; path=/; max-age=86400; SameSite=Lax`;
    },
    token
  );

  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.close();
};
