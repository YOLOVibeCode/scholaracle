/**
 * Harness: FakePageDriver → transform → validateEnvelope for Parent Square.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SLC_INGEST_SCHEMA_VERSION_V1 } from '@scholaracle/contracts';
import { FakePageDriver } from '../../driver/FakePageDriver';
import { validateEnvelope } from '../../validator/validator';
import { checkScraperModule } from '../../registry/check-module';
import { parentSquareModule } from './index';
import { transformParentSquareExtract, type IParentSquareExtract } from './transform';

const ctx = {
  provider: 'parent-square',
  adapterId: parentSquareModule.metadata.adapterId,
  studentExternalId: 'stu-sample',
  institutionExternalId: 'inst-sample',
};

describe('Parent Square community scraper harness', () => {
  it('should pass structural checkScraperModule', async () => {
    const fixture = JSON.parse(
      readFileSync(join(__dirname, 'fixtures', 'sample.json'), 'utf8')
    ) as IParentSquareExtract;

    const errors = await checkScraperModule(parentSquareModule, {
      runFixtures: true,
      fixtures: {
        'https://portal.example.com': {
          html: '<html><body>ok</body></html>',
        },
      },
      config: { baseUrl: 'https://portal.example.com', studentNameHint: fixture.studentName },
      transformContext: ctx,
      driver: new FakePageDriver({
        initialUrl: 'https://portal.example.com',
        fixtures: {
          'https://portal.example.com': { html: '<html><body>ok</body></html>' },
        },
      }),
    });

    expect(errors.filter((e) => /missing scrape|missing transform|manifest/i.test(e))).toEqual([]);
  });

  it('should transform sample fixture into a valid envelope', () => {
    const fixture = JSON.parse(
      readFileSync(join(__dirname, 'fixtures', 'sample.json'), 'utf8')
    ) as IParentSquareExtract;
    const ops = transformParentSquareExtract(fixture, ctx);
    expect(ops.length).toBeGreaterThan(0);

    const envelope = {
      schemaVersion: SLC_INGEST_SCHEMA_VERSION_V1,
      run: {
        runId: 'harness-run-1',
        startedAt: fixture.scrapedAt,
        endedAt: fixture.scrapedAt,
        provider: ctx.provider,
        adapterId: ctx.adapterId,
        adapterVersion: parentSquareModule.metadata.version,
        mode: 'delta' as const,
        timezone: 'UTC',
      },
      source: {
        sourceId: 'src-harness',
        displayName: 'Parent Square',
        portalBaseUrl: 'https://portal.example.com',
      },
      ops,
    };

    const report = validateEnvelope(envelope);
    expect(report.passed).toBe(true);
    expect(report.errorCount).toBe(0);
  });
});
