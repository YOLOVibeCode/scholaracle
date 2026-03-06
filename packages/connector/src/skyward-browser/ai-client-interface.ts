/**
 * ISP: Scraper-only AI dependency. Single method for HTML parsing fallback.
 */
export interface IAiClient {
  parseHtml(html: string, schema: string): Promise<Record<string, unknown>>;
}
