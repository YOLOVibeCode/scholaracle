import { test, expect, type APIRequestContext } from '@playwright/test';
import { loginExpecting } from '../fixtures/auth';
import { generateUniqueEmail } from '../fixtures/test-data';

/**
 * SHARING SCENARIO — docs/sharing-spec.md §6, the owner's exact case with throwaway accounts.
 *
 *   Ava        → Robert (member), Jessica (admin)
 *   Christian  → Jessica (admin), Jennifer (member)
 *   Gideon     → Jessica (admin), Jennifer (member)
 *
 * Three invitations, six grants. SH-001 drives the API end to end (what the phone and web both
 * rely on); SH-002 checks the web pages: pending-invites banner, /dashboard/invites, "Shared with
 * you", hidden Edit/Delete for a member, the Family & guardians tab for member and owner, and the
 * Share dialog. Alerts (§6 step 6) land in S3 and are not covered here.
 */
test.describe('@feature Sharing scenario (spec §6)', () => {
  const apiBaseUrl = process.env['API_BASE_URL'] ?? 'http://localhost:2801';
  const password = 'SecurePass123!';

  interface Person {
    readonly email: string;
    readonly name: string;
    readonly token: string;
  }

  interface StudentRow {
    readonly id: string;
    readonly name: string;
    readonly access: 'owner' | 'admin' | 'member';
    readonly peopleCount: number;
  }

  interface InviteResult {
    readonly inviteGroupId: string;
    readonly perStudent: ReadonlyArray<{ readonly studentId: string; readonly status: string }>;
  }

  interface PendingRow {
    readonly studentId: string;
    readonly studentName: string;
    readonly inviteGroupId?: string;
    readonly invitedByName?: string;
    readonly invite: { readonly isAdmin: boolean };
  }

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  async function registerUser(request: APIRequestContext, prefix: string, name: string): Promise<Person> {
    const email = generateUniqueEmail(prefix).toLowerCase();
    const res = await request.post(`${apiBaseUrl}/api/auth/register`, {
      data: { email, password, name },
    });
    expect(res.ok(), `register ${prefix}`).toBeTruthy();
    const body = (await res.json()) as { token?: string };
    expect(body.token).toBeTruthy();
    return { email, name, token: body.token! };
  }

  async function createStudent(
    request: APIRequestContext,
    owner: Person,
    name: string,
    grade: number
  ): Promise<{ id: string; name: string }> {
    const res = await request.post(`${apiBaseUrl}/api/students`, {
      data: { name, grade },
      headers: auth(owner.token),
    });
    expect(res.status(), `create ${name}`).toBe(201);
    const body = (await res.json()) as { id: string };
    return { id: body.id, name };
  }

  async function invite(
    request: APIRequestContext,
    inviter: Person,
    person: Person,
    studentIds: readonly string[],
    opts: { label: 'parent' | 'guardian' | 'caregiver'; isAdmin?: boolean }
  ): Promise<InviteResult> {
    const res = await request.post(`${apiBaseUrl}/api/sharing/invites`, {
      data: {
        email: person.email,
        name: person.name,
        label: opts.label,
        studentIds,
        ...(opts.isAdmin ? { isAdmin: true } : {}),
      },
      headers: auth(inviter.token),
    });
    expect(res.status(), `invite ${person.name}`).toBe(201);
    const body = (await res.json()) as InviteResult;
    expect(body.inviteGroupId).toBeTruthy();
    expect(body.perStudent.map((p) => p.status)).toEqual(studentIds.map(() => 'invited'));
    return body;
  }

  async function listStudents(request: APIRequestContext, person: Person): Promise<StudentRow[]> {
    const res = await request.get(`${apiBaseUrl}/api/students`, { headers: auth(person.token) });
    expect(res.ok()).toBeTruthy();
    const rows = (await res.json()) as StudentRow[];
    return [...rows].sort((a, b) => a.name.localeCompare(b.name));
  }

  async function pendingFor(request: APIRequestContext, person: Person): Promise<PendingRow[]> {
    const res = await request.get(`${apiBaseUrl}/api/sharing/invites/pending`, {
      headers: auth(person.token),
    });
    expect(res.ok()).toBeTruthy();
    return (await res.json()) as PendingRow[];
  }

  test('SH-001: owner shares three students with three adults; each sees exactly theirs with the right access', async ({
    request,
  }) => {
    test.setTimeout(120_000);

    // 1. Owner creates Ava, Christian, Gideon.
    const owner = await registerUser(request, 'share-owner', 'Ricardo Owner');
    const ava = await createStudent(request, owner, 'Ava', 10);
    const christian = await createStudent(request, owner, 'Christian', 7);
    const gideon = await createStudent(request, owner, 'Gideon', 4);

    const jessica = await registerUser(request, 'share-jessica', 'Jessica');
    const robert = await registerUser(request, 'share-robert', 'Robert');
    const jennifer = await registerUser(request, 'share-jennifer', 'Jennifer');

    // 2. Six grants in three invitations.
    const jessicaInvite = await invite(request, owner, jessica, [ava.id, christian.id, gideon.id], {
      label: 'parent',
      isAdmin: true,
    });
    const robertInvite = await invite(request, owner, robert, [ava.id], { label: 'parent' });
    const jenniferInvite = await invite(request, owner, jennifer, [christian.id, gideon.id], {
      label: 'guardian',
    });

    // Nobody else can accept Jessica's invitation: identity is the JWT email.
    const hijack = await request.post(`${apiBaseUrl}/api/sharing/invites/accept`, {
      data: { inviteGroupId: jessicaInvite.inviteGroupId },
      headers: auth(robert.token),
    });
    expect(hijack.status()).toBe(404);

    // 3–5. Each person sees their own pending list and accepts with their own token.
    const jessicaPending = await pendingFor(request, jessica);
    expect(jessicaPending.map((p) => p.studentName).sort()).toEqual(['Ava', 'Christian', 'Gideon']);
    expect(new Set(jessicaPending.map((p) => p.inviteGroupId))).toEqual(new Set([jessicaInvite.inviteGroupId]));
    expect(jessicaPending.every((p) => p.invite.isAdmin)).toBe(true);
    expect(jessicaPending[0]!.invitedByName).toBe('Ricardo Owner');

    const jessicaAccept = await request.post(`${apiBaseUrl}/api/sharing/invites/accept`, {
      data: { inviteGroupId: jessicaInvite.inviteGroupId },
      headers: auth(jessica.token),
    });
    expect(jessicaAccept.status()).toBe(200);
    expect(((await jessicaAccept.json()) as { studentIds: string[] }).studentIds).toHaveLength(3);

    const robertPending = await pendingFor(request, robert);
    expect(robertPending.map((p) => p.studentName)).toEqual(['Ava']);
    const robertAccept = await request.post(`${apiBaseUrl}/api/sharing/invites/accept`, {
      data: { inviteGroupId: robertInvite.inviteGroupId },
      headers: auth(robert.token),
    });
    expect(robertAccept.status()).toBe(200);

    const jenniferPending = await pendingFor(request, jennifer);
    expect(jenniferPending.map((p) => p.studentName).sort()).toEqual(['Christian', 'Gideon']);
    const jenniferAccept = await request.post(`${apiBaseUrl}/api/sharing/invites/accept`, {
      data: { studentIds: [christian.id, gideon.id] },
      headers: auth(jennifer.token),
    });
    expect(jenniferAccept.status()).toBe(200);
    expect(await pendingFor(request, jennifer)).toEqual([]);
    expect(jenniferInvite.perStudent).toHaveLength(2);

    // Each person's GET /api/students shows exactly their students with the right access.
    const ownerView = await listStudents(request, owner);
    expect(ownerView.map((s) => [s.name, s.access, s.peopleCount])).toEqual([
      ['Ava', 'owner', 3],
      ['Christian', 'owner', 3],
      ['Gideon', 'owner', 3],
    ]);
    const jessicaView = await listStudents(request, jessica);
    expect(jessicaView.map((s) => [s.name, s.access])).toEqual([
      ['Ava', 'admin'],
      ['Christian', 'admin'],
      ['Gideon', 'admin'],
    ]);
    const robertView = await listStudents(request, robert);
    expect(robertView.map((s) => [s.name, s.access])).toEqual([['Ava', 'member']]);
    const jenniferView = await listStudents(request, jennifer);
    expect(jenniferView.map((s) => [s.name, s.access])).toEqual([
      ['Christian', 'member'],
      ['Gideon', 'member'],
    ]);

    // 4. Jessica (admin) edits Christian but cannot remove him.
    const jessicaEdit = await request.put(`${apiBaseUrl}/api/students/${christian.id}`, {
      data: { grade: 8 },
      headers: auth(jessica.token),
    });
    expect(jessicaEdit.status()).toBe(200);
    const jessicaDelete = await request.delete(`${apiBaseUrl}/api/students/${christian.id}`, {
      headers: auth(jessica.token),
    });
    expect(jessicaDelete.status()).toBe(403);

    // 5. Jennifer (member) cannot edit.
    const jenniferEdit = await request.put(`${apiBaseUrl}/api/students/${christian.id}`, {
      data: { name: 'Chris' },
      headers: auth(jennifer.token),
    });
    expect(jenniferEdit.status()).toBe(403);

    // 6b. Jennifer leaves Gideon herself and keeps Christian.
    const leave = await request.post(`${apiBaseUrl}/api/sharing/leave`, {
      data: { studentId: gideon.id },
      headers: auth(jennifer.token),
    });
    expect(leave.status()).toBe(200);
    expect((await listStudents(request, jennifer)).map((s) => s.name)).toEqual(['Christian']);
    const gideonPeople = await request.get(`${apiBaseUrl}/api/students/${gideon.id}/contacts`, {
      headers: auth(owner.token),
    });
    const gideonRows = (await gideonPeople.json()) as Array<{ email?: string }>;
    expect(gideonRows.some((r) => r.email === jennifer.email)).toBe(false);

    // 7. Owner removes Robert from Ava: Robert sees nothing.
    const removeRobert = await request.delete(
      `${apiBaseUrl}/api/students/${ava.id}/contacts/${encodeURIComponent(robert.email)}`,
      { headers: auth(owner.token) }
    );
    expect(removeRobert.status()).toBe(200);
    expect(await listStudents(request, robert)).toEqual([]);
    const robertAva = await request.get(`${apiBaseUrl}/api/students/${ava.id}`, {
      headers: auth(robert.token),
    });
    expect(robertAva.status()).toBe(404);

    // 8. Jennifer (free plan) adds her own child: shared students did not count.
    const ownKid = await request.post(`${apiBaseUrl}/api/students`, {
      data: { name: 'Jennifer Junior', grade: 2 },
      headers: auth(jennifer.token),
    });
    expect(ownKid.status()).toBe(201);
    expect((await listStudents(request, jennifer)).map((s) => [s.name, s.access])).toEqual([
      ['Christian', 'member'],
      ['Jennifer Junior', 'owner'],
    ]);
  });

  test('SH-002: web — invites banner and page, "Shared with you", member and owner views of Family & guardians, Share dialog @local-only', async ({
    page,
    request,
    browser,
  }) => {
    test.setTimeout(150_000);

    const owner = await registerUser(request, 'share-web-owner', 'Ricardo Owner');
    const christian = await createStudent(request, owner, 'Christian', 7);
    const gideon = await createStudent(request, owner, 'Gideon', 4);
    const jennifer = await registerUser(request, 'share-web-jennifer', 'Jennifer');
    const sent = await invite(request, owner, jennifer, [christian.id, gideon.id], { label: 'guardian' });

    // Jennifer signs in: the dashboard shows the pending-invites banner.
    await loginExpecting(page, jennifer.email, password, '/dashboard');
    const banner = page.getByTestId('pending-invites-banner');
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText('1 pending invitation');
    await page.getByTestId('pending-invites-link').click();
    await page.waitForURL(/\/dashboard\/invites/);

    // One card for the whole invitation; Accept takes both students.
    const card = page.getByTestId(`invite-card-${sent.inviteGroupId}`);
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText('Ricardo Owner invited you to follow Christian and Gideon');
    const acceptResponse = page.waitForResponse(
      (r) => r.url().includes('/api/sharing/invites/accept') && r.request().method() === 'POST'
    );
    await page.getByTestId(`invite-accept-${sent.inviteGroupId}`).click();
    expect((await acceptResponse).status()).toBe(200);
    await expect(page.getByTestId('invites-status')).toContainText('You now follow Christian and Gideon');
    await expect(page.getByTestId('invites-empty')).toBeVisible({ timeout: 15_000 });

    // Students list: badge with the inviter's name; no Edit, no Delete for a member.
    await page.goto('/dashboard/students');
    await expect(page.getByTestId('shared-with-you')).toHaveCount(2, { timeout: 15_000 });
    await expect(page.getByTestId('shared-with-you').first()).toContainText('Shared with you · by Ricardo Owner');
    await expect(page.getByTestId('button-delete-student')).toHaveCount(0);
    await expect(page.getByTestId('button-edit-student')).toHaveCount(0);
    await expect(page.getByTestId('button-open-student')).toHaveCount(2);
    await expect(page.getByTestId('button-share')).toHaveCount(0);

    // Student page as a member: tab renamed, read-only overview, no connect, role-aware card.
    await page.goto(`/dashboard/students/${christian.id}?tab=parents`);
    await expect(page.getByTestId('tab-parents')).toHaveText('Family & guardians');
    const family = page.getByTestId('family-card');
    await expect(family).toBeVisible({ timeout: 15_000 });
    const myRow = page.getByTestId(`family-row-${jennifer.email}`);
    await expect(myRow).toBeVisible({ timeout: 15_000 });
    await expect(myRow).toContainText('(you)');
    await expect(page.getByTestId(`family-chip-role-${jennifer.email}`)).toHaveText('Member');
    await expect(page.getByTestId(`family-chip-status-${jennifer.email}`)).toHaveText('Accepted');
    await expect(page.getByTestId(`family-leave-${jennifer.email}`)).toBeVisible();
    await expect(page.getByTestId(`family-my-alerts-${jennifer.email}`)).toBeVisible();
    await expect(page.getByTestId('family-name-owner')).toContainText('Ricardo Owner');
    await expect(page.getByTestId('family-share')).toHaveCount(0);
    await expect(page.getByTestId('family-member-note')).toBeVisible();
    await expect(page.getByTestId('button-share-student')).toHaveCount(0);

    await page.getByTestId('tab-overview').click();
    await expect(page.getByTestId('student-overview-readonly')).toBeVisible();
    await expect(page.getByTestId('button-save-student')).toHaveCount(0);
    await page.getByTestId('tab-sources').click();
    await expect(page.getByTestId('empty-sources')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('button-connect-source')).toHaveCount(0);

    // Owner's view in a fresh browser: management controls and the Share dialog.
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await loginExpecting(ownerPage, owner.email, password, '/dashboard');
    await ownerPage.goto(`/dashboard/students/${christian.id}?tab=parents`);
    await expect(ownerPage.getByTestId(`family-row-${jennifer.email}`)).toBeVisible({ timeout: 15_000 });
    await expect(ownerPage.getByTestId('family-share')).toBeVisible();
    await expect(ownerPage.getByTestId(`family-toggle-admin-${jennifer.email}`)).toHaveText(/Make admin/);
    await expect(ownerPage.getByTestId(`family-remove-${jennifer.email}`)).toBeVisible();
    await expect(ownerPage.getByTestId(`family-resend-${jennifer.email}`)).toContainText('Send sign-in link');
    await expect(ownerPage.getByTestId('family-name-owner')).toContainText('(you)');

    await ownerPage.getByTestId('family-share').click();
    const dialog = ownerPage.getByTestId('share-dialog');
    await expect(dialog).toBeVisible();
    await expect(ownerPage.getByTestId(`share-student-${christian.id}`)).toBeChecked({ timeout: 15_000 });
    await expect(ownerPage.getByTestId(`share-student-${gideon.id}`)).not.toBeChecked();
    await expect(ownerPage.getByTestId('share-channel-email')).toBeChecked();
    await expect(ownerPage.getByTestId('share-channel-push')).toBeChecked();
    await expect(ownerPage.getByTestId('share-channel-sms')).not.toBeChecked();
    await ownerContext.close();
  });
});
