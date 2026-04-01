import { getJson, buildUrl } from '../http';

// ---------------------------------------------------------------------------
// Raw API response types (Skyward Qmlativ — OneRoster 1.2 compatible)
// ---------------------------------------------------------------------------

export interface ISkywardCourse {
  readonly sourcedId: string;
  readonly title: string;
  readonly courseCode?: string;
  readonly status: 'active' | 'tobedeleted';
}

export interface ISkywardClass {
  readonly sourcedId: string;
  readonly title: string;
  readonly course: { readonly sourcedId: string };
  readonly terms?: readonly { readonly sourcedId: string }[];
  readonly status: 'active' | 'tobedeleted';
}

export interface ISkywardLineItem {
  readonly sourcedId: string;
  readonly title: string;
  readonly description?: string;
  readonly assignDate?: string;
  readonly dueDate?: string;
  readonly class: { readonly sourcedId: string };
  readonly category?: { readonly sourcedId: string; readonly title?: string };
  readonly resultValueMin?: number;
  readonly resultValueMax?: number;
  readonly status: 'active' | 'tobedeleted';
}

export interface ISkywardResult {
  readonly sourcedId: string;
  readonly lineItem: { readonly sourcedId: string };
  readonly student: { readonly sourcedId: string };
  readonly score?: number;
  readonly scoreStatus: 'exempt' | 'fully graded' | 'not submitted' | 'partially graded';
  readonly scoreDate?: string;
  readonly status: 'active' | 'tobedeleted';
}

export interface ISkywardEnrollment {
  readonly sourcedId: string;
  readonly user: { readonly sourcedId: string };
  readonly class: { readonly sourcedId: string };
  readonly role: 'student' | 'teacher' | 'aide';
  readonly status: 'active' | 'tobedeleted';
}

// ---------------------------------------------------------------------------
// Client config
// ---------------------------------------------------------------------------

export interface ISkywardClientConfig {
  readonly baseUrl: string;
  readonly accessToken: string;
}

// ---------------------------------------------------------------------------
// Paginated response wrapper (OneRoster envelope)
// ---------------------------------------------------------------------------

interface IOneRosterPage<T> {
  readonly [key: string]: readonly T[] | undefined;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * Skyward Qmlativ REST API client.
 * Uses the OneRoster 1.2 compatible API endpoints.
 * Handles pagination via offset/limit.
 */
export class SkywardClient {
  private readonly _config: ISkywardClientConfig;

  constructor(config: ISkywardClientConfig) {
    this._config = config;
  }

  /** Lightweight ping: list classes with limit=1 to verify token validity. */
  public async ping(): Promise<{ classCount: number }> {
    const classes = await this._paginatedGet<ISkywardClass>(
      '/ims/oneroster/v1p2/classes',
      'classes',
      { limit: '1' }
    );
    return { classCount: classes.length > 0 ? 1 : 0 };
  }

  public async getClasses(): Promise<readonly ISkywardClass[]> {
    return this._paginatedGet<ISkywardClass>('/ims/oneroster/v1p2/classes', 'classes', {
      limit: '100',
      filter: "status='active'",
    });
  }

  public async getLineItems(classId: string): Promise<readonly ISkywardLineItem[]> {
    return this._paginatedGet<ISkywardLineItem>(
      `/ims/oneroster/v1p2/classes/${classId}/lineItems`,
      'lineItems',
      { limit: '100' }
    );
  }

  public async getResults(classId: string): Promise<readonly ISkywardResult[]> {
    return this._paginatedGet<ISkywardResult>(
      `/ims/oneroster/v1p2/classes/${classId}/results`,
      'results',
      { limit: '100' }
    );
  }

  public async getEnrollments(classId: string): Promise<readonly ISkywardEnrollment[]> {
    return this._paginatedGet<ISkywardEnrollment>(
      `/ims/oneroster/v1p2/classes/${classId}/enrollments`,
      'enrollments',
      { limit: '100', filter: "role='student'" }
    );
  }

  // -------------------------------------------------------------------------
  // Pagination (OneRoster uses offset/limit)
  // -------------------------------------------------------------------------

  private async _paginatedGet<T>(
    path: string,
    itemsKey: string,
    params?: Record<string, string>
  ): Promise<readonly T[]> {
    const results: T[] = [];
    let offset = 0;
    const limit = parseInt(params?.['limit'] ?? '100', 10);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const allParams = { ...params, offset: String(offset), limit: String(limit) };
      const url = this._buildUrl(path, allParams);
      const { data } = await getJson<IOneRosterPage<T>>(url, this._config.accessToken);

      const items = data[itemsKey];
      if (!Array.isArray(items) || items.length === 0) break;

      results.push(...items);
      if (items.length < limit) break;
      offset += limit;
    }

    return results;
  }

  private _buildUrl(path: string, params?: Record<string, string>): string {
    return buildUrl(this._config.baseUrl, path, params);
  }
}
