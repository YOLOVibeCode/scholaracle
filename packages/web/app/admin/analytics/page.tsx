'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { adminAnalyticsApi } from '@/lib/api/admin/analytics';
import type {
  IAnalyticsOverview,
  IRevenueDataPoint,
  IGrowthDataPoint,
} from '@/lib/api/admin/analytics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AdminAnalyticsPage() {
  const [overview, setOverview] = useState<IAnalyticsOverview | null>(null);
  const [revenue, setRevenue] = useState<IRevenueDataPoint[]>([]);
  const [customerGrowth, setCustomerGrowth] = useState<IGrowthDataPoint[]>([]);
  const [subscriptionGrowth, setSubscriptionGrowth] = useState<IGrowthDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [overviewRes, revenueRes, customersRes, subsRes] = await Promise.all([
          adminAnalyticsApi.getOverview(),
          adminAnalyticsApi.getRevenue({ period: 'month' }),
          adminAnalyticsApi.getCustomerGrowth({ period: 'month', months: 6 }),
          adminAnalyticsApi.getSubscriptions({ period: 'month', months: 6 }),
        ]);

        if (cancelled) return;
        if (overviewRes.success && overviewRes.data) setOverview(overviewRes.data);
        if (revenueRes.success && revenueRes.data) setRevenue([...revenueRes.data]);
        if (customersRes.success && customersRes.data) setCustomerGrowth([...customersRes.data]);
        if (subsRes.success && subsRes.data) setSubscriptionGrowth([...subsRes.data]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-analytics-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">Business metrics and trends</p>
      </div>

      {overview && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>MRR</CardDescription>
              <CardTitle className="text-2xl">${overview.mrr.toFixed(0)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Churn rate</CardDescription>
              <CardTitle className="text-2xl">{overview.churnRate.toFixed(1)}%</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>ARPU</CardDescription>
              <CardTitle className="text-2xl">${overview.arpu.toFixed(2)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total customers</CardDescription>
              <CardTitle className="text-2xl">{overview.totalCustomers}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>New signups</CardDescription>
              <CardTitle className="text-2xl">{overview.newCustomers}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {overview?.squarePlusRecommendation && (
        <Card
          className={
            overview.squarePlusRecommendation.considerSquarePlus
              ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20'
              : ''
          }
          data-testid="square-plus-recommendation"
        >
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              Paying users: <strong>{overview.squarePlusRecommendation.payingUserCount}</strong>
              {' · '}
              {overview.squarePlusRecommendation.message}
            </p>
          </CardContent>
        </Card>
      )}

      {revenue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Revenue by period</CardTitle>
            <CardDescription>Revenue over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenue} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="period" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v: number | undefined) => [v != null ? `$${v.toFixed(2)}` : '—', 'Revenue']} />
                  <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {customerGrowth.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Customer growth</CardTitle>
            <CardDescription>Customer count over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={customerGrowth} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="period" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name="Customers"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {subscriptionGrowth.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Subscription growth</CardTitle>
            <CardDescription>Active subscriptions over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={subscriptionGrowth} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="period" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name="Subscriptions"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {overview && (
        <Card>
          <CardHeader>
            <CardTitle>Churn rate trend</CardTitle>
            <CardDescription>Current churn rate (percentage of cancelled)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{overview.churnRate.toFixed(1)}%</span>
              <span className="text-muted-foreground">churn rate</span>
            </div>
          </CardContent>
        </Card>
      )}

      {!overview && revenue.length === 0 && customerGrowth.length === 0 && (
        <p className="text-muted-foreground">No analytics data yet.</p>
      )}
    </div>
  );
}
