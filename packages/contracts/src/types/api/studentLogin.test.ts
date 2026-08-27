/**
 * Slice 6 — parent-provisioned student login wire types.
 *
 * Pins invite/status shape and asserts this file never imports the gradebook.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  STUDENT_LOGIN_INVITE_RESPONSE_KEYS,
  STUDENT_LOGIN_STATUS_KEYS,
  STUDENT_MAGIC_LINK_RESPONSE_KEYS,
  type IStudentLoginInviteResponse,
  type IStudentLoginStatus,
  type IStudentMagicLinkResponse,
} from './studentLogin';

describe('student login wire contracts', () => {
  it('invite response is email + one-time temporary password', () => {
    const body: IStudentLoginInviteResponse = {
      email: 'emma.demo@scholarmancy.com',
      temporaryPassword: 'once-only',
    };
    expect(Object.keys(body).sort()).toEqual([...STUDENT_LOGIN_INVITE_RESPONSE_KEYS].sort());
  });

  it('GET status never includes a password', () => {
    const body: IStudentLoginStatus = {
      provisioned: true,
      email: 'emma.demo@scholarmancy.com',
      showGrades: false,
      createdAt: '2026-08-24T00:00:00.000Z',
      userId: '507f1f77bcf86cd799439011',
    };
    expect(Object.keys(body).sort()).toEqual([...STUDENT_LOGIN_STATUS_KEYS].sort());
    expect(body).not.toHaveProperty('temporaryPassword');
    expect(body).not.toHaveProperty('password');
    expect(body.showGrades).toBe(false);
  });

  it('does not import the gradebook (ISP)', () => {
    const src = fs.readFileSync(path.join(__dirname, 'studentLogin.ts'), 'utf8');
    expect(src).not.toMatch(/grades/);
    expect(src).not.toMatch(/IStudentGradesResponse/);
  });

  it('magic-link response is a /login URL, expiry, and QR image — never a raw token field', () => {
    const body: IStudentMagicLinkResponse = {
      loginUrl: 'http://localhost:2800/login?magic=once-only',
      expiresAt: '2026-08-25T21:30:00.000Z',
      qrDataUrl: 'data:image/png;base64,qq',
    };
    expect(Object.keys(body).sort()).toEqual([...STUDENT_MAGIC_LINK_RESPONSE_KEYS].sort());
    expect(body.loginUrl).toMatch(/\/login\?magic=/);
    expect(body).not.toHaveProperty('token');
    expect(body).not.toHaveProperty('temporaryPassword');
    expect(body).not.toHaveProperty('password');
  });
});
