import { MongoClient, type Db } from 'mongodb';
import { AdminNoteRepository } from './AdminNoteRepository';
import { AdminNote, type IAdminNoteData } from '../../models/AdminNote';

describe('AdminNoteRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repository: AdminNoteRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    repository = new AdminNoteRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('admin_notes').deleteMany({});
  });

  describe('create', () => {
    it('should create note', async () => {
      const noteData: IAdminNoteData = {
        userId: '507f1f77bcf86cd799439011',
        adminUserId: '507f1f77bcf86cd799439012',
        adminName: 'Admin User',
        content: 'Test note',
        category: 'general',
      };

      const note = await repository.create(noteData);

      expect(note).toBeInstanceOf(AdminNote);
      expect(note.content).toBe('Test note');
      expect(note._id).toBeDefined();
    });
  });

  describe('findByUserId', () => {
    it('should find notes by user id', async () => {
      const userId = '507f1f77bcf86cd799439011';
      await repository.create({
        userId,
        adminUserId: '507f1f77bcf86cd799439012',
        content: 'Note 1',
        category: 'general',
      });
      await repository.create({
        userId,
        adminUserId: '507f1f77bcf86cd799439012',
        content: 'Note 2',
        category: 'support',
      });

      const notes = await repository.findByUserId(userId);

      expect(notes.length).toBe(2);
    });

    it('should return pinned notes first', async () => {
      const userId = '507f1f77bcf86cd799439011';
      await repository.create({
        userId,
        adminUserId: '507f1f77bcf86cd799439012',
        content: 'Regular note',
        category: 'general',
        isPinned: false,
      });
      await repository.create({
        userId,
        adminUserId: '507f1f77bcf86cd799439012',
        content: 'Pinned note',
        category: 'general',
        isPinned: true,
      });

      const notes = await repository.findByUserId(userId);

      expect(notes.length).toBe(2);
      if (notes[0]) {
        expect(notes[0].content).toBe('Pinned note');
      }
    });
  });

  describe('update', () => {
    it('should update note', async () => {
      const note = await repository.create({
        userId: '507f1f77bcf86cd799439011',
        adminUserId: '507f1f77bcf86cd799439012',
        content: 'Original content',
        category: 'general',
      });

      const updated = await repository.update(note._id!.toString(), {
        content: 'Updated content',
        category: 'billing',
      });

      expect(updated).not.toBeNull();
      expect(updated?.content).toBe('Updated content');
      expect(updated?.category).toBe('billing');
    });
  });

  describe('delete', () => {
    it('should delete note', async () => {
      const note = await repository.create({
        userId: '507f1f77bcf86cd799439011',
        adminUserId: '507f1f77bcf86cd799439012',
        content: 'Delete me',
        category: 'general',
      });

      const success = await repository.delete(note._id!.toString());

      expect(success).toBe(true);
      const found = await repository.findById(note._id!.toString());
      expect(found).toBeNull();
    });
  });

  describe('togglePin', () => {
    it('should pin note', async () => {
      const note = await repository.create({
        userId: '507f1f77bcf86cd799439011',
        adminUserId: '507f1f77bcf86cd799439012',
        content: 'Pin me',
        category: 'general',
        isPinned: false,
      });

      const success = await repository.togglePin(note._id!.toString(), true);

      expect(success).toBe(true);
      const found = await repository.findById(note._id!.toString());
      expect(found?.isPinned).toBe(true);
    });

    it('should unpin note', async () => {
      const note = await repository.create({
        userId: '507f1f77bcf86cd799439011',
        adminUserId: '507f1f77bcf86cd799439012',
        content: 'Unpin me',
        category: 'general',
        isPinned: true,
      });

      const success = await repository.togglePin(note._id!.toString(), false);

      expect(success).toBe(true);
      const found = await repository.findById(note._id!.toString());
      expect(found?.isPinned).toBe(false);
    });
  });
});

