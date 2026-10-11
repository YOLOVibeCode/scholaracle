import { isGsm7, toGsm7 } from './gsm7';

describe('toGsm7', () => {
  it('replaces arrows, curly quotes, dashes, ellipses and Intl spaces', () => {
    const out = toGsm7(
      '85% \u2192 72% \u201CEssay\u201D \u2014 Mrs. O\u2019Neil\u2026 11:59\u202FPM'
    );
    expect(out).toBe('85% to 72% "Essay" - Mrs. O\'Neil... 11:59 PM');
    expect(isGsm7(out)).toBe(true);
  });

  it('drops accents, emoji and characters outside GSM-7, and collapses whitespace', () => {
    const out = toGsm7('Jos\u00E9   \u{1F389} Pr\u00E9-Calc [H] {AP} ~ok~ | x\n\ny');
    expect(out).toBe('Jose Pre-Calc H AP ok x y');
    expect(isGsm7(out)).toBe(true);
  });

  it('isGsm7 rejects characters that force UCS-2', () => {
    expect(isGsm7('85% \u2192 72%')).toBe(false);
    expect(isGsm7('caf\u00E9 \u00E0 @ \u00A3')).toBe(true);
  });
});
