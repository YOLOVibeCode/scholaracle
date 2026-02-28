import { test, expect } from '@playwright/test';

/**
 * E2E: Blended-family consent-based contacts
 *
 * Robert (owner) → Ava; invites Jessica, Ricky as contacts.
 * Ricky (owner) → Christian, Gideon; invites Jessica, Jennifer.
 * Verifies: pending → accept flow, GET contacts, owner-alert-prefs, cross-account visibility.
 */
test.describe('@feature Blended-family contacts (consent-first)', () => {
  const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:2801';
  const password = 'SecurePass123!';
  const ts = Date.now();

  test('BFC-001: Robert adds Ava, invites Jessica and Ricky as contacts', async ({ request }) => {
    const robertEmail = `robert-${ts}@blended-e2e.test`;
    const reg = await request.post(`${apiBaseUrl}/api/auth/register`, {
      data: { email: robertEmail, password, name: 'Robert' },
    });
    expect(reg.ok()).toBeTruthy();
    const robertToken = ((await reg.json()) as { token?: string }).token;
    expect(robertToken).toBeTruthy();

    const createStudent = await request.post(`${apiBaseUrl}/api/students`, {
      data: { name: 'Ava', grade: 10 },
      headers: { authorization: `Bearer ${robertToken}` },
    });
    expect(createStudent.ok()).toBeTruthy();
    const ava = (await createStudent.json()) as { id: string };

    const jessicaEmail = `jessica-${ts}@blended-e2e.test`;
    const rickyEmail = `ricky-${ts}@blended-e2e.test`;

    const inviteJ = await request.post(`${apiBaseUrl}/api/students/${ava.id}/contacts`, {
      data: { email: jessicaEmail, name: 'Jessica', role: 'parent' },
      headers: { authorization: `Bearer ${robertToken}` },
    });
    expect(inviteJ.status()).toBe(201);

    const inviteR = await request.post(`${apiBaseUrl}/api/students/${ava.id}/contacts`, {
      data: { email: rickyEmail, name: 'Ricky', role: 'guardian' },
      headers: { authorization: `Bearer ${robertToken}` },
    });
    expect(inviteR.status()).toBe(201);

    const contactsRes = await request.get(`${apiBaseUrl}/api/students/${ava.id}/contacts`, {
      headers: { authorization: `Bearer ${robertToken}` },
    });
    expect(contactsRes.ok()).toBeTruthy();
    const contacts = (await contactsRes.json()) as Array<{ email?: string; status: string; isOwner: boolean }>;
    expect(contacts.length).toBeGreaterThanOrEqual(3);
    const owner = contacts.find((c) => c.isOwner);
    expect(owner?.status).toBe('accepted');
    const jContact = contacts.find((c) => c.email === jessicaEmail);
    const rContact = contacts.find((c) => c.email === rickyEmail);
    expect(jContact?.status).toBe('pending');
    expect(rContact?.status).toBe('pending');
  });

  test('BFC-002: Ricky accepts invite for Ava; Jessica registers and accepts', async ({ request }) => {
    const ts2 = Date.now();
    const robertEmail = `robert2-${ts2}@blended-e2e.test`;
    const jessicaEmail = `jessica2-${ts2}@blended-e2e.test`;
    const rickyEmail = `ricky2-${ts2}@blended-e2e.test`;

    const regR = await request.post(`${apiBaseUrl}/api/auth/register`, {
      data: { email: robertEmail, password, name: 'Robert' },
    });
    expect(regR.ok()).toBeTruthy();
    const robertToken = ((await regR.json()) as { token?: string }).token;

    const createAva = await request.post(`${apiBaseUrl}/api/students`, {
      data: { name: 'Ava', grade: 10 },
      headers: { authorization: `Bearer ${robertToken}` },
    });
    const ava = (await createAva.json()) as { id: string };

    await request.post(`${apiBaseUrl}/api/students/${ava.id}/contacts`, {
      data: { email: jessicaEmail, role: 'parent' },
      headers: { authorization: `Bearer ${robertToken}` },
    });
    await request.post(`${apiBaseUrl}/api/students/${ava.id}/contacts`, {
      data: { email: rickyEmail, role: 'guardian' },
      headers: { authorization: `Bearer ${robertToken}` },
    });

    // Ricky registers and accepts
    const regRicky = await request.post(`${apiBaseUrl}/api/auth/register`, {
      data: { email: rickyEmail, password, name: 'Ricky' },
    });
    expect(regRicky.ok()).toBeTruthy();
    const rickyToken = ((await regRicky.json()) as { token?: string }).token;

    const acceptRicky = await request.post(
      `${apiBaseUrl}/api/students/${ava.id}/contacts/accept`,
      { data: { email: rickyEmail }, headers: { authorization: `Bearer ${rickyToken}` } }
    );
    expect(acceptRicky.ok()).toBeTruthy();

    // Jessica registers and accepts
    const regJess = await request.post(`${apiBaseUrl}/api/auth/register`, {
      data: { email: jessicaEmail, password, name: 'Jessica' },
    });
    expect(regJess.ok()).toBeTruthy();
    const jessToken = ((await regJess.json()) as { token?: string }).token;

    const acceptJess = await request.post(
      `${apiBaseUrl}/api/students/${ava.id}/contacts/accept`,
      { data: { email: jessicaEmail }, headers: { authorization: `Bearer ${jessToken}` } }
    );
    expect(acceptJess.ok()).toBeTruthy();

    const listRicky = await request.get(`${apiBaseUrl}/api/students`, {
      headers: { authorization: `Bearer ${rickyToken}` },
    });
    expect(listRicky.ok()).toBeTruthy();
    const rickyStudents = (await listRicky.json()) as Array<{ name: string }>;
    expect(rickyStudents.some((s) => s.name === 'Ava')).toBe(true);

    const listJess = await request.get(`${apiBaseUrl}/api/students`, {
      headers: { authorization: `Bearer ${jessToken}` },
    });
    expect(listJess.ok()).toBeTruthy();
    const jessStudents = (await listJess.json()) as Array<{ name: string }>;
    expect(jessStudents.some((s) => s.name === 'Ava')).toBe(true);
  });

  test('BFC-003: Ricky adds Christian and Gideon, invites Jessica and Jennifer; Jessica accepts', async ({
    request,
  }) => {
    const ts3 = Date.now();
    const rickyEmail = `ricky3-${ts3}@blended-e2e.test`;
    const jessicaEmail = `jessica3-${ts3}@blended-e2e.test`;
    const jenniferEmail = `jennifer-${ts3}@blended-e2e.test`;

    const regR = await request.post(`${apiBaseUrl}/api/auth/register`, {
      data: { email: rickyEmail, password, name: 'Ricky' },
    });
    expect(regR.ok()).toBeTruthy();
    const rickyToken = ((await regR.json()) as { token?: string }).token;

    const createC = await request.post(`${apiBaseUrl}/api/students`, {
      data: { name: 'Christian', grade: 8 },
      headers: { authorization: `Bearer ${rickyToken}` },
    });
    const christian = (await createC.json()) as { id: string };
    const createG = await request.post(`${apiBaseUrl}/api/students`, {
      data: { name: 'Gideon', grade: 6 },
      headers: { authorization: `Bearer ${rickyToken}` },
    });
    const gideon = (await createG.json()) as { id: string };

    await request.post(`${apiBaseUrl}/api/students/${christian.id}/contacts`, {
      data: { email: jessicaEmail, role: 'parent' },
      headers: { authorization: `Bearer ${rickyToken}` },
    });
    await request.post(`${apiBaseUrl}/api/students/${christian.id}/contacts`, {
      data: { email: jenniferEmail, role: 'parent' },
      headers: { authorization: `Bearer ${rickyToken}` },
    });
    await request.post(`${apiBaseUrl}/api/students/${gideon.id}/contacts`, {
      data: { email: jessicaEmail, role: 'parent' },
      headers: { authorization: `Bearer ${rickyToken}` },
    });
    await request.post(`${apiBaseUrl}/api/students/${gideon.id}/contacts`, {
      data: { email: jenniferEmail, role: 'parent' },
      headers: { authorization: `Bearer ${rickyToken}` },
    });

    const regJess = await request.post(`${apiBaseUrl}/api/auth/register`, {
      data: { email: jessicaEmail, password, name: 'Jessica' },
    });
    expect(regJess.ok()).toBeTruthy();
    const jessToken = ((await regJess.json()) as { token?: string }).token;

    const acceptC = await request.post(
      `${apiBaseUrl}/api/students/${christian.id}/contacts/accept`,
      { data: { email: jessicaEmail }, headers: { authorization: `Bearer ${jessToken}` } }
    );
    expect(acceptC.ok()).toBeTruthy();
    const acceptG = await request.post(
      `${apiBaseUrl}/api/students/${gideon.id}/contacts/accept`,
      { data: { email: jessicaEmail }, headers: { authorization: `Bearer ${jessToken}` } }
    );
    expect(acceptG.ok()).toBeTruthy();

    const listJess = await request.get(`${apiBaseUrl}/api/students`, {
      headers: { authorization: `Bearer ${jessToken}` },
    });
    expect(listJess.ok()).toBeTruthy();
    const names = ((await listJess.json()) as Array<{ name: string }>).map((s) => s.name);
    expect(names).toContain('Christian');
    expect(names).toContain('Gideon');
  });

  test('BFC-004: Owner can set owner-alert-prefs per student', async ({ request }) => {
    const ts4 = Date.now();
    const ownerEmail = `owner-${ts4}@blended-e2e.test`;
    const reg = await request.post(`${apiBaseUrl}/api/auth/register`, {
      data: { email: ownerEmail, password, name: 'Owner' },
    });
    expect(reg.ok()).toBeTruthy();
    const token = ((await reg.json()) as { token?: string }).token;

    const createRes = await request.post(`${apiBaseUrl}/api/students`, {
      data: { name: 'Student', grade: 9 },
      headers: { authorization: `Bearer ${token}` },
    });
    const student = (await createRes.json()) as { id: string };

    const prefsRes = await request.put(
      `${apiBaseUrl}/api/students/${student.id}/owner-alert-prefs`,
      {
        data: { receiveAlerts: false, alertChannels: ['email'] },
        headers: { authorization: `Bearer ${token}` },
      }
    );
    expect(prefsRes.ok()).toBeTruthy();
    const body = (await prefsRes.json()) as { ownerAlertPrefs: { receiveAlerts: boolean } };
    expect(body.ownerAlertPrefs.receiveAlerts).toBe(false);
  });
});
