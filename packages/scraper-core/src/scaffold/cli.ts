#!/usr/bin/env npx ts-node
/* eslint-disable no-console */
/**
 * CLI: scaffold a community scraper module.
 *
 * Usage:
 *   pnpm scaffold -- --name "Parent Square" --host "*.parentsquare.com"
 *   pnpm scaffold -- --name "IC" --host "*.infinitecampus.org" --entities course,assignment,message
 */

import { join } from 'node:path';
import { scaffoldScraperModule } from './scaffold';

/** Drop bare `--` that pnpm injects between script and user args. */
const ARGV = process.argv.filter((a) => a !== '--');

function getArg(flag: string): string | undefined {
  const idx = ARGV.indexOf(flag);
  if (idx === -1 || idx + 1 >= ARGV.length) return undefined;
  return ARGV[idx + 1];
}

function getList(flag: string): string[] | undefined {
  const raw = getArg(flag);
  if (!raw) return undefined;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function main(): void {
  if (ARGV.includes('--help') || ARGV.includes('-h')) {
    console.log(`
Scaffold a Scholaracle community scraper (IScraperModule + FakePageDriver harness)

  pnpm scaffold -- --name "<Platform>" --host "<pattern>" [--entities a,b,c] [--out <dir>]

Examples:
  pnpm scaffold -- --name "Parent Square" --host "*.parentsquare.com"
  pnpm scaffold -- --name "PowerSchool" --host "*.powerschool.com" --entities course,assignment,gradeSnapshot,message
`);
    process.exit(0);
  }

  const name = getArg('--name');
  const host = getArg('--host');
  const hosts = getList('--hosts') ?? (host ? [host] : undefined);
  const entities = getList('--entities');
  const outDir = getArg('--out') ?? join(__dirname, '..', 'community');

  if (!name || !hosts?.length) {
    console.error('Required: --name and --host (or --hosts a,b)');
    process.exit(1);
  }

  const result = scaffoldScraperModule({
    name,
    hosts,
    entities,
    outDir,
  });

  console.log(`\n  Scaffolded ${name}`);
  console.log(`  → ${result.dir}`);
  console.log(`  Files: ${result.files.join(', ')}`);
  console.log('\n  Next:');
  console.log('    1. Implement scrape() in index.ts');
  console.log(`    2. pnpm test -- ${result.slug}`);
  console.log('    3. Sideload when harness is green\n');
}

main();
