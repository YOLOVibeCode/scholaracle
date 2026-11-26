import { PRICING_PAGE_PLANS, PURCHASABLE_PLANS } from './planCatalog';

/** Every "$N each" a plan description states, as a number of cents. */
function perStudentCentsStatedIn(description: string): number[] {
  return [...description.matchAll(/\$(\d+(?:\.\d{1,2})?)\s+each/gi)].map((match) =>
    Math.round(Number(match[1]) * 100)
  );
}

describe('plan catalog wording', () => {
  it('never states a per-student price that does not add up to the plan price', () => {
    // On 25 Nov 2026 Premium said "$9.99 each" for two students at $19.99 (2 x 9.99 is
    // 19.98) and Family said the same for five students at $49.99 (5 x 9.99 is 49.95).
    for (const plan of PRICING_PAGE_PLANS) {
      for (const cents of perStudentCentsStatedIn(plan.description)) {
        expect({ plan: plan.id, total: cents * plan.students }).toEqual({
          plan: plan.id,
          total: Math.round(plan.monthlyPrice * 100),
        });
      }
    }
  });

  it('says how many students each paid plan covers', () => {
    const paid = PURCHASABLE_PLANS.map((plan) => ({ id: plan.id, students: plan.students }));
    expect(paid).toEqual([
      { id: 'starter', students: 1 },
      { id: 'premium', students: 2 },
      { id: 'family', students: 5 },
    ]);
    for (const plan of PURCHASABLE_PLANS) {
      expect(plan.description).toMatch(/student/i);
    }
  });
});
