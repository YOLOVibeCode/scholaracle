import { ObjectId } from 'mongodb';
import { Student } from '@scholaracle/database';
import { slcStudentFilter, toStudentSession } from './studioScope';

describe('studioScope', () => {
  it('toStudentSession treats omitted showGrades as false (server-side, not CSS)', () => {
    const student = new Student(
      {
        userId: 'owner-parent-id',
        name: 'Emma',
        studentLogin: {
          userId: 'emma-login-user',
          createdAt: new Date('2026-08-25T12:00:00Z'),
        },
      },
      new ObjectId()
    );
    expect(toStudentSession(student).showGrades).toBe(false);
  });

  it('slcStudentFilter queries the owner dataUserId, not the student login userId', () => {
    const id = new ObjectId();
    const student = new Student(
      {
        userId: 'owner-parent-id',
        name: 'Emma',
        studentId: 'demo-emma',
        studentLogin: {
          userId: 'emma-login-user',
          showGrades: false,
          createdAt: new Date(),
        },
      },
      id
    );
    const filter = slcStudentFilter(student);
    expect(filter['userId']).toBe('owner-parent-id');
    expect(filter['userId']).not.toBe('emma-login-user');
    expect(filter['deletedAt']).toBeNull();
    expect(filter['$or']).toEqual(
      expect.arrayContaining([{ studentId: id.toString() }, { studentExternalId: 'demo-emma' }])
    );
  });
});
