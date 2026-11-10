import { HERMES_BROWSER_PRELUDE } from './hermesBrowserPrelude';

export function buildHermesHarness(pageFnSource: string, args: unknown): string {
  const argsJson = JSON.stringify(args);
  const isAsync = pageFnSource.startsWith('async function');
  const call = isAsync
    ? 'var __result = await __pageFn.apply(null, __args);'
    : 'var __result = __pageFn.apply(null, __args);';
  return `${HERMES_BROWSER_PRELUDE}
(async function() {
  var __pageFn = ${pageFnSource};
  var __raw = ${argsJson};
  var __args = Array.isArray(__raw) ? __raw : (__raw === null || __raw === undefined ? [] : [__raw]);
  try {
    ${call}
    print(JSON.stringify({ ok: true, resultType: typeof __result }));
  } catch (e) {
    print(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }));
  }
})();
`;
}
