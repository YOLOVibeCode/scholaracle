/**
 * Pure view-model for the alert inbox: severity labels, filtering, grouping,
 * sorting and display strings. No React, no network.
 */

import type { IAlertListItem } from '@scholaracle/contracts';

export type AlertSeverity = 'critical' | 'warning' | 'info' | 'positive';
export type AlertSeverityFilter = 'all' | AlertSeverity;

export const SEVERITY_FILTERS: readonly AlertSeverityFilter[] = [
  'all',
  'critical',
  'warning',
  'info',
  'positive',
];

/** Lower = more urgent. */
const SEVERITY_RANK: Readonly<Record<AlertSeverity, number>> = {
  critical: 0,
  warning: 1,
  info: 2,
  positive: 3,
};

const SEVERITY_LABELS: Readonly<Record<AlertSeverityFilter, string>> = {
  all: 'All',
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
  positive: 'Good news',
};

const SEVERITY_COLORS: Readonly<Record<AlertSeverity, string>> = {
  critical: '#dc3545',
  warning: '#e8590c',
  info: '#4361ee',
  positive: '#2b8a3e',
};

/** Unknown server severities are shown as info rather than dropped. */
export function normalizeSeverity(raw: string): AlertSeverity {
  const key = raw.trim().toLowerCase();
  return key === 'critical' || key === 'warning' || key === 'info' || key === 'positive'
    ? key
    : 'info';
}

export function severityLabel(filter: AlertSeverityFilter): string {
  return SEVERITY_LABELS[filter];
}

export function severityColor(raw: string): string {
  return SEVERITY_COLORS[normalizeSeverity(raw)];
}

/** `grade_drop` -> `Grade drop`. */
export function alertTypeLabel(type: string): string {
  const words = type.replace(/[_-]+/g, ' ').trim();
  if (words === '') return 'Alert';
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

function timeOf(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/** Most urgent first, then newest first, then id for a stable order. */
export function compareAlerts(a: IAlertListItem, b: IAlertListItem): number {
  const bySeverity =
    SEVERITY_RANK[normalizeSeverity(a.severity)] - SEVERITY_RANK[normalizeSeverity(b.severity)];
  if (bySeverity !== 0) return bySeverity;
  const byTime = timeOf(b.createdAt) - timeOf(a.createdAt);
  if (byTime !== 0) return byTime;
  return a.id.localeCompare(b.id);
}

export function filterAlerts(
  alerts: readonly IAlertListItem[],
  filter: AlertSeverityFilter
): IAlertListItem[] {
  if (filter === 'all') return [...alerts];
  return alerts.filter((a) => normalizeSeverity(a.severity) === filter);
}

export interface IAlertSection {
  readonly key: 'active' | 'acknowledged';
  readonly title: string;
  readonly data: readonly IAlertListItem[];
}

/** Active (unacknowledged) alerts by urgency, then acknowledged ones. Empty sections are omitted. */
export function groupAlerts(
  alerts: readonly IAlertListItem[],
  filter: AlertSeverityFilter = 'all'
): IAlertSection[] {
  const filtered = filterAlerts(alerts, filter);
  const active = filtered.filter((a) => !a.acknowledged).sort(compareAlerts);
  const done = filtered
    .filter((a) => a.acknowledged)
    .sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt) || a.id.localeCompare(b.id));
  const sections: IAlertSection[] = [];
  if (active.length > 0) sections.push({ key: 'active', title: 'Active', data: active });
  if (done.length > 0) sections.push({ key: 'acknowledged', title: 'Acknowledged', data: done });
  return sections;
}

export function countActive(alerts: readonly IAlertListItem[]): number {
  return alerts.filter((a) => !a.acknowledged).length;
}

/** Marks one alert acknowledged locally (optimistic update). */
export function markAcknowledged(
  alerts: readonly IAlertListItem[],
  alertId: string,
  at: Date
): IAlertListItem[] {
  return alerts.map((a) =>
    a.id === alertId && !a.acknowledged
      ? { ...a, acknowledged: true, acknowledgedAt: at.toISOString() }
      : a
  );
}

/** Short relative time ("5m ago", "3h ago", "2d ago", else a date). */
export function formatAlertAge(createdAt: string, now: Date): string {
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return '';
  const diffMs = now.getTime() - t;
  if (diffMs < 60_000) return 'just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(t).toDateString();
}

export function emptyStateText(filter: AlertSeverityFilter): { title: string; body: string } {
  if (filter === 'all') {
    return { title: 'No alerts', body: "You're all caught up. New alerts will show up here." };
  }
  return {
    title: `No ${severityLabel(filter).toLowerCase()} alerts`,
    body: 'Try another filter to see the rest.',
  };
}

export function a11yAlertLabel(alert: IAlertListItem, now: Date): string {
  const sev = severityLabel(normalizeSeverity(alert.severity));
  const age = formatAlertAge(alert.createdAt, now);
  const status = alert.acknowledged ? 'Acknowledged. ' : '';
  return `${status}${sev}. ${alertTypeLabel(alert.type)}. ${alert.message}${age ? `. ${age}` : ''}`;
}
