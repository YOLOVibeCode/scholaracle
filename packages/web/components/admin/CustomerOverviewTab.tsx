/**
 * CustomerOverviewTab Component (ISP)
 * 
 * Small, focused component for displaying customer overview information.
 * Follows Interface Segregation Principle - single responsibility.
 */

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Phone, Calendar, Shield } from 'lucide-react';
import type { ICustomerDetail } from '@/lib/api/admin/customers';
import { adminCustomersApi } from '@/lib/api/admin/customers';

export interface ICustomerOverviewTabProps {
  readonly customer: ICustomerDetail;
  readonly onSuspend: () => void;
  readonly onUnsuspend: () => void;
}

export function CustomerOverviewTab({ customer, onSuspend, onUnsuspend }: ICustomerOverviewTabProps) {
  const [ltv, setLtv] = useState<number | null>(null);
  const [ltvError, setLtvError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLtvError(null);
      try {
        const res = await adminCustomersApi.getLtv(customer.id);
        if (!res.success || !res.data) throw new Error(res.error ?? 'Failed to load LTV');
        if (!cancelled) setLtv(res.data.ltv);
      } catch (e) {
        if (!cancelled) setLtvError(e instanceof Error ? e.message : 'Failed to load LTV');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [customer.id]);

  return (
    <div className="space-y-4" data-testid="customer-overview-tab">
      <Card>
        <CardHeader>
          <CardTitle>Customer Information</CardTitle>
          <CardDescription>Basic customer details and account status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Name</label>
              <p className="text-lg font-semibold" data-testid="customer-name">{customer.name}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Email</label>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-gray-500" />
                <p className="text-lg" data-testid="customer-email">{customer.email}</p>
              </div>
            </div>
            {customer.phone && (
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Phone</label>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-500" />
                  <p className="text-lg" data-testid="customer-phone">{customer.phone}</p>
                  {customer.phoneVerified && (
                    <Badge variant="outline" className="text-xs">Verified</Badge>
                  )}
                </div>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Account Status</label>
              <div className="flex items-center gap-2">
                {customer.isSuspended ? (
                  <>
                    <Shield className="h-4 w-4 text-red-500" />
                    <Badge variant="destructive" data-testid="customer-status">Suspended</Badge>
                  </>
                ) : (
                  <Badge variant="default" data-testid="customer-status">Active</Badge>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Lifetime Value</label>
              <div className="mt-1">
                {ltvError ? (
                  <p className="text-sm text-red-600 dark:text-red-400" data-testid="customer-ltv-error">
                    Failed to load
                  </p>
                ) : ltv === null ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400" data-testid="customer-ltv-loading">
                    Loading…
                  </p>
                ) : (
                  <p className="text-lg font-semibold" data-testid="customer-ltv">
                    USD {ltv.toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {customer.isSuspended && customer.suspendedReason && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
              <p className="text-sm font-medium text-red-900 dark:text-red-100">Suspension Reason</p>
              <p className="text-sm text-red-800 dark:text-red-200" data-testid="suspension-reason">
                {customer.suspendedReason}
              </p>
              {customer.suspendedAt && (
                <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                  Suspended on: {new Date(customer.suspendedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {customer.isSuspended ? (
              <Button variant="default" onClick={onUnsuspend} data-testid="unsuspend-button">
                Unsuspend Customer
              </Button>
            ) : (
              <Button variant="destructive" onClick={onSuspend} data-testid="suspend-button">
                Suspend Customer
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>Current subscription plan and status</CardDescription>
        </CardHeader>
        <CardContent>
          {customer.subscription ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Plan</span>
                <Badge variant="outline" data-testid="subscription-plan">
                  {customer.subscription.plan}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Status</span>
                <Badge
                  variant={customer.subscription.status === 'active' ? 'default' : 'secondary'}
                  data-testid="subscription-status"
                >
                  {customer.subscription.status}
                </Badge>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">No active subscription</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account Dates</CardTitle>
          <CardDescription>Important account timestamps</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm font-medium">Created</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {new Date(customer.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm font-medium">Last Updated</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {new Date(customer.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

