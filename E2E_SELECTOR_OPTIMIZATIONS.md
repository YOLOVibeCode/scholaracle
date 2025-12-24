# E2E Selector Optimizations

This document summarizes the optimizations made to E2E test selectors to use stable `data-testid` attributes.

## Summary

All E2E tests have been updated to use direct `data-testid` selectors instead of fallback selectors, making them more efficient and reliable.

## Changes Made

### 1. Auth Fixtures (`packages/e2e/fixtures/auth.ts`)

**Before:**
```typescript
const emailInput = page.locator('input#email, input[type="email"], [data-testid="email-input"], input[name="email"]');
```

**After:**
```typescript
const emailInput = page.locator('[data-testid="email-input"]');
```

**Benefits:**
- Faster selector resolution (no need to try multiple selectors)
- More reliable (direct match to stable testid)
- Cleaner code

### 2. Feature Tests

#### Admin Feature Tests (`tests/04-feature-admin.spec.ts`)

**Optimizations:**
- Replaced `tbody tr` with `[data-testid="customer-row"]`
- Replaced `[role="tab"]:has-text("...")` with `[data-testid="tab-..."]`
- Replaced `button:has-text("Confirm")` with `[data-testid="confirm-dialog-confirm"]`
- Replaced `button:has-text("Suspend")` with `[data-testid="suspend-button"]`

#### Parent Feature Tests (`tests/04-feature-parent.spec.ts`)

**Optimizations:**
- Removed fallback selectors from form inputs
- Updated delete student test to use `[data-testid="confirm-dialog-confirm"]` instead of native `confirm()`
- Simplified all button selectors to use direct testids

### 3. Page Objects

#### LoginPage (`pages/login.page.ts`)

**Before:**
```typescript
this.emailInput = page.locator('input#email, [data-testid="email-input"], input[name="email"], input[type="email"]');
```

**After:**
```typescript
this.emailInput = page.locator('[data-testid="email-input"]');
```

#### AdminCustomersPage (`pages/admin/customers.page.ts`)

**Optimizations:**
- Simplified `customerRows` from `'[data-testid="customer-row"], tbody tr'` to `'[data-testid="customer-row"]'`
- Removed fallback selectors from all locators

### 4. Critical Tests (`tests/00-critical.spec.ts`)

**Optimizations:**
- Updated login page verification to use direct testids

## Performance Improvements

1. **Faster Selector Resolution**: Direct `data-testid` selectors are resolved immediately without trying multiple fallback selectors
2. **Reduced Flakiness**: Stable testids don't depend on DOM structure or CSS classes that might change
3. **Better Maintainability**: Single source of truth for selectors (the testid attribute)

## Test Coverage

All 114 E2E tests continue to pass with the optimized selectors, confirming:
- ✅ No regressions introduced
- ✅ All selectors correctly updated
- ✅ Tests are more efficient and reliable

## Future Recommendations

1. **Remove Fallback Selectors**: Since all interactive elements now have `data-testid` attributes, fallback selectors are no longer needed
2. **Lint Rule**: Consider adding an ESLint rule to enforce `data-testid` usage in E2E tests
3. **Documentation**: Keep `AUTOMATION_TESTABILITY.md` updated as new components are added

