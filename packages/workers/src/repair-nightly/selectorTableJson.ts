/**
 * Nightly worker uses an empty selector shell when scraper-core is not linked on the worker
 * package (lockfile gate). Staff/API repair supplies the full table from scraper-core.
 */
export function selectorTableJsonForRecipe(_recipeId: string): string {
  return JSON.stringify({ version: 1, selectors: {} }, null, 0);
}
