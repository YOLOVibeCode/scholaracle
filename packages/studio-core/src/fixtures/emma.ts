import type { IStudentMaterialsResponse, IStudentSession } from '@scholaracle/contracts';
import type { IOpenTask, ITodaySource, IWin, IWorkPackSource } from '@scholaracle/interfaces';
import { TodayGuide } from '../TodayGuide';
import { WorkPack, createStaticWorkPackSource } from '../WorkPack';
import {
  EMMA_LAB_SAFETY_ASSET_ID,
  EMMA_LAB_SAFETY_FIXTURE_URL,
  EMMA_LAB_SAFETY_FIXTURE_URL_V2,
  EMMA_LAB_SAFETY_HASH,
  EMMA_LAB_SAFETY_HASH_V2,
} from './labSafetyPdf';

export type EmmaWorkPackVersion = 'v1' | 'v2';

/** Demo session for /studio fixture visualization. Grades stay off. */
export const EMMA_FIXTURE_SESSION: IStudentSession = {
  studentId: 'stu-emma',
  displayName: 'Emma Mitchell',
  showGrades: false,
};

const EMMA_WINS: readonly IWin[] = [
  {
    kind: 'graded',
    assignmentExternalId: 'demo-emma-eng10-reading-8',
    title: 'Reading response 8',
    courseName: 'English 10 Honors',
  },
];

const EMMA_TASKS: readonly IOpenTask[] = [
  {
    kind: 'missing',
    assignmentExternalId: 'demo-emma-ap-bio-a5',
    title: 'Cell Division worksheet',
    courseName: 'AP Biology',
    dueAt: '2026-08-29T16:00:00.000Z',
    primaryCtaLabel: 'Open worksheet',
  },
  {
    kind: 'due_soon',
    assignmentExternalId: 'demo-emma-span2-vocab',
    title: 'Vocab quiz',
    courseName: 'Spanish II',
    dueAt: '2026-08-25T16:00:00.000Z',
    primaryCtaLabel: 'Open quiz',
  },
];

export function createEmmaFixtureSource(): ITodaySource {
  return {
    recentWins: async () => EMMA_WINS,
    openTasks: async () => EMMA_TASKS,
  };
}

/** Cell Division as next, Reading response 8 as encouragement — visualization seed. */
export async function loadEmmaFixtureToday(): ReturnType<TodayGuide['load']> {
  return new TodayGuide(createEmmaFixtureSource()).load(EMMA_FIXTURE_SESSION);
}

const KHAN = 'https://www.khanacademy.org/science/ap-biology/cell-communication-and-cell-cycle';
const LMS = 'https://school.instructure.com/courses/bio101/assignments/cell-division';

const PACK_MATERIALS: IStudentMaterialsResponse = {
  studentId: 'stu-emma',
  studentName: 'Emma Mitchell',
  totalMaterials: 5,
  courses: [
    {
      courseExternalId: 'demo-emma-ap-bio',
      courseName: 'AP Biology',
      materials: [
        {
          externalId: 'demo-emma-ap-bio-syllabus',
          title: 'AP Biology Syllabus',
          type: 'syllabus',
          fileName: 'syllabus.pdf',
          assignmentExternalId: null,
          assetId: 'demo-asset-demo-emma-ap-bio-syllabus',
          contentHash: 'demo-demo-emma-ap-bio-syllabus-hash',
        },
        {
          externalId: 'demo-emma-ap-bio-lab-safety',
          title: 'Lab Safety Handout',
          type: 'handout',
          fileName: 'lab-safety.pdf',
          mimeType: 'application/pdf',
          assignmentExternalId: 'demo-emma-ap-bio-a5',
          assetId: EMMA_LAB_SAFETY_ASSET_ID,
          contentHash: EMMA_LAB_SAFETY_HASH,
          downloadUrl: EMMA_LAB_SAFETY_FIXTURE_URL,
        },
        {
          externalId: 'demo-emma-ap-bio-khan',
          title: 'Khan Academy - Cell Division',
          type: 'video',
          url: KHAN,
          linkAccessibility: 'public',
          assignmentExternalId: 'demo-emma-ap-bio-a5',
        },
        {
          externalId: 'demo-emma-ap-bio-yt',
          title: 'YouTube - AP Bio Review',
          type: 'video',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          linkAccessibility: 'public',
          assignmentExternalId: null,
        },
        {
          externalId: 'demo-emma-ap-bio-study-guide',
          title: 'Chapter 5 Study Guide',
          type: 'study_guide',
          fileName: 'ch5-study.pdf',
          assignmentExternalId: null,
          assetId: 'demo-asset-demo-emma-ap-bio-study-guide',
          contentHash: 'demo-demo-emma-ap-bio-study-guide-hash',
        },
      ],
    },
  ],
};

export function createEmmaFixtureWorkPackSource(
  version: EmmaWorkPackVersion = 'v1'
): IWorkPackSource {
  const materials: IStudentMaterialsResponse = {
    ...PACK_MATERIALS,
    courses: PACK_MATERIALS.courses.map((course) => ({
      ...course,
      materials: course.materials.map((m) => {
        if (m.externalId !== 'demo-emma-ap-bio-lab-safety') return m;
        if (version !== 'v2') return m;
        return {
          ...m,
          contentHash: EMMA_LAB_SAFETY_HASH_V2,
          downloadUrl: EMMA_LAB_SAFETY_FIXTURE_URL_V2,
        };
      }),
    })),
  };
  return createStaticWorkPackSource({
    assignment: {
      assignmentExternalId: 'demo-emma-ap-bio-a5',
      title: 'Cell Division',
      courseName: 'AP Biology',
      dueAt: '2026-08-20T16:00:00.000Z',
      status: 'missing',
      descriptionHtml:
        '<p>Complete the <strong>Cell Division</strong> worksheet below and submit via Canvas.</p>' +
        `<p>Reference materials: <a href="${KHAN}">Khan Academy – Cell Cycle</a>.</p>` +
        '<p>Lab safety rules apply — review the handout before lab time.</p>',
      lmsUrl: LMS,
    },
    materials,
  });
}

/** Cell Division pack — visualization seed for /studio/assignments/demo-emma-ap-bio-a5. */
export async function loadEmmaFixtureWorkPack(
  version: EmmaWorkPackVersion = 'v1'
): ReturnType<WorkPack['load']> {
  return new WorkPack(createEmmaFixtureWorkPackSource(version)).load(
    EMMA_FIXTURE_SESSION,
    'demo-emma-ap-bio-a5'
  );
}
