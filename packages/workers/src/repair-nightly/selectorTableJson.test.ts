import { selectorTableJsonForRecipe } from './selectorTableJson';

describe('selectorTableJsonForRecipe', () => {
  it('returns empty selector table JSON for any recipe', () => {
    expect(selectorTableJsonForRecipe('aeries')).toBe(
      JSON.stringify({ version: 1, selectors: {} }, null, 0)
    );
  });
});
