/** GSM 03.38 basic character set (single 7-bit units; no escape-table characters). */
export const GSM7_BASIC_CHARS =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

const GSM7_SET = new Set(GSM7_BASIC_CHARS);

/** Printable ASCII that is also GSM-7 basic: what sanitized texts may contain. */
const SAFE_CHARS = new Set(
  Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)).filter((ch) =>
    GSM7_SET.has(ch)
  )
);

const REPLACEMENTS: readonly (readonly [RegExp, string])[] = [
  [/\s*[\u2192\u21D2\u27A1\u279C]\s*/g, ' to '],
  [/[\u2018\u2019\u201A\u201B\u2032\u0060\u00B4]/g, "'"],
  [/[\u201C\u201D\u201E\u201F\u2033]/g, '"'],
  [/[\u2010-\u2015\u2212]/g, '-'],
  [/\u2026/g, '...'],
  [/[\u2022\u00B7]/g, '-'],
  // Intl date output puts U+202F (narrow no-break space) before AM/PM.
  [/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' '],
];

/** True when every character is in the GSM-7 basic set (one 7-bit unit each). */
export function isGsm7(text: string): boolean {
  return Array.from(text).every((ch) => GSM7_SET.has(ch));
}

/**
 * Rewrites text to plain GSM-7: straight quotes, hyphens, "to" for arrows, accents dropped,
 * anything else outside the set removed, whitespace collapsed to single spaces.
 */
export function toGsm7(text: string): string {
  let out = text;
  for (const [pattern, replacement] of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  out = Array.from(out)
    .map((ch) => (/\s/.test(ch) ? ' ' : ch))
    .filter((ch) => SAFE_CHARS.has(ch))
    .join('');
  return out.replace(/ {2,}/g, ' ').trim();
}
