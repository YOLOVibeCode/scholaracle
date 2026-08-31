/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { IWorkPackView } from '@scholaracle/contracts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { apiClient } from '@/lib/api/client';
import { StudioWorkPack } from './StudioWorkPack';

const VIEW: IWorkPackView = {
  title: 'Cell Division',
  courseName: 'AP Biology',
  humanStatus: 'Not turned in',
  instructionsText: 'Complete the worksheet.',
  primaryAsset: {
    assetId: 'a',
    contentHash: 'h',
    fileName: 'lab-safety.pdf',
    downloadUrl: '/x',
  },
  needsSchoolLogin: [],
  moreFromCourse: [],
  capturedPages: [],
};

jest.mock('@/lib/api/client', () => ({
  apiClient: { request: jest.fn().mockResolvedValue({ success: true }) },
}));

jest.mock('./WorkPackView', () => ({
  WorkPackView: ({
    view,
    onPrimaryOpened,
  }: {
    view: IWorkPackView;
    onPrimaryOpened?: () => void;
  }) => (
    <div>
      <span data-testid="studio-pack-status">{view.humanStatus}</span>
      <button type="button" onClick={() => onPrimaryOpened?.()}>
        Open lab-safety.pdf
      </button>
    </div>
  ),
}));

describe('StudioWorkPack', () => {
  beforeEach(() => {
    (apiClient.request as jest.Mock).mockClear();
  });

  it('PATCHes working_on_it when the pack opens and shows optimistic status', () => {
    render(<StudioWorkPack view={VIEW} assignmentExternalId="demo-emma-ap-bio-a5" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open lab-safety.pdf' }));
    expect(screen.getByTestId('studio-pack-status')).toHaveTextContent('Working on it');
    expect(apiClient.request).toHaveBeenCalledWith(
      '/studio/assignments/demo-emma-ap-bio-a5/status',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'working_on_it' }),
      })
    );
  });

  it('does not import parent nudge types (ISP)', () => {
    const src = readFileSync(join(__dirname, 'StudioWorkPack.tsx'), 'utf8');
    expect(src).not.toMatch(/from ['"]@scholaracle\/interfaces['"]/);
    expect(src).not.toMatch(/INudgePublisher/);
    expect(src).not.toMatch(/IStudentMagicLink/);
  });
});
