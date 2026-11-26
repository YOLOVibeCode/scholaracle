'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import {
  feedbackPlacement,
  markFeedbackReady,
  type FeedbackPlacement,
} from '@/lib/feedback/feedback';

export const FEEDBACK_WIDGET_SRC = 'https://store.noctusoft.com/feedback/widget.js';

/** The relay's product key for Scholaracle. It is `scholarmancy`, not `scholaracle`. */
export const FEEDBACK_PRODUCT_KEY = 'scholarmancy';

/**
 * The relay serves the widget script and accepts its posts only for scholarmancy.com,
 * its subdomains, and localhost. On any other host (for example the Railway dev URL the
 * deploy gate tests against) the browser blocks the script with
 * ERR_BLOCKED_BY_RESPONSE.NotSameOrigin and logs a console error, which fails the critical
 * page-load check. Load the widget only where it can work.
 */
export function isFeedbackHostAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === 'scholarmancy.com' ||
    host.endsWith('.scholarmancy.com')
  );
}

/**
 * Noctusoft's cross-product feedback widget: one script tag that renders a floating
 * "Feedback" button and posts to the relay's public route. There is no key, env var, or
 * server route on our side. The host check runs after hydration so server and client
 * markup match.
 *
 * On a phone the floating button is not drawn (`data-hide-button`): it sits on top of the
 * page's own buttons there. The form is then opened from the page's menu instead, see
 * `lib/feedback/feedback.ts` and `FeedbackMenuButton`.
 */
export function NoctusoftFeedbackWidget({
  hostname,
}: {
  /** Test seam: defaults to the browser's current hostname. */
  readonly hostname?: string;
} = {}): React.ReactElement | null {
  const [placement, setPlacement] = useState<FeedbackPlacement | null>(null);
  useEffect(() => {
    setPlacement(
      isFeedbackHostAllowed(hostname ?? window.location.hostname) ? feedbackPlacement() : null
    );
  }, [hostname]);
  if (!placement) return null;
  return (
    <Script
      src={FEEDBACK_WIDGET_SRC}
      data-product={FEEDBACK_PRODUCT_KEY}
      data-hide-button={placement === 'menu' ? 'true' : undefined}
      strategy="afterInteractive"
      onReady={markFeedbackReady}
    />
  );
}
