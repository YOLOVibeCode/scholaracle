/**
 * Tiny single-page PDF with visible Helvetica text.
 * Used for demo seed files and optional article snapshots (no Chromium).
 */

function pdfEscape(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) {
      out += ' ';
      continue;
    }
    if (ch === '\\' || ch === '(' || ch === ')') {
      out += `\\${ch}`;
      continue;
    }
    out += ch;
  }
  return out;
}

function wrapLine(line: string, width: number): string[] {
  const trimmed = line.replace(/\s+/g, ' ').trim();
  if (trimmed === '') return [''];
  const words = trimmed.split(' ');
  const rows: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current === '' ? word : `${current} ${word}`;
    if (next.length <= width) {
      current = next;
    } else {
      if (current !== '') rows.push(current);
      current = word.length <= width ? word : word.slice(0, width);
    }
  }
  if (current !== '') rows.push(current);
  return rows;
}

function bodyLines(body: string, title: string): string[] {
  const wrapped: string[] = [title, ''];
  for (const paragraph of body.split('\n')) {
    wrapped.push(...wrapLine(paragraph, 86));
  }
  return wrapped.slice(0, 42);
}

/**
 * Build a one-page PDF. Title is the first line (16pt); body is wrapped 11pt text.
 */
export function buildSimplePdf(title: string, body: string): Uint8Array {
  const lines = bodyLines(body, title);
  const ops: string[] = ['BT', '/F1 16 Tf', '72 720 Td', `(${pdfEscape(lines[0] ?? '')}) Tj`];
  ops.push('/F1 11 Tf');
  for (let i = 1; i < lines.length; i += 1) {
    ops.push('0 -16 Td');
    ops.push(`(${pdfEscape(lines[i] ?? '')}) Tj`);
  }
  ops.push('ET');
  const stream = ops.join('\n');

  const objects: string[] = [
    '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n',
    '2 0 obj<< /Type /Pages /Count 1 /Kids [3 0 R] >>endobj\n',
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n',
    `4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n',
  ];

  let offset = '%PDF-1.4\n'.length;
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(offset);
    offset += obj.length;
  }

  const xrefLines = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f '];
  for (let i = 1; i < offsets.length; i += 1) {
    xrefLines.push(`${String(offsets[i]).padStart(10, '0')} 00000 n `);
  }
  const xref = `${xrefLines.join('\n')}\n`;
  const trailer = `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  const pdf = `%PDF-1.4\n${objects.join('')}${xref}${trailer}`;
  return new TextEncoder().encode(pdf);
}
