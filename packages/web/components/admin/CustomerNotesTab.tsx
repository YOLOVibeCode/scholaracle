/**
 * CustomerNotesTab Component (ISP)
 * 
 * Small, focused component for managing customer notes.
 * Follows Interface Segregation Principle - single responsibility.
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { adminNotesApi, type IAdminNote } from '@/lib/api/admin/notes';
import { useAsyncData } from '@/lib/hooks';
import { ErrorDisplay, LoadingSkeleton, ConfirmDialog } from '@/components/common';
import { Pin, Trash2, Edit2 } from 'lucide-react';

export interface ICustomerNotesTabProps {
  readonly customerId: string;
}

export function CustomerNotesTab({ customerId }: ICustomerNotesTabProps) {
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteCategory, setNewNoteCategory] = useState<'general' | 'billing' | 'support' | 'technical' | 'compliance'>('general');
  const [isInternal, setIsInternal] = useState(false);
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: notesData, isLoading, error, retry, refresh } = useAsyncData<readonly IAdminNote[]>(
    async () => {
      const response = await adminNotesApi.getByCustomerId(customerId);
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to load notes');
      }
      return response.data;
    },
    { retryCount: 2, retryDelay: 1000 }
  );

  const notes = notesData ?? [];
  const pinnedNotes = notes.filter((n) => n.isPinned);
  const unpinnedNotes = notes.filter((n) => !n.isPinned);

  const handleCreateNote = async () => {
    if (!newNoteContent.trim()) return;

    const result = await adminNotesApi.create(customerId, {
      content: newNoteContent,
      category: newNoteCategory,
      isInternal,
    });

    if (result.success) {
      setNewNoteContent('');
      setIsInternal(false);
      refresh();
    }
  };

  const handleDeleteNoteClick = (noteId: string) => {
    setDeleteNoteId(noteId);
  };

  const confirmDeleteNote = async () => {
    if (!deleteNoteId) return;
    setIsDeleting(true);
    try {
      const result = await adminNotesApi.delete(deleteNoteId);
      if (result.success) {
        refresh();
      }
    } finally {
      setIsDeleting(false);
      setDeleteNoteId(null);
    }
  };

  const cancelDeleteNote = () => {
    setDeleteNoteId(null);
  };

  const handleTogglePin = async (noteId: string) => {
    const result = await adminNotesApi.togglePin(noteId);
    if (result.success) {
      refresh();
    }
  };

  return (
    <div className="space-y-4" data-testid="customer-notes-tab">
      <Card>
        <CardHeader>
          <CardTitle>Add Note</CardTitle>
          <CardDescription>Create a new note for this customer</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="note-content">Content</Label>
            <Textarea
              id="note-content"
              placeholder="Add a note..."
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              rows={3}
              data-testid="note-content-input"
            />
          </div>
          <div className="flex gap-4">
            <div>
              <Label htmlFor="note-category">Category</Label>
              <select
                id="note-category"
                value={newNoteCategory}
                onChange={(e) => setNewNoteCategory(e.target.value as typeof newNoteCategory)}
                className="rounded-md border px-3 py-2"
                data-testid="note-category-select"
              >
                <option value="general">General</option>
                <option value="billing">Billing</option>
                <option value="support">Support</option>
                <option value="technical">Technical</option>
                <option value="compliance">Compliance</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="note-internal"
                checked={isInternal}
                onChange={(e) => setIsInternal(e.target.checked)}
                data-testid="note-internal-checkbox"
              />
              <Label htmlFor="note-internal">Internal only</Label>
            </div>
          </div>
          <Button onClick={handleCreateNote} data-testid="add-note-button">
            Add Note
          </Button>
        </CardContent>
      </Card>

      {isLoading && <LoadingSkeleton variant="list" count={3} />}
      {error && <ErrorDisplay error={error} title="Failed to load notes" onRetry={retry} />}

      {!isLoading && !error && (
        <div className="space-y-4">
          {pinnedNotes.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Pinned Notes</h3>
              <div className="space-y-2">
                {pinnedNotes.map((note) => (
                  <NoteCard key={note.id} note={note} onDelete={handleDeleteNoteClick} onTogglePin={handleTogglePin} />
                ))}
              </div>
            </div>
          )}

          {unpinnedNotes.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Notes</h3>
              <div className="space-y-2">
                {unpinnedNotes.map((note) => (
                  <NoteCard key={note.id} note={note} onDelete={handleDeleteNoteClick} onTogglePin={handleTogglePin} />
                ))}
              </div>
            </div>
          )}

          {notes.length === 0 && (
            <p className="text-sm text-gray-600 dark:text-gray-400" data-testid="no-notes-message">
              No notes yet. Add one above.
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteNoteId !== null}
        title="Delete Note"
        description="Are you sure you want to delete this note? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        isSubmitting={isDeleting}
        onConfirm={confirmDeleteNote}
        onCancel={cancelDeleteNote}
      />
    </div>
  );
}

interface INoteCardProps {
  readonly note: IAdminNote;
  readonly onDelete: (noteId: string) => void;
  readonly onTogglePin: (noteId: string) => void;
}

function NoteCard({ note, onDelete, onTogglePin }: INoteCardProps) {
  return (
    <Card className={note.isPinned ? 'border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/20' : ''}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline">{note.category}</Badge>
              {note.isInternal && <Badge variant="secondary">Internal</Badge>}
              {note.isPinned && <Pin className="h-4 w-4 text-yellow-600" />}
            </div>
            <p className="text-sm whitespace-pre-wrap" data-testid={`note-content-${note.id}`}>
              {note.content}
            </p>
            <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              By {note.adminName ?? 'Unknown'} • {new Date(note.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onTogglePin(note.id)}
              data-testid={`pin-note-${note.id}`}
            >
              <Pin className={`h-4 w-4 ${note.isPinned ? 'fill-current' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(note.id)}
              data-testid={`delete-note-${note.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

