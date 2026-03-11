/**
 * Branded HTML email template for the daily digest: N alerts as compact rows + one dashboard link.
 */

import type { IEmailDigestPendingItem } from '@scholaracle/database';

/** Single course grade block for the digest email grade bar. */
export interface IGradeBlock {
  readonly courseName: string;
  readonly percentGrade: number;
  readonly letterGrade: string;
  readonly courseUrl: string;
}

const HEADER_BG = '#1a1a1a';
const BODY_COLOR = '#333333';
const FOOTER_COLOR = '#6b7280';
const CONTAINER_MAX_WIDTH = '600px';
const BORDER_CRITICAL = '#ef4444';
const BORDER_WARNING = '#f59e0b';
const BORDER_POSITIVE = '#10b981';
const BORDER_INFO = '#3b82f6';

/** Grade bar colors: F &lt;70, D 70-79, C 80-84, B 85-92, A 93+. */
const GRADE_COLOR_F = '#ef4444';
const GRADE_COLOR_D = '#f59e0b';
const GRADE_COLOR_C = '#3b82f6';
const GRADE_COLOR_B = '#10b981';
const GRADE_COLOR_A = '#047857';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function severityBorderColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return BORDER_CRITICAL;
    case 'warning':
      return BORDER_WARNING;
    case 'positive':
      return BORDER_POSITIVE;
    default:
      return BORDER_INFO;
  }
}

/** Returns background color for a percent grade (F &lt;70, D 70-79, C 80-84, B 85-92, A 93+). */
export function gradeBarColorForPercent(percent: number): string {
  if (percent < 70) return GRADE_COLOR_F;
  if (percent < 80) return GRADE_COLOR_D;
  if (percent < 85) return GRADE_COLOR_C;
  if (percent < 93) return GRADE_COLOR_B;
  return GRADE_COLOR_A;
}

/** Renders the grade bar HTML: horizontal row of clickable blocks (course name small, letter grade bold). */
export function renderGradeBar(grades: readonly IGradeBlock[]): string {
  if (grades.length === 0) return '';
  const blocks = grades.map((g) => {
    const bg = gradeBarColorForPercent(g.percentGrade);
    return `<a href="${escapeHtml(g.courseUrl)}" style="display:inline-block;width:60px;margin:0 4px 8px 0;padding:8px 6px;background:${bg};color:#ffffff;text-decoration:none;border-radius:6px;text-align:center;vertical-align:top;">
  <div style="font-size:16px;font-weight:700;margin-bottom:4px;">${escapeHtml(g.letterGrade)}</div>
  <div style="font-size:10px;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(g.courseName)}">${escapeHtml(g.courseName)}</div>
</a>`;
  });
  return `<div style="margin:0 0 16px;">${blocks.join('')}</div>`;
}

function formatRelativeTime(createdAt: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(createdAt).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3600_000);
  const diffDays = Math.floor(diffMs / 86400_000);
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Date(createdAt).toLocaleDateString();
}

export interface IBuildDigestEmailOptions {
  readonly items: readonly IEmailDigestPendingItem[];
  readonly dashboardUrl?: string;
  readonly studentName?: string;
  /** When 'student', tone is direct and omits student name; when 'parent', includes student name and monitoring language. */
  readonly recipientType?: 'parent' | 'student';
  /** AI-generated insight paragraph to include above the alert list. */
  readonly aiInsight?: string;
  /** Grade blocks for the top-of-email grade bar (course name, letter grade, link to course). */
  readonly grades?: readonly IGradeBlock[];
}

/**
 * Builds a single branded digest email with summary, compact alert rows, and View Dashboard CTA.
 */
export function buildDigestEmail(opts: IBuildDigestEmailOptions): {
  subject: string;
  html: string;
} {
  const { items, dashboardUrl, studentName, recipientType, aiInsight, grades } = opts;
  const n = items.length;
  const isStudent = recipientType === 'student';
  const summaryLine =
    n === 0
      ? 'You have no new alerts.'
      : `You have ${n} new alert${n === 1 ? '' : 's'} since your last digest.`;
  const studentLabel = !isStudent && studentName ? ` for ${escapeHtml(studentName)}` : '';

  const gradeBarBlock = grades && grades.length > 0 ? renderGradeBar(grades) : '';

  const alertRows = items.map((item) => {
    const borderColor = severityBorderColor(item.severity);
    const oneLiner =
      [item.courseName, item.assignmentTitle].filter(Boolean).join(': ') || item.subject;
    const body = item.body || '';
    const snippet = body.slice(0, 120) + (body.length > 120 ? '…' : '');
    const timeStr = formatRelativeTime(item.createdAt);
    return `
    <div style="border-left:4px solid ${borderColor}; padding:10px 12px; margin:8px 0; background:#f9fafb; border-radius:0 6px 6px 0;">
      <div style="font-size:11px; color:#6b7280; text-transform:uppercase; margin-bottom:4px;">${escapeHtml(item.alertType.replace(/_/g, ' '))}</div>
      <div style="font-weight:600; margin-bottom:2px;">${escapeHtml(oneLiner)}</div>
      <div style="font-size:13px; color:#4b5563;">${escapeHtml(snippet)}</div>
      <div style="font-size:11px; color:#9ca3af; margin-top:4px;">${timeStr}</div>
    </div>`;
  });

  const ctaBlock = dashboardUrl
    ? `
  <p style="margin:20px 0 16px;">
    <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block; background:#2563eb; color:#ffffff; padding:12px 24px; text-decoration:none; border-radius:6px; font-weight:600;">View Dashboard</a>
  </p>`
    : '';

  const insightBlock = aiInsight
    ? `
  <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:14px 16px; margin:0 0 16px;">
    <div style="font-weight:600; font-size:13px; color:#1e40af; margin-bottom:6px;">AI Insights</div>
    <div style="font-size:14px; color:#1e3a5f; line-height:1.5;">${escapeHtml(aiInsight)}</div>
  </div>`
    : '';

  const bodyHtml = `
  <p style="margin:0 0 16px;">${escapeHtml(summaryLine)}</p>
  ${gradeBarBlock}
  ${insightBlock}
  ${alertRows.join('')}
  ${ctaBlock}
  `;

  const footerBlock = `
  <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">
    <p style="margin:0;font-size:12px;color:${FOOTER_COLOR}">
      Sent by Scholarmancy. Questions? Reply to notifications@scholarmancy.com
    </p>
  </div>`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Scholarmancy Daily Update</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: ${BODY_COLOR}; margin: 0; padding: 0; }
    .container { max-width: ${CONTAINER_MAX_WIDTH}; margin: 0 auto; padding: 20px; }
    .header { background: ${HEADER_BG}; color: #ffffff; padding: 16px 20px; }
    .header span { font-size: 18px; font-weight: 600; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <div class="header">
    <span>Scholarmancy</span>
  </div>
  <div class="container">
    ${bodyHtml}
    ${footerBlock}
  </div>
</body>
</html>`.trim();

  const subject = `Scholarmancy Daily Update — ${n} alert${n === 1 ? '' : 's'}${studentLabel}`;
  return { subject, html };
}
