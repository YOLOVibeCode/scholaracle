'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { useAsyncData } from '@/lib/hooks';
import { ErrorDisplay, LoadingSkeleton } from '@/components/common';
import { AdminStepUpSheet } from '@/components/admin';
import { adminCommunicationsApi, type CommunicationChannel, type CommunicationStatus, type CommunicationType, type IAdminCommunicationBatchItem, type IAdminCommunicationLogItem, type IAdminCommunicationTemplate } from '@/lib/api/admin/communications';

export default function AdminCommunicationsPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [recipientEmail, setRecipientEmail] = useState('test.parent@example.com');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [templateId, setTemplateId] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const [filterEmail, setFilterEmail] = useState('');
  const [filterStatus, setFilterStatus] = useState<CommunicationStatus | ''>('');
  const [filterChannel, setFilterChannel] = useState<CommunicationChannel | ''>('');
  const [filterType, setFilterType] = useState<CommunicationType | ''>('');

  const [isCreateTemplateOpen, setIsCreateTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateContent, setTemplateContent] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  const [bulkRole, setBulkRole] = useState<'parent' | 'all'>('parent');
  const [bulkTemplateId, setBulkTemplateId] = useState<string>('');
  const [bulkSubject, setBulkSubject] = useState('');
  const [bulkContent, setBulkContent] = useState('');
  const [isBulkSending, setIsBulkSending] = useState(false);
  const [isStepUpOpen, setIsStepUpOpen] = useState(false);
  const [pendingBulk, setPendingBulk] = useState<null | { criteria: { role?: string }; subject?: string; content?: string; templateId?: string }>(null);

  const listQuery = useMemo(
    () => ({
      recipientEmail: filterEmail.trim() || undefined,
      status: filterStatus || undefined,
      channel: filterChannel || undefined,
      type: filterType || undefined,
      limit: 25,
    }),
    [filterChannel, filterEmail, filterStatus, filterType]
  );

  const { data: logsData, isLoading, error, retry, refresh } = useAsyncData<readonly IAdminCommunicationLogItem[]>(
    async () => {
      const res = await adminCommunicationsApi.listLogs(listQuery);
      if (!res.success || !res.data) throw new Error(res.error ?? 'Failed to load communication logs');
      return res.data;
    },
    { retryCount: 1, retryDelay: 500 }
  );

  const [stableLogs, setStableLogs] = useState<readonly IAdminCommunicationLogItem[]>([]);
  useEffect(() => {
    if (!isLoading && !error && logsData) setStableLogs(logsData);
  }, [isLoading, error, logsData]);

  // Reset stable view when filters change, so we don't show unrelated stale rows.
  useEffect(() => {
    setStableLogs([]);
  }, [listQuery.recipientEmail, listQuery.status, listQuery.channel, listQuery.type]);

  const logs = logsData ?? stableLogs;
  const showLogsSkeleton = isLoading && stableLogs.length === 0;

  const { data: analyticsData } = useAsyncData(async () => {
    const res = await adminCommunicationsApi.getAnalytics(30);
    if (!res.success || !res.data) throw new Error(res.error ?? 'Failed to load analytics');
    return res.data;
  });

  const { data: templatesData, refresh: refreshTemplates } = useAsyncData<readonly IAdminCommunicationTemplate[]>(
    async () => {
      const res = await adminCommunicationsApi.listTemplates();
      if (!res.success || !res.data) throw new Error(res.error ?? 'Failed to load templates');
      return res.data;
    },
    { retryCount: 1, retryDelay: 500 }
  );

  const templates = templatesData ?? [];
  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;
  const isUsingTemplate = !!selectedTemplate;

  const { data: batchesData, refresh: refreshBatches } = useAsyncData<readonly IAdminCommunicationBatchItem[]>(
    async () => {
      const res = await adminCommunicationsApi.listBatches();
      if (!res.success || !res.data) throw new Error(res.error ?? 'Failed to load batches');
      return res.data;
    },
    { retryCount: 1, retryDelay: 500 }
  );

  const batches = batchesData ?? [];

  const openCreateTemplate = () => {
    setToast(null);
    setTemplateName('');
    setTemplateSubject('');
    setTemplateContent('');
    setIsCreateTemplateOpen(true);
  };

  const submitCreateTemplate = async () => {
    setToast(null);
    if (!templateName.trim() || !templateSubject.trim() || !templateContent.trim()) {
      setToast('Template name, subject, and content are required.');
      return;
    }
    setIsSavingTemplate(true);
    try {
      const res = await adminCommunicationsApi.createTemplate({
        name: templateName.trim(),
        channel: 'email',
        type: 'support',
        subject: templateSubject.trim(),
        content: templateContent.trim(),
      });
      if (!res.success) {
        setToast(res.error ?? 'Failed to create template');
        return;
      }
      setToast('Template created successfully.');
      setIsCreateTemplateOpen(false);
      refreshTemplates();
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleSend = async () => {
    setToast(null);
    if (!recipientEmail.trim()) {
      setToast('Recipient email is required.');
      return;
    }
    if (!templateId && !content.trim()) {
      setToast('Content is required (or choose a template).');
      return;
    }
    setIsSending(true);
    try {
      const res = await adminCommunicationsApi.sendEmail({
        recipientEmail: recipientEmail.trim(),
        subject: templateId ? undefined : (subject.trim() || '(no subject)'),
        content: templateId ? undefined : content.trim(),
        templateId: templateId || undefined,
      });
      if (!res.success) {
        setToast(res.error ?? 'Failed to send');
        return;
      }
      setToast('Communication sent successfully.');
      if (!templateId) {
        setSubject('');
        setContent('');
      }
      refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setIsSending(false);
    }
  };

  const handleBulkSend = async (stepUpToken?: string) => {
    setToast(null);

    const payload = pendingBulk ?? {
      criteria: { role: bulkRole === 'all' ? undefined : bulkRole },
      templateId: bulkTemplateId || undefined,
      subject: bulkTemplateId ? undefined : (bulkSubject.trim() || '(no subject)'),
      content: bulkTemplateId ? undefined : bulkContent.trim(),
    };

    if (!payload.criteria.role && bulkRole !== 'all') {
      setToast('Select a segment.');
      return;
    }
    if (!payload.templateId && !payload.content) {
      setToast('Content is required (or choose a template).');
      return;
    }

    setIsBulkSending(true);
    try {
      const res = await adminCommunicationsApi.bulkSend(payload, stepUpToken);
      if (!res.success) {
        if (res.code === 'MFA_STEP_UP_REQUIRED') {
          setPendingBulk(payload);
          setIsStepUpOpen(true);
          setToast('MFA re-verification required for bulk send.');
          return;
        }
        setToast(res.error ?? 'Bulk send failed');
        return;
      }
      setToast('Bulk send created.');
      setPendingBulk(null);
      setBulkSubject('');
      setBulkContent('');
      refreshBatches();
      refresh();
    } finally {
      setIsBulkSending(false);
    }
  };

  const communicationLogColumns: ColumnDef<IAdminCommunicationLogItem, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'createdAt',
        header: 'Time',
        cell: ({ row }) => (
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {new Date(row.original.createdAt).toLocaleString()}
          </span>
        ),
      },
      { accessorKey: 'recipientEmail', header: 'Recipient', cell: ({ row }) => <span className="text-xs text-gray-600 dark:text-gray-400">{row.original.recipientEmail ?? ''}</span> },
      { accessorKey: 'subject', header: 'Subject', cell: ({ row }) => <span className="text-sm">{row.original.subject ?? ''}</span> },
      { accessorKey: 'templateName', header: 'Template', cell: ({ row }) => <span className="text-xs text-gray-600 dark:text-gray-400">{row.original.templateName ?? ''}</span> },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={row.original.status === 'failed' ? 'destructive' : 'secondary'}>
            {row.original.status}
          </Badge>
        ),
      },
      { accessorKey: 'channel', header: 'Channel', cell: ({ row }) => <span className="text-xs text-gray-600 dark:text-gray-400">{row.original.channel}</span> },
    ],
    []
  );

  return (
    <div className="space-y-4" data-testid="admin-communications-page">
      <h1 className="text-3xl font-bold tracking-tight">Communications</h1>
      <p className="text-gray-600 dark:text-gray-400">Send messages to customers and review delivery history.</p>

      {toast && (
        <div role="alert" data-testid="toast" className="rounded-md border p-3 text-sm">
          {toast}
        </div>
      )}

      <Card data-testid="comms-analytics">
        <CardHeader>
          <CardTitle>Delivery Analytics (30d)</CardTitle>
          <CardDescription>High-level health of message delivery.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border p-3">
            <div className="text-xs text-gray-600 dark:text-gray-400">Total</div>
            <div className="text-2xl font-semibold" data-testid="comms-analytics-total">
              {analyticsData?.total ?? 0}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-gray-600 dark:text-gray-400">Delivery rate</div>
            <div className="text-2xl font-semibold" data-testid="comms-analytics-delivery">
              {Math.round(((analyticsData?.deliveryRate ?? 0) * 100) * 10) / 10}%
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-gray-600 dark:text-gray-400">Open rate</div>
            <div className="text-2xl font-semibold" data-testid="comms-analytics-open">
              {Math.round(((analyticsData?.openRate ?? 0) * 100) * 10) / 10}%
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compose</CardTitle>
          <CardDescription>Send an email to a customer account (logs every send).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <div className="text-sm font-medium">Template (optional)</div>
            <div className="flex gap-2">
              <select
                value={templateId}
                onChange={(e) => {
                  const id = e.target.value;
                  setTemplateId(id);
                  const t = templates.find((x) => x.id === id);
                  if (t) {
                    setSubject(t.subject);
                    setContent(t.content);
                  }
                }}
                data-testid="template-select"
                className="w-full rounded-md border px-3 py-2 text-sm"
                disabled={isSending}
              >
                <option value="">(none)</option>
                {templates.filter((t) => t.isActive).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                onClick={() => {
                  setTemplateId('');
                  setSubject('');
                  setContent('');
                }}
                disabled={isSending || !templateId}
                data-testid="template-clear"
              >
                Clear
              </Button>
            </div>
            {isUsingTemplate && (
              <div className="text-xs text-gray-600 dark:text-gray-400" data-testid="template-hint">
                Using template: <span className="font-medium">{selectedTemplate?.name}</span>
              </div>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Recipient Email</div>
              <Input
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                data-testid="input-recipient"
                placeholder="customer@example.com"
                disabled={isSending}
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Subject</div>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                data-testid="input-subject"
                placeholder="Subject"
                disabled={isSending || isUsingTemplate}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Content</div>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              data-testid="input-content"
              placeholder="Write your message…"
              disabled={isSending || isUsingTemplate}
              className="min-h-[120px]"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSend} disabled={isSending} data-testid="button-send-communication">
              {isSending ? 'Sending…' : 'Send'}
            </Button>
            <Button variant="outline" onClick={() => refresh()} disabled={isSending} data-testid="button-refresh-logs">
              Refresh logs
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="templates-card">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Templates</CardTitle>
            <CardDescription>Reusable messages for common scenarios.</CardDescription>
          </div>
          <Button onClick={openCreateTemplate} data-testid="button-template-add">
            Add Template
          </Button>
        </CardHeader>
        <CardContent>
          <Table data-testid="templates-table">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id} data-testid="template-row">
                  <TableCell className="text-sm">{t.name}</TableCell>
                  <TableCell className="text-xs text-gray-600 dark:text-gray-400">{t.channel}</TableCell>
                  <TableCell className="text-xs text-gray-600 dark:text-gray-400">{t.isActive ? 'active' : 'inactive'}</TableCell>
                </TableRow>
              ))}
              {templates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-sm text-gray-600 dark:text-gray-400">
                    No templates yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {isCreateTemplateOpen && (
        <Card data-testid="template-create-panel">
          <CardHeader>
            <CardTitle>Create Template</CardTitle>
            <CardDescription>Email templates for support communications.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              data-testid="template-name"
              placeholder="Template name"
              disabled={isSavingTemplate}
            />
            <Input
              value={templateSubject}
              onChange={(e) => setTemplateSubject(e.target.value)}
              data-testid="template-subject"
              placeholder="Subject"
              disabled={isSavingTemplate}
            />
            <Textarea
              value={templateContent}
              onChange={(e) => setTemplateContent(e.target.value)}
              data-testid="template-content"
              placeholder="Template content…"
              disabled={isSavingTemplate}
              className="min-h-[120px]"
            />
            <div className="flex gap-2">
              <Button onClick={submitCreateTemplate} disabled={isSavingTemplate} data-testid="template-save">
                Save
              </Button>
              <Button variant="outline" onClick={() => setIsCreateTemplateOpen(false)} disabled={isSavingTemplate}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card data-testid="bulk-send-card">
        <CardHeader>
          <CardTitle>Bulk Send</CardTitle>
          <CardDescription>Send a message to a segment.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Segment</div>
              <select
                value={bulkRole}
                onChange={(e) => setBulkRole(e.target.value as 'parent' | 'all')}
                data-testid="bulk-segment"
                className="w-full rounded-md border px-3 py-2 text-sm"
                disabled={isBulkSending}
              >
                <option value="parent">Parents</option>
                <option value="all">All users</option>
              </select>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Template (optional)</div>
              <select
                value={bulkTemplateId}
                onChange={(e) => {
                  const id = e.target.value;
                  setBulkTemplateId(id);
                  const t = templates.find((x) => x.id === id);
                  if (t) {
                    setBulkSubject(t.subject);
                    setBulkContent(t.content);
                  }
                }}
                data-testid="bulk-template"
                className="w-full rounded-md border px-3 py-2 text-sm"
                disabled={isBulkSending}
              >
                <option value="">(none)</option>
                {templates.filter((t) => t.isActive).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Subject</div>
              <Input
                value={bulkSubject}
                onChange={(e) => setBulkSubject(e.target.value)}
                data-testid="bulk-subject"
                placeholder="Subject"
                disabled={isBulkSending || !!bulkTemplateId}
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Content</div>
              <Textarea
                value={bulkContent}
                onChange={(e) => setBulkContent(e.target.value)}
                data-testid="bulk-content"
                placeholder="Write your message…"
                disabled={isBulkSending || !!bulkTemplateId}
                className="min-h-[90px]"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => void handleBulkSend()} disabled={isBulkSending} data-testid="button-bulk-send">
              {isBulkSending ? 'Creating…' : 'Create Bulk Send'}
            </Button>
            <Button variant="outline" onClick={() => refreshBatches()} disabled={isBulkSending} data-testid="bulk-refresh">
              Refresh batches
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="batches-card">
        <CardHeader>
          <CardTitle>Batches</CardTitle>
          <CardDescription>Recent bulk sends.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table data-testid="batches-table">
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Recipients</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.id} data-testid="batch-row">
                  <TableCell className="text-xs text-gray-600 dark:text-gray-400">{new Date(b.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="text-xs text-gray-600 dark:text-gray-400">{b.status}</TableCell>
                  <TableCell className="text-sm">{b.subject}</TableCell>
                  <TableCell className="text-xs text-gray-600 dark:text-gray-400">
                    {b.sentCount}/{b.totalRecipients}
                  </TableCell>
                </TableRow>
              ))}
              {batches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-gray-600 dark:text-gray-400">
                    No batches yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Communication Logs</CardTitle>
          <CardDescription>Recent sends (most recent first).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-4">
            <Input
              value={filterEmail}
              onChange={(e) => setFilterEmail(e.target.value)}
              placeholder="Filter by recipient email"
              data-testid="communication-filter-email"
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              data-testid="communication-filter-status"
            >
              <option value="">Status (all)</option>
              <option value="pending">pending</option>
              <option value="sent">sent</option>
              <option value="delivered">delivered</option>
              <option value="opened">opened</option>
              <option value="clicked">clicked</option>
              <option value="failed">failed</option>
              <option value="bounced">bounced</option>
            </select>
            <select
              value={filterChannel}
              onChange={(e) => setFilterChannel(e.target.value as any)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              data-testid="communication-filter-channel"
            >
              <option value="">Channel (all)</option>
              <option value="email">email</option>
              <option value="sms">sms</option>
              <option value="push">push</option>
              <option value="in_app">in_app</option>
              <option value="phone">phone</option>
              <option value="support_ticket">support_ticket</option>
            </select>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              data-testid="communication-filter-type"
            >
              <option value="">Type (all)</option>
              <option value="notification">notification</option>
              <option value="marketing">marketing</option>
              <option value="support">support</option>
              <option value="billing">billing</option>
              <option value="system">system</option>
              <option value="alert">alert</option>
            </select>
          </div>

          {showLogsSkeleton && <LoadingSkeleton variant="list" count={6} />}
          {error && stableLogs.length === 0 && <ErrorDisplay error={error} title="Failed to load communication logs" onRetry={retry} />}

          {(stableLogs.length > 0 || (!showLogsSkeleton && !error)) && (
            <div data-testid="communications-table">
              <DataTable
                columns={communicationLogColumns}
                data={logs}
                pagination
                pageSize={25}
                getRowProps={() => ({ 'data-testid': 'communication-log-row' })}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <AdminStepUpSheet
        open={isStepUpOpen}
        onOpenChange={(open) => {
          setIsStepUpOpen(open);
          if (!open) setPendingBulk(null);
        }}
        onVerified={(token) => void handleBulkSend(token)}
        title="Re-verify MFA to bulk send"
        description="Bulk sends require step-up authentication."
      />
    </div>
  );
}


