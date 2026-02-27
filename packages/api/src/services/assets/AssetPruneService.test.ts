import { AssetPruneService } from './AssetPruneService';
import type { IAssetReader, IAssetWriter } from './AssetRepository';
import type { IAssetStore } from './IAssetStore';

const mockStore: IAssetStore = {
  put: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
  exists: jest.fn(),
  getSignedUrl: jest.fn(),
};

describe('AssetPruneService', () => {
  let reader: { findSoftDeletedBefore: jest.Mock };
  let writer: {
    softDeleteBySourceId: jest.Mock;
    softDeleteByTerm: jest.Mock;
    softDeleteByAge: jest.Mock;
    hardDelete: jest.Mock;
  };
  let service: AssetPruneService;

  beforeEach(() => {
    writer = {
      softDeleteBySourceId: jest.fn().mockResolvedValue(5),
      softDeleteByTerm: jest.fn().mockResolvedValue(2),
      softDeleteByAge: jest.fn().mockResolvedValue(1),
      hardDelete: jest.fn(),
    };
    reader = {
      findSoftDeletedBefore: jest.fn().mockResolvedValue([
        { assetId: 'a1', storageKey: 's1' },
        { assetId: 'a2', storageKey: 's2' },
      ]),
    };
    service = new AssetPruneService({
      assetReader: reader as unknown as IAssetReader,
      assetWriter: writer as unknown as IAssetWriter,
      assetStore: mockStore,
    });
  });

  it('pruneBySource should call writer.softDeleteBySourceId', async () => {
    const count = await service.pruneBySource('user-1', 'source-1');
    expect(count).toBe(5);
    expect(writer.softDeleteBySourceId).toHaveBeenCalledWith('user-1', 'source-1');
  });

  it('pruneByTerm should call writer.softDeleteByTerm', async () => {
    const count = await service.pruneByTerm('user-1', 'source-1', 'term-fall');
    expect(count).toBe(2);
    expect(writer.softDeleteByTerm).toHaveBeenCalledWith('user-1', 'source-1', 'term-fall');
  });

  it('pruneByAge should call writer.softDeleteByAge with date cutoffs', async () => {
    const count = await service.pruneByAge(
      'user-1',
      'source-1',
      365 * 24 * 60 * 60 * 1000,
      180 * 24 * 60 * 60 * 1000
    );
    expect(count).toBe(1);
    expect(writer.softDeleteByAge).toHaveBeenCalledWith(
      'user-1',
      'source-1',
      expect.any(Date),
      expect.any(Date)
    );
  });

  it('processGracePeriod should hard-delete and remove from store', async () => {
    writer.hardDelete.mockResolvedValue(undefined);
    (mockStore.delete as jest.Mock).mockResolvedValue(undefined);
    const result = await service.processGracePeriod();
    expect(result.hardDeleted).toBe(2);
    expect(mockStore.delete).toHaveBeenCalledTimes(2);
    expect(writer.hardDelete).toHaveBeenCalledTimes(2);
  });
});
