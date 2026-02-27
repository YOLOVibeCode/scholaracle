import { LlmClient } from './llm-client';
import { ResponseCache } from './response-cache';

export type GradeRiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface ICourseGradeInput {
  readonly courseExternalId: string;
  readonly courseName: string;
  readonly grade: number;
  readonly letterGrade: string;
  readonly totalAssignments: number;
  readonly gradedAssignments: number;
  readonly missingAssignments: number;
  readonly lateAssignments: number;
  readonly recentTrend: 'improving' | 'stable' | 'declining';
  readonly riskLevel: GradeRiskLevel;
  readonly riskExplanation?: string;
}

export interface IGradeRiskServiceConfig {
  readonly apiKey?: string;
  readonly model?: string;
  readonly cacheTtlMs?: number;
}

export interface ICourseRiskEnhancement {
  readonly riskLevel: GradeRiskLevel;
  readonly riskExplanation?: string;
}

export interface IGradeRiskResult {
  readonly courseEnhancements: Map<string, ICourseRiskEnhancement>;
  readonly aiOverview?: string;
}

const SYSTEM_PROMPT = `You are an assistant for a parent-facing academic app. Given a student's name and their per-course grade summary, you will:
1. For each course, optionally provide a short risk explanation (1-2 sentences) explaining why the course is at risk or on track. Use the existing risk level (none/low/medium/high/critical) or suggest a different one only if clearly justified.
2. Write a single brief overall summary (2-3 sentences) for the parent: how the student is doing overall and any key actions to take.

Return valid JSON only, no markdown. Format:
{ "courses": [ { "courseExternalId": "<id>", "riskLevel": "none"|"low"|"medium"|"high"|"critical", "riskExplanation": "optional 1-2 sentences" } ], "aiOverview": "2-3 sentence parent summary" }`;

/**
 * AI-powered grade risk analysis and parent summary.
 * Batches into one LLM call per student and caches by request fingerprint.
 */
export class GradeRiskService {
  private readonly _client: LlmClient | undefined;
  private readonly _cache: ResponseCache<IGradeRiskResult>;
  private readonly _enabled: boolean;

  constructor(config: IGradeRiskServiceConfig = {}) {
    this._enabled = config.apiKey != null && config.apiKey.length > 0;
    this._client = this._enabled
      ? new LlmClient({ apiKey: config.apiKey!, model: config.model })
      : undefined;
    this._cache = new ResponseCache<IGradeRiskResult>(config.cacheTtlMs ?? 5 * 60 * 1000);
  }

  public isAvailable(): boolean {
    return this._enabled && this._client != null;
  }

  /**
   * Produce per-course risk explanations and overall AI summary.
   * Uses deterministic values when LLM is unavailable or errors.
   */
  public async analyze(
    studentName: string,
    courseGrades: readonly ICourseGradeInput[],
    studentGPA?: number
  ): Promise<IGradeRiskResult> {
    if (!this.isAvailable() || !this._client || courseGrades.length === 0) {
      return this._fallback(courseGrades);
    }

    const cacheKey = this._buildCacheKey(studentName, courseGrades);
    const cached = this._cache.get(cacheKey);
    if (cached) return cached;

    try {
      const userPrompt = this._buildUserPrompt(studentName, courseGrades, studentGPA);
      const response = await this._client.complete([{ role: 'user', content: userPrompt }], {
        maxTokens: 1024,
        system: SYSTEM_PROMPT,
      });

      const parsed = this._parseResponse(response.content, courseGrades);
      this._cache.set(cacheKey, parsed);
      return parsed;
    } catch {
      return this._fallback(courseGrades);
    }
  }

  private _fallback(courseGrades: readonly ICourseGradeInput[]): IGradeRiskResult {
    const courseEnhancements = new Map<string, ICourseRiskEnhancement>();
    for (const c of courseGrades) {
      courseEnhancements.set(c.courseExternalId, {
        riskLevel: c.riskLevel,
        riskExplanation: c.riskExplanation,
      });
    }
    return { courseEnhancements };
  }

  private _buildCacheKey(studentName: string, courses: readonly ICourseGradeInput[]): string {
    const parts = courses.map((c) => `${c.courseExternalId}:${c.grade}:${c.riskLevel}`).sort();
    return `grade-risk:${studentName}:${parts.join('|')}`;
  }

  private _buildUserPrompt(
    studentName: string,
    courses: readonly ICourseGradeInput[],
    studentGPA?: number
  ): string {
    const lines = [
      `Student: ${studentName}`,
      studentGPA != null ? `Overall GPA: ${studentGPA}` : '',
      '',
      'Per-course summary:',
      ...courses.map(
        (c) =>
          `- ${c.courseName} (${c.courseExternalId}): ${c.letterGrade} (${c.grade}%), ` +
          `graded ${c.gradedAssignments}/${c.totalAssignments}, missing ${c.missingAssignments}, late ${c.lateAssignments}, trend: ${c.recentTrend}, risk: ${c.riskLevel}`
      ),
    ].filter(Boolean);
    return `${lines.join('\n')}\n\nReturn JSON with "courses" array and "aiOverview" as specified.`;
  }

  private _parseResponse(
    content: string,
    courseGrades: readonly ICourseGradeInput[]
  ): IGradeRiskResult {
    const courseEnhancements = new Map<string, ICourseRiskEnhancement>();
    let aiOverview: string | undefined;

    const trimmed = content
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/\s*```$/i, '');
    let data: {
      courses?: Array<{ courseExternalId?: string; riskLevel?: string; riskExplanation?: string }>;
      aiOverview?: string;
    };
    try {
      data = JSON.parse(trimmed) as typeof data;
    } catch {
      return this._fallback(courseGrades);
    }

    const validLevel = (s: string): GradeRiskLevel =>
      ['none', 'low', 'medium', 'high', 'critical'].includes(s) ? (s as GradeRiskLevel) : 'none';

    if (Array.isArray(data.courses)) {
      for (const row of data.courses) {
        const id = row.courseExternalId;
        if (!id || typeof id !== 'string') continue;
        courseEnhancements.set(id, {
          riskLevel: validLevel(String(row.riskLevel ?? 'none')),
          riskExplanation:
            typeof row.riskExplanation === 'string' && row.riskExplanation.length > 0
              ? row.riskExplanation
              : undefined,
        });
      }
    }

    if (typeof data.aiOverview === 'string' && data.aiOverview.length > 0) {
      aiOverview = data.aiOverview;
    }

    for (const c of courseGrades) {
      if (!courseEnhancements.has(c.courseExternalId)) {
        courseEnhancements.set(c.courseExternalId, {
          riskLevel: c.riskLevel,
          riskExplanation: c.riskExplanation,
        });
      }
    }

    return { courseEnhancements, aiOverview };
  }
}
