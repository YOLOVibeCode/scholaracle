# Parental Access Control & Email Transfer System

## Overview

This document outlines the comprehensive parental access control system with email transfer capabilities and flexible digest delivery for Scholaracle.

## Features Implemented

### 1. Email Transfer System (Dual-Confirmation)

#### For Primary Account Holders (Users)
- **Data Model**: Added `emailTransferRequest` field to `User` model (`packages/database/src/models/User/User.ts`)
- **Service**: `EmailTransferService` (`packages/api/src/services/email-transfer/`)
- **API Endpoints** (`packages/api/src/routes/account/account.ts`):
  - `POST /api/account/email-transfer/initiate` - Start email transfer
  - `GET /api/account/email-transfer/confirm-old` - Confirm from old email
  - `GET /api/account/email-transfer/confirm-new` - Confirm from new email
  - `POST /api/account/email-transfer/cancel` - Cancel pending transfer
  - `GET /api/account/email-transfer/status` - Get transfer status

#### For Shared Parents
- **Data Model**: Added `transferRequest` field to `ISharedParent` interface
- **API Endpoints** (in `packages/api/src/routes/students/students.ts`):
  - `POST /api/students/:id/contacts/:email/transfer-email` - Initiate transfer
  - `POST /api/students/:id/contacts/transfer-confirm` - Confirm with token

**Flow**:
1. User initiates transfer (old email → new email)
2. System sends confirmation emails to **both** addresses with unique tokens
3. Both emails must click confirmation links (order doesn't matter)
4. Once both confirmed, transfer completes automatically
5. Email address updates in database

**Security**:
- 48-hour expiration window
- Unique cryptographic tokens for each email
- Validates new email not already registered
- Prevents self-transfer (same email)

---

### 2. Permission Updates

#### Shared Parent Self-Removal Prevention
**Change**: Modified `DELETE /api/students/:id/contacts/:email` endpoint

**Old behavior**: Shared parents could remove themselves from the student

**New behavior**: Only primary account owner or admin-promoted shared parents can remove contacts. Shared parents cannot remove themselves.

**Rationale**: Ensures primary account holder maintains full control over access permissions. Prevents accidental or emotional removal that the parent might regret.

**Error message**: "Only the account owner or admin can remove contacts. Shared parents cannot remove themselves."

---

### 3. Flexible Digest Delivery (TODO: Implementation Pending)

**Requirements**:
- Send digest to specific email addresses (owner, specific shared parent, or all)
- Manual/on-demand digest delivery via API
- Respect recipient preferences (receiveAlerts, alertChannels)

**Planned API**:
```
POST /api/students/:id/send-digest
Body: {
  recipients: ['all' | 'owner' | email1, email2, ...],
  includeGrades?: boolean,
  customMessage?: string
}
```

**Implementation Notes**:
- Use existing `buildDigestEmail` from `packages/agents/src/delivery/EmailDelivery/digestEmailTemplate.ts`
- Pull pending digest items from `email_digest_pending` collection
- Filter by `studentId` and selected recipients
- Generate personalized emails based on `recipientType` ('parent' vs 'student')
- Track delivery status

---

## Data Models

### User (`packages/database/src/models/User/User.ts`)

```typescript
export interface IUserData {
  readonly email: string;
  // ... other fields
  readonly emailTransferRequest?: {
    readonly newEmail: string;
    readonly initiatedAt: Date;
    readonly expiresAt: Date;
    readonly oldEmailToken: string;
    readonly newEmailToken: string;
  };
}
```

### ISharedParent (`packages/database/src/models/Student/Student.ts`)

```typescript
export interface ISharedParent {
  readonly userId?: string;
  readonly email: string;
  readonly name?: string;
  readonly role: 'parent' | 'guardian' | 'caregiver';
  readonly isAdmin?: boolean;
  readonly status: 'pending' | 'accepted' | 'declined';
  // ... other fields
  readonly transferRequest?: {
    readonly newEmail: string;
    readonly initiatedAt: Date;
    readonly expiresAt: Date;
    readonly oldEmailToken: string;
    readonly newEmailToken: string;
  };
}
```

---

## Database Collections

### email_transfer_confirmations
Temporary collection to track which email addresses have confirmed the transfer.

**Schema**:
```typescript
{
  userId: string,
  type: 'old' | 'new',
  confirmedAt: Date
}
```

**Index**: `{ userId: 1, type: 1 }` (unique)

### shared_parent_transfer_confirmations
Similar to above, but for shared parent transfers.

**Schema**:
```typescript
{
  studentId: string,
  email: string, // old email
  type: 'old' | 'new',
  confirmedAt: Date
}
```

**Index**: `{ studentId: 1, email: 1, type: 1 }` (unique)

---

## Permissions Matrix

| Action | Primary Owner | Admin Shared Parent | Regular Shared Parent |
|--------|--------------|---------------------|----------------------|
| View student data | ✅ | ✅ | ✅ |
| Edit student profile | ✅ | ✅ | ❌ |
| Add data sources | ✅ | ✅ | ❌ |
| Invite other parents | ✅ | ✅ | ❌ |
| Remove other parents | ✅ | ✅ | ❌ |
| Remove self | ✅ | ❌ | ❌ |
| Promote to admin | ✅ | ❌ | ❌ |
| Transfer own email | ✅ | ✅ | ✅ |
| Initiate account transfer | ✅ | ❌ | ❌ |
| Send manual digest | ✅ | ✅ | ❌ |

---

## Email Transfer UI Flow (Example)

### Primary Account Email Transfer

**Settings Page → Account Tab**:
```
┌─────────────────────────────────────────┐
│ Current Email: parent@example.com       │
│ [Transfer to new email]                 │
└─────────────────────────────────────────┘
```

**Transfer Dialog**:
```
┌─────────────────────────────────────────┐
│ Transfer Email Address                   │
│                                          │
│ New email: [__________________]          │
│                                          │
│ You will receive confirmation emails at  │
│ BOTH your current and new addresses.     │
│ The transfer completes only after both   │
│ confirmations.                           │
│                                          │
│ [Cancel] [Send Confirmations]            │
└─────────────────────────────────────────┘
```

**Pending Transfer State**:
```
┌─────────────────────────────────────────┐
│ Email Transfer In Progress               │
│                                          │
│ New email: newparent@example.com         │
│ Expires: Mar 10, 2026 3:45 PM           │
│                                          │
│ ✅ Old email confirmed                   │
│ ⏳ New email not yet confirmed          │
│                                          │
│ [Cancel Transfer]                        │
└─────────────────────────────────────────┘
```

**Confirmation Email (Old Address)**:
```
Subject: Confirm Email Transfer for Scholaracle

Hi [Name],

You've initiated an email transfer from parent@example.com 
to newparent@example.com.

To complete this transfer, please confirm from BOTH email 
addresses by clicking the links below.

Confirm from old email:
https://scholarmancy.com/api/account/email-transfer/confirm-old?token=abc123&userId=xyz

This link expires in 48 hours.
```

---

## Testing

### Unit Tests Needed
- [x] User model with `emailTransferRequest` field
- [x] ISharedParent with `transferRequest` field
- [ ] EmailTransferService methods
- [ ] Email transfer API endpoints
- [ ] Shared parent transfer endpoints
- [ ] Permission checks for contact removal

### Integration Tests Needed
- [ ] Full email transfer flow (both confirmations)
- [ ] Expired transfer handling
- [ ] Duplicate email prevention
- [ ] Permission enforcement (shared parent cannot remove self)
- [ ] Admin promotion and permission changes

### E2E Tests Needed
- [ ] Primary account email transfer with email delivery
- [ ] Shared parent email transfer
- [ ] Permission denied scenarios
- [ ] Digest delivery to specific recipients

---

## Future Enhancements

1. **Email Verification on Registration**: Require email verification before allowing account use
2. **2FA for Email Changes**: Add two-factor authentication requirement for email transfers
3. **Activity Log**: Log all email transfer attempts and permission changes
4. **Notification on Transfer**: Alert all shared parents when primary email changes
5. **Bulk Actions**: Allow primary to send digest to all parents at once with one click
6. **Digest Preview**: Preview digest email before sending
7. **Scheduled Digest Override**: Temporarily pause/resume digests for specific recipients
8. **Parent Preferences Inheritance**: Allow shared parents to inherit digest schedule from primary

---

## API Reference Summary

### Account Routes (`/api/account`)
- `POST /email-transfer/initiate` - Start transfer
- `GET /email-transfer/confirm-old` - Confirm old email
- `GET /email-transfer/confirm-new` - Confirm new email
- `POST /email-transfer/cancel` - Cancel transfer
- `GET /email-transfer/status` - Get status

### Student Contact Routes (`/api/students/:id/contacts`)
- `POST /:email/transfer-email` - Shared parent transfer
- `POST /transfer-confirm` - Confirm shared parent transfer
- `DELETE /:email` - Remove contact (admin/owner only)
- `PATCH /:email` - Update contact details

### Digest Routes (Planned)
- `POST /api/students/:id/send-digest` - Manual digest delivery
- `GET /api/students/:id/digest-preview` - Preview digest content

---

## Security Considerations

1. **Token Entropy**: Uses 32-byte random tokens (256 bits)
2. **Time-Limited**: 48-hour expiration for all transfers
3. **Rate Limiting**: Should add rate limiting to transfer initiation endpoints
4. **Email Validation**: Validates email format and checks for existing users
5. **Audit Trail**: Consider logging all access control changes
6. **CSRF Protection**: Ensure CSRF tokens on state-changing endpoints
7. **SQL Injection**: Using MongoDB with typed queries (no raw SQL)

---

## Deployment Checklist

- [ ] Run database migrations for new fields
- [ ] Create indexes on confirmation collections
- [ ] Configure email service for transfer confirmations
- [ ] Update frontend to show transfer UI
- [ ] Add monitoring/alerts for failed transfers
- [ ] Document API endpoints in OpenAPI/Swagger
- [ ] Update user documentation
- [ ] Test email delivery in staging
- [ ] Load test confirmation endpoints
- [ ] Set up cleanup job for expired confirmations (cron)

---

## Files Modified/Created

### Created
- `packages/api/src/services/email-transfer/email-transfer-service.ts`
- `packages/api/src/services/email-transfer/index.ts`
- `packages/api/src/routes/account/account.ts`
- `docs/parental-access-control.md` (this file)

### Modified
- `packages/database/src/models/User/User.ts` - Added `emailTransferRequest` field
- `packages/database/src/models/Student/Student.ts` - Added `transferRequest` to `ISharedParent`
- `packages/api/src/routes/students/students.ts` - Updated DELETE endpoint, added transfer endpoints

---

## Conclusion

This system provides secure, user-friendly email transfer with dual confirmation, prevents accidental account lockouts, and sets the foundation for flexible digest delivery to multiple parent accounts. The design prioritizes security (dual confirmation, expiring tokens) while maintaining usability (either email can confirm first, clear status indicators).
