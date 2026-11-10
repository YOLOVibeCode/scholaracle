import { AlertType } from '@scholaracle/contracts';

export type HttpVerb = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head';

export interface ISweepIds {
  readonly studentId: string;
  readonly alertId: string;
  readonly integrationId: string;
  readonly emailLogId: string;
  readonly sessionIdA: string;
  readonly assetId: string;
  readonly commentId: string;
  readonly mergedCourseId: string;
  readonly contactToken: string;
  readonly parentEmailEncoded: string;
  readonly inviteGroupId: string;
  readonly portalAccountId: string;
  readonly sourceRunId: string;
}

export interface ISweepRow {
  readonly method: HttpVerb;
  readonly path: string;
  readonly template: string;
  readonly body?: Record<string, unknown>;
}

export const SOURCE_ID_ON_STUDENT = 'idor-sweep-ds-on-student';
export const CONTACT_EMAIL = 'contact@idor-sweep.test';
const ASSIGNMENT_EXTERNAL_ID = 'idor-sweep-asg';

export function buildSweepRows(i: ISweepIds): ISweepRow[] {
  const s = i.studentId;
  const postAlerts = {
    studentId: s,
    type: AlertType.GRADE_DROP,
    severity: 'high',
    relatedData: { course: 'Math' },
  };
  const postDigest = { recipients: 'all' as const };
  const postParentInvite = { email: 'invite@example.com', role: 'parent' };
  const postParentsAccept = { email: 'pending@example.com' };
  const postParentsDecline = { email: 'pending@example.com' };
  const postContactsAccept = { email: CONTACT_EMAIL };
  const postContactsDecline = { email: CONTACT_EMAIL };
  const postTransferConfirm = { token: i.contactToken, email: CONTACT_EMAIL };
  const putOwnerPrefs = { receiveAlerts: true, alertChannels: ['email' as const], alertTypes: [] };
  const putParentAdmin = { isAdmin: false };
  const putContactAdmin = { isAdmin: false };
  const patchLogin = { showGrades: true };
  const patchTutorial = { tutorialWindow: '2025-01-01/2025-06-01' };
  const putAssignmentNote = { note: 'n' };
  const putAssignmentStatus = { status: 'done' };
  const postComment = { body: 'x', authorName: 'Y' };
  const postAddSource = {
    provider: 'canvas',
    adapterId: 'com.instructure.canvas',
    displayName: 'New',
    dataTypes: ['grades'],
  };
  const putUpdateSource = {
    provider: 'canvas',
    adapterId: 'com.instructure.canvas',
    displayName: 'Upd',
    dataTypes: ['grades'],
  };
  const putCredentials = { authType: 'api' as const, accessToken: 'test-token-idor-sweep' };
  const portalBindingBody = {
    studentId: s,
    sourceId: SOURCE_ID_ON_STUDENT,
    studentExternalId: 'idor-sweep-external-stu',
  };

  const emailContact = i.parentEmailEncoded;

  return [
    { method: 'post', path: '/api/alerts', template: '/api/alerts', body: postAlerts },
    {
      method: 'get',
      path: `/api/alerts-api/${i.alertId}`,
      template: '/api/alerts-api/:id',
    },
    {
      method: 'post',
      path: `/api/alerts-api/${i.alertId}/acknowledge`,
      template: '/api/alerts-api/:id/acknowledge',
    },
    {
      method: 'delete',
      path: `/api/alerts-api/${i.alertId}`,
      template: '/api/alerts-api/:id',
    },
    {
      method: 'get',
      path: `/api/email-history/${i.emailLogId}`,
      template: '/api/email-history/:id',
    },
    {
      method: 'post',
      path: `/api/email-history/${i.emailLogId}/resend`,
      template: '/api/email-history/:id/resend',
    },
    {
      method: 'delete',
      path: `/api/sessions/${i.sessionIdA}`,
      template: '/api/sessions/:id',
    },
    { method: 'get', path: `/api/assets/${i.assetId}`, template: '/api/assets/:assetId' },
    { method: 'head', path: `/api/assets/${i.assetId}`, template: '/api/assets/:assetId' },
    {
      method: 'get',
      path: `/api/assets/${i.assetId}/file`,
      template: '/api/assets/:assetId/file',
    },
    {
      method: 'head',
      path: `/api/assets/${i.assetId}/file`,
      template: '/api/assets/:assetId/file',
    },
    {
      method: 'get',
      path: `/api/integrations/${i.integrationId}`,
      template: '/api/integrations/:id',
    },
    {
      method: 'put',
      path: `/api/integrations/${i.integrationId}`,
      template: '/api/integrations/:id',
      body: { displayName: 'x' },
    },
    {
      method: 'delete',
      path: `/api/integrations/${i.integrationId}`,
      template: '/api/integrations/:id',
    },
    {
      method: 'get',
      path: `/api/integrations/${i.integrationId}/students`,
      template: '/api/integrations/:id/students',
    },
    {
      method: 'post',
      path: `/api/integrations/${i.integrationId}/students/${s}`,
      template: '/api/integrations/:id/students/:studentId',
      body: {},
    },
    {
      method: 'delete',
      path: `/api/integrations/${i.integrationId}/students/${s}`,
      template: '/api/integrations/:id/students/:studentId',
    },
    {
      method: 'post',
      path: `/api/sharing/invites/${i.inviteGroupId}/resend`,
      template: '/api/sharing/invites/:groupId/resend',
    },
    {
      method: 'put',
      path: `/api/portal-accounts/${i.portalAccountId}/bindings`,
      template: '/api/portal-accounts/:portalAccountId/bindings',
      body: portalBindingBody,
    },
    { method: 'get', path: `/api/students/${s}`, template: '/api/students/:id' },
    {
      method: 'put',
      path: `/api/students/${s}`,
      template: '/api/students/:id',
      body: { name: 'X' },
    },
    { method: 'delete', path: `/api/students/${s}`, template: '/api/students/:id' },
    { method: 'get', path: `/api/students/${s}/contacts`, template: '/api/students/:id/contacts' },
    {
      method: 'post',
      path: `/api/students/${s}/contacts`,
      template: '/api/students/:id/contacts',
      body: postParentInvite,
    },
    {
      method: 'post',
      path: `/api/students/${s}/contacts/accept`,
      template: '/api/students/:id/contacts/accept',
      body: postContactsAccept,
    },
    {
      method: 'post',
      path: `/api/students/${s}/contacts/decline`,
      template: '/api/students/:id/contacts/decline',
      body: postContactsDecline,
    },
    {
      method: 'put',
      path: `/api/students/${s}/contacts/${emailContact}/admin`,
      template: '/api/students/:id/contacts/:email/admin',
      body: putContactAdmin,
    },
    {
      method: 'put',
      path: `/api/students/${s}/contacts/${emailContact}`,
      template: '/api/students/:id/contacts/:email',
      body: { receiveAlerts: false },
    },
    {
      method: 'post',
      path: `/api/students/${s}/contacts/${emailContact}/magic-link/send`,
      template: '/api/students/:id/contacts/:email/magic-link/send',
      body: { channel: 'email' },
    },
    {
      method: 'delete',
      path: `/api/students/${s}/contacts/${emailContact}`,
      template: '/api/students/:id/contacts/:email',
    },
    {
      method: 'post',
      path: `/api/students/${s}/contacts/${emailContact}/transfer-email`,
      template: '/api/students/:id/contacts/:email/transfer-email',
      body: { newEmail: 'new@example.com' },
    },
    {
      method: 'post',
      path: `/api/students/${s}/contacts/transfer-confirm`,
      template: '/api/students/:id/contacts/transfer-confirm',
      body: postTransferConfirm,
    },
    {
      method: 'put',
      path: `/api/students/${s}/owner-alert-prefs`,
      template: '/api/students/:id/owner-alert-prefs',
      body: putOwnerPrefs,
    },
    {
      method: 'patch',
      path: `/api/students/${s}/courses/${encodeURIComponent(i.mergedCourseId)}/tutorial`,
      template: '/api/students/:id/courses/:mergedCourseId/tutorial',
      body: patchTutorial,
    },
    {
      method: 'delete',
      path: `/api/students/${s}/courses/${encodeURIComponent(i.mergedCourseId)}/tutorial`,
      template: '/api/students/:id/courses/:mergedCourseId/tutorial',
    },
    { method: 'get', path: `/api/students/${s}/grades`, template: '/api/students/:id/grades' },
    {
      method: 'get',
      path: `/api/students/${s}/materials`,
      template: '/api/students/:id/materials',
    },
    {
      method: 'get',
      path: `/api/students/${s}/grade-history`,
      template: '/api/students/:id/grade-history',
    },
    {
      method: 'delete',
      path: `/api/students/${s}/grade-history`,
      template: '/api/students/:id/grade-history',
    },
    {
      method: 'get',
      path: `/api/students/${s}/action-board`,
      template: '/api/students/:id/action-board',
    },
    { method: 'get', path: `/api/students/${s}/activity`, template: '/api/students/:id/activity' },
    {
      method: 'get',
      path: `/api/students/${s}/assignment-workflow`,
      template: '/api/students/:id/assignment-workflow',
    },
    {
      method: 'get',
      path: `/api/students/${s}/assignments/${ASSIGNMENT_EXTERNAL_ID}/history`,
      template: '/api/students/:id/assignments/:externalId/history',
    },
    {
      method: 'put',
      path: `/api/students/${s}/assignments/${ASSIGNMENT_EXTERNAL_ID}/note`,
      template: '/api/students/:id/assignments/:externalId/note',
      body: putAssignmentNote,
    },
    {
      method: 'put',
      path: `/api/students/${s}/assignments/${ASSIGNMENT_EXTERNAL_ID}/status`,
      template: '/api/students/:id/assignments/:externalId/status',
      body: putAssignmentStatus,
    },
    {
      method: 'get',
      path: `/api/students/${s}/assignments/${ASSIGNMENT_EXTERNAL_ID}/comments`,
      template: '/api/students/:id/assignments/:externalId/comments',
    },
    {
      method: 'post',
      path: `/api/students/${s}/assignments/${ASSIGNMENT_EXTERNAL_ID}/comments`,
      template: '/api/students/:id/assignments/:externalId/comments',
      body: postComment,
    },
    {
      method: 'delete',
      path: `/api/students/${s}/assignments/${ASSIGNMENT_EXTERNAL_ID}/comments/${i.commentId}`,
      template: '/api/students/:id/assignments/:externalId/comments/:commentId',
    },
    { method: 'get', path: `/api/students/${s}/sources`, template: '/api/students/:id/sources' },
    {
      method: 'post',
      path: `/api/students/${s}/sources`,
      template: '/api/students/:id/sources',
      body: postAddSource,
    },
    {
      method: 'put',
      path: `/api/students/${s}/sources/${SOURCE_ID_ON_STUDENT}`,
      template: '/api/students/:id/sources/:sourceId',
      body: putUpdateSource,
    },
    {
      method: 'put',
      path: `/api/students/${s}/sources/${SOURCE_ID_ON_STUDENT}/credentials`,
      template: '/api/students/:id/sources/:sourceId/credentials',
      body: putCredentials,
    },
    {
      method: 'delete',
      path: `/api/students/${s}/sources/${SOURCE_ID_ON_STUDENT}`,
      template: '/api/students/:id/sources/:sourceId',
    },
    {
      method: 'get',
      path: `/api/students/${s}/sources/${SOURCE_ID_ON_STUDENT}/runs`,
      template: '/api/students/:id/sources/:sourceId/runs',
    },
    {
      method: 'get',
      path: `/api/students/${s}/sources/${SOURCE_ID_ON_STUDENT}/runs/${i.sourceRunId}`,
      template: '/api/students/:id/sources/:sourceId/runs/:runId',
    },
    {
      method: 'post',
      path: `/api/students/${s}/sources/${SOURCE_ID_ON_STUDENT}/runs/trigger`,
      template: '/api/students/:id/sources/:sourceId/runs/trigger',
    },
    { method: 'get', path: `/api/students/${s}/alerts`, template: '/api/students/:id/alerts' },
    { method: 'get', path: `/api/students/${s}/parents`, template: '/api/students/:id/parents' },
    {
      method: 'post',
      path: `/api/students/${s}/parents/invite`,
      template: '/api/students/:id/parents/invite',
      body: postParentInvite,
    },
    {
      method: 'post',
      path: `/api/students/${s}/parents/accept`,
      template: '/api/students/:id/parents/accept',
      body: postParentsAccept,
    },
    {
      method: 'post',
      path: `/api/students/${s}/parents/decline`,
      template: '/api/students/:id/parents/decline',
      body: postParentsDecline,
    },
    {
      method: 'put',
      path: `/api/students/${s}/parents/${emailContact}/admin`,
      template: '/api/students/:id/parents/:email/admin',
      body: putParentAdmin,
    },
    {
      method: 'delete',
      path: `/api/students/${s}/parents/${emailContact}`,
      template: '/api/students/:id/parents/:email',
    },
    {
      method: 'post',
      path: `/api/students/${s}/send-digest`,
      template: '/api/students/:id/send-digest',
      body: postDigest,
    },
    { method: 'get', path: `/api/students/${s}/login`, template: '/api/students/:id/login' },
    {
      method: 'post',
      path: `/api/students/${s}/login`,
      template: '/api/students/:id/login',
      body: { email: 'stu@example.com' },
    },
    {
      method: 'post',
      path: `/api/students/${s}/login/magic-link`,
      template: '/api/students/:id/login/magic-link',
    },
    {
      method: 'post',
      path: `/api/students/${s}/login/magic-link/send`,
      template: '/api/students/:id/login/magic-link/send',
      body: { channel: 'email', to: 'stu@example.com' },
    },
    {
      method: 'patch',
      path: `/api/students/${s}/login`,
      template: '/api/students/:id/login',
      body: patchLogin,
    },
    { method: 'delete', path: `/api/students/${s}/login`, template: '/api/students/:id/login' },
    {
      method: 'post',
      path: `/api/students/${s}/assignments/${ASSIGNMENT_EXTERNAL_ID}/nudge`,
      template: '/api/students/:id/assignments/:externalId/nudge',
    },
  ];
}

export function sweepTemplateKeys(rows: ISweepRow[]): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    if (row.template.includes(':')) {
      keys.add(`${row.method.toUpperCase()} ${row.template}`);
    }
  }
  return keys;
}
