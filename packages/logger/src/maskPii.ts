const MAX_DEPTH = 8;

const EMAIL_FIELD_KEYS = new Set(['email', 'adminemail', 'recipientemail', 'createdbyadminemail']);

const PHONE_FIELD_KEYS = new Set(['phone', 'recipientphone', 'mobile']);

const CARD_FIELD_KEYS = new Set(['card', 'cardnumber', 'pan']);

const TEXT_SCAN_KEYS = new Set([
  'content',
  'htmlcontent',
  'subject',
  'reason',
  'failurereason',
  'note',
  'message',
  'msg',
]);

const EMAIL_IN_TEXT =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g;

/** E.164-ish and common domestic phone shapes. */
const PHONE_IN_TEXT = /\+?\d[\d\s().-]{7,}\d/g;

const CARD_IN_TEXT = /\b\d{13,19}\b/g;

/** Mask email: "user@example.com" → "u***@example.com" */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local[0]}***@${domain}`;
}

/** Mask phone: "+15551234567" → "+1***4567" */
export function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.length <= 4) return '***';
  return `${trimmed.slice(0, 2)}***${trimmed.slice(-4)}`;
}

/** Mask a card number string to last4 only. */
export function maskCardNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 13 && digits.length <= 19) {
    return `•••• ${digits.slice(-4)}`;
  }
  return value.replace(CARD_IN_TEXT, (match) => `•••• ${match.slice(-4)}`);
}

function maskStringByKey(key: string | undefined, value: string): string {
  const normalized = key?.toLowerCase() ?? '';
  if (EMAIL_FIELD_KEYS.has(normalized) || normalized.includes('email')) {
    return maskEmail(value);
  }
  if (PHONE_FIELD_KEYS.has(normalized) || normalized.includes('phone')) {
    return maskPhone(value);
  }
  if (CARD_FIELD_KEYS.has(normalized) || normalized.includes('card')) {
    return maskCardNumber(value);
  }
  if (TEXT_SCAN_KEYS.has(normalized)) {
    return maskPiiInString(value);
  }
  return value;
}

/** Scan free text and mask embedded email, phone, and card digit runs. */
export function maskPiiInString(input: string): string {
  let out = input;
  out = out.replace(EMAIL_IN_TEXT, (match) => maskEmail(match));
  out = out.replace(PHONE_IN_TEXT, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length < 10) return match;
    return maskPhone(match.trim());
  });
  out = out.replace(CARD_IN_TEXT, (match) => `•••• ${match.slice(-4)}`);
  return out;
}

/** Recursively mask PII in objects passed to logs or persistence. */
export function maskPiiDeep(value: unknown, depth = 0, parentKey?: string): unknown {
  if (depth > MAX_DEPTH) return '[REDACTED]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return maskStringByKey(parentKey, value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Error || value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => maskPiiDeep(item, depth + 1, parentKey));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = maskPiiDeep(v, depth + 1, k);
    }
    return out;
  }

  return value;
}
