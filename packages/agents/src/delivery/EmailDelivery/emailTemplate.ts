/**
 * Branded HTML email template for agent notification emails.
 * Clean, scannable design with clear hierarchy.
 */

export interface IBrandedEmailOptions {
  readonly title: string;
  readonly bodyHtml: string;
  readonly footerNote?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Builds a full HTML email with Scholaracle header, body, and footer.
 */
export function buildBrandedEmail(opts: IBrandedEmailOptions): string {
  const customNote = opts.footerNote
    ? `<p style="margin:0 0 8px;font-size:12px;color:#6b7280">${escapeHtml(opts.footerNote)}</p>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:#1a1a1a;padding:16px 24px;">
              <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">Scholaracle</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:24px;color:#1f2937;font-size:15px;line-height:1.6;">
              ${opts.bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:0 24px 20px;">
              <div style="border-top:1px solid #e5e7eb;padding-top:16px;">
                ${customNote}
                <p style="margin:0;font-size:12px;color:#9ca3af;">
                  Sent by Scholaracle &middot; <a href="mailto:notifications@scholarmancy.com" style="color:#9ca3af;">Contact support</a>
                </p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}
