/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConnectProviderWizard } from './ConnectProviderWizard';

jest.mock('@/lib/api/sourceInvites', () => ({
  sourceInvitesApi: {
    issue: jest.fn(),
  },
}));

describe('ConnectProviderWizard', () => {
  it('ends on connect-from-phone with QR and no download button', () => {
    const onClose = jest.fn();
    const onAdded = jest.fn();

    render(
      <ConnectProviderWizard open onClose={onClose} onAdded={onAdded} />
    );

    fireEvent.change(screen.getByTestId('input-portal-url'), {
      target: { value: 'https://school.instructure.com' },
    });
    fireEvent.click(screen.getByTestId('platform-canvas'));

    fireEvent.change(screen.getByTestId('connect-provider-student-name-hint'), {
      target: { value: 'Jordan' },
    });
    fireEvent.click(screen.getByTestId('connect-provider-continue'));

    expect(screen.getByTestId('connect-phone-qr')).toBeInTheDocument();
    expect(screen.queryByTestId('button-download-scraper')).not.toBeInTheDocument();
  });
});
