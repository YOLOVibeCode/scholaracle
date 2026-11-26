# App Store / Google Play review notes: Scholarmancy mobile

Two parts. **Notes for the reviewer** is the text to paste into the store. **Facts behind the notes** is for whoever updates this file: every sentence in the notes must stay true of the build being submitted.

- App Store Connect: App Review Information → Notes (4,000 character limit). The demo sign-in goes in the **Sign-in required** fields there, not in this file.
- Google Play Console: App content → App access → instructions for the demo sign-in.

## Notes for the reviewer

```text
WHAT THE APP DOES
Scholarmancy shows a parent their children's grades, assignments and class documents from the school's own portal (Canvas, Skyward or Aeries), in one place.

HOW TO SIGN IN
Use the demo parent account entered in the sign-in fields of this submission (email and password). It is a sample household with two students, Emma and Liam, and sample grades and assignments are already loaded. You do not need a school account to review the app.

WHAT TO TRY
1. Sign in. The student list shows Emma and Liam.
2. Tap a student to see Grades, Assignments, Docs and History.
3. Open Settings for Notifications, Plan & usage, Privacy, Terms, Support, Delete account and Sign out.

SCHOOL PORTAL SYNC
A real parent connects their school's portal once (Connect Portal: choose Canvas, Skyward or Aeries, enter the school's portal address and their school sign-in). Sync then opens the school's own sign-in page inside the app and reads that student's grades and assignments on the phone.
A sync cannot be completed without a real school account, which is why the demo household comes with data already loaded.
The school portal username and password are stored only on the device (iOS Keychain / Android Keystore). They are never sent to our servers.

PAYMENTS
The app has no in-app purchase and no purchase screen. It shows no prices, no plan picker and no checkout. It does not use StoreKit or Google Play Billing. The app is free and shows the plan the account already has (Settings > Plan & usage, read-only).
iOS only, and only on devices set to US English: that screen has two links that open scholarmancy.com in the browser, "Manage plan on scholarmancy.com" and "See plans on scholarmancy.com". The second link also appears once in onboarding when an account reaches its student limit. Devices in any other language or region see plain text and no link.
Android: there is no link to plans, billing or pricing anywhere in the app.

ACCOUNT DELETION
Settings > Delete account deletes the account inside the app. The user confirms with their account password, or with Sign in with Apple if they signed up that way, and the account and its data are deleted. The same can be done on the web at https://scholarmancy.com/delete-account.
Please do not delete the demo account during review; later reviews use it too.

SIGN IN WITH APPLE
Offered on the sign-in screen on iOS. Email and password is enough for review.

NOTIFICATIONS
Optional. The app asks for permission after sign-in; choosing "Don't Allow" does not limit anything else.

CONTACT
Privacy policy: https://scholarmancy.com/privacy
Support: https://scholarmancy.com/support
```

## Facts behind the notes

| Statement | Where it is enforced |
| --- | --- |
| No purchase UI, prices or checkout | `src/plan/planStudentWiring.test.ts` ("is read-only"), `src/screens/PlanScreen.tsx` |
| Links on iOS + US English only, never on Android | `canLinkToWebPlans` in `src/utils/usStorefrontLocale.ts`, used by `PlanScreen.tsx` and `OnboardingScreen.tsx`; guarded by `src/store/storeComplianceWiring.test.ts` |
| Deletion happens in the app | `src/screens/DeleteAccountSheet.tsx`; guarded by `storeComplianceWiring.test.ts` |
| Portal sign-in stays on the device | `src/screens/ConnectSourceScreen.tsx`, `src/screens/SyncScreen.tsx` (SecureStore) |

Rules for this file:

- No password or other secret here. The demo sign-in for review lives in App Store Connect and Play Console.
- If a screen named above changes, change the notes in the same pull request.
- Google Play allows links to outside purchases only for apps enrolled in its external content links program. Scholarmancy is not enrolled, so the Android app shows none. Enrolling is a business decision, not a code change.
