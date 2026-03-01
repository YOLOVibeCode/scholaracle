'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable } from '@/components/ui/data-table';
import { useAsyncData } from '@/lib/hooks';
import { ErrorDisplay, LoadingSkeleton } from '@/components/common';
import { adminCouponsApi, type ICoupon, type ICreateCouponRequest } from '@/lib/api/admin/coupons';

type CouponType = ICoupon['type'];
type CouponDuration = ICoupon['duration'];

const TYPE_LABELS: Record<CouponType, string> = {
  trial_extension: 'Trial Extension',
  percent_off: 'Percent Off',
  amount_off: 'Amount Off',
  free_plan: 'Free Plan',
};

const DURATION_LABELS: Record<CouponDuration, string> = {
  once: 'One-time',
  repeating: 'Repeating',
  forever: 'Forever',
};

export default function AdminCouponsPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [newCode, setNewCode] = useState('');
  const [newType, setNewType] = useState<CouponType>('percent_off');
  const [newValue, setNewValue] = useState('');
  const [newDuration, setNewDuration] = useState<CouponDuration>('once');
  const [newDurationMonths, setNewDurationMonths] = useState('');
  const [newPlan, setNewPlan] = useState('');
  const [newMaxRedemptions, setNewMaxRedemptions] = useState('');
  const [newExpiresAt, setNewExpiresAt] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const { data: couponsData, isLoading, error, retry, refresh } = useAsyncData<readonly ICoupon[]>(
    async () => {
      const res = await adminCouponsApi.list();
      if (!res.success || !res.data) throw new Error(res.error ?? 'Failed to load coupons');
      return res.data;
    },
    { retryCount: 2, retryDelay: 1000 }
  );

  const coupons = couponsData ?? [];
  const hasLoadedOnce = couponsData !== null;
  const showFullLoading = isLoading && !hasLoadedOnce;

  const handleCreate = useCallback(async () => {
    if (!newCode.trim() || !newValue.trim()) return;
    setIsSubmitting(true);
    try {
      const data: ICreateCouponRequest = {
        code: newCode.trim().toUpperCase(),
        type: newType,
        value: Number(newValue),
        duration: newDuration,
        ...(newDuration === 'repeating' && newDurationMonths ? { durationMonths: Number(newDurationMonths) } : {}),
        ...(newPlan ? { plan: newPlan } : {}),
        ...(newMaxRedemptions ? { maxRedemptions: Number(newMaxRedemptions) } : {}),
        ...(newExpiresAt ? { expiresAt: new Date(newExpiresAt).toISOString() } : {}),
        ...(newDescription ? { description: newDescription } : {}),
      };
      const res = await adminCouponsApi.create(data);
      if (res.success) {
        setToast(`Coupon ${data.code} created`);
        setShowCreate(false);
        resetForm();
        void refresh();
      } else {
        setToast(res.error ?? 'Failed to create coupon');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [newCode, newType, newValue, newDuration, newDurationMonths, newPlan, newMaxRedemptions, newExpiresAt, newDescription, refresh]);

  const handleToggle = useCallback(async (coupon: ICoupon) => {
    const res = await adminCouponsApi.toggle(coupon.id);
    if (res.success) {
      setToast(`Coupon ${coupon.code} ${res.isActive ? 'enabled' : 'disabled'}`);
      void refresh();
    }
  }, [refresh]);

  const resetForm = () => {
    setNewCode('');
    setNewType('percent_off');
    setNewValue('');
    setNewDuration('once');
    setNewDurationMonths('');
    setNewPlan('');
    setNewMaxRedemptions('');
    setNewExpiresAt('');
    setNewDescription('');
  };

  const statusBadge = (coupon: ICoupon) => {
    if (!coupon.isActive) return <Badge variant="secondary">Inactive</Badge>;
    if (coupon.isExpired) return <Badge variant="destructive">Expired</Badge>;
    if (coupon.isExhausted) return <Badge variant="destructive">Exhausted</Badge>;
    return <Badge variant="default">Active</Badge>;
  };

  const columns: ColumnDef<ICoupon, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'code',
        header: 'Code',
        cell: ({ row }) => (
          <span className="font-mono font-semibold text-sm" data-testid="coupon-code">
            {row.original.code}
          </span>
        ),
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => (
          <Badge variant="outline">{TYPE_LABELS[row.original.type]}</Badge>
        ),
      },
      {
        accessorKey: 'discountLabel',
        header: 'Discount',
        cell: ({ row }) => <span className="text-sm">{row.original.discountLabel}</span>,
      },
      {
        accessorKey: 'plan',
        header: 'Plan',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.plan ?? 'Any'}
          </span>
        ),
      },
      {
        accessorKey: 'redemptionCount',
        header: 'Redemptions',
        cell: ({ row }) => (
          <span className="text-sm" data-testid="coupon-redemptions">
            {row.original.redemptionCount}
            {row.original.maxRedemptions ? ` / ${row.original.maxRedemptions}` : ''}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => statusBadge(row.original),
      },
      {
        accessorKey: 'expiresAt',
        header: 'Expires',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.expiresAt
              ? new Date(row.original.expiresAt).toLocaleDateString()
              : 'Never'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleToggle(row.original)}
            data-testid="coupon-toggle-button"
          >
            {row.original.isActive ? 'Disable' : 'Enable'}
          </Button>
        ),
      },
    ],
    [handleToggle]
  );

  const valueLabel = newType === 'percent_off'
    ? 'Percentage (e.g. 20 for 20%)'
    : newType === 'amount_off'
    ? 'Amount in cents (e.g. 500 for $5.00)'
    : newType === 'trial_extension'
    ? 'Days (e.g. 30)'
    : 'Months free (0 = forever)';

  return (
    <div className="space-y-6 p-6" data-testid="admin-coupons-page">
      {toast && (
        <div role="alert" data-testid="toast" className="rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-200">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Coupons</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage coupon codes for discounts and free trials
          </p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)} data-testid="button-create-coupon">
          {showCreate ? 'Cancel' : 'Create Coupon'}
        </Button>
      </div>

      {showCreate && (
        <Card data-testid="create-coupon-panel">
          <CardHeader>
            <CardTitle>New Coupon</CardTitle>
            <CardDescription>Fill in the details to create a new coupon code</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="coupon-code">Code</Label>
                <Input
                  id="coupon-code"
                  data-testid="input-coupon-code"
                  placeholder="e.g. BETA2026"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coupon-type">Type</Label>
                <select
                  id="coupon-type"
                  data-testid="select-coupon-type"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as CouponType)}
                >
                  <option value="percent_off">Percent Off</option>
                  <option value="amount_off">Amount Off</option>
                  <option value="trial_extension">Trial Extension</option>
                  <option value="free_plan">Free Plan</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="coupon-value">{valueLabel}</Label>
                <Input
                  id="coupon-value"
                  data-testid="input-coupon-value"
                  type="number"
                  placeholder="e.g. 20"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coupon-duration">Duration</Label>
                <select
                  id="coupon-duration"
                  data-testid="select-coupon-duration"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={newDuration}
                  onChange={(e) => setNewDuration(e.target.value as CouponDuration)}
                >
                  <option value="once">One-time</option>
                  <option value="repeating">Repeating (N months)</option>
                  <option value="forever">Forever</option>
                </select>
              </div>
            </div>

            {newDuration === 'repeating' && (
              <div className="space-y-2">
                <Label htmlFor="coupon-duration-months">Duration (months)</Label>
                <Input
                  id="coupon-duration-months"
                  data-testid="input-coupon-duration-months"
                  type="number"
                  placeholder="e.g. 3"
                  value={newDurationMonths}
                  onChange={(e) => setNewDurationMonths(e.target.value)}
                />
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="coupon-plan">Restrict to plan (optional)</Label>
                <select
                  id="coupon-plan"
                  data-testid="select-coupon-plan"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={newPlan}
                  onChange={(e) => setNewPlan(e.target.value)}
                >
                  <option value="">Any plan</option>
                  <option value="starter">Starter</option>
                  <option value="premium">Premium</option>
                  <option value="family">Family</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="coupon-max">Max redemptions (optional)</Label>
                <Input
                  id="coupon-max"
                  data-testid="input-coupon-max-redemptions"
                  type="number"
                  placeholder="Unlimited"
                  value={newMaxRedemptions}
                  onChange={(e) => setNewMaxRedemptions(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coupon-expires">Expires (optional)</Label>
                <Input
                  id="coupon-expires"
                  data-testid="input-coupon-expires"
                  type="date"
                  value={newExpiresAt}
                  onChange={(e) => setNewExpiresAt(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="coupon-description">Description (optional)</Label>
              <Input
                id="coupon-description"
                data-testid="input-coupon-description"
                placeholder="Internal note about this coupon"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>

            <Button
              onClick={() => void handleCreate()}
              disabled={isSubmitting || !newCode.trim() || !newValue.trim()}
              data-testid="button-submit-coupon"
            >
              {isSubmitting ? 'Creating...' : 'Create Coupon'}
            </Button>
          </CardContent>
        </Card>
      )}

      {showFullLoading && <LoadingSkeleton />}
      {error && hasLoadedOnce && <ErrorDisplay error={error} onRetry={() => void retry()} />}

      <Card>
        <CardHeader>
          <CardTitle>All Coupons</CardTitle>
          <CardDescription>
            {coupons.length} coupon{coupons.length !== 1 ? 's' : ''} total
            {' · '}
            {coupons.filter((c) => c.isValid).length} active
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={[...coupons]} data-testid="coupons-table" />
        </CardContent>
      </Card>
    </div>
  );
}
