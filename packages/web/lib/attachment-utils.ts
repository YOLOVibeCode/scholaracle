import {
  FileText,
  Image,
  FileSpreadsheet,
  Presentation,
  Video,
  FileArchive,
  File,
  FileCode,
  Music,
} from 'lucide-react';
import type { ComponentType } from 'react';

const ICON_MAP: ReadonlyArray<[RegExp, ComponentType<{ className?: string }>]> = [
  [/^image\//, Image],
  [/^video\//, Video],
  [/^audio\//, Music],
  [/pdf/, FileText],
  [/spreadsheet|excel|csv/, FileSpreadsheet],
  [/presentation|powerpoint/, Presentation],
  [/html|javascript|typescript|json|xml|css/, FileCode],
  [/zip|tar|gz|rar|7z/, FileArchive],
  [/word|document|text/, FileText],
];

export function getAttachmentIcon(type?: string): ComponentType<{ className?: string }> {
  if (!type) return File;
  const lower = type.toLowerCase();
  for (const [pattern, icon] of ICON_MAP) {
    if (pattern.test(lower)) return icon;
  }
  return File;
}

export function isPreviewable(type?: string): boolean {
  if (!type) return false;
  const lower = type.toLowerCase();
  return lower.startsWith('image/') || lower === 'application/pdf';
}

export function getFileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toUpperCase() : '';
}
