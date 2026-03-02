# Railway Usage Validation Runbook

Use this runbook to check actual Railway usage against the **Cost, Revenue & Profit Margin Analysis** so compute cost estimates stay accurate.

## Where to Check Usage

1. **Railway Dashboard**: https://railway.app → select project **scholaracle** → **Usage** (or **Settings** → **Usage** / **Billing**).
2. **Per-service usage**: Open each service (api, web, workers, MongoDB) and check **Metrics** or **Usage** for CPU, memory, and egress.

## Cost Estimates to Validate (from plan)

| Item                    | Est. Cost/Month | What to compare in dashboard        |
| ----------------------- | --------------- | ----------------------------------- |
| Railway subscription    | $5 (Hobby)      | Plan + usage credit consumed        |
| API compute             | ~$5–8           | api service: vCPU-hours, RAM-hours  |
| Web compute             | ~$5–8           | web service: vCPU-hours, RAM-hours  |
| Workers compute         | ~$3–5           | workers service: vCPU-hours, RAM    |
| MongoDB                 | ~$3–5           | MongoDB service: storage + compute  |

**Total fixed (low traffic):** ~$32–41/month.

## Validation Steps

1. **Current period**: Note the billing period (e.g. monthly reset date).
2. **Usage tab**: Record total usage $ and breakdown by service (api, web, workers, MongoDB).
3. **Compare**:  
   - If total is within ~$32–41 (Hobby), estimates are valid.  
   - If a service is consistently above estimate, update the plan’s numbers or document the variance.
4. **Pro threshold**: When monthly usage exceeds ~$10, Pro’s $20 credit may beat Hobby’s $5 credit—revisit plan’s “Upgrade to Pro” recommendation.

## Frequency

- **Monthly**: Quick check after each billing cycle.  
- **After traffic changes**: Deployments, more users, or new features may change compute; re-validate that month.

## References

- Cost, Revenue & Profit Margin Analysis (plan): fixed/variable costs, break-even, scale projections.  
- `docs/MONETIZATION_PLAN.md`: pricing, plans, feature gates.
