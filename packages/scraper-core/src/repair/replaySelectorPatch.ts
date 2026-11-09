import type { IPageDriver } from '../driver/IPageDriver';
import { JsdomFixtureReplayDriver } from '../__fixtures__/jsdomFixtureReplayDriver';
import { runAeriesRecipe } from '../recipes/aeries-recipe';
import { countAeriesExtract, type IAeriesReplayCounts } from '../__fixtures__/countExtracts';
import { mergeSelectorRecord } from '../selectors/mergeSelectorTables';
import { AERIES_SELECTORS_V1 } from '../selectors/aeriesV1';
import { meetsAeriesCountStandard, formatCountDeficits } from './replayCountStandard';
import { loadAeriesReplayCountStandard, replaySubstrateForStep } from './replaySubstrateForStep';

export interface IReplaySelectorPatchParams {
  readonly recipeId: string;
  readonly step: string;
  readonly selectorPatch: Readonly<Record<string, string>>;
  readonly mutateGradebookHtml?: (html: string) => string;
  readonly countStandard?: IAeriesReplayCounts;
}

export interface IReplaySelectorPatchResult {
  readonly ok: boolean;
  readonly counts?: IAeriesReplayCounts;
  readonly reason?: string;
}

function buildDriver(
  substrate: NonNullable<ReturnType<typeof replaySubstrateForStep>>
): IPageDriver {
  return new JsdomFixtureReplayDriver({
    fixtures: substrate.fixtures,
    initialUrl: `${substrate.baseUrl}Dashboard.aspx`,
  });
}

export async function replaySelectorPatch(
  params: IReplaySelectorPatchParams
): Promise<IReplaySelectorPatchResult> {
  const substrate = replaySubstrateForStep(
    params.recipeId,
    params.step,
    params.mutateGradebookHtml
  );
  if (!substrate) {
    return { ok: false, reason: `no replay substrate for ${params.recipeId}/${params.step}` };
  }
  if (params.recipeId !== 'aeries') {
    return { ok: false, reason: 'only aeries replay is implemented' };
  }

  const standard = params.countStandard ?? loadAeriesReplayCountStandard();
  const merged = mergeSelectorRecord(AERIES_SELECTORS_V1, params.selectorPatch);
  const driver = buildDriver(substrate);
  const extract = await runAeriesRecipe(driver, substrate.baseUrl, { selectors: merged });
  const counts = countAeriesExtract(extract);
  const ok = meetsAeriesCountStandard(counts, standard);
  if (ok) return { ok: true, counts };
  return {
    ok: false,
    counts,
    reason: formatCountDeficits(counts, standard),
  };
}
