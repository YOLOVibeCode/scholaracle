/**
 * TDD Tests for ErrorDisplay component
 * Following ISP: Small, focused component for error display
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ErrorDisplay } from './ErrorDisplay';

describe('ErrorDisplay Component (ISP)', () => {
  it('should render error message', () => {
    render(<ErrorDisplay error="Test error" onRetry={() => {}} />);
    expect(screen.getByText('Test error')).toBeInTheDocument();
  });

  it('should render retry button', () => {
    const onRetry = jest.fn();
    render(<ErrorDisplay error="Test error" onRetry={onRetry} />);
    
    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).toBeInTheDocument();
    
    retryButton.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('should not render retry button when onRetry is not provided', () => {
    render(<ErrorDisplay error="Test error" />);
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('should render custom title', () => {
    render(<ErrorDisplay error="Test error" title="Custom Title" onRetry={() => {}} />);
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
  });
});

