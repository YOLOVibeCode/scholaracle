import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { fetchGradeBlocksForUser, percentToLetter } from './grade-block-fetcher';

describe('percentToLetter', () => {
  it.each([
    [50, 'F'],
    [72, 'D'],
    [82, 'C'],
    [88, 'B'],
    [95, 'A'],
  ])('maps %p to %s', (percent, letter) => {
    expect(percentToLetter(percent)).toBe(letter);
  });
});

describe('fetchGradeBlocksForUser', () => {
  it('returns empty list when database handle is invalid', async () => {
    await expect(
      fetchGradeBlocksForUser({} as never, 'user-1', 'http://localhost:2800')
    ).resolves.toEqual([]);
  });

  it('returns empty list when no grade snapshots exist', async () => {
    const mongod = await MongoMemoryServer.create();
    const client = new MongoClient(mongod.getUri());
    await client.connect();
    const database = client.db('grade_blocks');
    await expect(
      fetchGradeBlocksForUser(database, 'parent-1', 'http://localhost:2800/')
    ).resolves.toEqual([]);
    await client.close();
    await mongod.stop();
  });
});
