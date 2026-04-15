'use client';

import { useEffect, useRef } from 'react';

export function TrakletDevWidget(): null {
  const instanceRef = useRef<{ destroy: () => void } | null>(null);
  const initRef = useRef(false);

  useEffect((): (() => void) | undefined => {
    const token = process.env.NEXT_PUBLIC_TRAKLET_PAT;
    if (!token || process.env.NEXT_PUBLIC_TRAKLET_ENABLED !== 'true' || initRef.current) {
      return undefined;
    }
    initRef.current = true;

    void (async (): Promise<void> => {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { Traklet } = await import('traklet');
      instanceRef.current = await Traklet.init({
        adapter: 'github',
        token,
        projects: [
          {
            id: 'YOLOVibeCode/scholaracle',
            name: 'Scholaracle',
            identifier: 'YOLOVibeCode/scholaracle',
          },
        ],
        position: 'bottom-right',
      });
    })().catch((err) => console.warn('[Traklet] Failed to load:', err));

    return (): void => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
      initRef.current = false;
    };
  }, []);

  return null;
}
