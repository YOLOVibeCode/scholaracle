import { AERIES_SELECTORS_V1 } from '../selectors/aeriesV1';
import { SKYWARD_SELECTORS_V1 } from '../selectors/skywardV1';
import { resolveCanonicalAdapterId } from '../registry';

export function selectorTableJsonForRecipe(recipeId: string): string {
  const canonical = resolveCanonicalAdapterId(recipeId);
  if (canonical === 'aeries') {
    return JSON.stringify({ version: 1, selectors: AERIES_SELECTORS_V1 }, null, 0);
  }
  if (canonical === 'skyward') {
    return JSON.stringify({ version: 1, selectors: SKYWARD_SELECTORS_V1 }, null, 0);
  }
  return JSON.stringify({ version: 1, selectors: {} }, null, 0);
}
