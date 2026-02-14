'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MessageSquare, Mail, Bell, CheckCircle2 } from 'lucide-react';
import type { IAgendaItem, AgendaImportance } from '@/lib/api/agenda';
import { agendaApi } from '@/lib/api/agenda';
import { cn } from '@/lib/utils';

const importanceBorder: Record<AgendaImportance, string> = {
  critical: 'border-l-4 border-l-red-500',
  high: 'border-l-4 border-l-amber-500',
  medium: 'border-l-4 border-l-blue-500',
  low: 'border-l-2 border-l-gray-300 dark:border-l-gray-600',
};

function formatReminderTime(sentAt: string): string {
  const sent = new Date(sentAt);
  const now = new Date();
  const diffMs = now.getTime() - sent.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / (60 * 60_000));
  const diffDays = Math.floor(diffMs / (24 * 60 * 60_000));
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export interface AgendaCardProps {
  item: IAgendaItem;
  onSnooze: (id: string) => void;
  onReminderSent: () => void;
}

export function AgendaCard({ item, onSnooze, onReminderSent }: AgendaCardProps) {
  const [remindLoading, setRemindLoading] = useState(false);
  const borderClass = importanceBorder[item.importance] ?? importanceBorder.medium;
  const latestReminder = item.reminders?.[0];

  const handleSendReminder = async (channel: 'sms' | 'email') => {
    setRemindLoading(true);
    try {
      const res = await agendaApi.sendReminder({
        itemId: item.id,
        channel,
        title: item.title,
        studentName: item.studentName,
        courseName: item.courseName,
        timeAt: item.timeAt,
      });
      if (res.success) onReminderSent();
    } finally {
      setRemindLoading(false);
    }
  };

  return (
    <Card
      data-testid="agenda-item"
      className={cn('overflow-hidden', borderClass)}
    >
      <CardContent className="p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {item.studentName && (
                <span
                  className="text-xs font-medium text-muted-foreground"
                  data-testid="agenda-item-student"
                >
                  {item.studentName}
                </span>
              )}
              <span className="truncate font-medium" data-testid="agenda-item-title">
                {item.title}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {item.courseName && (
                <span className="font-medium text-foreground/80">{item.courseName}</span>
              )}
              <span data-testid="agenda-item-time">
                {new Date(item.timeAt).toLocaleString()}
              </span>
            </div>
            {item.aiSummary && (
              <p className="text-xs text-muted-foreground" data-testid="agenda-item-summary">
                {item.aiSummary}
              </p>
            )}
            <div className="flex flex-wrap gap-1 pt-1">
              {(item.labels ?? []).slice(0, 6).map((label) => (
                <Badge
                  key={label}
                  variant="secondary"
                  className="text-xs"
                  data-testid={`agenda-label-${label}`}
                >
                  {label}
                </Badge>
              ))}
            </div>
            {latestReminder && (
              <div
                className="flex items-center gap-1 text-xs text-muted-foreground"
                data-testid="agenda-reminder-badge"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>
                  {latestReminder.channel.toUpperCase()} sent {formatReminderTime(latestReminder.sentAt)}
                </span>
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {!latestReminder ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={remindLoading}
                    data-testid="agenda-send-reminder"
                    data-loading={remindLoading}
                    aria-label="Send reminder"
                  >
                    {remindLoading ? 'Sending...' : 'Send Reminder'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => handleSendReminder('email')}
                    data-testid="agenda-remind-email"
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Email
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleSendReminder('sms')}
                    data-testid="agenda-remind-sms"
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    SMS
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSnooze(item.id)}
              data-testid="agenda-snooze"
              aria-label="Snooze 1 day"
            >
              <Bell className="mr-1 h-3.5 w-3.5" />
              Snooze 1d
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
