/** Builds a Noctusoft store SKU: NOCTU-{PRODUCT}-{PLAN}-{CYCLE}. */
export function subscriptionSku(
  productKey: string,
  plan: string,
  billingCycle: 'monthly' | 'annual'
): string {
  const product = productKey.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const planPart = plan.toUpperCase();
  const cycle = billingCycle === 'annual' ? 'ANNUAL' : 'MONTHLY';
  return `NOCTU-${product}-${planPart}-${cycle}`;
}
