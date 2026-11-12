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

  it('calls onCheckout with the selected plan and cycle', () => {
    const onCheckout = jest.fn();
    render(<UpgradePlanPicker initialCycle="monthly" onCheckout={onCheckout} />);
    fireEvent.click(screen.getByTestId('plan-option-family'));
    fireEvent.click(screen.getByTestId('toggle-annual-billing'));
    fireEvent.click(screen.getByTestId('button-upgrade-selected-plan'));
    expect(onCheckout).toHaveBeenCalledWith('family', 'annual');
  });
});
