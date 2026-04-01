'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { Search, Settings2 } from 'lucide-react';
import type { VisibilityState } from '@/components/ui/data-table';
import { adminCustomersApi, type ICustomer } from '@/lib/api/admin/customers';

export default function AdminCustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<ICustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('admin-customers-columns');
      return saved ? (JSON.parse(saved) as VisibilityState) : {};
    } catch { return {}; }
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  useEffect(() => {
    // Hydrate initial state from URL query params on the client to avoid
    // Next.js `useSearchParams()` suspense requirement during prerender.
    const qs = new URLSearchParams(window.location.search);
    const initialSearch = qs.get('search') ?? '';
    const initialPage = Number(qs.get('page') ?? '1') || 1;
    setSearch(initialSearch);
    setPage(initialPage);
    void loadCustomers(initialPage, initialSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCustomers = useCallback(async (pageOverride?: number, searchOverride?: string) => {
    setIsLoading(true);
    try {
      const effectivePage = pageOverride ?? page;
      const effectiveSearch = searchOverride ?? search;
      const result = await adminCustomersApi.getAll({
        page: effectivePage,
        limit: 25,
        search: effectiveSearch || undefined,
      });
      setCustomers(result.data as ICustomer[]);
      setTotalPages(result.totalPages ?? 1);
    } catch (error) {
      console.error('Failed to load customers:', error);
    } finally {
      setIsLoading(false);
    }
  }, [page, search]);

  const handleSearch = () => {
    // Reset to first page and persist query in URL
    setPage(1);
    const qs = new URLSearchParams();
    if (search.trim()) qs.set('search', search.trim());
    qs.set('page', '1');
    router.push(`/admin/customers?${qs.toString()}`);
    void loadCustomers(1, search);
  };

  const getPlanBadgeColor = useCallback((plan?: string) => {
    switch (plan) {
      case 'premium':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'family':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  }, []);

  const paginationState = useMemo(() => ({ pageIndex: page - 1, pageSize: 25 }), [page]);
  const onPaginationChange = useCallback(
    (updater: (prev: { pageIndex: number; pageSize: number }) => { pageIndex: number; pageSize: number }) => {
      const next = updater(paginationState);
      const nextPage = next.pageIndex + 1;
      setPage(nextPage);
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      qs.set('page', String(nextPage));
      router.push(`/admin/customers?${qs.toString()}`);
      void loadCustomers(nextPage, search);
    },
    [search, router, loadCustomers, paginationState]
  );

  const customerColumns: ColumnDef<ICustomer, unknown>[] = useMemo(
    () => [
      {
        id: 'customer',
        header: 'Customer',
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">{row.original.email}</div>
          </div>
        ),
      },
      {
        accessorKey: 'subscription',
        header: 'Plan',
        cell: ({ row }) => (
          <Badge className={getPlanBadgeColor(row.original.subscription?.plan)}>
            {row.original.subscription?.plan ?? 'free'}
          </Badge>
        ),
      },
      {
        accessorKey: 'isSuspended',
        header: 'Status',
        cell: ({ row }) =>
          row.original.isSuspended ? (
            <Badge variant="destructive">Suspended</Badge>
          ) : (
            <Badge variant="default">Active</Badge>
          ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Created',
        cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <Button variant="outline" size="sm" asChild onClick={(e) => e.stopPropagation()}>
            <Link href={`/admin/customers/${row.original.id}`} data-testid="customer-link">
              View
            </Link>
          </Button>
        ),
      },
    ],
    [getPlanBadgeColor]
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
          <p className="text-gray-600 dark:text-gray-400">Manage all customer accounts</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                data-testid="input-search"
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearch} data-testid="button-search">Search</Button>
            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setShowColumnMenu(!showColumnMenu)}>
                <Settings2 className="h-4 w-4 mr-1" />
                Columns
              </Button>
              {showColumnMenu && (
                <div className="absolute right-0 top-full mt-1 z-10 bg-white dark:bg-gray-800 border rounded-md shadow-lg p-2 min-w-[160px]">
                  {['customer', 'subscription', 'isSuspended', 'createdAt'].map((colId) => (
                    <label key={colId} className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                      <input
                        type="checkbox"
                        checked={columnVisibility[colId] !== false}
                        onChange={() => {
                          setColumnVisibility((prev) => {
                            const next = { ...prev, [colId]: prev[colId] === false };
                            localStorage.setItem('admin-customers-columns', JSON.stringify(next));
                            return next;
                          });
                        }}
                      />
                      {colId === 'customer' ? 'Customer' : colId === 'subscription' ? 'Plan' : colId === 'isSuspended' ? 'Status' : 'Created'}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-gray-600 dark:text-gray-400">
              Loading customers...
            </div>
          ) : (
            <DataTable
              columns={customerColumns}
              data={customers}
              pagination
              manualPagination
              columnVisibility
              pageCount={totalPages}
              pageSize={25}
              state={{ pagination: paginationState, columnVisibility }}
              onPaginationChange={onPaginationChange}
              getRowProps={(row) => ({
                'data-testid': 'customer-row',
                className: 'cursor-pointer',
                onClick: () => router.push(`/admin/customers/${row.original.id}`),
              })}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}


