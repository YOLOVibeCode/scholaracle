import { GoogleClassroomClient } from '../google-classroom/google-classroom-client';
import { GoogleClassroomAdapter } from '../google-classroom/google-classroom-adapter';
import { googleClassroomEnv, describeIfAvailable } from './helpers';

const env = googleClassroomEnv();

describeIfAvailable(env, 'Google Classroom — Live Integration', () => {
  describe('GoogleClassroomClient', () => {
    let client: GoogleClassroomClient;

    beforeAll(() => {
      client = new GoogleClassroomClient({ accessToken: env.accessToken });
    });

    it('should list courses', async () => {
      const courses = await client.getCourses();

      expect(Array.isArray(courses)).toBe(true);
      console.log(`  ✓ Found ${courses.length} active courses`);

      if (courses.length > 0) {
        const c = courses[0]!;
        expect(typeof c.id).toBe('string');
        expect(typeof c.name).toBe('string');
        console.log(`    First course: ${c.name} (id: ${c.id})`);
      }
    });

    it('should list coursework for the first course', async () => {
      const courses = await client.getCourses();
      if (courses.length === 0) {
        console.log('  ⚠ No courses found — skipping coursework test');
        return;
      }

      const courseId = courses[0]!.id;
      const courseWork = await client.getCourseWork(courseId);

      expect(Array.isArray(courseWork)).toBe(true);
      console.log(`  ✓ Found ${courseWork.length} coursework items in "${courses[0]!.name}"`);

      if (courseWork.length > 0) {
        const cw = courseWork[0]!;
        expect(typeof cw.title).toBe('string');
        console.log(`    First item: "${cw.title}" (type: ${cw.workType}, max: ${cw.maxPoints ?? 'ungraded'})`);
      }
    });

    it('should list student submissions for coursework', async () => {
      const courses = await client.getCourses();
      if (courses.length === 0) return;

      const courseWork = await client.getCourseWork(courses[0]!.id);
      if (courseWork.length === 0) {
        console.log('  ⚠ No coursework found — skipping submissions test');
        return;
      }

      const submissions = await client.getStudentSubmissions(courses[0]!.id, courseWork[0]!.id);

      expect(Array.isArray(submissions)).toBe(true);
      console.log(`  ✓ Found ${submissions.length} submissions for "${courseWork[0]!.title}"`);

      if (submissions.length > 0) {
        const s = submissions[0]!;
        console.log(`    First: state=${s.state}, grade=${s.assignedGrade ?? 'none'}, late=${s.late ?? false}`);
      }
    });

    it('should list students in a course', async () => {
      const courses = await client.getCourses();
      if (courses.length === 0) return;

      const students = await client.getStudents(courses[0]!.id);

      expect(Array.isArray(students)).toBe(true);
      console.log(`  ✓ Found ${students.length} students in "${courses[0]!.name}"`);
    });
  });

  describe('GoogleClassroomAdapter', () => {
    let adapter: GoogleClassroomAdapter;

    beforeAll(async () => {
      adapter = new GoogleClassroomAdapter();
      await adapter.authenticate({
        baseUrl: 'https://classroom.googleapis.com',
        accessToken: env.accessToken,
      });
    });

    it('should authenticate successfully', () => {
      expect(adapter.isAuthenticated()).toBe(true);
    });

    it('should test connection', async () => {
      const result = await adapter.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Connected');
      console.log(`  ✓ ${result.message} (${result.durationMs}ms)`);
    });

    it('should fetch a complete ingest envelope', async () => {
      const envelope = await adapter.fetchEnvelope({
        runId: `gc-live-${Date.now()}`,
        sourceId: 'gc-live-source',
        displayName: 'GC Live Test',
      });

      expect(envelope.schemaVersion).toBe('slc.ingest.v1');
      expect(envelope.run.provider).toBe('google-classroom');

      const entityCounts = new Map<string, number>();
      for (const op of envelope.ops) {
        entityCounts.set(op.entity, (entityCounts.get(op.entity) ?? 0) + 1);
      }

      console.log(`  ✓ Envelope: ${envelope.ops.length} total ops`);
      for (const [entity, count] of entityCounts) {
        console.log(`    ${entity}: ${count}`);
      }
    }, 30_000);
  });
});
