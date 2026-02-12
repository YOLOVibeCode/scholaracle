import { getJson } from '../http';

export interface ICanvasCourse {
  readonly id: number;
  readonly name: string;
  readonly course_code: string;
  readonly enrollment_term_id: number;
  readonly time_zone: string;
}

export interface ICanvasAssignment {
  readonly id: number;
  readonly name: string;
  readonly course_id: number;
  readonly due_at: string | null;
  readonly points_possible: number;
  readonly submission_types: readonly string[];
  readonly has_submitted_submissions: boolean;
}

export interface ICanvasSubmission {
  readonly id: number;
  readonly assignment_id: number;
  readonly user_id: number;
  readonly score: number | null;
  readonly grade: string | null;
  readonly workflow_state: 'submitted' | 'unsubmitted' | 'graded' | 'pending_review';
  readonly submitted_at: string | null;
  readonly late: boolean;
  readonly missing: boolean;
}

export interface ICanvasCalendarEvent {
  readonly id: number;
  readonly title: string;
  readonly start_at: string;
  readonly end_at: string;
  readonly type: string;
  readonly context_code: string;
}

export interface ICanvasClientConfig {
  readonly baseUrl: string;
  readonly accessToken: string;
}

/**
 * Canvas LMS REST API client.
 * Handles pagination via Link headers.
 */
export class CanvasClient {
  private readonly _config: ICanvasClientConfig;

  constructor(config: ICanvasClientConfig) {
    this._config = config;
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
    });
  }

  public async getSubmissions(courseId: number): Promise<readonly ICanvasSubmission[]> {
    return this._paginatedGet<ICanvasSubmission>(
      `/api/v1/courses/${courseId}/students/submissions`,
      { 'student_ids[]': 'all', per_page: '100' }
    );
  }

  public async getCalendarEvents(
    startDate: string,
    endDate: string
  ): Promise<readonly ICanvasCalendarEvent[]> {
    return this._paginatedGet<ICanvasCalendarEvent>('/api/v1/calendar_events', {
      start_date: startDate,
      end_date: endDate,
      per_page: '100',
    });
  }

  private async _paginatedGet<T>(
    path: string,
    params?: Record<string, string>
  ): Promise<readonly T[]> {
    const results: T[] = [];
    let url = this._buildUrl(path, params);

    while (url) {
      const { data, headers } = await getJson<T[]>(url, this._config.accessToken);
      results.push(...data);
      url = this._parseNextLink(headers);
    }

    return results;
  }

  private _buildUrl(path: string, params?: Record<string, string>): string {
    const base = `${this._config.baseUrl}${path}`;
    if (!params || Object.keys(params).length === 0) return base;

    const search = new URLSearchParams(params).toString();
    return `${base}?${search}`;
  }

  private _parseNextLink(headers: Headers): string {
    const linkHeader = headers.get('link');
    if (!linkHeader) return '';

    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    return nextMatch?.[1] ?? '';
  }
}
