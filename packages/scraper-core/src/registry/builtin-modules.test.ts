/**
 * Builtin module registry — host coverage tests (TDD).
 */

import { getBuiltinModules } from './builtin-modules';
import { matchHost } from './manifest';

describe('getBuiltinModules', () => {
  it('includes canvas, skyward, and aeries modules', () => {
    const ids = getBuiltinModules().map((m) => m.metadata.id);
    expect(ids).toContain('canvas');
    expect(ids).toContain('skyward');
    expect(ids).toContain('aeries');
  });

  describe('skyward module', () => {
    function skywardHosts() {
      const mod = getBuiltinModules().find((m) => m.metadata.id === 'skyward');
      if (!mod) throw new Error('skyward builtin not found');
      return mod.metadata.hosts;
    }

    it('matches *.skyward.com portals', () => {
      expect(matchHost(skywardHosts(), 'https://school.skyward.com/home')).toBe(true);
    });

    it('matches skyward.iscorp.com portals (Ava Lewis portal)', () => {
      expect(
        matchHost(
          skywardHosts(),
          'https://skyward.iscorp.com/scripts/wsisa.dll/WService=wsFin/seplog01.w'
        )
      ).toBe(true);
    });
  });
});
