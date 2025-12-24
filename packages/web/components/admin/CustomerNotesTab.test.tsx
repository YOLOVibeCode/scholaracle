/**
 * TDD Tests for CustomerNotesTab component
 * 
 * Following ISP: Small, focused component for customer notes
 */

import { render, screen, waitFor } from '@testing-library/react';
import { CustomerNotesTab } from './CustomerNotesTab';
import { adminNotesApi } from '@/lib/api/admin/notes';

jest.mock('@/lib/api/admin/notes');

describe('CustomerNotesTab Component (ISP)', () => {
  const mockNotes = [
    {
      id: '1',
      content: 'Test note 1',
      category: 'general' as const,
      isInternal: false,
      isPinned: false,
      adminUserId: 'admin1',
      adminName: 'Admin User',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    (adminNotesApi.getByCustomerId as jest.Mock).mockResolvedValue({
      success: true,
      data: mockNotes,
    });
  });

  it('should load and display notes', async () => {
    render(<CustomerNotesTab customerId="123" />);
    
    await waitFor(() => {
      expect(screen.getByText('Test note 1')).toBeInTheDocument();
    });
  });

  it('should show create note form', () => {
    render(<CustomerNotesTab customerId="123" />);
    
    expect(screen.getByPlaceholderText(/add a note/i)).toBeInTheDocument();
  });

  it('should create a note when form is submitted', async () => {
    (adminNotesApi.create as jest.Mock).mockResolvedValue({ success: true });
    
    render(<CustomerNotesTab customerId="123" />);
    
    const input = screen.getByPlaceholderText(/add a note/i);
    const submitButton = screen.getByRole('button', { name: /add note/i });
    
    // Simulate form submission
    input.value = 'New note';
    submitButton.click();
    
    await waitFor(() => {
      expect(adminNotesApi.create).toHaveBeenCalledWith('123', expect.objectContaining({ content: 'New note' }));
    });
  });

  it('should delete a note when delete button is clicked', async () => {
    (adminNotesApi.delete as jest.Mock).mockResolvedValue({ success: true });
    
    render(<CustomerNotesTab customerId="123" />);
    
    await waitFor(() => {
      expect(screen.getByText('Test note 1')).toBeInTheDocument();
    });
    
    const deleteButton = screen.getByRole('button', { name: /delete/i });
    deleteButton.click();
    
    await waitFor(() => {
      expect(adminNotesApi.delete).toHaveBeenCalledWith('1');
    });
  });
});

