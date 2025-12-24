'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { adminCustomersApi, type ICustomer } from '@/lib/api/admin/customers';

export default function AdminCustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<ICustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

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

  const loadCustomers = async (pageOverride?: number, searchOverride?: string) => {
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
  };

  const handleSearch = () => {
    // Reset to first page and persist query in URL
    setPage(1);
    const qs = new URLSearchParams();
    if (search.trim()) qs.set('search', search.trim());
    qs.set('page', '1');
    router.push(`/admin/customers?${qs.toString()}`);
    void loadCustomers(1, search);
  };

  const getPlanBadgeColor = (plan?: string) => {
    switch (plan) {
      case 'premium':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'family':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

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
                data-testid="search-input"
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearch} data-testid="search-button">Search</Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-gray-600 dark:text-gray-400">
              Loading customers...
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow
                      key={customer.id}
                      data-testid="customer-row"
                      className="cursor-pointer"
                      onClick={() => router.push(`/admin/customers/${customer.id}`)}
                    >
                      <TableCell>
                        <div>
                          <div className="font-medium">{customer.name}</div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {customer.email}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getPlanBadgeColor(customer.subscription?.plan)}>
                          {customer.subscription?.plan ?? 'free'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {customer.isSuspended ? (
                          <Badge variant="destructive">Suspended</Badge>
                        ) : (
                          <Badge variant="default">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {new Date(customer.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link href={`/admin/customers/${customer.id}`} data-testid="customer-link">
                            View
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Page {page} of {totalPages}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const nextPage = page - 1;
                      setPage(nextPage);
                      const qs = new URLSearchParams();
                      if (search.trim()) qs.set('search', search.trim());
                      qs.set('page', String(nextPage));
                      router.push(`/admin/customers?${qs.toString()}`);
                      void loadCustomers(nextPage, search);
                    }}
                    disabled={page === 1}
                    data-testid="previous-page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="next-page"
                    onClick={() => {
                      const nextPage = page + 1;
                      setPage(nextPage);
                      const qs = new URLSearchParams();
                      if (search.trim()) qs.set('search', search.trim());
                      qs.set('page', String(nextPage));
                      router.push(`/admin/customers?${qs.toString()}`);
                      void loadCustomers(nextPage, search);
                    }}
                    disabled={page >= totalPages}
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


