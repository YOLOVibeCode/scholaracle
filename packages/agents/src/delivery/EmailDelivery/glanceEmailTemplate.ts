import { renderGradeBar, type IGradeBlock } from './digestEmailTemplate';

export interface IMissingAssignmentBlock {
  readonly title: string;
  readonly courseName: string;
  readonly dueAt: Date;
}

export interface IUpcomingDeadlineBlock {
  readonly title: string;
  readonly courseName: string;
  readonly dueAt: Date;
}

export interface IBuildGlanceEmailOptions {
  readonly studentName: string;
  readonly grades?: readonly IGradeBlock[];
  readonly missingAssignments?: readonly IMissingAssignmentBlock[];
  readonly upcomingDeadlines?: readonly IUpcomingDeadlineBlock[];
  readonly aiInsight?: string;
  readonly dashboardUrl?: string;
  readonly recipientType?: 'parent' | 'student';
}

const HEADER_BG = '#1a1a1a';
const BODY_COLOR = '#333333';
const FOOTER_COLOR = '#6b7280';
const CONTAINER_MAX_WIDTH = '600px';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatShortDate(d: Date): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderMissingAssignments(items: readonly IMissingAssignmentBlock[]): string {
  if (items.length === 0) return '';
  const rows = items
    .map(
      (item) =>
        `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:14px;">${escapeHtml(item.title)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;">${escapeHtml(item.courseName)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#ef4444;">${formatShortDate(item.dueAt)}</td>
      </tr>`
    )
    .join('');
  return `
    <div style="margin:0 0 20px;">
      <h3 style="font-size:15px;font-weight:600;color:#111827;margin:0 0 8px;">Missing Assignments</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:6px 8px;text-align:left;font-size:12px;color:#6b7280;font-weight:500;border-bottom:1px solid #e5e7eb;">Assignment</th>
            <th style="padding:6px 8px;text-align:left;font-size:12px;color:#6b7280;font-weight:500;border-bottom:1px solid #e5e7eb;">Course</th>
            <th style="padding:6px 8px;text-align:left;font-size:12px;color:#6b7280;font-weight:500;border-bottom:1px solid #e5e7eb;">Due</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderUpcomingDeadlines(items: readonly IUpcomingDeadlineBlock[]): string {
  if (items.length === 0) return '';
  const rows = items
    .map(
      (item) =>
        `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:14px;">${escapeHtml(item.title)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;">${escapeHtml(item.courseName)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#3b82f6;">${formatShortDate(item.dueAt)}</td>
      </tr>`
    )
    .join('');
  return `
    <div style="margin:0 0 20px;">
      <h3 style="font-size:15px;font-weight:600;color:#111827;margin:0 0 8px;">Coming Up This Week</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:6px 8px;text-align:left;font-size:12px;color:#6b7280;font-weight:500;border-bottom:1px solid #e5e7eb;">Assignment</th>
            <th style="padding:6px 8px;text-align:left;font-size:12px;color:#6b7280;font-weight:500;border-bottom:1px solid #e5e7eb;">Course</th>
            <th style="padding:6px 8px;text-align:left;font-size:12px;color:#6b7280;font-weight:500;border-bottom:1px solid #e5e7eb;">Due</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

export function buildGlanceEmail(opts: IBuildGlanceEmailOptions): {
  subject: string;
  html: string;
} {
  const { studentName, grades, missingAssignments, upcomingDeadlines, aiInsight, dashboardUrl } =
    opts;

  const gradeBarBlock = grades && grades.length > 0 ? renderGradeBar(grades) : '';

  const missingBlock = missingAssignments ? renderMissingAssignments(missingAssignments) : '';
  const upcomingBlock = upcomingDeadlines ? renderUpcomingDeadlines(upcomingDeadlines) : '';

  const missingCount = missingAssignments?.length ?? 0;
  const summaryParts: string[] = [];
  if (grades && grades.length > 0)
    summaryParts.push(`${grades.length} course${grades.length === 1 ? '' : 's'}`);
  if (missingCount > 0)
    summaryParts.push(`${missingCount} missing assignment${missingCount === 1 ? '' : 's'}`);
  const summaryLine = summaryParts.length > 0 ? summaryParts.join(' · ') : 'All caught up!';

  const insightBlock = aiInsight
    ? `
  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
    <div style="font-weight:600;font-size:13px;color:#1e40af;margin-bottom:6px;">Today&rsquo;s Summary</div>
    <div style="font-size:14px;color:#1e3a5f;line-height:1.5;">${escapeHtml(aiInsight)}</div>
  </div>`
    : '';

  const ctaBlock = dashboardUrl
    ? `
  <p style="margin:20px 0 16px;">
    <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;">View Dashboard</a>
  </p>`
    : '';

  const allCaughtUp =
    missingCount === 0 && (!upcomingDeadlines || upcomingDeadlines.length === 0)
      ? '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin:0 0 16px;text-align:center;"><div style="font-size:15px;color:#15803d;font-weight:600;">All caught up! No missing work or upcoming deadlines.</div></div>'
      : '';

  const bodyHtml = `
  <p style="margin:0 0 4px;font-size:13px;color:${FOOTER_COLOR};">${escapeHtml(summaryLine)}</p>
  <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">${escapeHtml(studentName)}&rsquo;s Snapshot</h2>
  ${gradeBarBlock}
  ${insightBlock}
  ${missingBlock}
  ${upcomingBlock}
  ${allCaughtUp}
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
  <title>${escapeHtml(studentName)}'s Daily Snapshot</title>
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

  const todayStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const subject = `${studentName}'s Snapshot — ${todayStr}`;
  return { subject, html };
}
