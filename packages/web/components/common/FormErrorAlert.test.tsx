/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { FormErrorAlert } from './FormErrorAlert';

describe('FormErrorAlert', () => {
  it('exposes role alert and assertive live region', () => {
    render(<FormErrorAlert>Invalid credentials</FormErrorAlert>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveAttribute('data-testid', 'message-error');
    expect(alert).toHaveTextContent('Invalid credentials');
  });
});
