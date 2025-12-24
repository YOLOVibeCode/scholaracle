import { SLC_INGEST_SCHEMA_VERSION_V1, type ISlcIngestEnvelopeV1 } from '@scholaracle/contracts';

export function buildFixtureEnvelope(params: {
  readonly runId: string;
  readonly sourceId: string;
  readonly displayName: string;
  readonly portalBaseUrl?: string;
}): ISlcIngestEnvelopeV1 {
  const now = new Date().toISOString();
  return {
    schemaVersion: SLC_INGEST_SCHEMA_VERSION_V1,
    run: {
      runId: params.runId,
      startedAt: now,
      provider: 'fixture',
      adapterId: 'com.scholaracle.fixture',
      adapterVersion: '0.1.0',
      mode: 'delta',
      timezone: 'America/Los_Angeles',
    },
    source: {
      sourceId: params.sourceId,
      displayName: params.displayName,
      portalBaseUrl: params.portalBaseUrl,
    },
    ops: [
      {
        op: 'upsert',
        entity: 'assignment',
        key: {
          provider: 'fixture',
          adapterId: 'com.scholaracle.fixture',
          externalId: 'assignment-1',
          studentExternalId: 'student-ext-1',
          institutionExternalId: 'institution-ext-1',
          courseExternalId: 'course-ext-1',
          termExternalId: 'term-ext-fall',
        },
        observedAt: now,
        record: {
          title: 'Read Chapter 1',
          dueAt: new Date(Date.now() + 48 * 60 * 60_000).toISOString(),
          status: 'missing',
          pointsPossible: 10,
          pointsEarned: 0,
        },
      },
      {
        op: 'upsert',
        entity: 'eventSeries',
        key: {
          provider: 'fixture',
          adapterId: 'com.scholaracle.fixture',
          externalId: 'series-quiz-fridays',
          studentExternalId: 'student-ext-1',
          institutionExternalId: 'institution-ext-1',
          termExternalId: 'term-ext-fall',
        },
        observedAt: now,
        record: {
          title: 'Weekly Quiz',
          category: 'quiz',
          timezone: 'America/Los_Angeles',
          startsAt: '2025-09-05T08:00:00',
          endsAt: '2025-09-05T08:30:00',
          recurrence: {
            rrule: 'FREQ=WEEKLY;BYDAY=FR',
            count: 4,
            exDates: [],
          },
        },
      },
    ],
  };
}


