'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DollarSign, Users, TrendingUp, TrendingDown } from 'lucide-react';
import {
  adminAnalyticsApi,
  type IAnalyticsOverview,
  type IRevenueDataPoint,
  type IGrowthDataPoint,
} from '@/lib/api/admin/analytics';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<IAnalyticsOverview | null>(null);
  const [revenue, setRevenue] = useState<IRevenueDataPoint[]>([]);
  const [subscriptionGrowth, setSubscriptionGrowth] = useState<IGrowthDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void loadStats();
  }, []);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const [overviewRes, revenueRes, subsRes] = await Promise.all([
        adminAnalyticsApi.getOverview(),
        adminAnalyticsApi.getRevenue({ period: 'month' }),
        adminAnalyticsApi.getSubscriptions({ period: 'month', months: 6 }),
      ]);
      if (overviewRes.success && overviewRes.data) setStats(overviewRes.data);
      if (revenueRes.success && revenueRes.data) setRevenue([...revenueRes.data]);
      if (subsRes.success && subsRes.data) setSubscriptionGrowth([...subsRes.data]);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 data-testid="admin-header" className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400">Welcome to Scholarmancy Admin</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-600 dark:text-gray-400">
          Loading analytics...
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">MRR</CardTitle>
                <DollarSign className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${stats?.mrr?.toFixed(2) ?? '0.00'}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Monthly Recurring Revenue
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Customers</CardTitle>
                <Users className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalCustomers ?? 0}</div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {stats?.activeCustomers ?? 0} active
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">ARPU</CardTitle>
                <TrendingUp className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${stats?.arpu?.toFixed(2) ?? '0.00'}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Average Revenue Per User
                </p>
              </CardContent>
            </Card>

            {stats?.squarePlusRecommendation?.considerSquarePlus && (
              <Card className="md:col-span-2 lg:col-span-4 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20" data-testid="square-plus-alert">
                <CardContent className="pt-4">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Square Plus: {stats.squarePlusRecommendation.message}
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Churn Rate</CardTitle>
                <TrendingDown className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats?.churnRate?.toFixed(1) ?? '0.0'}%
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Customer churn</p>
              </CardContent>
            </Card>
          </div>

          {revenue.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Revenue by period</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
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

          {subscriptionGrowth.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Subscription growth</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
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

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link href="/admin/customers">View Customers</Link>
                </Button>
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link href="/admin/analytics">View Analytics</Link>
                </Button>
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link href="/admin/reports">Export Reports</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>System Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">API Status</span>
                    <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-400 rounded text-xs">
                      Operational
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Database</span>
                    <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-400 rounded text-xs">
                      Connected
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

