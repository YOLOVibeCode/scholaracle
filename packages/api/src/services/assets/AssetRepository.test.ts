import type { Db } from 'mongodb';
import { AssetRepository } from './AssetRepository';

function mockCollection() {
  const findOne = jest.fn();
  const updateMany = jest.fn();
  const insertOne = jest.fn();
  const deleteOne = jest.fn();
  const find = jest.fn();
  return {
    findOne,
    updateMany,
    insertOne,
    deleteOne,
    find,
    _calls: { findOne, updateMany, insertOne, deleteOne, find },
  };
}

function mockDb(collection = mockCollection()): Db {
  return {
    collection: jest.fn().mockReturnValue(collection),
  } as unknown as Db;
}

describe('AssetRepository', () => {
  it('findByAssetId returns null when no doc', async () => {
    const coll = mockCollection();
    coll.findOne.mockResolvedValue(null);
    const repo = new AssetRepository(mockDb(coll));
    expect(await repo.findByAssetId('a1')).toBeNull();
    expect(coll.findOne).toHaveBeenCalledWith({ assetId: 'a1', deletedAt: null });
  });

  it('softDeleteByEntity calls updateMany with entityType and entityExternalId', async () => {
    const coll = mockCollection();
    coll.updateMany.mockResolvedValue({ modifiedCount: 2 });
    const repo = new AssetRepository(mockDb(coll));
    const count = await repo.softDeleteByEntity('u', 's', 'assignment', 'ext-1');
    expect(count).toBe(2);
    expect(coll.updateMany).toHaveBeenCalledWith(
      { userId: 'u', sourceId: 's', entityType: 'assignment', entityExternalId: 'ext-1', deletedAt: null },
      expect.objectContaining({ $set: expect.objectContaining({ deletedAt: expect.any(Date) }) })
    );
  });

  it('softDeleteByCourse calls updateMany with courseExternalId', async () => {
    const coll = mockCollection();
    coll.updateMany.mockResolvedValue({ modifiedCount: 3 });
    const repo = new AssetRepository(mockDb(coll));
    const count = await repo.softDeleteByCourse('u', 's', 'course-1');
    expect(count).toBe(3);
    expect(coll.updateMany).toHaveBeenCalledWith(
      { userId: 'u', sourceId: 's', courseExternalId: 'course-1', deletedAt: null },
      expect.any(Object)
    );
  });

  it('softDeleteByTermIds returns 0 when academicTermIds is empty', async () => {
    const coll = mockCollection();
    const repo = new AssetRepository(mockDb(coll));
    expect(await repo.softDeleteByTermIds('u', 's', [])).toBe(0);
    expect(coll.updateMany).not.toHaveBeenCalled();
  });

  it('softDeleteByTermIds calls updateMany with $in term ids', async () => {
    const coll = mockCollection();
    coll.updateMany.mockResolvedValue({ modifiedCount: 5 });
    const repo = new AssetRepository(mockDb(coll));
    const count = await repo.softDeleteByTermIds('u', 's', ['t1', 't2']);
    expect(count).toBe(5);
    expect(coll.updateMany).toHaveBeenCalledWith(
      { userId: 'u', sourceId: 's', academicTermId: { $in: ['t1', 't2'] }, deletedAt: null },
      expect.any(Object)
    );
  });

  it('insert calls insertOne with doc and timestamps', async () => {
    const coll = mockCollection();
    coll.insertOne.mockResolvedValue({ insertedId: 'id' });
    const repo = new AssetRepository(mockDb(coll));
    await repo.insert({
      assetId: 'a1',
      sourceId: 's',
      userId: 'u',
      originalUrl: 'https://x.com/f',
      storageKey: 's/a1',
      fileName: 'f',
      mimeType: 'application/pdf',
      fileSize: 100,
      contentHash: 'h',
      entityType: 'courseMaterial',
      entityExternalId: 'e1',
    });
    expect(coll.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'a1',
        sourceId: 's',
        userId: 'u',
        uploadedAt: expect.any(Date),
        lastAccessedAt: expect.any(Date),
      })
    );
  });
});
