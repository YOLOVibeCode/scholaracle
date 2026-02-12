import { MongoClient, ObjectId, type Db } from 'mongodb';
import { StudentRepository } from './StudentRepository';
import { Student, type IStudentData } from '../../models/Student';

describe('StudentRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repository: StudentRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    repository = new StudentRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('students').deleteMany({});
  });

  const makeStudentData = (overrides: Partial<IStudentData> = {}): IStudentData => ({
    userId: new ObjectId(),
    name: 'Test Student',
    grade: 10,
    studentId: 'STU-001',
    ...overrides,
  });

  describe('create', () => {
    it('should create a student and return a Student instance', async () => {
      const data = makeStudentData();

      const student = await repository.create(data);

      expect(student).toBeInstanceOf(Student);
      expect(student._id).toBeDefined();
      expect(student.name).toBe('Test Student');
      expect(student.grade).toBe(10);
      expect(student.studentId).toBe('STU-001');
    });

    it('should set createdAt and updatedAt timestamps', async () => {
      const before = new Date();
      const student = await repository.create(makeStudentData());
      const after = new Date();

      expect(student.createdAt).toBeInstanceOf(Date);
      expect(student.updatedAt).toBeInstanceOf(Date);
      expect(student.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(student.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should convert a string userId to ObjectId', async () => {
      const userId = new ObjectId();
      const data = makeStudentData({ userId: userId.toString() });

      const student = await repository.create(data);

      expect(student.userId).toBeInstanceOf(ObjectId);
      expect(student.userId.toString()).toBe(userId.toString());
    });

    it('should default dataSources to an empty array', async () => {
      const student = await repository.create(makeStudentData());

      expect(student.dataSources).toEqual([]);
    });

    it('should persist the student to the database', async () => {
      const student = await repository.create(makeStudentData());

      const found = await repository.findById(student._id!);
      expect(found).not.toBeNull();
      expect(found?.name).toBe('Test Student');
    });
  });

  describe('findById', () => {
    it('should find a student by ObjectId', async () => {
      const created = await repository.create(makeStudentData({ name: 'Find Me' }));

      const found = await repository.findById(created._id!);

      expect(found).not.toBeNull();
      expect(found).toBeInstanceOf(Student);
      expect(found?._id?.toString()).toBe(created._id?.toString());
      expect(found?.name).toBe('Find Me');
    });

    it('should find a student by string id', async () => {
      const created = await repository.create(makeStudentData({ name: 'String ID' }));

      const found = await repository.findById(created._id!.toString());

      expect(found).not.toBeNull();
      expect(found?.name).toBe('String ID');
    });

    it('should return null for a non-existent id', async () => {
      const found = await repository.findById('507f1f77bcf86cd799439011');

      expect(found).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('should find all students for a given user', async () => {
      const userId = new ObjectId();
      await repository.create(makeStudentData({ userId, name: 'Child A' }));
      await repository.create(makeStudentData({ userId, name: 'Child B' }));

      const students = await repository.findByUserId(userId);

      expect(students).toHaveLength(2);
      const names = students.map((s) => s.name);
      expect(names).toContain('Child A');
      expect(names).toContain('Child B');
    });

    it('should find students when userId is passed as a string', async () => {
      const userId = new ObjectId();
      await repository.create(makeStudentData({ userId, name: 'String Lookup' }));

      const students = await repository.findByUserId(userId.toString());

      expect(students).toHaveLength(1);
      expect(students[0]?.name).toBe('String Lookup');
    });

    it('should return an empty array when no students exist for the user', async () => {
      const students = await repository.findByUserId(new ObjectId());

      expect(students).toEqual([]);
    });

    it('should not return students belonging to a different user', async () => {
      const userA = new ObjectId();
      const userB = new ObjectId();
      await repository.create(makeStudentData({ userId: userA, name: 'User A Child' }));
      await repository.create(makeStudentData({ userId: userB, name: 'User B Child' }));

      const students = await repository.findByUserId(userA);

      expect(students).toHaveLength(1);
      expect(students[0]?.name).toBe('User A Child');
    });

    it('should return Student instances', async () => {
      const userId = new ObjectId();
      await repository.create(makeStudentData({ userId }));

      const students = await repository.findByUserId(userId);

      expect(students[0]).toBeInstanceOf(Student);
    });
  });

  describe('update', () => {
    it('should update a student and return the updated Student', async () => {
      const created = await repository.create(makeStudentData({ name: 'Old Name', grade: 9 }));

      const updated = await repository.update(created._id!, { name: 'New Name', grade: 10 });

      expect(updated).not.toBeNull();
      expect(updated).toBeInstanceOf(Student);
      expect(updated?.name).toBe('New Name');
      expect(updated?.grade).toBe(10);
    });

    it('should update the updatedAt timestamp', async () => {
      const created = await repository.create(makeStudentData());
      const originalUpdatedAt = created.updatedAt;

      // Small delay to ensure timestamp differs
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await repository.update(created._id!, { name: 'Updated' });

      expect(updated).not.toBeNull();
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    it('should perform a partial update without overwriting other fields', async () => {
      const created = await repository.create(
        makeStudentData({ name: 'Original', grade: 11, studentId: 'STU-100' })
      );

      const updated = await repository.update(created._id!, { grade: 12 });

      expect(updated?.name).toBe('Original');
      expect(updated?.grade).toBe(12);
      expect(updated?.studentId).toBe('STU-100');
    });

    it('should accept a string id', async () => {
      const created = await repository.create(makeStudentData({ name: 'String Update' }));

      const updated = await repository.update(created._id!.toString(), { name: 'Updated' });

      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('Updated');
    });

    it('should return null when updating a non-existent student', async () => {
      const updated = await repository.update('507f1f77bcf86cd799439011', { name: 'Ghost' });

      expect(updated).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete a student and return true', async () => {
      const created = await repository.create(makeStudentData());

      const isDeleted = await repository.delete(created._id!);

      expect(isDeleted).toBe(true);
    });

    it('should remove the student from the database', async () => {
      const created = await repository.create(makeStudentData());

      await repository.delete(created._id!);
      const found = await repository.findById(created._id!);

      expect(found).toBeNull();
    });

    it('should accept a string id', async () => {
      const created = await repository.create(makeStudentData());

      const isDeleted = await repository.delete(created._id!.toString());

      expect(isDeleted).toBe(true);
    });

    it('should return false when deleting a non-existent student', async () => {
      const isDeleted = await repository.delete('507f1f77bcf86cd799439011');

      expect(isDeleted).toBe(false);
    });

    it('should not affect other students when deleting one', async () => {
      const userId = new ObjectId();
      const studentA = await repository.create(makeStudentData({ userId, name: 'Keep' }));
      const studentB = await repository.create(makeStudentData({ userId, name: 'Remove' }));

      await repository.delete(studentB._id!);

      const remaining = await repository.findByUserId(userId);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.name).toBe('Keep');

      const foundA = await repository.findById(studentA._id!);
      expect(foundA).not.toBeNull();
    });
  });
});
