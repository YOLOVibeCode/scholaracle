import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Railway and CI build a Dockerfile without naming a target, so they get its
 * LAST stage. When that stage was `development`, production ran
 * `ts-node-dev --respawn`: after a crash it waits for a file change instead of
 * exiting, so the container stays up with a dead worker and Railway's restart
 * rule never fires.
 */
const DOCKERFILE_PATH = path.join(__dirname, '..', '..', '..', 'Dockerfile.workers');

interface IStage {
  readonly name: string;
  readonly instructions: readonly string[];
}

function parseStages(dockerfile: string): IStage[] {
  const stages: { name: string; instructions: string[] }[] = [];
  for (const raw of dockerfile.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const from = /^FROM\s+\S+(?:\s+AS\s+(\S+))?/i.exec(line);
    if (from) {
      stages.push({ name: from[1] ?? '', instructions: [] });
      continue;
    }
    stages[stages.length - 1]?.instructions.push(line);
  }
  return stages;
}

function lastStage(): IStage {
  const stages = parseStages(fs.readFileSync(DOCKERFILE_PATH, 'utf8'));
  const last = stages[stages.length - 1];
  if (!last) {
    throw new Error('Dockerfile.workers has no FROM line');
  }
  return last;
}

describe('Dockerfile.workers default image', () => {
  it('ends on the production stage, because that is the stage Railway builds', () => {
    expect(lastStage().name).toBe('production');
  });

  it('starts the compiled worker with node, not a dev server', () => {
    const commands = lastStage().instructions.filter((line) => line.startsWith('CMD'));

    expect(commands).toEqual(['CMD ["node", "packages/workers/dist/worker.js"]']);
  });

  it('runs with NODE_ENV=production', () => {
    expect(lastStage().instructions).toContain('ENV NODE_ENV=production');
  });
});
