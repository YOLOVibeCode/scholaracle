/**
 * Self-contained page function: structural DOM snapshot with D6 shape tokens only.
 * All helpers are nested so Hermes can inject this file's source without imports.
 */

const SKELETON_MAX_BYTES = 200 * 1024;

export interface ICaptureSkeletonResult {
  readonly step: string;
  readonly capturedAt: string;
  readonly pagePath?: string;
  readonly skeleton: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly truncated?: boolean;
}

export async function captureSkeleton(opts: { step: string }): Promise<ICaptureSkeletonResult> {
  const STRUCTURAL_CLASS = new Set([
    'active',
    'assignment',
    'body',
    'btn',
    'button',
    'card',
    'checkbox',
    'col',
    'container',
    'content',
    'course',
    'dialog',
    'disabled',
    'footer',
    'form',
    'gradebook',
    'header',
    'hidden',
    'html',
    'icon',
    'info',
    'input',
    'item',
    'label',
    'lg',
    'light',
    'link',
    'list',
    'login',
    'main',
    'md',
    'menu',
    'modal',
    'nav',
    'navbar',
    'option',
    'panel',
    'password',
    'primary',
    'radio',
    'readonly',
    'row',
    'secondary',
    'select',
    'selected',
    'sm',
    'student',
    'submit',
    'success',
    'table',
    'tbody',
    'td',
    'th',
    'thead',
    'title',
    'tr',
    'warning',
    'wrapper',
    'xl',
  ]);

  const SKIP_TAGS = new Set(['script', 'style', 'noscript']);

  function isAttrAllowlisted(name: string): boolean {
    const lower = name.toLowerCase();
    if (lower === 'class' || lower === 'id' || lower === 'role' || lower === 'type') return true;
    if (lower === 'name' || lower === 'href' || lower === 'title' || lower === 'alt') return true;
    if (lower === 'for' || lower === 'rel' || lower === 'tabindex') return true;
    if (lower.startsWith('aria-')) return true;
    if (lower.startsWith('data-')) return true;
    return false;
  }

  function tokenizeShape(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return '<w>';
    if (/^\+?[\d\s().-]{7,}$/.test(trimmed) && /\d{3}/.test(trimmed)) return '<d>';
    if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(trimmed)) return '<date>';
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return '<date>';
    if (/^[A-Za-z]{3}\s+\d{1,2},?\s+\d{4}$/.test(trimmed)) return '<date>';
    if (/^\d+(\.\d+)?%$/.test(trimmed)) return '<pct>';
    if (/^\d+$/.test(trimmed)) return '<d>';
    if (/^[\d\s%./:-]+$/.test(trimmed)) return '<d>';
    return '<w>';
  }

  function tokenizeClassList(raw: string): string[] {
    const parts = raw.split(/\s+/).filter(Boolean);
    const out: string[] = [];
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (STRUCTURAL_CLASS.has(lower)) {
        if (!out.includes(lower)) out.push(lower);
        continue;
      }
      const segs = lower.split(/[-_]+/).filter(Boolean);
      for (const seg of segs) {
        const tok = STRUCTURAL_CLASS.has(seg) ? seg : tokenizeShape(seg);
        if (tok && !out.includes(tok)) out.push(tok);
      }
    }
    return out;
  }

  function tokenizePagePath(): string {
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    if (!path) return '';
    return path
      .split('/')
      .map((seg) => (seg ? tokenizeShape(seg) : ''))
      .join('/');
  }

  interface ISkeletonNode {
    t: string;
    i?: string;
    c?: string[];
    a?: Record<string, string>;
    ch?: ISkeletonNode[];
  }

  function serializeElement(el: Element, depth: number): ISkeletonNode | null {
    const tag = el.tagName?.toLowerCase();
    if (!tag || SKIP_TAGS.has(tag)) return null;
    const node: ISkeletonNode = { t: tag };
    const id = el.getAttribute('id');
    if (id) node.i = tokenizeShape(id);
    const cls = el.getAttribute('class');
    if (cls) {
      const c = tokenizeClassList(cls);
      if (c.length > 0) node.c = c;
    }
    const attrs: Record<string, string> = {};
    for (const attr of Array.from(el.attributes)) {
      if (!isAttrAllowlisted(attr.name)) continue;
      if (attr.name === 'class' || attr.name === 'id') continue;
      attrs[attr.name] = tokenizeShape(attr.value);
    }
    if (Object.keys(attrs).length > 0) node.a = attrs;

    if (depth < 48) {
      const children: ISkeletonNode[] = [];
      for (const child of Array.from(el.children)) {
        const childNode = serializeElement(child, depth + 1);
        if (childNode) children.push(childNode);
      }
      if (children.length > 0) node.ch = children;
    }
    return node;
  }

  function capTree(root: ISkeletonNode): { tree: ISkeletonNode; truncated: boolean } {
    const tree: ISkeletonNode = JSON.parse(JSON.stringify(root)) as ISkeletonNode;
    let truncated = false;

    const measure = (): number => JSON.stringify({ v: 1, step: opts.step, r: tree }).length;

    const shrinkNode = (node: ISkeletonNode): boolean => {
      const ch = node.ch;
      if (!ch || ch.length === 0) return false;
      let lo = 0;
      let hi = ch.length;
      while (lo < hi) {
        const mid = Math.floor((lo + hi + 1) / 2);
        const saved = node.ch;
        node.ch = ch.slice(0, mid);
        if (measure() <= SKELETON_MAX_BYTES) lo = mid;
        else {
          node.ch = saved;
          hi = mid - 1;
        }
      }
      if (lo < ch.length) {
        node.ch = ch.slice(0, lo);
        return true;
      }
      return false;
    };

    while (measure() > SKELETON_MAX_BYTES) {
      truncated = true;
      const stack: ISkeletonNode[] = [tree];
      const parents: ISkeletonNode[] = [];
      while (stack.length > 0) {
        const cur = stack.pop();
        if (!cur?.ch || cur.ch.length === 0) continue;
        parents.push(cur);
        for (const child of cur.ch) stack.push(child);
      }
      let didShrink = false;
      for (let i = parents.length - 1; i >= 0; i--) {
        if (shrinkNode(parents[i]!)) {
          didShrink = true;
          break;
        }
      }
      if (!didShrink) break;
    }
    return { tree, truncated };
  }

  function encodeUtf8(text: string): Uint8Array {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
    const out: number[] = [];
    const encoded = encodeURIComponent(text);
    for (let i = 0; i < encoded.length; i++) {
      const ch = encoded.charAt(i);
      if (ch === '%') {
        out.push(parseInt(encoded.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        out.push(encoded.charCodeAt(i));
      }
    }
    return new Uint8Array(out);
  }

  async function sha256Hex(text: string): Promise<string> {
    const data = encodeUtf8(text);
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
      throw new Error('crypto.subtle unavailable');
    }
    const digest = await subtle.digest('SHA-256', data as BufferSource);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  const rootEl = document.documentElement;
  const root = serializeElement(rootEl, 0) ?? { t: 'html' };
  const { tree, truncated } = capTree(root);
  const skeleton = JSON.stringify({ v: 1, step: opts.step, r: tree });
  const byteLength = encodeUtf8(skeleton).length;
  const sha256 = await sha256Hex(skeleton);

  return {
    step: opts.step,
    capturedAt: new Date().toISOString(),
    pagePath: tokenizePagePath(),
    skeleton,
    byteLength,
    sha256,
    ...(truncated ? { truncated } : {}),
  };
}
