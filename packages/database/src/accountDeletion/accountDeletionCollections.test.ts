import {
  ACCOUNT_DELETION_AUDIT_COLLECTION,
  EXTRA_USER_SCOPED_JOB_FILTER,
  STUDENT_SCOPED_DELETION_COLLECTIONS,
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
});
