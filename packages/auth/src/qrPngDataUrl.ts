import QRCode from 'qrcode';

export async function qrPngDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text);
}
