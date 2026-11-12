/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { UpgradePlanPicker } from './UpgradePlanPicker';

describe('UpgradePlanPicker', () => {
  it('lists starter, premium, and family options', () => {
    render(<UpgradePlanPicker initialCycle="monthly" onCheckout={jest.fn()} />);
    expect(screen.getByTestId('plan-option-starter')).toBeInTheDocument();
    expect(screen.getByTestId('plan-option-premium')).toBeInTheDocument();
    expect(screen.getByTestId('plan-option-family')).toBeInTheDocument();
  });

  it('disables switch primary action on the current plan in switch mode', () => {
    render(
      <UpgradePlanPicker
        mode="switch"
        initialCycle="monthly"
        currentPlan="starter"
        currentCycle="monthly"
        onCheckout={jest.fn()}
        onSwitchRequest={jest.fn()}
      />
    );
    expect(screen.getByTestId('button-request-plan-switch')).toBeDisabled();
  });

  it('shows disabled notice when switchDisabled', () => {
    render(
      <UpgradePlanPicker
        mode="switch"
        initialCycle="monthly"
        currentPlan="premium"
        currentCycle="monthly"
        switchDisabled
        onCheckout={jest.fn()}
        onSwitchRequest={jest.fn()}
      />
    );
    expect(screen.getByTestId('billing-plan-switch-disabled-notice')).toBeInTheDocument();
    expect(screen.getByTestId('button-request-plan-switch')).toBeDisabled();
  });

  it('calls onCheckout with the selected plan and cycle', () => {
    const onCheckout = jest.fn();
    render(<UpgradePlanPicker initialCycle="monthly" onCheckout={onCheckout} />);
    fireEvent.click(screen.getByTestId('plan-option-family'));
    fireEvent.click(screen.getByTestId('toggle-annual-billing'));
    fireEvent.click(screen.getByTestId('button-upgrade-selected-plan'));
    expect(onCheckout).toHaveBeenCalledWith('family', 'annual');
  });
});
