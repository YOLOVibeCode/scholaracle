# App Store / Play review — Scholarmancy mobile

## Payments

- The app has **no in-app purchase** and no purchase UI. It does not sell digital goods or subscriptions inside the app, and it does not use StoreKit or Play Billing.
- Subscriptions are purchased on the web at scholarmancy.com, outside the app. The app only reflects the plan the account already has.
- Account-limit messaging (for example, "this account supports one student") is informational text. Only for users whose device locale is US English (`en-US`), that message is followed by a single outbound link, **See plans on scholarmancy.com**, which opens `https://scholarmancy.com/pricing` in the system browser. Users on any other locale see the text with no link.
- There is no price, plan picker, checkout, or payment form anywhere in the app.
- We are not claiming guideline 3.1.3 (Reader apps) or any other in-app-purchase exemption. The US-only link is the outbound-link behavior that the US storefront allows, and the app offers no other external purchase path.

## Account deletion

- **In app:** Settings → **Delete account** → Continue opens the account deletion page at `https://scholarmancy.com/delete-account` in the browser.
- The same URL is documented on the website; deletion is initiated by the user there.

## Demo access (review)

- Use the **Beta App Review Information** (App Store Connect) and **`packages/mobile/store-metadata/testflight.json`** for the seeded demo **parent** account identifier and where to enter the password. After sign-in, use the in-app flow to connect a school portal; portal credentials are stored **only on device**, not on Scholarmancy servers.
- **Demo district / portal credentials** (if required for review): see **`README.md`** in the repository under **Demo logins** for **where** those values are described (parent demo, student demo, and shared demo password location). Do not embed live secrets in this file.

## Privacy & support

- Privacy policy: https://scholarmancy.com/privacy  
- Support: https://scholarmancy.com/support  
