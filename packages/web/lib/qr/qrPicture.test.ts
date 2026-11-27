import { create } from 'qrcode/lib/core/qrcode';
import { QR_QUIET_ZONE, qrPicture } from './qrPicture';

/** Rebuilds the grid of dark squares from the SVG path, so the path can be checked. */
function darkSquares(path: string, size: number): boolean[][] {
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  for (const [, x, y, width] of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let i = 0; i < Number(width); i += 1) {
      const row = grid[Number(y)];
      if (row) row[Number(x) + i] = true;
    }
  }
  return grid;
}

describe('qrPicture', () => {
  const link = 'scholarmancy://connect?studentId=student-1';

  it('draws exactly the dark squares of the QR code for the text', () => {
    const picture = qrPicture(link);
    const { modules } = create(link, { errorCorrectionLevel: 'M' });
    const grid = darkSquares(picture.path, picture.size);

    expect(picture.size).toBe(modules.size + QR_QUIET_ZONE * 2);
    for (let row = 0; row < picture.size; row += 1) {
      for (let col = 0; col < picture.size; col += 1) {
        const inside =
          row >= QR_QUIET_ZONE &&
          col >= QR_QUIET_ZONE &&
          row < picture.size - QR_QUIET_ZONE &&
          col < picture.size - QR_QUIET_ZONE;
        const expected = inside
          ? Boolean(modules.get(row - QR_QUIET_ZONE, col - QR_QUIET_ZONE))
          : false;
        expect([row, col, grid[row]?.[col]]).toEqual([row, col, expected]);
      }
    }
  });

  it('starts with the corner marker every QR code has: seven dark squares in a row', () => {
    expect(qrPicture(link).path.startsWith(`M${QR_QUIET_ZONE} ${QR_QUIET_ZONE}h7v1h-7z`)).toBe(
      true
    );
  });

  it('leaves four empty squares on every side, which a camera needs to find the code', () => {
    expect(QR_QUIET_ZONE).toBe(4);
  });

  it('gives a different picture for different text, and the same one for the same text', () => {
    expect(qrPicture(link).path).toBe(qrPicture(link).path);
    expect(qrPicture(`${link}2`).path).not.toBe(qrPicture(link).path);
  });

  it('grows the grid for longer text instead of failing', () => {
    const long = `scholarmancy://connect?studentId=${'a'.repeat(200)}`;
    expect(qrPicture(long).size).toBeGreaterThan(qrPicture(link).size);
  });
});
