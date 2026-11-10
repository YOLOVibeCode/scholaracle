import { summarizeAiUsageForAdmin } from './aiUsageAdminSummary';

describe('summarizeAiUsageForAdmin', () => {
  const monthStart = new Date('2026-11-01T00:00:00.000Z');

  it('matches hand-computed month spend and district repair counts', () => {
    const rows = [
      {
        feature: 'scraper_repair',
        at: new Date('2026-11-05T12:00:00Z'),
        costUsd: 0.0001,
        repairCandidateId: 'district.aeries.net|aeries|step|hash1|no_grade',
      },
      {
        feature: 'scraper_repair',
        at: new Date('2026-11-05T12:01:00Z'),
        costUsd: 0.0002,
        repairCandidateId: 'district.aeries.net|aeries|step|hash1|no_grade',
      },
      {
        feature: 'scraper_repair',
        at: new Date('2026-11-06T12:00:00Z'),
        costUsd: 0.00005,
        repairCandidateId: 'skyward.example.net|skyward|step|hash2|no_assignments',
      },
      {
        feature: 'agenda',
        at: new Date('2026-11-04T12:00:00Z'),
        costUsd: undefined,
      },
      {
        feature: 'scraper_repair',
        at: new Date('2026-10-31T23:59:59Z'),
        costUsd: 0.99,
        repairCandidateId: 'old.net|aeries|s|h|no_grade',
      },
    ];

    const summary = summarizeAiUsageForAdmin(rows, monthStart);

    expect(summary.monthToDateSpendUsd).toBe(0.00035);
    expect(summary.verificationPassRate).toBe(0.5);
    expect(summary.repairsByDistrict).toEqual([
      { portalHost: 'district.aeries.net', repairCount: 1 },
      { portalHost: 'skyward.example.net', repairCount: 1 },
    ]);
  });
});
