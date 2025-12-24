/**
 * TDD Tests for LoadingSkeleton component
 * 
 * Following ISP: Small, focused component for loading states
 */

import { render, screen } from '@testing-library/react';
import { LoadingSkeleton } from './LoadingSkeleton';

describe('LoadingSkeleton Component (ISP)', () => {
  it('should render default skeleton', () => {
    render(<LoadingSkeleton />);
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
  });

  it('should render card skeleton', () => {
    render(<LoadingSkeleton variant="card" />);
    expect(screen.getByTestId('loading-skeleton-card')).toBeInTheDocument();
  });

  it('should render list skeleton', () => {
    render(<LoadingSkeleton variant="list" count={3} />);
    const skeletons = screen.getAllByTestId('loading-skeleton-list-item');
    expect(skeletons).toHaveLength(3);
  });

  it('should render dashboard skeleton', () => {
    render(<LoadingSkeleton variant="dashboard" />);
    expect(screen.getByTestId('loading-skeleton-dashboard')).toBeInTheDocument();
  });
});

