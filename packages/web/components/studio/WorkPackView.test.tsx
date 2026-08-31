/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { IWorkPackView } from '@scholaracle/contracts';
import { WorkPackView } from './WorkPackView';

const VIEW: IWorkPackView = {
  title: 'Cell Division',
  courseName: 'AP Biology',
  dueAt: '2026-08-20T16:00:00.000Z',
  humanStatus: 'Not turned in',
  instructionsText: 'Complete the Cell Division worksheet and submit via Canvas.',
  primaryAsset: {
    assetId: 'demo-asset-demo-emma-ap-bio-lab-safety',
    contentHash: 'demo-demo-emma-ap-bio-lab-safety-hash',
    fileName: 'lab-safety.pdf',
    downloadUrl: '/studio/fixtures/lab-safety.pdf',
  },
  needsSchoolLogin: [
    {
      label: 'Khan Academy – Cell Cycle',
      href: 'https://www.khanacademy.org/science/ap-biology/cell-communication-and-cell-cycle',
      kind: 'needs-internet',
    },
    {
      label: 'View in Canvas',
      href: 'https://school.instructure.com/courses/bio101/assignments/cell-division',
      kind: 'school-login',
    },
  ],
  moreFromCourse: [
    {
      title: 'AP Biology Syllabus',
      asset: { assetId: 's', contentHash: 'h', fileName: 'syllabus.pdf' },
    },
    { title: 'Chapter 5 Study Guide' },
    { title: 'YouTube - AP Bio Review', href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  ],
  capturedPages: [],
};

const OPENED = {
  bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
  contentType: 'application/pdf',
  cacheKey: 'demo-asset-demo-emma-ap-bio-lab-safety:demo-demo-emma-ap-bio-lab-safety-hash',
  fromCache: false,
  stale: false,
};

describe('WorkPackView', () => {
  beforeEach(() => {
    URL.createObjectURL = jest.fn(() => 'blob:test-lab-safety');
    URL.revokeObjectURL = jest.fn();
  });

  it('shows one loud Open for the hosted file; LMS is a quieter fallback', () => {
    render(<WorkPackView view={VIEW} openPrimaryAsset={jest.fn()} />);
    expect(screen.getByRole('heading', { name: 'Cell Division' })).toBeInTheDocument();
    expect(screen.getByTestId('studio-pack-status')).toHaveTextContent('Not turned in');
    expect(screen.getByRole('button', { name: 'Open lab-safety.pdf' })).toBeInTheDocument();
    expect(screen.getByTestId('studio-pack-primary-cta').tagName).toBe('BUTTON');
    expect(screen.getByText('View in Canvas')).toBeInTheDocument();
    expect(screen.getByText(/needs internet/)).toBeInTheDocument();
    expect(screen.getByTestId('studio-pack-instructions')).toHaveTextContent(/Cell Division/);
    expect(screen.queryByText(/^missing$/i)).not.toBeInTheDocument();
  });

  it('shows captured article text for offline reading', () => {
    render(
      <WorkPackView
        view={{
          ...VIEW,
          capturedPages: [
            {
              title: 'SparkNotes snapshot',
              text: 'Scout narrates. Cite the novel.',
              href: 'https://www.sparknotes.com/lit/mocking/',
            },
          ],
        }}
        openPrimaryAsset={jest.fn()}
      />
    );
    expect(screen.getByTestId('studio-pack-captured')).toHaveTextContent(/Scout narrates/);
    expect(screen.getByRole('link', { name: 'Open original' })).toHaveAttribute(
      'href',
      'https://www.sparknotes.com/lit/mocking/'
    );
  });

  it('keeps course extras collapsed', () => {
    render(<WorkPackView view={VIEW} openPrimaryAsset={jest.fn()} />);
    const details = screen.getByTestId('studio-more-from-course');
    expect(details).not.toHaveAttribute('open');
    expect(details).toHaveTextContent('AP Biology Syllabus');
  });

  it('with no primary asset has no loud Open button', () => {
    render(
      <WorkPackView
        view={{
          ...VIEW,
          primaryAsset: null,
          needsSchoolLogin: [VIEW.needsSchoolLogin[1]!],
        }}
        openPrimaryAsset={jest.fn()}
      />
    );
    expect(screen.queryByTestId('studio-pack-primary-cta')).not.toBeInTheDocument();
  });

  it('stack chrome omits the title header for parent drawers', () => {
    render(<WorkPackView view={VIEW} chrome="stack" openPrimaryAsset={jest.fn()} />);
    expect(screen.queryByRole('heading', { name: 'Cell Division' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open lab-safety.pdf' })).toBeInTheDocument();
  });

  it('Open uses IAssetCache and shows an in-page viewer keyed by assetId:hash', async () => {
    const openPrimaryAsset = jest.fn(async () => OPENED);
    render(<WorkPackView view={VIEW} openPrimaryAsset={openPrimaryAsset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open lab-safety.pdf' }));
    const viewer = await screen.findByTestId('studio-asset-viewer');
    expect(openPrimaryAsset).toHaveBeenCalledWith(VIEW.primaryAsset);
    expect(viewer).toHaveAttribute('src', 'blob:test-lab-safety');
    expect(viewer).toHaveAttribute(
      'data-cache-key',
      'demo-asset-demo-emma-ap-bio-lab-safety:demo-demo-emma-ap-bio-lab-safety-hash'
    );
    expect(viewer).toHaveAttribute('data-from-cache', 'false');
  });

  it('notifies the host when the primary file opens so studio can set working_on_it', async () => {
    const onPrimaryOpened = jest.fn();
    render(
      <WorkPackView
        view={VIEW}
        openPrimaryAsset={jest.fn(async () => OPENED)}
        onPrimaryOpened={onPrimaryOpened}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open lab-safety.pdf' }));
    await screen.findByTestId('studio-asset-viewer');
    expect(onPrimaryOpened).toHaveBeenCalledTimes(1);
  });

  it('second Open with fromCache true does not change the cache key', async () => {
    const openPrimaryAsset = jest
      .fn()
      .mockResolvedValueOnce(OPENED)
      .mockResolvedValueOnce({ ...OPENED, fromCache: true });
    render(<WorkPackView view={VIEW} openPrimaryAsset={openPrimaryAsset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open lab-safety.pdf' }));
    await screen.findByTestId('studio-asset-viewer');
    fireEvent.click(screen.getByRole('button', { name: 'Open lab-safety.pdf' }));
    await waitFor(() => {
      expect(screen.getByTestId('studio-asset-viewer')).toHaveAttribute('data-from-cache', 'true');
    });
    expect(screen.getByTestId('studio-asset-viewer')).toHaveAttribute(
      'data-cache-key',
      'demo-asset-demo-emma-ap-bio-lab-safety:demo-demo-emma-ap-bio-lab-safety-hash'
    );
  });

  it('shows outdated copy notice when the requested hash is missing', async () => {
    const openPrimaryAsset = jest.fn(async () => ({
      ...OPENED,
      fromCache: true,
      stale: true,
      requestedHashMissing: true,
    }));
    render(<WorkPackView view={VIEW} openPrimaryAsset={openPrimaryAsset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open lab-safety.pdf' }));
    expect(await screen.findByTestId('studio-pack-stale')).toHaveTextContent(
      'May be outdated until next parent sync'
    );
  });
});
