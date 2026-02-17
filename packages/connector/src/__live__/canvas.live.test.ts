import { CanvasClient } from '../canvas/canvas-client';
import { CanvasAdapter } from '../canvas/canvas-adapter';
import { canvasEnv, describeIfAvailable } from './helpers';

const env = canvasEnv();

describeIfAvailable(env, 'Canvas LMS — Live Integration', () => {
  // ------------------------------------------------------------------
  // Client-level tests (raw API calls)
  // ------------------------------------------------------------------

  describe('CanvasClient', () => {
    let client: CanvasClient;

    beforeAll(() => {
      client = new CanvasClient({
        baseUrl: env.baseUrl,
        accessToken: env.accessToken,
      });
    });

    it('should fetch the current user profile (GET /api/v1/users/self)', async () => {
      const user = await client.getSelf();

      expect(user).toBeDefined();
      expect(user.id).toBeGreaterThan(0);
      expect(typeof user.name).toBe('string');
      expect(user.name.length).toBeGreaterThan(0);

      console.log(`  ✓ Authenticated as: ${user.name} (id: ${user.id})`);
    });

    it('should list courses', async () => {
      const courses = await client.getCourses();

      expect(Array.isArray(courses)).toBe(true);
      console.log(`  ✓ Found ${courses.length} active courses`);

      if (courses.length > 0) {
        const c = courses[0]!;
        expect(c.id).toBeGreaterThan(0);
        expect(typeof c.name).toBe('string');
        console.log(`    First course: ${c.name} (id: ${c.id})`);
      }
    });

    it('should list assignments for the first course', async () => {
      const courses = await client.getCourses();
      if (courses.length === 0) {
        console.log('  ⚠ No courses found — skipping assignment test');
        return;
      }

      const courseId = courses[0]!.id;
      const assignments = await client.getAssignments(courseId);

      expect(Array.isArray(assignments)).toBe(true);
      console.log(`  ✓ Found ${assignments.length} assignments in "${courses[0]!.name}"`);

      if (assignments.length > 0) {
        const a = assignments[0]!;
        expect(typeof a.name).toBe('string');
        expect(typeof a.points_possible).toBe('number');
        console.log(`    First assignment: "${a.name}" (${a.points_possible} pts, due: ${a.due_at ?? 'none'})`);
      }
    });

    it('should list submissions for the first course', async () => {
      const courses = await client.getCourses();
      if (courses.length === 0) return;

      const courseId = courses[0]!.id;
      const submissions = await client.getSubmissions(courseId);

      expect(Array.isArray(submissions)).toBe(true);
      console.log(`  ✓ Found ${submissions.length} submissions in "${courses[0]!.name}"`);

      if (submissions.length > 0) {
        const s = submissions[0]!;
        expect(typeof s.assignment_id).toBe('number');
        console.log(`    First submission: assignment ${s.assignment_id}, score: ${s.score}, state: ${s.workflow_state}`);
      }
    });

    it('should list calendar events', async () => {
      const today = new Date().toISOString().split('T')[0]!;
      const future = new Date(Date.now() + 90 * 24 * 60 * 60_000).toISOString().split('T')[0]!;
      const events = await client.getCalendarEvents(today, future);

      expect(Array.isArray(events)).toBe(true);
      console.log(`  ✓ Found ${events.length} calendar events (next 90 days)`);
    });
  });

  // ------------------------------------------------------------------
  // Adapter-level tests (full envelope generation)
  // ------------------------------------------------------------------

  describe('CanvasAdapter', () => {
    let adapter: CanvasAdapter;

    beforeAll(async () => {
      adapter = new CanvasAdapter();
      await adapter.authenticate({
        baseUrl: env.baseUrl,
        accessToken: env.accessToken,
      });
    });

    it('should authenticate successfully', () => {
      expect(adapter.isAuthenticated()).toBe(true);
    });

    it('should test connection', async () => {
      const result = await adapter.testConnection();

      expect(result.success).toBe(true);
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.message).toContain('Connected');
      console.log(`  ✓ ${result.message} (${result.durationMs}ms)`);
    });

    it('should fetch a complete ingest envelope', async () => {
      const envelope = await adapter.fetchEnvelope({
        runId: `live-test-${Date.now()}`,
        sourceId: 'live-test-source',
        displayName: 'Live Test',
        portalBaseUrl: env.baseUrl,
      });

      expect(envelope.schemaVersion).toBe('slc.ingest.v1');
      expect(envelope.run.provider).toBe('canvas');
      expect(envelope.run.adapterId).toBe('com.instructure.canvas');
      expect(Array.isArray(envelope.ops)).toBe(true);

      const entityCounts = new Map<string, number>();
      for (const op of envelope.ops) {
        entityCounts.set(op.entity, (entityCounts.get(op.entity) ?? 0) + 1);
      }

      console.log(`  ✓ Envelope: ${envelope.ops.length} total ops`);
      for (const [entity, count] of entityCounts) {
        console.log(`    ${entity}: ${count}`);
      }

      // Should have at least some ops if the account has any data
      // (we don't assert > 0 because a brand new account might be empty)
      expect(envelope.ops.length).toBeGreaterThanOrEqual(0);
    }, 30_000); // Allow 30s for full sync
  });
});
