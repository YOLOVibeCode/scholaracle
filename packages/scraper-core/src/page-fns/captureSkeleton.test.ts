/**
 * @jest-environment jsdom
 */
import { webcrypto } from 'node:crypto';
import { captureSkeleton } from './captureSkeleton';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  }
});

const REDACTION_CORPUS = [
  'Emma Johnson',
  'Robin Smith',
  'emma.johnson@lisd.net',
  '12345678',
  'stu-abcdef',
  '92%',
  '(555) 123-4567',
  '555-123-4567',
  'Alpha Beta Gamma',
] as const;

const MAX_BYTES = 200 * 1024;

function buildLeakHtml(): string {
  return `
    <html>
      <body>
        <div id="student-12345678" class="student-card emma-johnson active">
          <h1>Emma Johnson</h1>
          <a href="mailto:emma.johnson@lisd.net">Contact</a>
          <span data-student-id="stu-abcdef">Grade 92%</span>
          <p>Call (555) 123-4567 or 555-123-4567 for Robin Smith</p>
          <input type="hidden" value="Alpha Beta Gamma" />
        </div>
      </body>
    </html>
  `;
}

function leakCheck(output: string, corpus: readonly string[]): string[] {
  const leaks: string[] = [];
  for (const s of corpus) {
    if (output.toLowerCase().includes(s.toLowerCase())) leaks.push(s);
  }
  return leaks;
}

describe('captureSkeleton', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '';
  });

  it('redaction corpus finds zero literal leaks in serialized output', async () => {
    document.documentElement.innerHTML = buildLeakHtml();
    const result = await captureSkeleton({ step: 'test.redaction' });
    const blob = `${result.skeleton}\n${result.pagePath ?? ''}\n${result.sha256}`;
    expect(leakCheck(blob, REDACTION_CORPUS)).toEqual([]);
    expect(result.skeleton).toContain('"t"');
    expect(result.skeleton).not.toMatch(/Emma Johnson/i);
  });

  it(
    'caps serialized skeleton at 200 KB',
    async () => {
      const spans = Array.from({ length: 10_000 }, (_, i) => `<span class="row item" id="cell-${i}"></span>`).join(
        ''
      );
      document.body.innerHTML = `<div class="table">${spans}</div>`;
      const result = await captureSkeleton({ step: 'test.cap' });
    expect(result.byteLength).toBeLessThanOrEqual(MAX_BYTES);
    expect(result.skeleton.length).toBeLessThanOrEqual(MAX_BYTES);
      expect(result.truncated).toBe(true);
    },
    30_000
  );

  it('produces a stable sha256 across two captures of the same DOM', async () => {
    document.body.innerHTML =
      '<main class="nav table"><section id="course-42" role="region"><div class="btn active">92%</div></section></main>';
    const first = await captureSkeleton({ step: 'test.stable' });
    const second = await captureSkeleton({ step: 'test.stable' });
    expect(first.sha256).toBe(second.sha256);
    expect(first.skeleton).toBe(second.skeleton);
    expect(first.byteLength).toBe(second.byteLength);
  });
});
