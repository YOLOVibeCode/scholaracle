import type { IAlertListItem } from '@scholaracle/contracts';
import {
  a11yAlertLabel,
  alertTypeLabel,
  compareAlerts,
  countActive,
  emptyStateText,
  filterAlerts,
  formatAlertAge,
  groupAlerts,
  markAcknowledged,
  normalizeSeverity,
  severityColor,
  severityLabel,
} from './alertsViewModel';

function alert(overrides: Partial<IAlertListItem> & { id: string }): IAlertListItem {
  return {
    studentId: 's1',
    userId: 'u1',
    type: 'grade_drop',
    severity: 'info',
    message: 'msg',
    acknowledged: false,
    createdAt: '2026-11-01T12:00:00.000Z',
    ...overrides,
  };
}

const NOW = new Date('2026-11-08T12:00:00.000Z');

describe('severity helpers', () => {
  it('normalizes known severities case-insensitively and falls back to info', () => {
    expect(normalizeSeverity('CRITICAL')).toBe('critical');
    expect(normalizeSeverity(' warning ')).toBe('warning');
    expect(normalizeSeverity('positive')).toBe('positive');
    expect(normalizeSeverity('high')).toBe('info');
    expect(normalizeSeverity('')).toBe('info');
  });

  it('labels and colors', () => {
    expect(severityLabel('all')).toBe('All');
    expect(severityLabel('positive')).toBe('Good news');
    expect(severityColor('critical')).not.toBe(severityColor('info'));
    expect(severityColor('weird')).toBe(severityColor('info'));
  });
});

describe('alertTypeLabel', () => {
  it('humanizes type keys', () => {
    expect(alertTypeLabel('grade_drop')).toBe('Grade drop');
    expect(alertTypeLabel('missing-assignment')).toBe('Missing assignment');
    expect(alertTypeLabel('  ')).toBe('Alert');
  });
});

describe('sorting, filtering, grouping', () => {
  const list = [
    alert({ id: 'info-new', severity: 'info', createdAt: '2026-11-07T00:00:00.000Z' }),
    alert({ id: 'crit-old', severity: 'critical', createdAt: '2026-11-01T00:00:00.000Z' }),
    alert({ id: 'crit-new', severity: 'critical', createdAt: '2026-11-06T00:00:00.000Z' }),
    alert({ id: 'warn', severity: 'warning' }),
    alert({ id: 'good', severity: 'positive' }),
    alert({
      id: 'done-old',
      severity: 'critical',
      acknowledged: true,
      createdAt: '2026-10-01T00:00:00.000Z',
    }),
    alert({
      id: 'done-new',
      severity: 'info',
      acknowledged: true,
      createdAt: '2026-10-20T00:00:00.000Z',
    }),
  ];

  it('orders by urgency, then newest, then id', () => {
    const ids = [...list].sort(compareAlerts).map((a) => a.id);
    expect(ids.slice(0, 3)).toEqual(['crit-new', 'crit-old', 'done-old']);
    const tie = [alert({ id: 'b' }), alert({ id: 'a' })].sort(compareAlerts);
    expect(tie.map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('treats unparseable dates as oldest', () => {
    const sorted = [
      alert({ id: 'bad', createdAt: 'nope' }),
      alert({ id: 'ok', createdAt: '2026-11-01T00:00:00.000Z' }),
    ].sort(compareAlerts);
    expect(sorted.map((a) => a.id)).toEqual(['ok', 'bad']);
  });

  it('filters by severity and keeps everything for all', () => {
    expect(filterAlerts(list, 'all')).toHaveLength(list.length);
    expect(
      filterAlerts(list, 'critical')
        .map((a) => a.id)
        .sort()
    ).toEqual(['crit-new', 'crit-old', 'done-old'].sort());
  });

  it('groups active before acknowledged with sorted contents', () => {
    const sections = groupAlerts(list);
    expect(sections.map((s) => s.key)).toEqual(['active', 'acknowledged']);
    expect(sections[0]!.data.map((a) => a.id)).toEqual([
      'crit-new',
      'crit-old',
      'warn',
      'info-new',
      'good',
    ]);
    expect(sections[1]!.data.map((a) => a.id)).toEqual(['done-new', 'done-old']);
  });

  it('applies the filter and omits empty sections', () => {
    const sections = groupAlerts(list, 'warning');
    expect(sections).toHaveLength(1);
    expect(sections[0]!.key).toBe('active');
    expect(groupAlerts([], 'all')).toEqual([]);
  });

  it('sorts acknowledged alerts with an id tiebreak', () => {
    const t = '2026-10-01T00:00:00.000Z';
    const sections = groupAlerts([
      alert({ id: 'b', acknowledged: true, createdAt: t }),
      alert({ id: 'a', acknowledged: true, createdAt: t }),
    ]);
    expect(sections[0]!.data.map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('counts active alerts', () => {
    expect(countActive(list)).toBe(5);
  });
});

describe('markAcknowledged', () => {
  it('acknowledges only the matching unacknowledged alert without mutating', () => {
    const original = [alert({ id: 'a' }), alert({ id: 'b' })];
    const next = markAcknowledged(original, 'a', NOW);
    expect(next[0]).toMatchObject({ acknowledged: true, acknowledgedAt: NOW.toISOString() });
    expect(next[1]).toBe(original[1]);
    expect(original[0]!.acknowledged).toBe(false);
  });

  it('leaves an already acknowledged alert untouched', () => {
    const done = alert({ id: 'a', acknowledged: true, acknowledgedAt: '2026-01-01T00:00:00.000Z' });
    expect(markAcknowledged([done], 'a', NOW)[0]).toBe(done);
  });
});

describe('formatAlertAge', () => {
  const ago = (ms: number): string => new Date(NOW.getTime() - ms).toISOString();

  it('formats relative times', () => {
    expect(formatAlertAge(ago(5_000), NOW)).toBe('just now');
    expect(formatAlertAge(ago(5 * 60_000), NOW)).toBe('5m ago');
    expect(formatAlertAge(ago(3 * 3_600_000), NOW)).toBe('3h ago');
    expect(formatAlertAge(ago(2 * 86_400_000), NOW)).toBe('2d ago');
  });

  it('falls back to a date after a week and blank for bad input', () => {
    expect(formatAlertAge(ago(30 * 86_400_000), NOW)).toMatch(/2026/);
    expect(formatAlertAge('garbage', NOW)).toBe('');
  });
});

describe('copy', () => {
  it('has empty-state text per filter', () => {
    expect(emptyStateText('all').title).toBe('No alerts');
    expect(emptyStateText('critical').title).toBe('No critical alerts');
  });

  it('builds an accessibility label', () => {
    const label = a11yAlertLabel(
      alert({
        id: 'a',
        severity: 'critical',
        message: 'Math dropped',
        createdAt: NOW.toISOString(),
      }),
      NOW
    );
    expect(label).toBe('Critical. Grade drop. Math dropped. just now');
    expect(a11yAlertLabel(alert({ id: 'b', acknowledged: true, createdAt: 'bad' }), NOW)).toBe(
      'Acknowledged. Info. Grade drop. msg'
    );
  });
});
