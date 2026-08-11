'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import {
  studentsApi,
  type ICommentResponse,
} from '@/lib/api/students';

export interface CommentThreadProps {
  readonly studentId: string;
  readonly assignmentExternalId: string;
  readonly courseExternalId: string;
  readonly onCommentAdded?: () => void;
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffM = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMs / 3600_000);
  const diffD = Math.floor(diffMs / 86400_000);
  if (diffM < 1) return 'Just now';
  if (diffM < 60) return `${diffM}m ago`;
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return '??';
}

function roleBadgeClass(role: string): string {
  switch (role) {
    case 'owner':
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
    case 'parent':
      return 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-200';
    case 'student':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export function CommentThread({
  studentId,
  assignmentExternalId,
  onCommentAdded,
}: CommentThreadProps) {
  const [comments, setComments] = useState<readonly ICommentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await studentsApi.getAssignmentComments(studentId, assignmentExternalId);
      setComments(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [studentId, assignmentExternalId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (comments.length > 0) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  const handleSend = useCallback(async () => {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      const created = await studentsApi.addAssignmentComment(
        studentId,
        assignmentExternalId,
        trimmed
      );
      if (created) {
        setComments((prev) => [...prev, created]);
        setBody('');
        onCommentAdded?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send comment');
    } finally {
      setSending(false);
    }
  }, [studentId, assignmentExternalId, body, sending, onCommentAdded]);

  const handleDelete = useCallback(
    async (commentId: string) => {
      if (deletingId) return;
      setDeletingId(commentId);
      setError(null);
      try {
        const ok = await studentsApi.deleteAssignmentComment(
          studentId,
          assignmentExternalId,
          commentId
        );
        if (ok) {
          setComments((prev) => prev.filter((c) => c.id !== commentId));
          onCommentAdded?.();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete comment');
      } finally {
        setDeletingId(null);
      }
    },
    [studentId, assignmentExternalId, deletingId, onCommentAdded]
  );

  if (loading) {
    return (
      <div className="space-y-2 py-2" data-testid="comment-thread-loading">
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="comment-thread">
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" data-testid="comment-thread-error">
          {error}
        </p>
      )}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {comments.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Start the conversation…
          </p>
        ) : (
          comments.map((c) => (
            <div
              key={c.id}
              className="flex gap-2 rounded-lg border bg-muted/20 p-3"
              data-testid="comment-thread-item"
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
                title={c.authorEmail}
              >
                {initials(c.authorName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{c.authorName}</span>
                  <span
                    className={`inline-flex rounded px-1.5 py-0.5 text-xs capitalize ${roleBadgeClass(c.authorRole)}`}
                  >
                    {c.authorRole}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {relativeTime(c.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{c.body}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(c.id)}
                disabled={deletingId === c.id}
                aria-label="Delete comment"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex flex-col gap-2 border-t pt-3">
        <textarea
          className="min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="Add a comment…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          data-testid="comment-thread-input"
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!body.trim() || sending}
          data-testid="comment-thread-send"
        >
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </div>
  );
}
