# Source Invite — Engineering Specification

**Status:** v1 — implementation source of truth  
**Tests cite:** `SOURCE_INVITE.md §N`

A **source invite** is not a scraper package. One opaque HTTPS link registers a builtin portal (Canvas / Skyward / Aeries + school URL) on the client. Portal passwords never appear in email, URLs, or issue JSON.

## §1 Product

One email, one token, two last-mile buttons:

1. Landing `GET {apiOrigin}/install-source?t={token}` (public HTML, no login).
2. **Open in Scholarmancy** → `scholarmancy://install-source?t={token}` (Expo iOS and Android).
3. **Continue in browser** → `{webOrigin}/dashboard/install-source?t={token}`.
4. Authenticated **redeem** returns metadata only. The user types the portal password on-device (app WebView or extension).

Ava fixture: provider `skyward`, portal `https://skyward.iscorp.com`.

Do not email binaries, `.command`, or JS. Google Classroom OAuth is a later `authMethod` on this envelope.

## §2 Identity

| Field | Meaning |
|---|---|
| Issue `studentId` | Scholaracle Mongo id (`IStudentListItem.id`) |
| Payload `studentExternalId` | SIS id (`IStudentListItem.studentId`) or Mongo id if missing |
| `institutionExternalId` | Portal hostname |
| Local `sourceId` | `local-{provider}-{hostname}` |
| Mobile `adapterId` | `com.instructure.canvas` / `com.skyward.iscorp` / `com.aeries.portal` |

Unknown or other-user student → `404 NOT_FOUND`. Never persist `'default'` as `studentExternalId`.

## §3 Contracts

Types in `@scholaracle/contracts` (`ISourceInvitePayload`, issue/redeem request/response). Payload JSON keys are exactly:

`provider`, `adapterId`, `portalBaseUrl`, `displayName`, `studentId`, `studentExternalId`, `institutionExternalId`.

Issue HTTP response keys are exactly: `success`, `expiresAt`, `emailedTo`. **Forbidden:** `token`, `landingUrl`, `portalBaseUrl`, `studentExternalId`.

`assertNoSecrets` rejects secret-like keys except redeem top-level `token`, stored `tokenHash`, and mailer `landingUrl`.

## §4 ISP

Callers depend on small interfaces: `IClock`, `ITokenGenerator`, `ITokenHasher`, `ISourceInviteStore`, `IStudentOwnerLookup`, `ISourceInviteIssuer`, `ISourceInviteRedeemer`, `ISourceInviteMailer`, `IInstallLandingRenderer`, `IInstallSourceLinkParser`, `ISourceInviteApplier`, `IPendingSourceInviteStore`.

Issuer returns `{ token, expiresAt, payload }` internally. The HTTP route strips the token, emails the landing URL, and returns `ISourceInviteIssueResponse`.

Store collection `source_invites`: hash only, never the raw token. TTL index on `expiresAt`. Unique `tokenHash`.

## §5 Validation

- Portal URL: `https` only, no userinfo, nonempty host, strip trailing slashes, lowercase host.
- Token: 32 random bytes → 64 hex. Echo only `/^[a-f0-9]{64}$/i`.
- TTL 7 days. One-shot consume. Re-issue invalidates prior open invites for the same `(userId, studentId, provider, institutionExternalId)`.
- Redeem failures (expired, consumed, wrong user, missing) share the message: `This install link expired or is not for this account.` Wire as `404 NOT_FOUND`.

## §6 HTTP

| Method | Path | Auth |
|---|---|---|
| POST | `/api/source-invites` | JWT |
| POST | `/api/source-invites/redeem` | JWT |
| GET | `/install-source` | none |

Issue: self-email only (`to` in body → 400). Rate limit 5/hour per user. Landing is **stateless** (no Mongo). Sanitize `t`. Open + Continue buttons. Invalid `t` still HTTP 200 (no oracle). HTML must not contain portal hosts, passwords, or student names.

## §7 Email

Subject: `Install {providerName} in Scholarmancy`. Branded HTML. One HTTPS landing URL. Copy: this message never includes your school password. Empty SendGrid key no-ops.

## §8 Mobile

Parse `scholarmancy://install-source?t=` with string operations (never `URL`). Logged out: save token in `IPendingSourceInviteStore`. Logged in: redeem → apply (no SecureStore) → `ConnectSourceScreen` credentials step with URL locked.

## §9 Web continue

`/dashboard/install-source?t=`. Login redirect preserves `t`. Redeem, then `replaceState` to drop `t`. Prefill via sessionStorage (not a query with `portalBaseUrl`). No server-side password form. Dashboard **Email me an install link** posts only the allowlisted issue body.
