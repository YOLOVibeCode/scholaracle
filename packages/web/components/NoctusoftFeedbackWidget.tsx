import Script from 'next/script';

export const FEEDBACK_WIDGET_SRC = 'https://store.noctusoft.com/feedback/widget.js';

/** The relay's product key for Scholaracle. It is `scholarmancy`, not `scholaracle`. */
export const FEEDBACK_PRODUCT_KEY = 'scholarmancy';

/**
 * Noctusoft's cross-product feedback widget: one script tag that renders a floating
 * "Feedback" button and posts to the relay's public route. The relay accepts posts only
 * from scholarmancy.com, its subdomains, and localhost, so there is no key, env var, or
 * server route on our side.
 */
export function NoctusoftFeedbackWidget(): React.ReactElement {
  return (
    <Script
      src={FEEDBACK_WIDGET_SRC}
      data-product={FEEDBACK_PRODUCT_KEY}
      strategy="afterInteractive"
    />
  );
}
