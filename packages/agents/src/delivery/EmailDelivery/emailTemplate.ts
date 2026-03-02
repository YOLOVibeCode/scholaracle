/**
 * Branded HTML email template for agent notification emails (mirrors API template).
 * Header: dark bar with wordmark; body: white container; footer: muted note.
 */

export interface IBrandedEmailOptions {
  readonly title: string;
  readonly bodyHtml: string;
  readonly footerNote?: string;
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

/**
 * Builds a full HTML email with Scholarmancy header, body, and optional footer.
 */
export function buildBrandedEmail(opts: IBrandedEmailOptions): string {
  const customNote = opts.footerNote
    ? `<p style="margin:0;font-size:12px;color:${FOOTER_COLOR}">${escapeHtml(opts.footerNote)}</p>`
    : '';
  const footerBlock = `
  <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">
    ${customNote}
    <p style="margin:8px 0 0;font-size:12px;color:${FOOTER_COLOR}">
      Sent by Scholarmancy. Questions? Reply to notifications@scholarmancy.com
    </p>
  </div>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(opts.title)}</title>
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
    ${opts.bodyHtml}
    ${footerBlock}
  </div>
</body>
</html>`.trim();
}
