/**
 * CustomerActivityTimeline (ISP)
 *
 * Focused component: render a unified activity feed.
 */

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { IAdminCustomerActivityItem } from '@/lib/api/admin/customers';

function labelForType(type: IAdminCustomerActivityItem['type']): string {
  switch (type) {
    case 'note':
      return 'Note';
    case 'payment':
      return 'Payment';
    case 'subscription':
      return 'Subscription';
    case 'student':
      return 'Student';
    case 'admin_action':
      return 'Admin';
    default:
      return 'Activity';
  }
}

export interface ICustomerActivityTimelineProps {
  readonly items: readonly IAdminCustomerActivityItem[];
}

export function CustomerActivityTimeline({ items }: ICustomerActivityTimelineProps) {
  return (
    <Card data-testid="customer-activity-timeline">
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400" data-testid="customer-activity-empty">
            No recent activity.
          </p>
        ) : (
          <div className="space-y-2" data-testid="customer-activity-list">
            {items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="shrink-0">
                      {labelForType(item.type)}
                    </Badge>
                    <div className="truncate text-sm font-medium" data-testid="customer-activity-title">
                      {item.title}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-gray-600 dark:text-gray-400" data-testid="customer-activity-time">
                    {new Date(item.occurredAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


