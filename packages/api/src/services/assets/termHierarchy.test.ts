import type { Db } from 'mongodb';
import { resolveTermIdsIncludingDescendants } from './termHierarchy';

function mockDb(docs: { externalId: string; record?: { parentTermExternalId?: string } }[]): Db {
  return {
    collection: jest.fn().mockReturnValue({
      find: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue(docs),
      }),
    }),
  } as unknown as Db;
}

describe('resolveTermIdsIncludingDescendants', () => {
  it('returns only root when no descendants exist', async () => {
    const db = mockDb([{ externalId: 'year1', record: {} }]);
    const result = await resolveTermIdsIncludingDescendants(db, 'u', 'p', 'a', 'year1');
    expect(result).toEqual(['year1']);
  });

  it('returns root and all descendants (semester → grading periods)', async () => {
    const db = mockDb([
      { externalId: 'sem1', record: { parentTermExternalId: 'year1' } },
      { externalId: 'gp1', record: { parentTermExternalId: 'sem1' } },
      { externalId: 'gp2', record: { parentTermExternalId: 'sem1' } },
      { externalId: 'gp3', record: { parentTermExternalId: 'sem1' } },
      { externalId: 'year1', record: {} },
    ]);
    const result = await resolveTermIdsIncludingDescendants(db, 'u', 'p', 'a', 'sem1');
    expect(result.sort()).toEqual(['sem1', 'gp1', 'gp2', 'gp3'].sort());
  });

  it('includes multi-level hierarchy (year → semester → grading period)', async () => {
    const db = mockDb([
      { externalId: 'year1', record: {} },
      { externalId: 'sem1', record: { parentTermExternalId: 'year1' } },
      { externalId: 'gp1', record: { parentTermExternalId: 'sem1' } },
    ]);
    const result = await resolveTermIdsIncludingDescendants(db, 'u', 'p', 'a', 'year1');
    expect(result.sort()).toEqual(['year1', 'sem1', 'gp1'].sort());
  });

  it('returns root only when collection has no term docs', async () => {
    const db = mockDb([]);
    const result = await resolveTermIdsIncludingDescendants(db, 'u', 'p', 'a', 'root');
    expect(result).toEqual(['root']);
  });
});
