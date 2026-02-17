/**
 * Subject reconciliation system.
 *
 * Normalizes course titles from different LMS/SIS platforms into
 * standardized subject areas, and links courses to teachers and materials.
 *
 * This solves the problem where:
 *  - Canvas calls it "AP Physics C: Mechanics"
 *  - Skyward calls it "PHYSICS 2 AP"
 *  - Google Classroom calls it "Physics - Period 3 (Smith)"
 *  - OneRoster calls it "PHY201" with subject "Sciences"
 *
 * All should map to subject area: "Science > Physics"
 */

// ---------------------------------------------------------------------------
// Standard subject taxonomy
// ---------------------------------------------------------------------------

export type SubjectArea =
  | 'math'
  | 'science'
  | 'english'
  | 'social-studies'
  | 'world-languages'
  | 'arts'
  | 'technology'
  | 'health-pe'
  | 'elective'
  | 'other';

export type SubjectSubArea = string; // e.g., "algebra", "physics", "us-history"

export interface IReconciledSubject {
  readonly area: SubjectArea;
  readonly subArea?: SubjectSubArea;
  readonly confidence: 'high' | 'medium' | 'low';
  /** Signals that contributed to the classification. */
  readonly signals: readonly string[];
}

// ---------------------------------------------------------------------------
// Course reconciliation result
// ---------------------------------------------------------------------------

export interface IReconciledCourse {
  /** Original course title as scraped. */
  readonly rawTitle: string;
  /** Cleaned, normalized title. */
  readonly normalizedTitle: string;
  /** Detected subject area. */
  readonly subject: IReconciledSubject;
  /** Is this an honors or advanced course? */
  readonly isHonors: boolean;
  /** Is this an AP (Advanced Placement) course? */
  readonly isAP: boolean;
  /** Is this a dual-enrollment / college-credit course? */
  readonly isDualEnrollment: boolean;
  /** Extracted period number (if present). */
  readonly period?: number;
  /** Extracted section (if present). */
  readonly section?: string;
  /** Teacher name (if extracted from title or provided separately). */
  readonly teacherName?: string;
}

// ---------------------------------------------------------------------------
// Keyword → subject area mapping
// ---------------------------------------------------------------------------

interface ISubjectPattern {
  readonly area: SubjectArea;
  readonly subArea?: string;
  readonly patterns: readonly RegExp[];
}

const SUBJECT_PATTERNS: readonly ISubjectPattern[] = [
  // *** Priority: Specific compound terms that would otherwise match a broader category ***
  // "Computer Science" must match technology, not science
  { area: 'technology', subArea: 'computer-science', patterns: [/computer sci/i, /\bap cs\b/i, /\bcsa\b/i, /programming/i, /coding/i] },
  // "Art History" must match arts, not social-studies
  { area: 'arts', subArea: 'visual-art', patterns: [/\bart hist/i] },
  // "Creative Writing" must match english/creative-writing, not composition
  { area: 'english', subArea: 'creative-writing', patterns: [/creative writ/i] },

  // Math
  { area: 'math', subArea: 'algebra', patterns: [/algebra/i, /\balg\b/i] },
  { area: 'math', subArea: 'geometry', patterns: [/geometry/i, /\bgeom\b/i] },
  { area: 'math', subArea: 'precalculus', patterns: [/pre.?calc/i] },
  { area: 'math', subArea: 'calculus', patterns: [/calculus/i, /\bcalc\b/i] },
  { area: 'math', subArea: 'statistics', patterns: [/statistic/i, /\bstats?\b/i, /\bap stat/i] },
  { area: 'math', subArea: 'trigonometry', patterns: [/trigonometry/i, /\btrig\b/i] },
  { area: 'math', patterns: [/\bmath\b/i, /\bmth\b/i, /arithmetic/i] },

  // Science (after Computer Science is already matched above)
  { area: 'science', subArea: 'physics', patterns: [/physics/i, /\bphys\b/i, /\bphy\d/i] },
  { area: 'science', subArea: 'chemistry', patterns: [/chemistry/i, /\bchem\b/i] },
  { area: 'science', subArea: 'biology', patterns: [/biology/i, /\bbio\b/i, /\bbiol\b/i] },
  { area: 'science', subArea: 'environmental', patterns: [/environmental/i, /\benviro/i, /\bapes\b/i] },
  { area: 'science', subArea: 'earth-science', patterns: [/earth sci/i, /geology/i, /geoscience/i] },
  { area: 'science', subArea: 'anatomy', patterns: [/anatomy/i, /physiology/i, /\ba&p\b/i] },
  { area: 'science', patterns: [/(?<!computer )science/i, /(?<!computer )\bsci\b/i, /\blab\b/i] },

  // English / Language Arts
  { area: 'english', subArea: 'creative-writing', patterns: [/creative writ/i] },
  { area: 'english', subArea: 'literature', patterns: [/literature/i, /\blit\b/i] },
  { area: 'english', subArea: 'composition', patterns: [/composition/i, /\bcomp\b/i, /\bwriting\b/i] },
  { area: 'english', patterns: [/english/i, /\beng\b/i, /\bela\b/i, /language arts/i, /\brla\b/i, /\bla\d/i, /reading/i] },

  // Arts (art history already matched above in priority section)
  { area: 'arts', subArea: 'visual-art', patterns: [/\bart\b/i, /visual art/i, /painting/i, /drawing/i, /sculpture/i, /ceramics/i] },
  { area: 'arts', subArea: 'music', patterns: [/music/i, /\bband\b/i, /orchestra/i, /choir/i, /chorus/i] },
  { area: 'arts', subArea: 'theater', patterns: [/theat(er|re)/i, /drama/i, /\bact(ing)?\b/i] },
  { area: 'arts', subArea: 'dance', patterns: [/dance/i] },

  // Technology (must come before social-studies to catch "AP Computer Science" before bare patterns)
  { area: 'technology', subArea: 'computer-science', patterns: [/computer sci/i, /\bap cs/i, /\bcsa\b/i, /programming/i, /coding/i] },
  { area: 'technology', subArea: 'engineering', patterns: [/engineering/i, /robotics/i, /\bpltw\b/i] },
  { area: 'technology', patterns: [/technolog/i, /\btech\b/i, /digital/i, /information tech/i] },

  // Social Studies
  { area: 'social-studies', subArea: 'us-history', patterns: [/us hist/i, /u\.s\. hist/i, /american hist/i, /\bush\b/i, /\bapush\b/i] },
  { area: 'social-studies', subArea: 'world-history', patterns: [/world hist/i, /\bwhist\b/i, /\bap world/i] },
  { area: 'social-studies', subArea: 'government', patterns: [/government/i, /\bgov\b/i, /\bcivics\b/i, /\bap gov/i] },
  { area: 'social-studies', subArea: 'economics', patterns: [/economics/i, /\becon\b/i, /\bap (micro|macro)/i] },
  { area: 'social-studies', subArea: 'geography', patterns: [/geography/i, /\bgeog\b/i, /\bap human geo/i] },
  { area: 'social-studies', subArea: 'psychology', patterns: [/psychology/i, /\bpsych\b/i] },
  { area: 'social-studies', patterns: [/social stud/i, /\bss\d/i, /history/i, /\bhist\b/i] },

  // World Languages
  { area: 'world-languages', subArea: 'spanish', patterns: [/spanish/i, /\bspan\b/i, /espa[ñn]ol/i] },
  { area: 'world-languages', subArea: 'french', patterns: [/french/i, /fran[cç]ais/i] },
  { area: 'world-languages', subArea: 'german', patterns: [/german/i, /deutsch/i] },
  { area: 'world-languages', subArea: 'latin', patterns: [/\blatin\b/i] },
  { area: 'world-languages', subArea: 'chinese', patterns: [/chinese/i, /mandarin/i] },
  { area: 'world-languages', subArea: 'japanese', patterns: [/japanese/i] },
  { area: 'world-languages', subArea: 'asl', patterns: [/\basl\b/i, /sign language/i] },

  // (Arts and Technology patterns were moved above Social Studies for correct precedence)

  // Health & PE
  { area: 'health-pe', subArea: 'pe', patterns: [/phys(ical)? ed/i, /\bpe\b/i, /athletics/i, /\bgym\b/i] },
  { area: 'health-pe', subArea: 'health', patterns: [/health/i, /wellness/i, /nutrition/i] },
];

// ---------------------------------------------------------------------------
// Reconciler
// ---------------------------------------------------------------------------

/** Flags that indicate course level. */
const AP_PATTERN = /\bap\b|advanced\s+placement/i;
const HONORS_PATTERN = /\bhonors?\b|\bhn?rs?\b|\bh$/i;
const DUAL_ENROLL_PATTERN = /\bdual\b|\bcollege\b|\bdc\b|\bde\b/i;
const PERIOD_PATTERN = /(?:per(?:iod)?|pd?)[\s.:]*(\d+)/i;
const SECTION_PATTERN = /(?:sec(?:tion)?|sect?)[\s.:]*([A-Z0-9]+)/i;
const TEACHER_IN_PARENS = /\(([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\)\s*$/;

/**
 * Normalize a raw course title by stripping noise, extracting metadata,
 * and classifying the subject area.
 */
export function reconcileCourse(rawTitle: string, teacherName?: string): IReconciledCourse {
  const signals: string[] = [];

  // Extract metadata before cleaning
  const isAP = AP_PATTERN.test(rawTitle);
  const isHonors = HONORS_PATTERN.test(rawTitle) && !isAP; // AP takes precedence
  const isDualEnrollment = DUAL_ENROLL_PATTERN.test(rawTitle);

  const periodMatch = rawTitle.match(PERIOD_PATTERN);
  const period = periodMatch ? parseInt(periodMatch[1]!, 10) : undefined;

  const sectionMatch = rawTitle.match(SECTION_PATTERN);
  const section = sectionMatch ? sectionMatch[1] : undefined;

  // Try to extract teacher name from title like "Physics (Smith)"
  const teacherMatch = rawTitle.match(TEACHER_IN_PARENS);
  const extractedTeacher = teacherMatch ? teacherMatch[1] : undefined;
  const resolvedTeacher = teacherName ?? extractedTeacher;

  if (isAP) signals.push('AP flag detected');
  if (isHonors) signals.push('Honors flag detected');
  if (isDualEnrollment) signals.push('Dual enrollment flag detected');

  // Clean the title for classification
  let cleaned = rawTitle
    .replace(AP_PATTERN, '')
    .replace(HONORS_PATTERN, '')
    .replace(DUAL_ENROLL_PATTERN, '')
    .replace(PERIOD_PATTERN, '')
    .replace(SECTION_PATTERN, '')
    .replace(TEACHER_IN_PARENS, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove trailing numbers (like "PHYSICS 2" → "PHYSICS" for classification)
  const withoutTrailingNum = cleaned.replace(/\s+\d+\s*$/, '').trim();

  // Classify subject
  let subject: IReconciledSubject = {
    area: 'other',
    confidence: 'low',
    signals: ['No subject patterns matched'],
  };

  for (const sp of SUBJECT_PATTERNS) {
    for (const pattern of sp.patterns) {
      if (pattern.test(cleaned) || pattern.test(withoutTrailingNum)) {
        subject = {
          area: sp.area,
          subArea: sp.subArea,
          confidence: sp.subArea ? 'high' : 'medium',
          signals: [...signals, `Matched pattern: ${pattern.source}`],
        };
        break;
      }
    }
    if (subject.area !== 'other') break;
  }

  // Build normalized title
  const prefix = isAP ? 'AP ' : isHonors ? 'Honors ' : '';
  const normalizedTitle = `${prefix}${titleCase(withoutTrailingNum || cleaned)}`;

  return {
    rawTitle,
    normalizedTitle,
    subject,
    isHonors,
    isAP,
    isDualEnrollment,
    period,
    section,
    teacherName: resolvedTeacher,
  };
}

/**
 * Reconcile a list of courses and group them by subject area.
 */
export function reconcileCourses(
  courses: readonly { title: string; teacherName?: string }[]
): readonly IReconciledCourse[] {
  return courses.map((c) => reconcileCourse(c.title, c.teacherName));
}

/**
 * Group reconciled courses by subject area.
 */
export function groupBySubject(
  courses: readonly IReconciledCourse[]
): ReadonlyMap<SubjectArea, readonly IReconciledCourse[]> {
  const map = new Map<SubjectArea, IReconciledCourse[]>();
  for (const c of courses) {
    const list = map.get(c.subject.area) ?? [];
    list.push(c);
    map.set(c.subject.area, list);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/(?:^|\s)\w/g, (c) => c.toUpperCase())
    .trim();
}
