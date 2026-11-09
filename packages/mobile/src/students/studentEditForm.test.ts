import {
  buildStudentUpdate,
  hasStudentEditChanges,
  initialStudentEditFields,
} from './studentEditForm';

describe('initialStudentEditFields', () => {
  it('prefills from the student', () => {
    expect(initialStudentEditFields({ name: 'Ava', grade: 7, studentId: 'x1' })).toEqual({
      name: 'Ava',
      grade: '7',
      studentId: 'x1',
    });
  });

  it('uses empty strings for missing optional fields', () => {
    expect(initialStudentEditFields({ name: 'Ava' })).toEqual({
      name: 'Ava',
      grade: '',
      studentId: '',
    });
  });
});

describe('buildStudentUpdate', () => {
  it('requires a name', () => {
    expect(buildStudentUpdate({ name: '  ', grade: '', studentId: '' })).toEqual({
      ok: false,
      error: 'Enter a name.',
    });
  });

  it('trims and sends name, numeric grade and student id like the web', () => {
    expect(buildStudentUpdate({ name: ' Ava ', grade: ' 7 ', studentId: ' x1 ' })).toEqual({
      ok: true,
      request: { name: 'Ava', grade: 7, studentId: 'x1' },
    });
  });

  it('omits empty optional fields', () => {
    expect(buildStudentUpdate({ name: 'Ava', grade: '', studentId: '' })).toEqual({
      ok: true,
      request: { name: 'Ava' },
    });
  });

  it.each(['abc', '0', '-3', '1.5', '123'])('rejects grade %s', (grade) => {
    const out = buildStudentUpdate({ name: 'Ava', grade, studentId: '' });
    expect(out.ok).toBe(false);
  });
});

describe('hasStudentEditChanges', () => {
  const student = { name: 'Ava', grade: 7, studentId: 'x1' };

  it('is false for untouched or whitespace-only edits', () => {
    expect(hasStudentEditChanges(student, initialStudentEditFields(student))).toBe(false);
    expect(hasStudentEditChanges(student, { name: ' Ava ', grade: '7', studentId: 'x1' })).toBe(
      false
    );
  });

  it('is true when any field changes', () => {
    expect(hasStudentEditChanges(student, { name: 'Eva', grade: '7', studentId: 'x1' })).toBe(true);
    expect(hasStudentEditChanges(student, { name: 'Ava', grade: '8', studentId: 'x1' })).toBe(true);
    expect(hasStudentEditChanges(student, { name: 'Ava', grade: '7', studentId: '' })).toBe(true);
  });
});
