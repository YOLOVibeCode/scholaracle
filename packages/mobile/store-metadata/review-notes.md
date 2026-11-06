# App Store / Play review — Scholarmancy mobile (3.1.3)

## Paid content

- The app does **not** offer in-app purchase. Subscriptions and plan changes are completed on the **web** at scholarmancy.com.
- Any mention of plans in the app is informational only. Where the device locale is US English (`en-US`), the app may show a single outbound link labeled **See plans on scholarmancy.com** that opens `https://scholarmancy.com/pricing` in the system browser. There is no purchase flow inside the app.

## Account deletion

- **In app:** Settings → **Delete account** → Continue opens the account deletion page at `https://scholarmancy.com/delete-account` in the browser.
- The same URL is documented on the website; deletion is initiated by the user there.

## Demo access (review)

- Use the **Beta App Review Information** (App Store Connect) and **`packages/mobile/store-metadata/testflight.json`** for the seeded demo **parent** account identifier and where to enter the password. After sign-in, use the in-app flow to connect a school portal; portal credentials are stored **only on device**, not on Scholarmancy servers.
- **Demo district / portal credentials** (if required for review): see **`README.md`** in the repository under **Demo logins** for **where** those values are described (parent demo, student demo, and shared demo password location). Do not embed live secrets in this file.

## Privacy & support

- Privacy policy: https://scholarmancy.com/privacy  
- Support: https://scholarmancy.com/support  
