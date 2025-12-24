# Automation Testability Conventions

This document outlines the conventions and standards for making UI components automation-friendly (Playwright + Browser MCP).

## Core Principles

1. **Every interactive control must be testable** - No element should require fragile selectors (e.g., CSS classes that change, nth-child selectors, text content that varies)
2. **Stable selectors** - Use `data-testid` attributes for all interactive elements
3. **Accessible by default** - All controls must have proper labels (`htmlFor`/`aria-label`) for accessibility AND automation
4. **No native dialogs** - Replace `confirm()`, `alert()`, `prompt()` with custom components that are testable
5. **Deterministic DOM** - Avoid unmounting elements during loading/error states to prevent DOM detachment

## Required Attributes

### Interactive Elements

All interactive elements **must** have either:
- A `data-testid` attribute, OR
- An explicit accessible name via:
  - `<Label htmlFor="...">` connected to the element's `id`
  - `aria-label` attribute
  - `aria-labelledby` pointing to a visible label

### Form Inputs

```tsx
// ✅ Good: Has both label connection AND testid
<Label htmlFor="email">Email</Label>
<Input
  id="email"
  data-testid="email-input"
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
/>

// ✅ Also good: Has aria-label AND testid
<Input
  data-testid="search-input"
  aria-label="Search customers"
  placeholder="Search..."
/>
```

### Buttons

```tsx
// ✅ Good: Has testid
<Button onClick={handleSave} data-testid="save-button">
  Save
</Button>

// ✅ Also good: Icon button with aria-label
<Button
  onClick={handleDelete}
  data-testid="delete-button"
  aria-label="Delete item"
>
  <TrashIcon />
</Button>
```

### Selects/Dropdowns

```tsx
// ✅ Good: Native select with label and testid
<Label htmlFor="plan-select">Plan</Label>
<select
  id="plan-select"
  data-testid="plan-select"
  value={plan}
  onChange={(e) => setPlan(e.target.value)}
>
  <option value="free">Free</option>
  <option value="premium">Premium</option>
</select>
```

### Tabs

```tsx
// ✅ Good: Proper ARIA roles + testid
<button
  role="tab"
  aria-selected={activeTab === 'overview'}
  onClick={() => setActiveTab('overview')}
  data-testid="tab-overview"
>
  Overview
</button>
```

### Dialogs/Modals

**❌ NEVER use native dialogs:**
```tsx
// ❌ BAD: Not testable
if (confirm('Are you sure?')) {
  handleDelete();
}
```

**✅ Use custom dialog components:**
```tsx
// ✅ GOOD: Testable custom dialog
<ConfirmDialog
  isOpen={isDeleteDialogOpen}
  title="Delete Item"
  description="Are you sure you want to delete this item?"
  confirmLabel="Delete"
  variant="destructive"
  onConfirm={handleDelete}
  onCancel={() => setIsDeleteDialogOpen(false)}
/>
```

## Naming Conventions

### Test IDs

Use kebab-case with descriptive, hierarchical names:

- **Page-level**: `{page-name}-page` (e.g., `admin-settings-page`)
- **Sections**: `{section-name}-section` (e.g., `admin-users-section`)
- **Forms**: `{form-name}-form` (e.g., `settings-form`)
- **Inputs**: `{field-name}-input` (e.g., `email-input`, `student-name`)
- **Buttons**: `{action}-button` (e.g., `save-button`, `delete-student-button`)
- **Tabs**: `tab-{tab-name}` (e.g., `tab-overview`, `tab-payments`)
- **Panels/Dialogs**: `{action}-panel` or `{name}-dialog` (e.g., `refund-panel`, `confirm-dialog`)
- **Tables**: `{entity}-table` (e.g., `payments-table`, `customers-table`)
- **Table Rows**: `{entity}-row` (e.g., `payment-row`, `customer-row`)
- **Toast Messages**: `toast` (consistent across all pages)

### Examples

```tsx
// Page container
<div data-testid="admin-payments-page">

  {/* Toast */}
  <div role="alert" data-testid="toast">...</div>

  {/* Table */}
  <Table data-testid="payments-table">
    <TableRow data-testid="payment-row">
      ...
      <Button data-testid="refund-button">Refund</Button>
    </TableRow>
  </Table>

  {/* Panel */}
  <Card data-testid="refund-panel">
    <Input data-testid="refund-amount" />
    <Button data-testid="confirm-refund-button">Confirm</Button>
  </Card>
</div>
```

## Common Patterns

### Loading States

Keep elements mounted during loading to prevent DOM detachment:

```tsx
// ✅ Good: Table stays mounted, skeleton overlays
{isLoading && <LoadingSkeleton />}
{(hasLoadedOnce || !isLoading) && (
  <Table data-testid="payments-table">
    {/* Table content */}
  </Table>
)}
```

### Error States

Show inline errors without unmounting the main content:

```tsx
// ✅ Good: Error shown inline, table remains mounted
{error && hasLoadedOnce && (
  <div role="alert" data-testid="payments-error-inline">
    Failed to refresh: {error}
  </div>
)}
{(hasLoadedOnce || !isLoading) && (
  <Table data-testid="payments-table">...</Table>
)}
```

### Conditional Rendering

Use state-based rendering, not conditional unmounting:

```tsx
// ✅ Good: Panel conditionally renders but stays in DOM when open
{isOpen && (
  <Card data-testid="refund-panel">
    {/* Content */}
  </Card>
)}

// ❌ Avoid: Unmounting during state changes causes flakiness
{isOpen ? <RefundPanel /> : null}
```

## Checklist for New Components

- [ ] All interactive elements have `data-testid` attributes
- [ ] All form inputs have connected `<Label htmlFor="...">` or `aria-label`
- [ ] All buttons have `data-testid` attributes
- [ ] No native dialogs (`confirm`, `alert`, `prompt`) - use custom components
- [ ] Page containers have `data-testid="{page-name}-page"`
- [ ] Tables have `data-testid="{entity}-table"`
- [ ] Table rows have `data-testid="{entity}-row"`
- [ ] Toast messages use `data-testid="toast"`
- [ ] Loading states don't unmount interactive elements
- [ ] Error states show inline without unmounting main content

## Testing

All UI changes must pass the full Playwright E2E suite:

```bash
pnpm --filter @scholaracle/e2e test
```

## Examples in Codebase

- **ConfirmDialog**: `packages/web/components/common/ConfirmDialog.tsx` - Reusable confirmation dialog
- **Admin Pages**: `packages/web/app/admin/*/page.tsx` - Examples of properly testable pages
- **Form Components**: `packages/web/components/admin/*Panel.tsx` - Examples of testable form panels

## Future Enhancements

Consider adding:
- ESLint rule to enforce `data-testid` on interactive elements
- Pre-commit hook to check for native dialogs
- TypeScript types for test IDs to catch typos at compile time

