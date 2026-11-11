import { planFeatureLines, planFeaturesForApi } from './planFeatureLines';

describe('planFeatureLines', () => {
  it('describes free plan limits', () => {
    expect(planFeaturesForApi('free').maxStudents).toBe(1);
    expect(planFeatureLines('free')).toEqual(
      expect.arrayContaining(['1 student', '7-day history', 'Email alerts'])
    );
  });

  it('describes premium tier notifications and analytics', () => {
    const lines = planFeatureLines('premium');
    expect(planFeaturesForApi('premium').maxStudents).toBe(2);
    expect(lines).toEqual(
      expect.arrayContaining(['2 students', 'All notification channels', 'Advanced analytics'])
    );
  });
});
