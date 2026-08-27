/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { ITodayView } from '@scholaracle/contracts';
import { TodayView } from './TodayView';

jest.mock('next/link', () => {
  return function MockLink({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  };
});

const VIEW: ITodayView = {
  encouragement: 'Nice work on Reading response 8.',
  next: {
    assignmentExternalId: 'demo-emma-ap-bio-a5',
    title: 'Cell Division worksheet',
    courseName: 'AP Biology',
    dueAt: '2026-08-29T16:00:00.000Z',
    primaryCtaLabel: 'Open worksheet',
  },
  alsoToday: [
    {
      assignmentExternalId: 'demo-emma-span2-vocab',
      title: 'Vocab quiz',
      courseName: 'Spanish II',
      primaryCtaLabel: 'Open quiz',
    },
  ],
};

describe('TodayView', () => {
  it('shows encouragement, exactly one primary Open button, and Also today', () => {
    render(<TodayView view={VIEW} />);
    expect(screen.getByTestId('studio-encouragement')).toHaveTextContent(
      'Nice work on Reading response 8.'
    );
    expect(screen.getByRole('link', { name: 'Open worksheet' })).toBeInTheDocument();
    expect(screen.getByTestId('studio-primary-cta')).toHaveAttribute(
      'href',
      '/studio/assignments/demo-emma-ap-bio-a5'
    );
    expect(screen.getByTestId('studio-also-today')).toHaveTextContent('Vocab quiz');
    expect(screen.getByRole('link', { name: /Vocab quiz/ })).toHaveAttribute(
      'href',
      '/studio/assignments/demo-emma-span2-vocab'
    );
    expect(screen.queryByTestId('studio-grades')).not.toBeInTheDocument();
  });

  it('does not render extra grade fields from a poisoned fixture', () => {
    const poisoned = {
      ...VIEW,
      letterGrade: 'A-',
      percent: '92%',
    } as ITodayView;
    render(<TodayView view={poisoned} />);
    expect(screen.queryByText('92%')).not.toBeInTheDocument();
    expect(screen.queryByText('A-')).not.toBeInTheDocument();
    expect(screen.queryByTestId('studio-grades')).not.toBeInTheDocument();
  });

  it('with next null still shows positive copy and no primary button', () => {
    render(
      <TodayView
        view={{ encouragement: "You're caught up.", next: null, alsoToday: [] }}
      />
    );
    expect(screen.getByTestId('studio-encouragement')).toHaveTextContent(/caught up/i);
    expect(screen.queryByTestId('studio-primary-cta')).not.toBeInTheDocument();
    expect(screen.queryByTestId('studio-also-today')).not.toBeInTheDocument();
  });
});
