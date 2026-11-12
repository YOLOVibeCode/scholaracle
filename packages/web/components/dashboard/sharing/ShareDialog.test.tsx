/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ShareDialog } from './ShareDialog';
import { studentsApi } from '@/lib/api/students';

jest.mock('@/lib/api/students', () => ({
  studentsApi: { getAll: jest.fn() },
}));
jest.mock('@/lib/api/sharing', () => ({
  sharingApi: { invite: jest.fn() },
}));

const getAllMock = studentsApi.getAll as jest.MockedFunction<typeof studentsApi.getAll>;

describe('ShareDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists only the students the viewer owns or manages, with the current one pre-ticked', async () => {
    getAllMock.mockResolvedValue([
      { id: 's-ava', userId: 'u1', name: 'Ava', grade: '10', access: 'owner', peopleCount: 1 },
      { id: 's-chris', userId: 'u2', name: 'Christian', grade: '7', access: 'admin', peopleCount: 2 },
      { id: 's-gid', userId: 'u2', name: 'Gideon', grade: '4', access: 'member', peopleCount: 2 },
    ]);
    render(<ShareDialog open onClose={jest.fn()} defaultStudentIds={['s-chris']} />);

    expect(await screen.findByTestId('share-student-s-ava')).toBeInTheDocument();
    expect(screen.getByTestId('share-student-s-chris')).toBeChecked();
    expect(screen.queryByTestId('share-student-s-gid')).not.toBeInTheDocument();
    expect(screen.getByText('Share with someone')).toBeInTheDocument();
  });

  it('renders nothing while closed', () => {
    render(<ShareDialog open={false} onClose={jest.fn()} />);
    expect(screen.queryByTestId('share-dialog')).not.toBeInTheDocument();
    expect(getAllMock).not.toHaveBeenCalled();
  });
});
