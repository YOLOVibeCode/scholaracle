'use client';

import { cn } from '@/lib/utils';

export interface ProviderIconProps {
  /** Display name — first letter is used as the initial. */
  name: string;
  /** Hex color for the background (e.g. #E8471B). */
  brandColor: string;
  className?: string;
}

/**
 * Colored initial in a rounded square for provider cards.
 * Uses brandColor from the provider descriptor.
 */
export function ProviderIcon({ name, brandColor, className }: ProviderIconProps) {
  const initial = name.charAt(0).toUpperCase() || '?';
  return (
    <div
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white',
        className
      )}
      style={{ backgroundColor: brandColor }}
      aria-hidden
    >
      {initial}
    </div>
  );
}
