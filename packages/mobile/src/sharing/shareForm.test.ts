import { ApiError } from '../api/ApiError';
import {
  DEFAULT_SHARE_CHANNELS,
  buildShareInvite,
  initialShareForm,
  isValidEmail,
  selectedSummary,
  shareFailureMessage,
  shareResultLines,
  shareSummary,
  smsOptInShareMessage,
  textChannelAvailable,
  toggleChannel,
  toggleStudent,
} from './shareForm';

const names = new Map([
  ['s1', 'Ava'],
  ['s2', 'Christian'],
]);

describe('share form state', () => {
  it('starts with email + push on, the given student preselected, label parent, not admin', () => {
    const form = initialShareForm('s1');
    expect(form.channels).toEqual(DEFAULT_SHARE_CHANNELS);
    expect(form.channels).toEqual(['email', 'push']);
    expect(form.studentIds).toEqual(['s1']);
    expect(form.label).toBe('parent');
    expect(form.isAdmin).toBe(false);
    expect(initialShareForm().studentIds).toEqual([]);
  });

  it('toggles students and channels', () => {
    let form = initialShareForm();
    form = toggleStudent(form, 's1');
    form = toggleStudent(form, 's2');
    expect(form.studentIds).toEqual(['s1', 's2']);
    form = toggleStudent(form, 's1');
    expect(form.studentIds).toEqual(['s2']);
    form = toggleChannel(form, 'push');
    expect(form.channels).toEqual(['email']);
    form = toggleChannel(form, 'sms');
    expect(form.channels).toEqual(['email', 'sms']);
  });

  it('offers texting only once a phone is typed', () => {
    expect(textChannelAvailable({ phone: '' })).toBe(false);
    expect(textChannelAvailable({ phone: '  ' })).toBe(false);
    expect(textChannelAvailable({ phone: '+1 555 0100' })).toBe(true);
  });
});

describe('buildShareInvite', () => {
  const valid = {
    ...initialShareForm('s1'),
    email: '  Jessica@Example.com ',
    name: ' Jessica Lewis ',
  };

  it('requires a valid email', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
    expect(buildShareInvite({ ...valid, email: 'nope' })).toEqual({
      ok: false,
      error: 'Enter a valid email address.',
    });
  });

  it('requires at least one student and one channel', () => {
    expect(buildShareInvite({ ...valid, studentIds: [] })).toEqual({
      ok: false,
      error: 'Pick at least one student.',
    });
    expect(buildShareInvite({ ...valid, channels: [] })).toEqual({
      ok: false,
      error: 'Pick at least one way to send alerts.',
    });
  });

  it('requires a phone when texting is picked', () => {
    expect(buildShareInvite({ ...valid, channels: ['email', 'sms'] })).toEqual({
      ok: false,
      error: 'Add a phone number to send texts.',
    });
  });

  it('builds a trimmed, lower-cased request and omits empty optionals', () => {
    const built = buildShareInvite(valid);
    expect(built).toEqual({
      ok: true,
      request: {
        email: 'jessica@example.com',
        name: 'Jessica Lewis',
        label: 'parent',
        isAdmin: false,
        studentIds: ['s1'],
        alertChannels: ['email', 'push'],
      },
    });
    const withPhone = buildShareInvite({
      ...valid,
      phone: ' +1 555 0100 ',
      channels: ['email', 'sms'],
      isAdmin: true,
      label: 'guardian',
    });
    expect(withPhone.ok && withPhone.request.phone).toBe('+1 555 0100');
    expect(withPhone.ok && withPhone.request.isAdmin).toBe(true);
    expect(withPhone.ok && withPhone.request.label).toBe('guardian');
  });
});

describe('result copy', () => {
  it('summarises the selection', () => {
    expect(selectedSummary({ studentIds: [] }, names)).toBe('No students selected');
    expect(selectedSummary({ studentIds: ['s1'] }, names)).toBe('1 student selected: Ava');
    expect(selectedSummary({ studentIds: ['s1', 's2'] }, names)).toBe(
      '2 students selected: Ava and Christian'
    );
    expect(selectedSummary({ studentIds: ['zz'] }, names)).toBe('1 student selected: Student');
  });

  it('maps per-student statuses to lines', () => {
    const lines = shareResultLines(
      {
        perStudent: [
          { studentId: 's1', status: 'invited' },
          { studentId: 's2', status: 'already_accepted' },
          { studentId: 's3', status: 'no_access' },
        ],
      },
      names
    );
    expect(lines).toEqual([
      { studentId: 's1', name: 'Ava', text: 'Invitation sent', ok: true },
      { studentId: 's2', name: 'Christian', text: 'Already has access', ok: false },
      { studentId: 's3', name: 'Student', text: "You can't share this student", ok: false },
    ]);
  });

  it('summarises how many invitations went out', () => {
    expect(shareSummary({ perStudent: [{ studentId: 's1', status: 'already_invited' }] })).toMatch(
      /Nothing new/
    );
    expect(shareSummary({ perStudent: [{ studentId: 's1', status: 'invited' }] })).toBe(
      'One invitation email sent.'
    );
    expect(
      shareSummary({
        perStudent: [
          { studentId: 's1', status: 'invited' },
          { studentId: 's2', status: 'invited' },
        ],
      })
    ).toBe('One invitation email sent for 2 students.');
  });

  it('writes the opt-in message the person must act on themselves', () => {
    const text = smsOptInShareMessage({
      inviteeName: 'Jessica',
      studentNames: ['Ava', 'Christian'],
      url: 'https://scholarmancy.com/sms/optin/tok',
    });
    expect(text).toContain('Hi Jessica,');
    expect(text).toContain('about Ava and Christian');
    expect(text).toContain('https://scholarmancy.com/sms/optin/tok');
    expect(text).toMatch(/opt in yourself/);
    expect(text).toMatch(/Nothing is texted to you before you do/);
    expect(smsOptInShareMessage({ studentNames: [], url: 'u' })).toMatch(/^Hi, Scholarmancy/);
  });

  it('turns API failures into plain copy', () => {
    expect(shareFailureMessage(new ApiError('Forbidden', 403))).toMatch(/own or manage/);
    expect(shareFailureMessage(new ApiError('Too many', 429))).toMatch(/tomorrow/);
    expect(shareFailureMessage(new ApiError('dup', 409))).toMatch(/already has access/);
    expect(shareFailureMessage(new ApiError('Server said no', 500))).toBe('Server said no');
    expect(shareFailureMessage('weird')).toBe('Could not send the invitation.');
  });
});
