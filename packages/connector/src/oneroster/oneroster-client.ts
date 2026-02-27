import { getJson } from '../http';

// ---------------------------------------------------------------------------
// OneRoster v1.1/v1.2 response types
// ---------------------------------------------------------------------------

export interface IOneRosterOrg {
  readonly sourcedId: string;
  readonly name: string;
  readonly type: 'school' | 'district' | 'local' | 'state' | 'national';
}

export interface IOneRosterAcademicSession {
  readonly sourcedId: string;
  readonly title: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly type: 'gradingPeriod' | 'semester' | 'schoolYear' | 'term';
  readonly schoolYear: string;
}

export interface IOneRosterCourse {
  readonly sourcedId: string;
  readonly title: string;
  readonly courseCode?: string;
  readonly subjects?: readonly string[];
  readonly org?: { readonly sourcedId: string };
}

export interface IOneRosterClass {
  readonly sourcedId: string;
  readonly title: string;
  readonly course?: { readonly sourcedId: string };
  readonly terms?: readonly { readonly sourcedId: string }[];
}

export interface IOneRosterEnrollment {
  readonly sourcedId: string;
  readonly user: { readonly sourcedId: string };
  readonly class: { readonly sourcedId: string };
  readonly role: 'student' | 'teacher' | 'aide' | 'administrator';
}

export interface IOneRosterLineItem {
  readonly sourcedId: string;
  readonly title: string;
  readonly description?: string;
  readonly assignDate?: string;
  readonly dueDate?: string;
  readonly resultValueMin?: number;
  readonly resultValueMax?: number;
  readonly class?: { readonly sourcedId: string };
  readonly category?: { readonly sourcedId: string };
}

export interface IOneRosterResult {
  readonly sourcedId: string;
  readonly lineItem: { readonly sourcedId: string };
  readonly student: { readonly sourcedId: string };
  readonly score?: number;
  readonly scoreStatus:
    | 'exempt'
    | 'fully graded'
    | 'not submitted'
    | 'partially graded'
    | 'submitted';
  readonly scoreDate?: string;
  readonly comment?: string;
}

export interface IOneRosterCategory {
  readonly sourcedId: string;
  readonly title: string;
}

// ---------------------------------------------------------------------------
// Paginated response wrapper
// ---------------------------------------------------------------------------

// (Paginated responses use the itemsKey approach in _paginatedGet)

// ---------------------------------------------------------------------------
// Client config
// ---------------------------------------------------------------------------

export interface IOneRosterClientConfig {
  readonly baseUrl: string;
  readonly accessToken: string;
}

// ---------------------------------------------------------------------------
// Token response for OAuth2 client credentials
// ---------------------------------------------------------------------------

export interface IOneRosterTokenResponse {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in: number;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * OneRoster v1.1/v1.2 REST API client.
 * Handles offset-based pagination.
 */
export class OneRosterClient {
  private readonly _config: IOneRosterClientConfig;

  constructor(config: IOneRosterClientConfig) {
    this._config = config;
  }

  /**
   * Static factory that exchanges client credentials for an access token.
   */
  public static async fromClientCredentials(
    tokenUrl: string,
    clientId: string,
    clientSecret: string,
    baseUrl: string
  ): Promise<OneRosterClient> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OAuth2 token exchange failed: HTTP ${res.status} ${text}`);
    }

    const data = (await res.json()) as IOneRosterTokenResponse;
    return new OneRosterClient({ baseUrl, accessToken: data.access_token });
  }

  public async getOrgs(): Promise<readonly IOneRosterOrg[]> {
    return this._paginatedGet<IOneRosterOrg>('/orgs', 'orgs');
  }

  public async getAcademicSessions(): Promise<readonly IOneRosterAcademicSession[]> {
    return this._paginatedGet<IOneRosterAcademicSession>('/academicSessions', 'academicSessions');
  }

  public async getCourses(): Promise<readonly IOneRosterCourse[]> {
    return this._paginatedGet<IOneRosterCourse>('/courses', 'courses');
  }

  public async getClasses(): Promise<readonly IOneRosterClass[]> {
    return this._paginatedGet<IOneRosterClass>('/classes', 'classes');
  }

  public async getLineItems(): Promise<readonly IOneRosterLineItem[]> {
    return this._paginatedGet<IOneRosterLineItem>('/lineItems', 'lineItems');
  }

  public async getResults(): Promise<readonly IOneRosterResult[]> {
    return this._paginatedGet<IOneRosterResult>('/results', 'results');
  }

  public async getCategories(): Promise<readonly IOneRosterCategory[]> {
    return this._paginatedGet<IOneRosterCategory>('/categories', 'categories');
  }

  private async _paginatedGet<T>(
    path: string,
    itemsKey: string,
    limit = 100
  ): Promise<readonly T[]> {
    const results: T[] = [];
    let offset = 0;

    while (true) {
      const url = this._buildUrl(path, {
        limit: String(limit),
        offset: String(offset),
      });
      const { data } = await getJson<Record<string, unknown>>(url, this._config.accessToken);

      const items = data[itemsKey];
      if (!Array.isArray(items) || items.length === 0) break;

      results.push(...(items as T[]));

      if (items.length < limit) break;
      offset += limit;
    }

    return results;
  }

  private _buildUrl(path: string, params?: Record<string, string>): string {
    const base = `${this._config.baseUrl}${path}`;
    if (!params || Object.keys(params).length === 0) return base;
    const search = new URLSearchParams(params).toString();
    return `${base}?${search}`;
  }
}
