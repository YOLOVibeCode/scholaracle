export interface IAiUsageDistrictRepairCount {
  readonly portalHost: string;
  readonly repairCount: number;
}

export interface IAiUsageAdminSummary {
  readonly monthToDateSpendUsd: number;
  readonly verificationPassRate: number;
  readonly repairsByDistrict: readonly IAiUsageDistrictRepairCount[];
}

type AiUsageCostRow = {
  readonly feature?: string;
  readonly at?: Date;
  readonly costUsd?: number;
  readonly repairCandidateId?: string;
};

function portalHostFromCandidateId(repairCandidateId: string): string {
  const idx = repairCandidateId.indexOf('|');
  return idx >= 0 ? repairCandidateId.slice(0, idx) : repairCandidateId;
}

/** Pure summary from in-memory rows (used by repository + tests). */
export function summarizeAiUsageForAdmin(
  rows: readonly AiUsageCostRow[],
  monthStartUtc: Date
): IAiUsageAdminSummary {
  const inMonth = rows.filter((r) => r.at !== undefined && r.at >= monthStartUtc);

  let monthToDateSpendUsd = 0;
  for (const row of inMonth) {
    monthToDateSpendUsd += row.costUsd ?? 0;
  }
  monthToDateSpendUsd = Math.round(monthToDateSpendUsd * 1_000_000) / 1_000_000;

  const repairRows = inMonth.filter(
    (r) => r.feature === 'scraper_repair' && typeof r.repairCandidateId === 'string'
  );
  const callsByCandidate = new Map<string, number>();
  for (const row of repairRows) {
    const id = row.repairCandidateId as string;
    callsByCandidate.set(id, (callsByCandidate.get(id) ?? 0) + 1);
  }

  let attempted = 0;
  let passed = 0;
  const districtCounts = new Map<string, number>();
  for (const [candidateId, callCount] of callsByCandidate) {
    attempted += 1;
    if (callCount >= 2) {
      passed += 1;
    }
    const host = portalHostFromCandidateId(candidateId);
    districtCounts.set(host, (districtCounts.get(host) ?? 0) + 1);
  }

  const verificationPassRate = attempted > 0 ? passed / attempted : 0;
  const repairsByDistrict = [...districtCounts.entries()]
    .map(([portalHost, repairCount]) => ({ portalHost, repairCount }))
    .sort((a, b) => a.portalHost.localeCompare(b.portalHost));

  return {
    monthToDateSpendUsd,
    verificationPassRate,
    repairsByDistrict,
  };
}
