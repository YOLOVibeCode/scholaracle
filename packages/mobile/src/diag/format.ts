import type { DiagEntry } from './store';
import type { DiagEnv } from './env';

export function formatSession(entries: DiagEntry[], env: DiagEnv): string {
  const head = [
    `Scholarmancy diag ${new Date().toISOString()}`,
    `api ${env.apiUrl}`,
    `v${env.appVersion ?? '?'} build ${env.nativeBuild ?? '?'} rtv ${String(env.runtimeVersion)}`,
    `update ${env.updateId ?? 'embedded'} ch=${env.channel ?? '?'} embedded=${String(env.isEmbeddedLaunch)}`,
    env.emergencyLaunchReason ? `emergency ${env.emergencyLaunchReason}` : null,
    `device ${env.model ?? '?'} ${env.os ?? ''}`.trim(),
    '---',
  ].filter((l): l is string => l !== null);
  const lines = entries.map((e) => {
    const data = e.data ? ` ${JSON.stringify(e.data)}` : '';
    return `${String(e.dt).padStart(6)}ms [${e.level[0]}] ${e.tag} ${e.msg}${data}`;
  });
  return [...head, ...lines].join('\n');
}
