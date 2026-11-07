/**
 * @jest-environment jsdom
 *
 * Hermes gate: each registered page function must compile with hermesc and run in
 * the standalone Hermes VM (same family as the mobile app engine).
 */
import { PAGE_FNS } from './registry';
import { PAGE_FN_SOURCES } from './pageFns.generated';
import { compileAndRunHermesSmoke } from './hermesVmSmoke';
import { smokeArgsForPageFn } from './hermesSmokeArgs';

describe('page functions (Hermes compile + VM smoke)', () => {
  jest.setTimeout(180_000);

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('registers the same ids in PAGE_FNS and PAGE_FN_SOURCES', () => {
    expect(Object.keys(PAGE_FN_SOURCES).sort()).toEqual(Object.keys(PAGE_FNS).sort());
  });

  it.each(Object.keys(PAGE_FNS))(
    '%s compiles with hermesc and runs in the Hermes VM',
    async (id) => {
      const source = PAGE_FN_SOURCES[id];
      if (source === undefined) {
        throw new Error(`Missing PAGE_FN_SOURCES entry for ${id}`);
      }
      const args = smokeArgsForPageFn(id);
      await compileAndRunHermesSmoke(id, source, args);
    }
  );
});
