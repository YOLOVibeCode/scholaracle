import { create } from 'qrcode/lib/core/qrcode';

/** Empty squares a camera needs on every side of a QR code to find it. */
export const QR_QUIET_ZONE = 4;

export interface IQrPicture {
  /** Squares along one side, quiet border included. Use it as the SVG viewBox size. */
  readonly size: number;
  /** One SVG path covering every dark square, on a grid of 1 x 1 squares. */
  readonly path: string;
}

/**
 * The QR code for `text`, as an SVG path the page draws itself.
 *
 * The text never leaves the page: no image service is asked to draw it. That matters
 * because the links we show this way carry a student's id.
 */
export function qrPicture(text: string): IQrPicture {
  const { modules } = create(text, { errorCorrectionLevel: 'M' });
  const runs: string[] = [];
  for (let row = 0; row < modules.size; row += 1) {
    let col = 0;
    while (col < modules.size) {
      if (!modules.get(row, col)) {
        col += 1;
        continue;
      }
      const start = col;
      while (col < modules.size && modules.get(row, col)) col += 1;
      const width = col - start;
      runs.push(`M${start + QR_QUIET_ZONE} ${row + QR_QUIET_ZONE}h${width}v1h-${width}z`);
    }
  }
  return { size: modules.size + QR_QUIET_ZONE * 2, path: runs.join('') };
}
