/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { InvoiceHistoryList } from './InvoiceHistoryList';

describe('InvoiceHistoryList', () => {
  it('shows download invoice when pdfUrl is present', () => {
    render(
      <InvoiceHistoryList
        invoices={[
          {
            id: 'pay_1',
            amount: 9.99,
            currency: 'usd',
            status: 'paid',
            date: '2025-01-15T00:00:00.000Z',
            pdfUrl: 'https://store.noctusoft.com/receipt/1',
          },
        ]}
      />
    );
    const link = screen.getByTestId('button-download-invoice-pay_1');
    expect(link).toHaveAttribute('href', 'https://store.noctusoft.com/receipt/1');
    expect(link).toHaveTextContent('Download invoice');
  });

  it('shows unavailable message when no receipt URL', () => {
    render(
      <InvoiceHistoryList
        invoices={[
          {
            id: 'pay_2',
            amount: 9.99,
            currency: 'usd',
            status: 'paid',
            date: '2025-01-15T00:00:00.000Z',
          },
        ]}
      />
    );
    expect(screen.getByTestId('invoice-download-unavailable-pay_2')).toBeInTheDocument();
  });
});
