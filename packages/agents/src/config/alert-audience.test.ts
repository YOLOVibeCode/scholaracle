import { AlertType } from '@scholaracle/contracts';
import { alertAudience, shouldNotifyParent, shouldNotifyStudent } from './alert-audience';

describe('alertAudience v1 (slice 7)', () => {
  it('deadline T-48h / T-18h is student only', () => {
    expect(shouldNotifyStudent(AlertType.DEADLINE)).toBe(true);
    expect(shouldNotifyParent(AlertType.DEADLINE)).toBe(false);
  });

  it('missing T+12h notifies student and parent', () => {
    expect(shouldNotifyStudent(AlertType.MISSING_ASSIGNMENT)).toBe(true);
    expect(shouldNotifyParent(AlertType.MISSING_ASSIGNMENT)).toBe(true);
  });

  it('T+72h talking points are parent-only (no extra student nag)', () => {
    expect(shouldNotifyStudent(AlertType.RECOMMENDATION)).toBe(false);
    expect(shouldNotifyParent(AlertType.RECOMMENDATION)).toBe(true);
  });

  it('grade drop still goes to both (copy omits scores when showGrades is false)', () => {
    expect(shouldNotifyStudent(AlertType.GRADE_DROP)).toBe(true);
    expect(shouldNotifyParent(AlertType.GRADE_DROP)).toBe(true);
  });

  it('positive is student-first; parent waits for digest', () => {
    expect(shouldNotifyStudent(AlertType.POSITIVE)).toBe(true);
    expect(shouldNotifyParent(AlertType.POSITIVE)).toBe(false);
  });

  it('workload and test are student-first; parent digest unless severity high (deferred)', () => {
    expect(shouldNotifyStudent(AlertType.WORKLOAD)).toBe(true);
    expect(shouldNotifyParent(AlertType.WORKLOAD)).toBe(false);
    expect(shouldNotifyStudent(AlertType.TEST)).toBe(true);
    expect(shouldNotifyParent(AlertType.TEST)).toBe(false);
  });

  it('covers every AlertType', () => {
    for (const type of Object.values(AlertType)) {
      expect(alertAudience[type]).toEqual(
        expect.objectContaining({ student: expect.any(Boolean), parent: expect.any(Boolean) })
      );
    }
  });
});
