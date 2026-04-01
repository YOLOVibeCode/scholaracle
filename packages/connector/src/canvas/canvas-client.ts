import { getJson, buildUrl } from '../http';

// ---------------------------------------------------------------------------
// Raw API response types (Canvas REST API)
// ---------------------------------------------------------------------------

export interface ICanvasCourse {
  readonly id: number;
  readonly name: string;
  readonly course_code: string;
  readonly workflow_state: 'available' | 'unpublished' | 'completed' | 'deleted';
  readonly enrollment_term_id?: number;
  readonly start_at?: string;
  readonly end_at?: string;
}

export interface ICanvasAssignment {
  readonly id: number;
  readonly course_id: number;
  readonly name: string;
  readonly description?: string;
  readonly due_at?: string;
  readonly points_possible?: number;
  readonly submission_types: readonly string[];
  readonly workflow_state: 'published' | 'unpublished' | 'deleted';
  readonly has_submitted_submissions?: boolean;
}

export interface ICanvasSubmission {
  readonly id: number;
  readonly assignment_id: number;
  readonly user_id: number;
  readonly score?: number | null;
  readonly grade?: string | null;
  readonly submitted_at?: string | null;
  readonly graded_at?: string | null;
  readonly late?: boolean;
  readonly missing?: boolean;
  readonly workflow_state: 'submitted' | 'unsubmitted' | 'graded' | 'pending_review';
}

export interface ICanvasEnrollment {
  readonly id: number;
  readonly course_id: number;
  readonly user_id: number;
  readonly type: string;
  readonly enrollment_state: 'active' | 'invited' | 'inactive' | 'completed' | 'deleted';
  readonly grades?: {
    readonly current_score?: number | null;
    readonly current_grade?: string | null;
    readonly final_score?: number | null;
    readonly final_grade?: string | null;
  };
}

// ---------------------------------------------------------------------------
// Client config
// ---------------------------------------------------------------------------

export interface ICanvasClientConfig {
  readonly baseUrl: string;
  readonly accessToken: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * Canvas LMS REST API client.
 * Handles Link-header pagination and Bearer token auth.
 */
export class CanvasClient {
  private readonly _config: ICanvasClientConfig;

  constructor(config: ICanvasClientConfig) {
    this._config = config;
  }

  /** Lightweight ping: list courses with per_page=1 to verify token validity. */
  public async ping(): Promise<{ courseCount: number }> {
    const courses = await this._paginatedGet<ICanvasCourse>('/api/v1/courses', {
      enrollment_state: 'active',
      per_page: '1',
    });
    return { courseCount: courses.length > 0 ? 1 : 0 };
  }

  public async getCourses(): Promise<readonly ICanvasCourse[]> {
    return this._paginatedGet<ICanvasCourse>('/api/v1/courses', {
      enrollment_state: 'active',
      per_page: '100',
    });
  }

  public async getAssignments(courseId: number): Promise<readonly ICanvasAssignment[]> {
    return this._paginatedGet<ICanvasAssignment>(`/api/v1/courses/${courseId}/assignments`, {
      per_page: '100',
      order_by: 'due_at',
    });
  }

  public async getSubmissions(
    courseId: number,
    assignmentId: number
  ): Promise<readonly ICanvasSubmission[]> {
    return this._paginatedGet<ICanvasSubmission>(
      `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions`,
      { per_page: '100' }
    );
  }

  public async getMySubmission(
    courseId: number,
    assignmentId: number
  ): Promise<ICanvasSubmission | undefined> {
    try {
      const url = this._buildUrl(
        `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/self`
      );
      const { data } = await getJson<ICanvasSubmission>(url, this._config.accessToken);
      return data;
    } catch {
      return undefined;
    }
  }

  public async getEnrollments(courseId: number): Promise<readonly ICanvasEnrollment[]> {
    return this._paginatedGet<ICanvasEnrollment>(`/api/v1/courses/${courseId}/enrollments`, {
      per_page: '100',
      type: ['StudentEnrollment'] as unknown as string,
    });
  }

  // -------------------------------------------------------------------------
  // Pagination (Canvas uses Link headers)
  // -------------------------------------------------------------------------

  private async _paginatedGet<T>(
    path: string,
    params?: Record<string, string>
  ): Promise<readonly T[]> {
    const results: T[] = [];
    let url: string | undefined = this._buildUrl(path, params);

    while (url) {
      const { data, headers } = await getJson<T[]>(url, this._config.accessToken);

      if (Array.isArray(data)) {
        results.push(...data);
      }

      url = this._parseNextLink(headers);
    }

    return results;
  }

  private _buildUrl(path: string, params?: Record<string, string>): string {
    return buildUrl(this._config.baseUrl, path, params);
  }

  /** Parse the `next` URL from the Canvas Link header. */
  private _parseNextLink(headers: Headers): string | undefined {
    const link = headers.get('link');
    if (!link) return undefined;

    const match = link.match(/<([^>]+)>;\s*rel="next"/);
    return match?.[1];
  }
}
