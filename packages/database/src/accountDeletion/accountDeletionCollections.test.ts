import {
  ACCOUNT_DELETION_AUDIT_COLLECTION,
  COLLECTIONS_HANDLED_BY_DELETION_SERVICE,
  COLLECTIONS_KEPT_ON_ACCOUNT_DELETION,
  EXTRA_USER_SCOPED_JOB_FILTER,
  STUDENT_SCOPED_DELETION_COLLECTIONS,
  USER_ID_KEYED_DELETION_COLLECTIONS,
  USER_SCOPED_DELETION_TARGETS,
} from './accountDeletionCollections';

describe('accountDeletionCollections manifest', () => {
  it('lists every slc_* tenant collection used for household data', () => {
    const slc = USER_SCOPED_DELETION_TARGETS.map((t) => t.name).filter((n) => n.startsWith('slc_'));
    expect(slc).toEqual(
      expect.arrayContaining([
        'slc_assignments',
        'slc_courses',
        'slc_sources',
        'slc_runs',
        'slc_device_auth',
      ])
    );
    expect(slc.length).toBeGreaterThanOrEqual(10);
  });

  it('includes audit collection name and job outbox purge key', () => {
    expect(ACCOUNT_DELETION_AUDIT_COLLECTION).toBe('account_deletion_audits');
    expect(EXTRA_USER_SCOPED_JOB_FILTER).toBe('jobs');
    expect(STUDENT_SCOPED_DELETION_COLLECTIONS).toContain('sync_requests');
    // Student review R3/R4 rows are keyed by the student's Mongo id and go with the student.
    expect(STUDENT_SCOPED_DELETION_COLLECTIONS).toContain('student_help_requests');
    expect(STUDENT_SCOPED_DELETION_COLLECTIONS).toContain('weekly_review_sends');
  });

  it('lists every collection ingest writes synced school records to', () => {
    // The values of ENTITY_COLLECTION_MAP in the API's ingest route.
    const names = USER_SCOPED_DELETION_TARGETS.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'slc_assignments',
        'slc_event_series',
        'slc_event_overrides',
        'slc_courses',
        'slc_grade_snapshots',
        'slc_attendance_events',
        'slc_academic_terms',
        'slc_institutions',
        'slc_teachers',
        'slc_course_materials',
        'slc_messages',
        'slc_student_profiles',
      ])
    );
  });

  it('removes connected devices, so their tokens stop being honoured', () => {
    const names = USER_SCOPED_DELETION_TARGETS.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['slc_devices', 'revoked_connector_tokens']));
  });

  it('removes the reminder log with the student and the stale-sync record with the owner', () => {
    expect(STUDENT_SCOPED_DELETION_COLLECTIONS).toEqual(
      expect.arrayContaining(['guidance_sends', 'guidance_student_days'])
    );
    expect(USER_ID_KEYED_DELETION_COLLECTIONS).toEqual(['sync_staleness_alerts']);
  });

  it('names no collection twice across the lists', () => {
    const all = [
      ...USER_SCOPED_DELETION_TARGETS.map((t) => t.name),
      ...USER_ID_KEYED_DELETION_COLLECTIONS,
      ...COLLECTIONS_HANDLED_BY_DELETION_SERVICE,
      ...Object.keys(COLLECTIONS_KEPT_ON_ACCOUNT_DELETION),
    ];
    expect(all.filter((name, i) => all.indexOf(name) !== i)).toEqual([]);
    // magic_login_tokens is deleted both by user and by student, on purpose.
    const studentOnly = STUDENT_SCOPED_DELETION_COLLECTIONS.filter(
      (name) => name !== 'magic_login_tokens'
    );
    expect(studentOnly.filter((name) => all.includes(name))).toEqual([]);
  });
});
