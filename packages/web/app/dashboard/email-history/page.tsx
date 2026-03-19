'use client';

import { useState, useEffect, useCallback } from 'react';
import { Mail, CheckCircle, XCircle, Clock, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  emailHistoryApi,
  type IEmailHistoryItem,
  type IEmailHistoryDetail,
} from '@/lib/api/email-history';

const STATUS_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Sent', value: 'sent' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Failed', value: 'failed' },
] as const;

function StatusIcon({ status }: { status: string }) {
  if (status === 'sent' || status === 'delivered') {
    return <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />;
  }
  if (status === 'failed' || status === 'bounced') {
    return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
  }
  return <Clock className="h-4 w-4 text-yellow-500 shrink-0" />;
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'sent' || status === 'delivered'
      ? 'default'
      : status === 'failed' || status === 'bounced'
        ? 'destructive'
        : 'secondary';
  return <Badge variant={variant}>{status}</Badge>;
}

export default function EmailHistoryPage() {
  const [emails, setEmails] = useState<readonly IEmailHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Preview state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IEmailHistoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchEmails = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await emailHistoryApi.list({
        status: statusFilter || undefined,
        page,
        limit: 25,
      });
      if (res.success && res.data) {
        setEmails(res.data);
        setTotal(res.total ?? 0);
        setTotalPages(res.totalPages ?? 1);
      } else {
        setError('Failed to load email history');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load email history');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    void fetchEmails();
  }, [fetchEmails]);

  const openPreview = async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await emailHistoryApi.getDetail(id);
      if (res.success && res.data) {
        setDetail(res.data);
      }
    } catch {
      // best-effort
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mail className="h-6 w-6" />
          Email History
        </h1>
        <p className="text-muted-foreground mt-1">
          View digest emails sent to you and other recipients.
        </p>
      </div>

      {/* Status filter */}
      <div className="flex gap-2">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={statusFilter === f.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setStatusFilter(f.value);
              setPage(1);
            }}
          >
            {f.label}
          </Button>
        ))}
        <div className="ml-auto text-sm text-muted-foreground self-center">
          {total} email{total === 1 ? '' : 's'}
        </div>
      </div>

      {/* Email list */}
      {isLoading ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-red-500">{error}</p>
            <div className="text-center mt-2">
              <Button variant="outline" size="sm" onClick={() => void fetchEmails()}>
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : emails.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Mail className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No emails sent yet.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Digest emails will appear here after they are sent.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Sent Emails</CardTitle>
            <CardDescription>
              Page {page} of {totalPages}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {emails.map((email) => (
                <div
                  key={email.id}
                  className="flex items-start gap-3 rounded-md border p-3 hover:bg-muted/50 transition-colors"
                >
                  <StatusIcon status={email.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {email.subject ?? 'Digest Email'}
                      </span>
                      <StatusBadge status={email.status} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      To: {email.recipientEmail ?? 'Unknown'} &middot;{' '}
                      {new Date(email.sentAt ?? email.createdAt).toLocaleString()}
                    </div>
                    {email.failureReason && (
                      <p className="text-xs text-red-500 mt-1">{email.failureReason}</p>
                    )}
                  </div>
                  {email.hasHtmlContent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void openPreview(email.id)}
                      title="Preview email"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-4 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm self-center text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Email preview dialog */}
      <Dialog open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.subject ?? 'Email Preview'}</DialogTitle>
            <DialogDescription>
              {detail && (
                <>
                  To: {detail.recipientEmail} &middot;{' '}
                  {new Date(detail.sentAt ?? detail.createdAt).toLocaleString()} &middot;{' '}
                  <StatusBadge status={detail.status} />
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading preview...</div>
          ) : detail?.htmlContent ? (
            <iframe
              srcDoc={detail.htmlContent}
              sandbox=""
              title="Email preview"
              className="w-full border rounded"
              style={{ height: '500px' }}
            />
          ) : detail ? (
            <div className="rounded border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground mb-2">
                HTML preview not available for this email.
              </p>
              <pre className="text-sm whitespace-pre-wrap">{detail.content}</pre>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
