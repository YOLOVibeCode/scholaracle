# Premium Pricing Strategy: Value-Based Family Tiers

## Competitive landscape (market reference)

Research as of early 2025. Products that overlap with Scholaracle: parent-facing grade/monitoring, multi-kid, alerts, and/or AI.

| Product | What it does | Price | Notes |
|--------|----------------|-------|--------|
| **Gradey** | AI grade monitoring, text queries (“What did Ava score?”), real-time alerts, multi-kid, grade history. Enhances parent portal access. | **Free for first year**; post-trial not published | Closest direct competitor. Same pitch: one place, AI insights, proactive alerts, multi-child. |
| **Gradekit** | Log in once to Skyward/PowerSchool/Aeries/etc.; grade prediction, GPA tracking. 10K+ districts. | Free + **Parent Edition ~\$4.99/year** (IAP) | Very low price; no AI, no cross-portal aggregation—single SIS per login. |
| **GradePro** | Grade predictions, GPA, attendance, grade-change notifications, multi-student. | Free + in-app purchases | Similar to Gradekit; no published premium price. |
| **ClassDojo Plus** | Optional parent subscription: progress reports, class stories, memory albums, family accounts (3), premium messaging. | **\$4.99/mo** (\$59.99/yr) | School communication + engagement, not grade-centric. |
| **Khanmigo for Parents** | AI tutor + progress tracking, moderation alerts; add up to 10 kids. | **\$4/mo** or \$44/yr | Education/tutoring focus; “parent” tier is cheap, high kid count. |
| **PowerSchool / Aeries / ProgressBook** | Official parent portals: grades, attendance, alerts (threshold-based). | **Free** (district provides) | One system per district; no aggregation, no AI. |
| **Tutor.com** | Live tutoring + parent dashboard, session reports. | **\$40–\$180/mo** (by hours) | Different category (tutoring); shows parents will pay more for “help my kid succeed.” |

**Takeaways**

- **Gradey** is the closest comp (AI + alerts + multi-kid) and is **free for year one**; they haven’t signaled post-trial pricing. That leaves room for a **premium** position if Scholaracle is clearer on multi-LMS aggregation and AI (scraper gen, grade risk, agenda).
- **“Monitoring only”** (Gradekit, GradePro) is priced very low (free to ~\$5/year). Scholaracle is not just monitoring: **one dashboard across Canvas + Skyward + Aeries**, **proactive alerts**, **AI** (scraper generation, grade risk, agenda). Pricing above \$8–10/mo is defensible if positioned on aggregation + AI value.
- **Parent willingness to pay:** ClassDojo and Khanmigo sit at **\$4–5/mo** for optional parent features; Tutor.com shows **\$40+/mo** for tutoring. A **\$12–22/mo** band for “all my kids’ schools in one place + AI that helps me intervene” sits between “cheap add-on” and “tutoring,” and aligns with the value of time saved and peace of mind.
- **AI as differentiator:** Gradey and Scholaracle both use AI. Your AI is used for scraper generation, grade-risk analysis, and agenda intelligence—distinct from “chat about grades.” Emphasizing **actionable AI** (e.g. “see risk before the report card,” “one-click scraper for your district”) supports a premium price vs. free-year and \$5/year monitoring apps.

**Recommended positioning vs. competitors**

- **Don’t race to the bottom** with Gradekit (\$5/yr) or ClassDojo/Khanmigo (\$4–5/mo). Those are add-ons or single-system tools. Scholaracle: **multi-LMS aggregation + proactive alerts + AI that drives decisions** = higher category.
- **Target band: \$12–\$25/mo** for 1–2 students, **\$35–\$45/mo** for 5 students. That’s above “cheap parent app” and below tutoring, and matches the cost model (AI spend ~\$0.10–0.20/user/mo; you have headroom).
- **AI usage:** You’ll use AI heavily (scraper gen, grade risk, agenda). Price so that **revenue per paying user comfortably exceeds variable cost including AI**; the competitive table above supports a premium so you can invest in that AI without margin squeeze.

---

## Chosen pricing: \$9.99 per student per month

**Model:** **\$9.99 per student per month.** One price per student; primary account holder pays once. Keeps you competitive while using psychological pricing (under \$10 per student).

| Plan       | Students | Monthly | Annual (≈2 mo free) |
|------------|----------|---------|----------------------|
| **Starter**   | 1        | **\$9.99**  | **\$99.99**             |
| **Premium**   | 2        | **\$19.99** | **\$199.99**            |
| **Family**    | 5        | **\$49.99** | **\$499.99**            |
| **Enterprise**| 10+ / unlimited | **\$99.99** | **\$999.99**   |

- **Psychology:** \$9.99 stays under \$10; \$19.99, \$49.99, \$99.99 keep the .99 anchor. Easy to communicate: “Just \$9.99 per student.”
- **Competitive:** Under \$10/student undercuts premium-only positioning while staying above free / \$5-year monitoring apps. Strong value for multi-LMS + AI.
- **Implementation:** Tiers map to student caps; price = students × \$9.99 (rounded to .99). Stored in `PLAN_PRICING`; pricing page and checkout use these amounts.

---

## Value proposition (why premium is justified)

- **One place for all kids** — No more logging into Canvas, Skyward, Google Classroom separately. One dashboard, one login, one bill.
- **Time saved** — Parents spend hours chasing “what’s due?”, “what’s your grade?”, “did you turn that in?” Scholaracle answers that proactively with alerts and grades in one place.
- **Earlier intervention** — Alerts before the report card, so parents can help when it matters instead of finding out too late.
- **Less stress** — Fewer surprise Ds, fewer “I didn’t know that was due” conversations. Peace of mind has real value.

The person who pays is the **primary account holder** (one bill per household). Alerts and features apply to every student linked to that account.

---

## Option A: Fixed tiers (1 / 2 / 5 students)

See table and rationale below. One price per tier; simple to explain and implement with current plan IDs.

---

## Option B: Scale per student (per-user pricing)

**Pros:** Transparent (“I have 3 kids, I pay for 3”), scales naturally when they add/remove students, feels fair. No “which tier am I?” — price follows family size.

**Cons:** Large families see a bigger number (5 × $14 = $70); you can soften with a volume discount (see below). Checkout and billing must be dynamic (price = f(student count)) or you sell “slots” and enforce a cap.

### Per-user pricing options

| Model | Formula | 1 student | 2 students | 5 students | Notes |
|-------|---------|-----------|------------|------------|-------|
| **Flat per student** | $13/student | $13 | $26 | $65 | Simplest. Easy to communicate. |
| **Volume discount** | 1st $14, 2nd $10, 3rd+ $8 | $14 | $24 | $42 | Rewards larger families; 5 kids = $14+10+8+8+8. |
| **Base + per student** | $6 + $9/student | $15 | $24 | $51 | Spreads cost; base covers platform, per-student covers alerts/AI. |

**Recommendation if you go per-user:** Volume discount keeps 1–2 student pricing premium while making 3–5 students more palatable (e.g. “$8 per additional child after the first two”).

### Implementation (per-user)

- **Checkout:** Price is computed from *current* student count (or “slots” they choose). Either:
  - **Dynamic:** At checkout, `createPaymentLink(plan, billingCycle, studentCount)` → amount = pricingFormula(studentCount). Subscription stores `maxStudents` and optionally `studentCountAtPurchase` for display; renewal uses current count or a “locked” count depending on your policy.
  - **Slots:** Plans are “1 student”, “2 students”, … “10 students” with fixed prices (same as fixed tiers but every number is a tier). No formula; just more plan options.
- **Adding a student mid-cycle:** If over limit, block add until upgrade. On upgrade, pro-rate or charge at next renewal (Square subscription or one-off top-up). If you do true per-user and count can change, consider monthly reconciliation (“you have 4 students now, next invoice = 4 × $X”) or lock count until renewal.
- **Database:** Keep `Subscription.plan`; add optional `billingStudentCount` or derive from `maxStudents` / plan. `PLAN_PRICING` becomes a function or a table keyed by plan + count.

---

## Recommended tiers: 1, 2, and 5 students (Option A detail)

Position as **family size**, not feature tiers. Same primary account holder, same payment; limits are “how many students can I add?”

| Tier (by students) | Monthly | Annual (save ~17%) | Who it’s for |
|--------------------|--------|--------------------|--------------|
| **1 student**      | $14    | $140               | One child; try full features (SMS, AI, alerts). |
| **2 students**     | $22    | $220               | Two kids; most common family size. |
| **5 students**     | $39    | $390               | Larger families; all features, priority support. |

Optional **10 students** (e.g. “Family Plus” or keep “Family” name): **$59/mo** or **$590/yr** — for blended families, guardians with many dependents.

**Enterprise** (unlimited students, schools/districts): keep at **$99/mo** or custom.

---

## Rationale for these numbers

- **1 student @ $14** — Slightly above current Starter ($9) to reflect premium positioning; still an easy “yes” for a single child. ~\$0.50/day.
- **2 students @ $22** — Not double the 1-student price; second student is incremental value and cost. Strong perceived value: “both kids covered for $22.”
- **5 students @ $39** — Clear step up from 2; under $8/student/month. Fits “we have a few kids” without feeling enterprise-priced.

All remain **well above variable cost** (~\$0.88–\$1.56 per paying user in the existing cost model). Margins stay in the same 88–95% range.

---

## Alerts and the primary account holder

- **One subscription** = one primary account (the payer).
- **Alerts** (email, SMS if on plan) go to that account’s notification prefs; can be tuned per student (e.g. “notify me for Student A’s math only” if you add that later).
- **No per-student surcharge for alerts** — alerts are included in the tier; more students = more alerts, same price within the tier. That simplicity supports premium positioning (“one price, all your kids”).

---

## Mapping to current plans (implementation)

| Plan          | Students | Plan id     | Monthly | Annual   |
|---------------|----------|-------------|--------|----------|
| **Starter**   | 1        | `starter`   | $9.99  | $99.99   |
| **Premium**   | 2        | `premium`   | $19.99 | $199.99  |
| **Family**    | 5        | `family`    | $49.99 | $499.99  |
| **Enterprise**| 10+      | `enterprise`| $99.99 | $999.99  |

**Formula:** \$9.99 per student per month; annual ≈ 10 months price (2 months free). Implemented in `PLAN_PRICING` and `PLAN_FEATURES.maxStudents`.

You can keep existing `starter` / `premium` / `family` IDs and only change `PLAN_PRICING` and `PLAN_FEATURES.maxStudents` (e.g. starter→1, premium→2, family→5), or introduce new plan IDs and migrate. Naming can stay “Starter / Premium / Family” with copy that emphasizes student count: “1 student”, “2 students”, “5 students”.

---

## Copy suggestions for pricing page

- **Headline:** “One dashboard. All your kids. One price.”
- **Subhead:** “The primary account holder pays once. Alerts and grades for every student you add.”
- **1 student:** “Perfect for one child — full alerts, SMS, and AI insights.”
- **2 students:** “Most popular — two kids, one subscription, no extra per-student fees.”
- **5 students:** “For larger families — everything included, priority support.”

---

## Summary

- **Chosen model:** **\$9.99 per student per month.** Primary account holder pays; competitive and psychological (under \$10).
- **Tiers:** Starter 1 = \$9.99, Premium 2 = \$19.99, Family 5 = \$49.99, Enterprise 10+ = \$99.99 (monthly); annual ≈ 2 months free.
- **Implementation:** `PLAN_PRICING` and `PLAN_FEATURES.maxStudents` in `Subscription.ts`; pricing page shows “\$9.99 per student” and tier amounts.
