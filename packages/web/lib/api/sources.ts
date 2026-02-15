import { apiClient } from './client';

export interface IDataSource {
  readonly id: string;
  readonly pluginId: string;
  readonly provider: string;
  readonly displayName: string;
  readonly portalBaseUrl?: string;
  readonly enabled: boolean;
  readonly schedule: string;
  readonly dataTypes: string[];
  readonly status: 'active' | 'error' | 'disabled';
  readonly hasCredentials?: boolean;
  readonly lastScraped?: string;
  readonly lastSuccess?: string;
  readonly lastError?: string | null;
}

/** Credentials for API (token) or portal login (username/password for scraping). */
export interface ISourceCredentialsRequest {
  readonly authType: 'api' | 'login';
  readonly accessToken?: string;
  readonly username?: string;
  readonly password?: string;
  readonly baseUrl?: string;
}

export interface IAddSourceRequest {
  readonly provider: string;
  readonly adapterId: string;
  readonly displayName: string;
  readonly portalBaseUrl?: string;
  readonly schedule?: 'hourly' | 'every_6h' | 'daily' | 'manual';
  readonly dataTypes: string[];
}

export interface IIngestRun {
  readonly runId: string;
  readonly status: 'started' | 'uploaded' | 'committed' | 'failed';
  readonly startedAt: string;
  readonly uploadedAt?: string;
  readonly committedAt?: string;
  readonly error?: string | null;
}

/**
 * Data sources API for a student (LMS connectors, sync runs).
 */
export const sourcesApi = {
  async listForStudent(studentId: string): Promise<readonly IDataSource[]> {
    try {
      return await apiClient.get<readonly IDataSource[]>(`/students/${studentId}/sources`);
    } catch (error) {
      console.error('Failed to load sources:', error);
      return [];
    }
  },

  async addToStudent(studentId: string, source: IAddSourceRequest): Promise<IDataSource | null> {
    try {
      return await apiClient.post<IDataSource>(`/students/${studentId}/sources`, source);
    } catch (error) {
      console.error('Failed to add source:', error);
      return null;
    }
  },

  async update(
    studentId: string,
    sourceId: string,
    updates: Partial<IAddSourceRequest> & { enabled?: boolean }
  ): Promise<IDataSource | null> {
    try {
      return await apiClient.put<IDataSource>(`/students/${studentId}/sources/${sourceId}`, updates);
    } catch (error) {
      console.error('Failed to update source:', error);
      return null;
    }
  },

  async remove(studentId: string, sourceId: string): Promise<boolean> {
    try {
      const res = await apiClient.delete<{ readonly success?: boolean }>(
        `/students/${studentId}/sources/${sourceId}`
      );
      return res.success ?? false;
    } catch (error) {
      console.error('Failed to remove source:', error);
      return false;
    }
  },

  async listRuns(studentId: string, sourceId: string): Promise<readonly IIngestRun[]> {
    try {
      return await apiClient.get<readonly IIngestRun[]>(
        `/students/${studentId}/sources/${sourceId}/runs`
      );
    } catch (error) {
      console.error('Failed to load runs:', error);
      return [];
    }
  },

  async triggerSync(studentId: string, sourceId: string): Promise<IIngestRun | null> {
    try {
      return await apiClient.post<IIngestRun>(
        `/students/${studentId}/sources/${sourceId}/runs/trigger`,
        {}
      );
    } catch (error) {
      console.error('Failed to trigger sync:', error);
      return null;
    }
  },

  async setCredentials(
    studentId: string,
    sourceId: string,
    credentials: ISourceCredentialsRequest
  ): Promise<boolean> {
    try {
      const res = await apiClient.put<{ success?: boolean }>(
        `/students/${studentId}/sources/${sourceId}/credentials`,
        credentials
      );
      return res?.success ?? false;
    } catch (error) {
      console.error('Failed to set source credentials', error);
      return false;
    }
  },
};
