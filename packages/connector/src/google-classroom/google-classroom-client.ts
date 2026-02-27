import { getJson } from '../http';

// ---------------------------------------------------------------------------
// Raw API response types (Google Classroom REST v1)
// ---------------------------------------------------------------------------

export interface IGoogleCourse {
  readonly id: string;
  readonly name: string;
  readonly section?: string;
  readonly courseState: 'ACTIVE' | 'ARCHIVED' | 'PROVISIONED' | 'DECLINED' | 'SUSPENDED';
  readonly ownerId?: string;
}

export interface IGoogleCourseWork {
  readonly id: string;
  readonly courseId: string;
  readonly title: string;
  readonly description?: string;
  readonly dueDate?: { year: number; month: number; day: number };
  readonly dueTime?: { hours: number; minutes?: number };
  readonly maxPoints?: number;
  readonly workType: 'ASSIGNMENT' | 'SHORT_ANSWER_QUESTION' | 'MULTIPLE_CHOICE_QUESTION';
  readonly state: 'PUBLISHED' | 'DRAFT' | 'DELETED';
}

export interface IGoogleStudentSubmission {
  readonly id: string;
  readonly courseId: string;
  readonly courseWorkId: string;
  readonly userId: string;
  readonly state: 'NEW' | 'CREATED' | 'TURNED_IN' | 'RETURNED' | 'RECLAIMED_BY_STUDENT';
  readonly assignedGrade?: number;
  readonly draftGrade?: number;
  readonly late?: boolean;
}

export interface IGoogleCourseStudent {
  readonly courseId: string;
  readonly userId: string;
  readonly profile?: {
    readonly name?: { readonly fullName?: string };
    readonly emailAddress?: string;
  };
}

// ---------------------------------------------------------------------------
// Paginated response wrapper
// ---------------------------------------------------------------------------

interface IGooglePagedResponse {
  readonly [key: string]: unknown;
  readonly nextPageToken?: string;
}

// ---------------------------------------------------------------------------
// Client config
// ---------------------------------------------------------------------------

export interface IGoogleClassroomClientConfig {
  readonly accessToken: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const BASE_URL = 'https://classroom.googleapis.com/v1';

/**
 * Google Classroom REST API client.
 * Handles token-based pagination via nextPageToken.
 */
export class GoogleClassroomClient {
  private readonly _config: IGoogleClassroomClientConfig;

  constructor(config: IGoogleClassroomClientConfig) {
    this._config = config;
  }

  /**
   * Lightweight ping: list courses with pageSize=1 to verify token validity.
   */
  public async ping(): Promise<{ courseCount: number }> {
    const courses = await this._paginatedGet<IGoogleCourse>('/courses', 'courses', {
      courseStates: 'ACTIVE',
      pageSize: '1',
    });
    return { courseCount: courses.length > 0 ? 1 : 0 };
  }

  public async getCourses(): Promise<readonly IGoogleCourse[]> {
    return this._paginatedGet<IGoogleCourse>('/courses', 'courses', {
      courseStates: 'ACTIVE',
      pageSize: '100',
    });
  }

  public async getCourseWork(courseId: string): Promise<readonly IGoogleCourseWork[]> {
    return this._paginatedGet<IGoogleCourseWork>(`/courses/${courseId}/courseWork`, 'courseWork', {
      pageSize: '100',
    });
  }

  public async getStudentSubmissions(
    courseId: string,
    courseWorkId: string
  ): Promise<readonly IGoogleStudentSubmission[]> {
    return this._paginatedGet<IGoogleStudentSubmission>(
      `/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions`,
      'studentSubmissions',
      { pageSize: '100' }
    );
  }

  public async getStudents(courseId: string): Promise<readonly IGoogleCourseStudent[]> {
    return this._paginatedGet<IGoogleCourseStudent>(`/courses/${courseId}/students`, 'students', {
      pageSize: '100',
    });
  }

  private async _paginatedGet<T>(
    path: string,
    itemsKey: string,
    params?: Record<string, string>
  ): Promise<readonly T[]> {
    const results: T[] = [];
    let pageToken: string | undefined;

    do {
      const allParams = { ...params, ...(pageToken ? { pageToken } : {}) };
      const url = this._buildUrl(path, allParams);
      const { data } = await getJson<IGooglePagedResponse & Record<string, unknown>>(
        url,
        this._config.accessToken
      );

      const items = (data as Record<string, unknown>)[itemsKey];
      if (Array.isArray(items)) {
        results.push(...(items as T[]));
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    return results;
  }

  private _buildUrl(path: string, params?: Record<string, string>): string {
    const base = `${BASE_URL}${path}`;
    if (!params || Object.keys(params).length === 0) return base;
    const search = new URLSearchParams(params).toString();
    return `${base}?${search}`;
  }
}
