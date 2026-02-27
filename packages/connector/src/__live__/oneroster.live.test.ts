import { OneRosterClient } from '../oneroster/oneroster-client';
import { OneRosterAdapter } from '../oneroster/oneroster-adapter';
import { oneRosterEnv, describeIfAvailable } from './helpers';

const env = oneRosterEnv();

describeIfAvailable(env, 'OneRoster — Live Integration', () => {
  describe('OneRosterClient', () => {
    let client: OneRosterClient;

    beforeAll(async () => {
      if (env.accessToken) {
        client = new OneRosterClient({
          baseUrl: env.baseUrl,
          accessToken: env.accessToken,
        });
      } else {
        client = await OneRosterClient.fromClientCredentials(
          `${env.baseUrl}/token`,
          env.clientId,
          env.clientSecret,
          env.baseUrl
        );
      }
    });

    it('should list organizations', async () => {
      const orgs = await client.getOrgs();

      expect(Array.isArray(orgs)).toBe(true);
      console.log(`  ✓ Found ${orgs.length} organizations`);

      if (orgs.length > 0) {
        const o = orgs[0]!;
        expect(typeof o.name).toBe('string');
        console.log(`    First org: ${o.name} (type: ${o.type})`);
      }
    });

    it('should list academic sessions', async () => {
      const sessions = await client.getAcademicSessions();

      expect(Array.isArray(sessions)).toBe(true);
      console.log(`  ✓ Found ${sessions.length} academic sessions`);

      if (sessions.length > 0) {
        const s = sessions[0]!;
        console.log(`    First: ${s.title} (${s.type}, ${s.startDate} → ${s.endDate})`);
      }
    });

    it('should list courses', async () => {
      const courses = await client.getCourses();

      expect(Array.isArray(courses)).toBe(true);
      console.log(`  ✓ Found ${courses.length} courses`);

      if (courses.length > 0) {
        const c = courses[0]!;
        expect(typeof c.title).toBe('string');
        console.log(`    First: ${c.title} (code: ${c.courseCode ?? 'n/a'})`);
      }
    });

    it('should list line items (assignments)', async () => {
      const lineItems = await client.getLineItems();

      expect(Array.isArray(lineItems)).toBe(true);
      console.log(`  ✓ Found ${lineItems.length} line items (assignments)`);

      if (lineItems.length > 0) {
        const li = lineItems[0]!;
        expect(typeof li.title).toBe('string');
        console.log(
          `    First: "${li.title}" (due: ${li.dueDate ?? 'none'}, max: ${li.resultValueMax ?? 'n/a'})`
        );
      }
    });

    it('should list results (grades)', async () => {
      const results = await client.getResults();

      expect(Array.isArray(results)).toBe(true);
      console.log(`  ✓ Found ${results.length} results (grades)`);

      if (results.length > 0) {
        const r = results[0]!;
        console.log(`    First: score=${r.score}, status=${r.scoreStatus}`);
      }
    });
  });

  describe('OneRosterAdapter', () => {
    let adapter: OneRosterAdapter;

    beforeAll(async () => {
      adapter = new OneRosterAdapter();
      await adapter.authenticate({
        baseUrl: env.baseUrl,
        accessToken: env.accessToken || undefined,
        clientId: env.clientId || undefined,
        clientSecret: env.clientSecret || undefined,
      });
    });

    it('should test connection', async () => {
      const result = await adapter.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Connected');
      console.log(`  ✓ ${result.message} (${result.durationMs}ms)`);
    });

    it('should fetch a complete ingest envelope', async () => {
      const envelope = await adapter.fetchEnvelope({
        runId: `or-live-${Date.now()}`,
        sourceId: 'or-live-source',
        displayName: 'OneRoster Live Test',
        portalBaseUrl: env.baseUrl,
      });

      expect(envelope.schemaVersion).toBe('slc.ingest.v1');
      expect(envelope.run.provider).toBe('oneroster');

      const entityCounts = new Map<string, number>();
      for (const op of envelope.ops) {
        entityCounts.set(op.entity, (entityCounts.get(op.entity) ?? 0) + 1);
      }

      console.log(`  ✓ Envelope: ${envelope.ops.length} total ops`);
      for (const [entity, count] of entityCounts) {
        console.log(`    ${entity}: ${count}`);
      }
    }, 60_000);
  });
});
