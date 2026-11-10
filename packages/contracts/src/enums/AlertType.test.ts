import { ALERT_TYPE_LABELS, AlertType, alertTypeLabel } from './AlertType';

describe('AlertType', () => {
  it('has student_needs_help for the student review "Need help" tap', () => {
    expect(AlertType.STUDENT_NEEDS_HELP).toBe('student_needs_help');
    expect(Object.values(AlertType)).toContain('student_needs_help');
  });

  it('labels every alert type with human copy', () => {
    for (const type of Object.values(AlertType)) {
      const label = ALERT_TYPE_LABELS[type];
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toMatch(/_/);
    }
    expect(ALERT_TYPE_LABELS[AlertType.STUDENT_NEEDS_HELP]).toBe('Asks for help');
  });

  it('alertTypeLabel returns the label or spaced words for unknown types', () => {
    expect(alertTypeLabel('student_needs_help')).toBe('Asks for help');
    expect(alertTypeLabel(AlertType.GRADE_DROP)).toBe('Grade drops');
    expect(alertTypeLabel('some_new-one')).toBe('some new one');
  });
});
