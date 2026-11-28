import type { ICourseTutorialOverrideWriter } from '@scholaracle/database';
import { adoptJoinedTutorialOverrides } from './adoptJoinedTutorialOverrides';

function fakeRepo() {
  const upsertManual = jest.fn(
    async (p: { readonly mergedCourseId: string; readonly tutorialWindow: string }) => ({
      mergedCourseId: p.mergedCourseId,
      tutorialWindow: p.tutorialWindow,
    })
  );
  const deleteByStudentAndMergedCourse = jest.fn(
    async (_p: { readonly mergedCourseId: string }) => true
  );
  const writer = {
    upsertManual,
    deleteByStudentAndMergedCourse,
  } as unknown as ICourseTutorialOverrideWriter;
  return { upsertManual, deleteByStudentAndMergedCourse, writer };
}

const owner = { userId: 'user-1', studentId: 'student-1' };

describe('adoptJoinedTutorialOverrides', () => {
  it('moves a window saved on a former duplicate onto the joined class', async () => {
    const repo = fakeRepo();

    const byMerged = await adoptJoinedTutorialOverrides({
      ...owner,
      repo: repo.writer,
      groups: [{ mergedId: 'joined', aliasMergedIds: ['old'] }],
      overrides: [{ mergedCourseId: 'old', tutorialWindow: 'Tue 7:15–7:45 AM' }],
    });

    expect(repo.upsertManual).toHaveBeenCalledWith({
      ...owner,
      mergedCourseId: 'joined',
      tutorialWindow: 'Tue 7:15–7:45 AM',
    });
    expect(repo.deleteByStudentAndMergedCourse).toHaveBeenCalledWith({
      ...owner,
      mergedCourseId: 'old',
    });
    expect(byMerged.get('joined')?.tutorialWindow).toBe('Tue 7:15–7:45 AM');
    expect(byMerged.has('old')).toBe(false);
  });

  it("keeps the joined class's own window and leaves the stored ones alone", async () => {
    const repo = fakeRepo();

    const byMerged = await adoptJoinedTutorialOverrides({
      ...owner,
      repo: repo.writer,
      groups: [{ mergedId: 'joined', aliasMergedIds: ['old'] }],
      overrides: [
        { mergedCourseId: 'joined', tutorialWindow: 'Wed 3:45 PM' },
        { mergedCourseId: 'old', tutorialWindow: 'Tue 7:15–7:45 AM' },
      ],
    });

    expect(repo.upsertManual).not.toHaveBeenCalled();
    expect(repo.deleteByStudentAndMergedCourse).not.toHaveBeenCalled();
    expect(byMerged.get('joined')?.tutorialWindow).toBe('Wed 3:45 PM');
  });

  it('writes nothing when no class was joined', async () => {
    const repo = fakeRepo();

    const byMerged = await adoptJoinedTutorialOverrides({
      ...owner,
      repo: repo.writer,
      groups: [{ mergedId: 'pottery' }],
      overrides: [{ mergedCourseId: 'pottery', tutorialWindow: 'Thu 7:30 AM' }],
    });

    expect(repo.upsertManual).not.toHaveBeenCalled();
    expect(byMerged.get('pottery')?.tutorialWindow).toBe('Thu 7:30 AM');
  });
});
