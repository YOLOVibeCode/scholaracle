/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChangePlanConfirmDialog } from './ChangePlanConfirmDialog';

describe('ChangePlanConfirmDialog', () => {
  it('calls onConfirm only when Confirm switch is clicked', () => {
    const onConfirm = jest.fn();
    const onOpenChange = jest.fn();
    render(
      <ChangePlanConfirmDialog
        open
        onOpenChange={onOpenChange}
        currentPlan="starter"
        currentCycle="monthly"
        targetPlan="premium"
        targetCycle="monthly"
        isUpgrade
        isSubmitting={false}
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByTestId('button-keep-current-plan'));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByTestId('button-confirm-plan-switch'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows downgrade terms when not an upgrade', () => {
    render(
      <ChangePlanConfirmDialog
        open
        onOpenChange={jest.fn()}
        currentPlan="family"
        currentCycle="annual"
        targetPlan="premium"
        targetCycle="annual"
        isUpgrade={false}
        isSubmitting={false}
        onConfirm={jest.fn()}
      />
    );
    expect(screen.getByTestId('change-plan-terms').textContent).toMatch(/next renewal/i);
  });
});
