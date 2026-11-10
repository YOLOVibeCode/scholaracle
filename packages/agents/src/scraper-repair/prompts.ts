/**
 * Fixed prompt prefix (system + recipe schema + selector table) shared across patch calls.
 */
export function buildRepairPromptPrefix(params: {
  readonly recipeId: string;
  readonly step: string;
  readonly selectorTableJson: string;
}): string {
  return [
    'You propose CSS selector patches for Scholarmancy portal scraper recipes.',
    'Output JSON only. Never invent PII; skeletons are pre-redacted.',
    `Recipe: ${params.recipeId}`,
    `Target step: ${params.step}`,
    'Selector table JSON schema: { "version": 1, "selectors": { "<key>": "<css selector>" } }',
    'Current selector table:',
    params.selectorTableJson,
  ].join('\n');
}

export const TRIAGE_SYSTEM =
  'Classify whether a DOM skeleton looks like a real portal page for scraper repair. Reply JSON only: {"real":boolean,"step":string}.';
