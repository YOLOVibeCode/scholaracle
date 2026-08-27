import { NextRequest } from 'next/server';
import { GET } from './route';

describe('GET /login/expired', () => {
  it('clears auth_token and redirects to login so a revoked student is not bounced back to /studio', () => {
    const req = new NextRequest('http://localhost:2800/login/expired?redirect=/studio');
    const res = GET(req);
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/login');
    expect(location).toContain('reason=session_expired');
    expect(location).toContain('redirect=%2Fstudio');
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/auth_token=/);
    expect(setCookie.toLowerCase()).toMatch(/max-age=0/);
  });
});
