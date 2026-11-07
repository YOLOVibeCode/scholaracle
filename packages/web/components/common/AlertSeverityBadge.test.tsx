/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { AlertSeverityBadge } from './AlertSeverityBadge';

describe('AlertSeverityBadge', () => {
  it('renders icon and human-readable label for critical', () => {
    render(<AlertSeverityBadge severity="critical" />);
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByLabelText('Critical severity')).toBeInTheDocument();
  });

  it('renders label for warning severity', () => {
    render(<AlertSeverityBadge severity="warning" />);
    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  it('falls back to Info for unknown severity', () => {
    render(<AlertSeverityBadge severity="unknown" />);
    expect(screen.getByText('Info')).toBeInTheDocument();
  });
});
