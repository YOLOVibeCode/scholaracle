'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  adminScrapersApi,
  type IScrapersStats,
  type IScraperCacheListItem,
  type IScraperCacheDetail,
  type IScraperJobListItem,
  type IScraperReportItem,
  type IScraperTestResult,
} from '@/lib/api/admin/scrapers';
import { Search, Trash2, Eye, Play, ChevronDown, ChevronRight } from 'lucide-react';

type TabId = 'caches' | 'jobs' | 'reports' | 'test';

export default function AdminScrapersPage() {
  const [stats, setStats] = useState<IScrapersStats | null>(null);
  const [tab, setTab] = useState<TabId>('caches');
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Caches
  const [caches, setCaches] = useState<IScraperCacheListItem[]>([]);
  const [cachePage, setCachePage] = useState(1);
  const [cacheTotalPages, setCacheTotalPages] = useState(1);
  const [cacheSearchPlatform, setCacheSearchPlatform] = useState('');
  const [cacheSearchUrl, setCacheSearchUrl] = useState('');
  const [cacheDetail, setCacheDetail] = useState<IScraperCacheDetail | null>(null);
  const [cacheDetailOpen, setCacheDetailOpen] = useState(false);
  const [cacheDetailId, setCacheDetailId] = useState<string | null>(null);

  // Jobs
  const [jobs, setJobs] = useState<IScraperJobListItem[]>([]);
  const [jobPage, setJobPage] = useState(1);
  const [jobTotalPages, setJobTotalPages] = useState(1);
  const [jobStatusFilter, setJobStatusFilter] = useState('');
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [jobDetail, setJobDetail] = useState<Record<string, unknown> | null>(null);

  // Reports
  const [reports, setReports] = useState<IScraperReportItem[]>([]);
  const [reportPage, setReportPage] = useState(1);
  const [reportTotalPages, setReportTotalPages] = useState(1);
  const [reportCacheKeyFilter, setReportCacheKeyFilter] = useState('');

  // Test
  const [testLoginUrl, setTestLoginUrl] = useState('');
  const [testUsername, setTestUsername] = useState('');
  const [testPassword, setTestPassword] = useState('');
  const [testResult, setTestResult] = useState<IScraperTestResult | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const res = await adminScrapersApi.getStats();
      if (res.success && res.data) setStats(res.data);
    } catch (e) {
      console.error('Failed to load stats:', e);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const loadCaches = useCallback(async () => {
    setLoading('caches');
    setError(null);
    try {
      const res = await adminScrapersApi.getCaches({
        page: cachePage,
        limit: 25,
        platformName: cacheSearchPlatform.trim() || undefined,
        loginUrl: cacheSearchUrl.trim() || undefined,
        sort: '-createdAt',
      });
      if (res.success && res.data) {
        setCaches([...res.data]);
        setCacheTotalPages(res.totalPages ?? 1);
      } else if (!res.success && res.error) setError(res.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load caches');
    } finally {
      setLoading(null);
    }
  }, [cachePage, cacheSearchPlatform, cacheSearchUrl]);

  const loadJobs = useCallback(async () => {
    setLoading('jobs');
    setError(null);
    try {
      const res = await adminScrapersApi.getJobs({
        page: jobPage,
        limit: 25,
        status: jobStatusFilter.trim() || undefined,
      });
      if (res.success && res.data) {
        setJobs([...res.data]);
        setJobTotalPages(res.totalPages ?? 1);
      } else if (!res.success && res.error) setError(res.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load jobs');
    } finally {
      setLoading(null);
    }
  }, [jobPage, jobStatusFilter]);

  const loadReports = useCallback(async () => {
    setLoading('reports');
    setError(null);
    try {
      const res = await adminScrapersApi.getReports({
        page: reportPage,
        limit: 25,
        cacheKey: reportCacheKeyFilter.trim() || undefined,
      });
      if (res.success && res.data) {
        setReports([...res.data]);
        setReportTotalPages(res.totalPages ?? 1);
      } else if (!res.success && res.error) setError(res.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports');
    } finally {
      setLoading(null);
    }
  }, [reportPage, reportCacheKeyFilter]);

  useEffect(() => {
    if (tab === 'caches') void loadCaches();
  }, [tab, loadCaches]);

  useEffect(() => {
    if (tab === 'jobs') void loadJobs();
  }, [tab, loadJobs]);

  useEffect(() => {
    if (tab === 'reports') void loadReports();
  }, [tab, loadReports]);

  const openCacheDetail = useCallback(async (id: string) => {
    setCacheDetailId(id);
    setCacheDetailOpen(true);
    try {
      const res = await adminScrapersApi.getCacheById(id);
      if (res.success && res.data) setCacheDetail(res.data);
      else setCacheDetail(null);
    } catch {
      setCacheDetail(null);
    }
  }, []);

  const purgeCache = useCallback(async (id: string) => {
    if (!confirm('Purge this cached scraper? It will be regenerated on next request.')) return;
    try {
      await adminScrapersApi.deleteCache(id);
      setCacheDetailOpen(false);
      setCacheDetailId(null);
      setCacheDetail(null);
      void loadCaches();
      void loadStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }, [loadCaches, loadStats]);

  const expandJob = async (jobId: string) => {
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
      setJobDetail(null);
      return;
    }
    setExpandedJobId(jobId);
    try {
      const res = await adminScrapersApi.getJobById(jobId);
      if (res.success && res.data) setJobDetail(res.data as unknown as Record<string, unknown>);
      else setJobDetail(null);
    } catch {
      setJobDetail(null);
    }
  };

  const runTest = async () => {
    if (!testLoginUrl.trim()) {
      setError('Login URL is required');
      return;
    }
    setTestLoading(true);
    setError(null);
    setTestResult(null);
    try {
      const res = await adminScrapersApi.testScraper({
        loginUrl: testLoginUrl.trim(),
        username: testUsername.trim() || undefined,
        password: testPassword || undefined,
      });
      if (res.success && res.data) setTestResult(res.data);
      else if (!res.success && res.error) setError(res.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setTestLoading(false);
    }
  };

  const tabButtons: { id: TabId; label: string }[] = [
    { id: 'caches', label: 'Caches' },
    { id: 'jobs', label: 'Jobs' },
    { id: 'reports', label: 'Failure Reports' },
    { id: 'test', label: 'Test' },
  ];

  const jobStatusBadge = (status: string) => {
    const variant = status === 'ready' ? 'default' : status === 'failed' ? 'destructive' : 'secondary';
    return <Badge variant={variant}>{status}</Badge>;
  };

  const failureCountByCacheKey = reports.reduce<Record<string, number>>((acc, r) => {
    acc[r.cacheKey] = (acc[r.cacheKey] ?? 0) + 1;
    return acc;
  }, {});

  const cachePaginationState = useMemo(() => ({ pageIndex: cachePage - 1, pageSize: 25 }), [cachePage]);
  const onCachePaginationChange = useCallback(
    (updater: (prev: { pageIndex: number; pageSize: number }) => { pageIndex: number; pageSize: number }) => {
      const next = updater(cachePaginationState);
      setCachePage(next.pageIndex + 1);
    },
    [cachePaginationState]
  );

  const cacheColumns: ColumnDef<IScraperCacheListItem, unknown>[] = useMemo(
    () => [
      { accessorKey: 'platformName', header: 'Platform', cell: ({ row }) => <span className="font-medium">{row.original.platformName}</span> },
      { accessorKey: 'loginUrl', header: 'Login URL', cell: ({ row }) => <span className="max-w-[200px] truncate block" title={row.original.loginUrl}>{row.original.loginUrl}</span> },
      { accessorKey: 'createdAt', header: 'Created', cell: ({ row }) => <span className="text-muted-foreground">{row.original.createdAt ? new Date(row.original.createdAt).toLocaleString() : '—'}</span> },
      { accessorKey: 'generatedByEmail', header: 'Generated By', cell: ({ row }) => row.original.generatedByEmail ?? row.original.generatedBy ?? '—' },
      { accessorKey: 'scraperCodeLength', header: 'Code size', cell: ({ row }) => `${row.original.scraperCodeLength + row.original.transformerCodeLength} chars` },
      {
        id: 'actions',
        header: () => <span className="w-[120px] block">Actions</span>,
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => openCacheDetail(row.original.id)} data-testid={`cache-view-${row.original.id}`}>
              <Eye className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => purgeCache(row.original.id)} data-testid={`cache-purge-${row.original.id}`}>
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        ),
      },
    ],
    [openCacheDetail, purgeCache]
  );

  const reportPaginationState = useMemo(() => ({ pageIndex: reportPage - 1, pageSize: 25 }), [reportPage]);
  const onReportPaginationChange = useCallback(
    (updater: (prev: { pageIndex: number; pageSize: number }) => { pageIndex: number; pageSize: number }) => {
      const next = updater(reportPaginationState);
      setReportPage(next.pageIndex + 1);
    },
    [reportPaginationState]
  );

  const reportColumns: ColumnDef<IScraperReportItem, unknown>[] = useMemo(
    () => [
      { accessorKey: 'platformName', header: 'Platform', cell: ({ row }) => row.original.platformName ?? '—' },
      { accessorKey: 'cacheKey', header: 'Cache key', cell: ({ row }) => <span className="max-w-[120px] truncate font-mono text-xs block" title={row.original.cacheKey}>{row.original.cacheKey}</span> },
      {
        id: 'failures',
        header: 'Failures',
        cell: ({ row }) => {
          const count = failureCountByCacheKey[row.original.cacheKey] ?? 1;
          return count >= 3 ? <Badge variant="destructive">{count} failures</Badge> : count;
        },
      },
      { accessorKey: 'error', header: 'Error', cell: ({ row }) => <span className="max-w-[300px] truncate text-sm block" title={row.original.error ?? undefined}>{row.original.error ?? '—'}</span> },
      { accessorKey: 'reportedAt', header: 'Reported at', cell: ({ row }) => <span className="text-muted-foreground">{row.original.reportedAt ? new Date(row.original.reportedAt).toLocaleString() : '—'}</span> },
    ],
    [failureCountByCacheKey]
  );

  return (
    <div className="space-y-6" data-testid="admin-scrapers-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Scrapers</h1>
        <p className="text-muted-foreground">Generated scraper caches, jobs, failure reports, and connection test</p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cached scrapers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stats-total-caches">
              {stats?.totalCaches ?? '—'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stats-active-jobs">
              {stats?.activeJobs ?? '—'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Failures (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stats-failures-24h">
              {stats?.failures24h ?? '—'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unique platforms</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stats-unique-platforms">
              {stats?.uniquePlatforms ?? '—'}
            </div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          data-testid="scrapers-error"
        >
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {tabButtons.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            data-testid={`tab-${id}`}
            onClick={() => setTab(id)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Caches tab */}
      {tab === 'caches' && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Platform name"
                  value={cacheSearchPlatform}
                  onChange={(e) => setCacheSearchPlatform(e.target.value)}
                  className="max-w-[200px]"
                />
                <Input
                  placeholder="Login URL"
                  value={cacheSearchUrl}
                  onChange={(e) => setCacheSearchUrl(e.target.value)}
                  className="max-w-[280px]"
                />
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => void loadCaches()}
                  disabled={loading === 'caches'}
                  data-testid="caches-search"
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading === 'caches' ? (
              <div className="py-8 text-center text-muted-foreground">Loading caches…</div>
            ) : (
              <DataTable
                columns={cacheColumns}
                data={caches}
                pagination
                manualPagination
                pageCount={cacheTotalPages}
                pageSize={25}
                state={{ pagination: cachePaginationState }}
                onPaginationChange={onCachePaginationChange}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Jobs tab */}
      {tab === 'jobs' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="job-status">Status</Label>
                <select
                  id="job-status"
                  value={jobStatusFilter}
                  onChange={(e) => setJobStatusFilter(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">All</option>
                  <option value="queued">Queued</option>
                  <option value="connecting">Connecting</option>
                  <option value="crawling">Crawling</option>
                  <option value="generating">Generating</option>
                  <option value="ready">Ready</option>
                  <option value="failed">Failed</option>
                </select>
                <Button variant="secondary" size="sm" onClick={() => void loadJobs()} disabled={loading === 'jobs'}>
                  Apply
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading === 'jobs' ? (
              <div className="py-8 text-center text-muted-foreground">Loading jobs…</div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Platform</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((j) => (
                      <React.Fragment key={j.jobId}>
                        <TableRow
                          key={j.jobId}
                          className="cursor-pointer"
                          onClick={() => expandJob(j.jobId)}
                          data-testid={`job-row-${j.jobId}`}
                        >
                          <TableCell>
                            {expandedJobId === j.jobId ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </TableCell>
                          <TableCell>{j.platformName}</TableCell>
                          <TableCell className="max-w-[200px] truncate" title={j.loginUrl}>
                            {j.loginUrl}
                          </TableCell>
                          <TableCell>{jobStatusBadge(j.status)}</TableCell>
                          <TableCell className="text-muted-foreground">{j.userId}</TableCell>
                          <TableCell>
                            {j.createdAt ? new Date(j.createdAt).toLocaleString() : '—'}
                          </TableCell>
                        </TableRow>
                        {expandedJobId === j.jobId && jobDetail && (
                          <TableRow>
                            <TableCell colSpan={6} className="bg-muted/30">
                              <div className="space-y-2 p-4 text-sm">
                                <div><strong>Steps</strong></div>
                                <pre className="max-h-[200px] overflow-auto rounded border p-2 text-xs">
                                  {JSON.stringify((jobDetail as { steps?: unknown }).steps ?? [], null, 2)}
                                </pre>
                                {(jobDetail as { error?: string }).error && (
                                  <div className="text-red-600">
                                    Error: {(jobDetail as { error: string }).error}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
                {jobTotalPages > 1 && (
                  <div className="mt-4 flex justify-between">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={jobPage <= 1}
                      onClick={() => setJobPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {jobPage} of {jobTotalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={jobPage >= jobTotalPages}
                      onClick={() => setJobPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Failure Reports tab */}
      {tab === 'reports' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <Input
                placeholder="Filter by cache key"
                value={reportCacheKeyFilter}
                onChange={(e) => setReportCacheKeyFilter(e.target.value)}
                className="max-w-[300px]"
              />
              <Button variant="secondary" size="sm" onClick={() => void loadReports()} disabled={loading === 'reports'}>
                Apply
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading === 'reports' ? (
              <div className="py-8 text-center text-muted-foreground">Loading reports…</div>
            ) : (
              <DataTable
                columns={reportColumns}
                data={reports}
                pagination
                manualPagination
                pageCount={reportTotalPages}
                pageSize={25}
                state={{ pagination: reportPaginationState }}
                onPaginationChange={onReportPaginationChange}
                getRowProps={(row) => {
                  const count = failureCountByCacheKey[row.original.cacheKey] ?? 1;
                  const highlight = count >= 3;
                  return {
                    'data-testid': `report-row-${row.original.id}`,
                    className: highlight ? 'bg-red-50 dark:bg-red-950/30' : undefined,
                  };
                }}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Test tab */}
      {tab === 'test' && (
        <Card>
          <CardHeader>
            <CardTitle>Test connection</CardTitle>
            <CardDescription>
              Run connect + crawl + auth check for a login URL. No actual login is performed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="test-login-url">Login URL *</Label>
                <Input
                  id="test-login-url"
                  type="url"
                  placeholder="https://..."
                  value={testLoginUrl}
                  onChange={(e) => setTestLoginUrl(e.target.value)}
                  data-testid="test-login-url"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="test-username">Username (optional)</Label>
                <Input
                  id="test-username"
                  value={testUsername}
                  onChange={(e) => setTestUsername(e.target.value)}
                  data-testid="test-username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="test-password">Password (optional)</Label>
                <Input
                  id="test-password"
                  type="password"
                  value={testPassword}
                  onChange={(e) => setTestPassword(e.target.value)}
                  data-testid="test-password"
                />
              </div>
            </div>
            <Button
              onClick={() => runTest()}
              disabled={testLoading || !testLoginUrl.trim()}
              data-testid="test-connection-btn"
            >
              {testLoading ? 'Testing…' : <><Play className="mr-2 h-4 w-4" /> Test connection</>}
            </Button>

            {testResult && (
              <div className="space-y-4 rounded-lg border p-4" data-testid="test-result">
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <strong>Connect:</strong>
                    {testResult.connect.ok ? (
                      <Badge variant="default">OK</Badge>
                    ) : (
                      <Badge variant="destructive">{testResult.connect.error ?? 'Failed'}</Badge>
                    )}
                    {testResult.connect.responseTimeMs != null && (
                      <span className="text-muted-foreground">{testResult.connect.responseTimeMs} ms</span>
                    )}
                  </div>
                  {testResult.crawl && (
                    <div className="flex items-center gap-2">
                      <strong>Crawl:</strong>
                      {testResult.crawl.ok ? (
                        <Badge variant="default">OK</Badge>
                      ) : (
                        <Badge variant="destructive">{testResult.crawl.error ?? 'Failed'}</Badge>
                      )}
                      {testResult.crawl.title && (
                        <span className="text-muted-foreground">Title: {testResult.crawl.title}</span>
                      )}
                    </div>
                  )}
                  {testResult.authenticateCheck && (
                    <div className="flex items-center gap-2">
                      <strong>Auth check:</strong>
                      {testResult.authenticateCheck.ok ? (
                        <Badge variant="default">OK</Badge>
                      ) : (
                        <Badge variant="destructive">{testResult.authenticateCheck.error ?? 'Failed'}</Badge>
                      )}
                    </div>
                  )}
                </div>
                {testResult.message && (
                  <p className="text-sm text-muted-foreground">{testResult.message}</p>
                )}
                {testResult.crawl?.loginForm && (
                  <pre className="max-h-[200px] overflow-auto rounded border bg-muted/30 p-2 text-xs">
                    {JSON.stringify(testResult.crawl.loginForm, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cache detail sheet */}
      <Sheet open={cacheDetailOpen} onOpenChange={setCacheDetailOpen}>
        <SheetContent side="right" className="w-full max-w-2xl overflow-y-auto" data-testid="cache-detail-sheet">
          <SheetHeader>
            <SheetTitle>Cache detail</SheetTitle>
            <SheetDescription>
              {cacheDetail ? `${cacheDetail.platformName} – ${cacheDetail.loginUrl}` : 'Loading…'}
            </SheetDescription>
          </SheetHeader>
          {cacheDetail && (
            <div className="space-y-4 pt-4">
              <div className="grid gap-2 text-sm">
                <div><strong>Platform:</strong> {cacheDetail.platformName}</div>
                <div><strong>Login URL:</strong> {cacheDetail.loginUrl}</div>
                <div><strong>Created:</strong> {cacheDetail.createdAt ? new Date(cacheDetail.createdAt).toLocaleString() : '—'}</div>
              </div>
              <div>
                <div className="mb-1 text-sm font-medium">Scraper code</div>
                <pre className="max-h-[40vh] overflow-auto rounded border bg-muted/30 p-2 text-xs">
                  {cacheDetail.scraperCode}
                </pre>
              </div>
              <div>
                <div className="mb-1 text-sm font-medium">Transformer code</div>
                <pre className="max-h-[40vh] overflow-auto rounded border bg-muted/30 p-2 text-xs">
                  {cacheDetail.transformerCode}
                </pre>
              </div>
              {cacheDetail.metadata && (
                <div>
                  <div className="mb-1 text-sm font-medium">Metadata</div>
                  <pre className="max-h-[20vh] overflow-auto rounded border bg-muted/30 p-2 text-xs">
                    {typeof cacheDetail.metadata === 'string'
                      ? cacheDetail.metadata
                      : JSON.stringify(cacheDetail.metadata, null, 2)}
                  </pre>
                </div>
              )}
              {cacheDetailId && (
                <Button variant="destructive" onClick={() => purgeCache(cacheDetailId)}>
                  Purge cache
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
