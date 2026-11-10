/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { TrialCountdownBanner } from './TrialCountdownBanner';

describe('TrialCountdownBanner', () => {
  it('shows days remaining when trialing', () => {
    const end = new Date();
    end.setDate(end.getDate() + 5);
    render(<TrialCountdownBanner trialEndIso={end.toISOString()} />);
    expect(screen.getByTestId('trial-countdown-banner')).toBeInTheDocument();
    expect(screen.getByText(/trial ends in 5 days/i)).toBeInTheDocument();
  });

  it('returns null when trial end is in the past', () => {
    const end = new Date();
    end.setDate(end.getDate() - 1);
    const { container } = render(<TrialCountdownBanner trialEndIso={end.toISOString()} />);
    expect(container.firstChild).toBeNull();
  });
});
