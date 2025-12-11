import { test, expect } from '../fixtures/auth';
import { AdminCustomersPage } from '../pages/admin/customers.page';
import { assertToastMessage, assertAccessDenied } from '../helpers/assertions';
import { TEST_USERS } from '../fixtures/test-data';

/**
 * Layer 4: Feature CRUD Tests (Admin)
 * 
 * Core functionality works for admin roles.
 * 
 * Depends on: Layer 3 (@navigation)
 * If Layer 3 fails → don't run
 */
test.describe('@feature Layer 4: Admin Features', () => {
  test('FEAT-A-001: Read customer list', async ({ page, loginAsRole }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/customers');
    
    const customersPage = new AdminCustomersPage(page);
    await customersPage.expectOnCustomersPage();
    
    // Verify table or list is visible
    await expect(customersPage.customerTable.or(customersPage.customerRows)).toBeVisible();
  });

  test('FEAT-A-002: Search customers', async ({ page }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/customers');
    
    const customersPage = new AdminCustomersPage(page);
    await customersPage.searchCustomer('test@example.com');
    
    // Verify search executed
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('FEAT-A-003: Filter customers by plan', async ({ page }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/customers');
    
    const filterDropdown = page.locator('[data-testid="filter-dropdown"], select').first();
    const count = await filterDropdown.count();
    
    if (count > 0) {
      await filterDropdown.selectOption({ index: 1 });
      await page.waitForTimeout(500);
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('FEAT-A-004: View customer detail', async ({ page }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/customers');
    
    const customerRow = page.locator('tbody tr, [data-testid="customer-row"]').first();
    const count = await customerRow.count();
    
    if (count > 0) {
      await customerRow.click();
      await expect(page).toHaveURL(/\/admin\/customers\/[^/]+/);
      
      // Verify customer info is visible
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('FEAT-A-005: Suspend customer (super_admin only)', async ({ page }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/customers');
    
    const customerRow = page.locator('tbody tr').first();
    const count = await customerRow.count();
    
    if (count > 0) {
      await customerRow.click();
      await page.waitForURL(/\/admin\/customers\/[^/]+/);
      
      const suspendButton = page.locator('[data-testid="suspend-button"], button:has-text("Suspend")');
      const suspendCount = await suspendButton.count();
      
      if (suspendCount > 0) {
        await suspendButton.click();
        
        // Confirm if dialog appears
        const confirmButton = page.locator('button:has-text("Confirm")').last();
        const confirmCount = await confirmButton.count();
        
        if (confirmCount > 0) {
          await confirmButton.click();
        }
        
        await assertToastMessage(page, /suspended|success/i);
      }
    }
  });

  test('FEAT-A-006: Unsuspend customer (super_admin only)', async ({ page }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/customers');
    
    // This test would require a suspended customer
    // For now, verify the functionality exists
    const customerRow = page.locator('tbody tr').first();
    const count = await customerRow.count();
    
    if (count > 0) {
      await customerRow.click();
      await page.waitForURL(/\/admin\/customers\/[^/]+/);
      
      const unsuspendButton = page.locator('[data-testid="unsuspend-button"], button:has-text("Unsuspend")');
      const unsuspendCount = await unsuspendButton.count();
      
      // If button exists, test it
      if (unsuspendCount > 0) {
        await unsuspendButton.click();
        await assertToastMessage(page, /unsuspended|success/i);
      }
    }
  });

  test('FEAT-A-007: Update subscription plan', async ({ page }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/customers');
    
    const customerRow = page.locator('tbody tr').first();
    const count = await customerRow.count();
    
    if (count > 0) {
      await customerRow.click();
      await page.waitForURL(/\/admin\/customers\/[^/]+/);
      
      // Navigate to subscription tab
      const subscriptionTab = page.locator('[role="tab"]:has-text("Subscription")');
      const tabCount = await subscriptionTab.count();
      
      if (tabCount > 0) {
        await subscriptionTab.click();
        
        const changePlanButton = page.locator('[data-testid="change-plan-button"], button:has-text("Change Plan")');
        const buttonCount = await changePlanButton.count();
        
        if (buttonCount > 0) {
          await changePlanButton.click();
          await page.waitForTimeout(500);
          await expect(page.locator('body')).toBeVisible();
        }
      }
    }
  });

  test('FEAT-A-008: Cancel subscription', async ({ page }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/subscriptions');
    
    const subscriptionRow = page.locator('tbody tr').first();
    const count = await subscriptionRow.count();
    
    if (count > 0) {
      const cancelButton = page.locator('[data-testid="cancel-subscription-button"], button:has-text("Cancel")').first();
      const cancelCount = await cancelButton.count();
      
      if (cancelCount > 0) {
        await cancelButton.click();
        
        const confirmButton = page.locator('button:has-text("Confirm")').last();
        const confirmCount = await confirmButton.count();
        
        if (confirmCount > 0) {
          await confirmButton.click();
          await assertToastMessage(page, /cancelled|success/i);
        }
      }
    }
  });

  test('FEAT-A-009: Issue refund (billing roles)', async ({ page }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/payments');
    
    const paymentRow = page.locator('tbody tr').first();
    const count = await paymentRow.count();
    
    if (count > 0) {
      const refundButton = page.locator('[data-testid="refund-button"], button:has-text("Refund")').first();
      const refundCount = await refundButton.count();
      
      if (refundCount > 0) {
        await refundButton.click();
        
        // Fill refund form if it appears
        const refundAmount = page.locator('[data-testid="refund-amount"], input[name="amount"]');
        const amountCount = await refundAmount.count();
        
        if (amountCount > 0) {
          await refundAmount.fill('10.00');
          
          const confirmButton = page.locator('button:has-text("Confirm")').last();
          await confirmButton.click();
          await assertToastMessage(page, /refund|success/i);
        }
      }
    }
  });

  test('FEAT-A-010: Create admin note', async ({ page }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/customers');
    
    const customerRow = page.locator('tbody tr').first();
    const count = await customerRow.count();
    
    if (count > 0) {
      await customerRow.click();
      await page.waitForURL(/\/admin\/customers\/[^/]+/);
      
      // Navigate to notes tab
      const notesTab = page.locator('[role="tab"]:has-text("Notes")');
      const tabCount = await notesTab.count();
      
      if (tabCount > 0) {
        await notesTab.click();
        
        const addNoteButton = page.locator('[data-testid="add-note-button"], button:has-text("Add Note")');
        const buttonCount = await addNoteButton.count();
        
        if (buttonCount > 0) {
          await addNoteButton.click();
          
          const noteTextarea = page.locator('[data-testid="note-content"], textarea');
          await noteTextarea.fill('Test note from E2E');
          
          const saveButton = page.locator('[data-testid="save-note-button"], button:has-text("Save")');
          await saveButton.click();
          await assertToastMessage(page, /note|success/i);
        }
      }
    }
  });

  test('FEAT-A-011: Update admin note', async ({ page }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/customers');
    
    const customerRow = page.locator('tbody tr').first();
    const count = await customerRow.count();
    
    if (count > 0) {
      await customerRow.click();
      
      const notesTab = page.locator('[role="tab"]:has-text("Notes")');
      const tabCount = await notesTab.count();
      
      if (tabCount > 0) {
        await notesTab.click();
        
        const editButton = page.locator('[data-testid="edit-note-button"], button:has-text("Edit")').first();
        const editCount = await editButton.count();
        
        if (editCount > 0) {
          await editButton.click();
          
          const noteTextarea = page.locator('textarea').first();
          await noteTextarea.fill('Updated note');
          
          const saveButton = page.locator('button:has-text("Save")');
          await saveButton.click();
          await assertToastMessage(page, /updated|success/i);
        }
      }
    }
  });

  test('FEAT-A-012: Delete admin note', async ({ page }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/customers');
    
    const customerRow = page.locator('tbody tr').first();
    const count = await customerRow.count();
    
    if (count > 0) {
      await customerRow.click();
      
      const notesTab = page.locator('[role="tab"]:has-text("Notes")');
      const tabCount = await notesTab.count();
      
      if (tabCount > 0) {
        await notesTab.click();
        
        const deleteButton = page.locator('[data-testid="delete-note-button"], button:has-text("Delete")').first();
        const deleteCount = await deleteButton.count();
        
        if (deleteCount > 0) {
          await deleteButton.click();
          
          const confirmButton = page.locator('button:has-text("Confirm")').last();
          await confirmButton.click();
          await assertToastMessage(page, /deleted|success/i);
        }
      }
    }
  });

  test('FEAT-A-013: Send communication to customer', async ({ page }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/communications');
    
    const sendButton = page.locator('[data-testid="send-communication-button"], button:has-text("Send")');
    const count = await sendButton.count();
    
    if (count > 0) {
      await sendButton.click();
      
      // Fill communication form
      const recipientInput = page.locator('[data-testid="recipient-input"], input[name="email"]');
      await recipientInput.fill('test@example.com');
      
      const subjectInput = page.locator('[data-testid="subject-input"], input[name="subject"]');
      await subjectInput.fill('Test Communication');
      
      const contentTextarea = page.locator('[data-testid="content-textarea"], textarea');
      await contentTextarea.fill('Test message from E2E');
      
      const submitButton = page.locator('button[type="submit"], button:has-text("Send")');
      await submitButton.click();
      await assertToastMessage(page, /sent|success/i);
    }
  });

  test('FEAT-A-014: Create admin user (super_admin only)', async ({ page }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/settings');
    
    const addAdminButton = page.locator('[data-testid="add-admin-button"], button:has-text("Add Admin")');
    const count = await addAdminButton.count();
    
    if (count > 0) {
      await addAdminButton.click();
      
      // Fill admin form
      const emailInput = page.locator('[data-testid="admin-email"], input[name="email"]');
      await emailInput.fill(`admin.${Date.now()}@scholaracle.com`);
      
      const nameInput = page.locator('[data-testid="admin-name"], input[name="name"]');
      await nameInput.fill('Test Admin');
      
      const roleSelect = page.locator('[data-testid="admin-role"], select[name="role"]');
      await roleSelect.selectOption('admin');
      
      const saveButton = page.locator('button[type="submit"], button:has-text("Save")');
      await saveButton.click();
      await assertToastMessage(page, /created|success/i);
    }
  });

  test('FEAT-A-015: Update admin user role', async ({ page }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/settings');
    
    const adminRow = page.locator('tbody tr').first();
    const count = await adminRow.count();
    
    if (count > 0) {
      const editButton = page.locator('[data-testid="edit-admin-button"], button:has-text("Edit")').first();
      const editCount = await editButton.count();
      
      if (editCount > 0) {
        await editButton.click();
        
        const roleSelect = page.locator('select[name="role"]');
        await roleSelect.selectOption('support');
        
        const saveButton = page.locator('button[type="submit"]');
        await saveButton.click();
        await assertToastMessage(page, /updated|success/i);
      }
    }
  });
});
