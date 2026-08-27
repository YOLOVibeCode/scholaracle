import type { ITodayView } from '@scholaracle/contracts';
import { todayViewModel } from './todayViewModel';

const VIEW: ITodayView = {
  encouragement: 'Nice work on Reading response 8.',
  next: {
    assignmentExternalId: 'demo-emma-ap-bio-a5',
    title: 'Unit 9 Homework',
    courseName: 'AP Biology',
    dueAt: '2026-08-29T16:00:00.000Z',
    primaryCtaLabel: 'Open worksheet',
  },
  alsoToday: [
    {
      assignmentExternalId: 'demo-emma-span2-vocab',
      title: 'Vocab quiz',
      courseName: 'Spanish II',
      primaryCtaLabel: 'Open quiz',
    },
  ],
};

describe('todayViewModel', () => {
  it('exposes encouragement, exactly one primary CTA, and Also today — no grades', () => {
    const model = todayViewModel(VIEW);
    expect(model.testId).toBe('studio-today');
    expect(model.encouragement).toBe('Nice work on Reading response 8.');
    expect(model.primary).toEqual({
      assignmentExternalId: 'demo-emma-ap-bio-a5',
      label: 'Open worksheet',
      title: 'Unit 9 Homework',
    });
    expect(model.alsoToday).toHaveLength(1);
    expect(model.alsoToday[0]?.title).toBe('Vocab quiz');
    expect(model).not.toHaveProperty('letterGrade');
    expect(model).not.toHaveProperty('percent');
    expect(JSON.stringify(model)).not.toMatch(/92%/);
  });

  it('omits the primary CTA when next is null', () => {
    const model = todayViewModel({
      encouragement: "You're caught up.",
      next: null,
      alsoToday: [],
    });
    expect(model.primary).toBeNull();
    expect(model.alsoToday).toEqual([]);
  });
});
