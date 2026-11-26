/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChangePlanConfirmDialog } from './ChangePlanConfirmDialog';

function renderDialog(overrides: Partial<Parameters<typeof ChangePlanConfirmDialog>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: jest.fn(),
    currentPlan: 'starter',
    currentCycle: 'monthly' as const,
    targetPlan: 'premium',
    targetCycle: 'monthly' as const,
    isSubmitting: false,
    onConfirm: jest.fn(),
    ...overrides,
  };
  render(<ChangePlanConfirmDialog {...props} />);
  return props;
}

describe('ChangePlanConfirmDialog', () => {
  it('calls onConfirm only when Confirm switch is clicked', () => {
    const props = renderDialog();

    fireEvent.click(screen.getByTestId('button-keep-current-plan'));
    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(props.onOpenChange).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByTestId('button-confirm-plan-switch'));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows the current and new plan with their prices', () => {
    renderDialog({ currentPlan: 'family', currentCycle: 'annual', targetPlan: 'premium' });

    expect(screen.getByTestId('change-plan-current').textContent).toMatch(/Family.*499\.99\/year/);
    expect(screen.getByTestId('change-plan-target').textContent).toMatch(/Premium.*19\.99\/month/);
  });

  it('does not promise charge timing the store may not keep', () => {
    renderDialog();

    const terms = screen.getByTestId('change-plan-terms').textContent ?? '';
    expect(terms).toMatch(/right away or at your next renewal date/i);
    expect(terms).not.toMatch(/charged to the card on file now/i);
    expect(terms).not.toMatch(/you keep your current plan until then/i);
  });

  it('shows why the change failed inside the dialog', () => {
    renderDialog({ error: 'We could not change your plan right now.' });

    expect(screen.getByTestId('change-plan-error')).toHaveTextContent(
      'We could not change your plan right now.'
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows no error line when there is none', () => {
    renderDialog();

    expect(screen.queryByTestId('change-plan-error')).not.toBeInTheDocument();
  });

  it('cannot be dismissed with Esc while the change is in flight', () => {
    const props = renderDialog({ isSubmitting: true });

    fireEvent.keyDown(screen.getByTestId('modal-change-plan-confirm'), { key: 'Escape' });

    expect(props.onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('button-keep-current-plan')).toBeDisabled();
    expect(screen.getByTestId('button-confirm-plan-switch')).toBeDisabled();
  });

  it('can be dismissed with Esc when idle', () => {
    const props = renderDialog();

    fireEvent.keyDown(screen.getByTestId('modal-change-plan-confirm'), { key: 'Escape' });

    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });
});
