import { apiClient } from '../client';

export interface IScrapersStats {
  readonly totalCaches: number;
  readonly activeJobs: number;
  readonly failures24h: number;
  readonly failures7d: number;
  readonly failures30d: number;
  readonly uniquePlatforms: number;
  readonly jobsByStatus: Record<string, number>;
}

export interface IScrapersStatsResponse {
  readonly success: boolean;
  readonly data?: IScrapersStats;
  readonly error?: string;
}

export interface IScraperCacheListItem {
  readonly id: string;
  readonly cacheKey: string;
  readonly platformName: string;
  readonly loginUrl: string;
  readonly createdAt?: string;
  readonly generatedBy?: string;
  readonly generatedByEmail?: string;
  readonly scraperCodeLength: number;
  readonly transformerCodeLength: number;
  readonly pageFingerprint?: string;
}

export interface IScraperCacheListResponse {
  readonly success: boolean;
  readonly data?: readonly IScraperCacheListItem[];
  readonly total?: number;
  readonly page?: number;
  readonly limit?: number;
  readonly totalPages?: number;
  readonly error?: string;
}

export interface IScraperCacheDetail {
  readonly id: string;
  readonly cacheKey: string;
  readonly platformName: string;
  readonly loginUrl: string;
  readonly loginMethod?: string;
  readonly scraperCode: string;
  readonly transformerCode: string;
  readonly metadata?: string;
  readonly createdAt?: string;
  readonly generatedBy?: string;
  readonly pageFingerprint?: string;
}

export interface IScraperCacheDetailResponse {
  readonly success: boolean;
  readonly data?: IScraperCacheDetail;
  readonly error?: string;
}

export interface IScraperJobListItem {
  readonly jobId: string;
  readonly userId: string;
  readonly platformName: string;
  readonly loginUrl: string;
  readonly cacheKey?: string;
  readonly status: string;
  readonly steps?: ReadonlyArray<{ name: string; status: string; details: unknown }>;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly error?: string;
  readonly result?: { scraperId?: string };
}

export interface IScraperJobListResponse {
  readonly success: boolean;
  readonly data?: readonly IScraperJobListItem[];
  readonly total?: number;
  readonly page?: number;
  readonly limit?: number;
  readonly totalPages?: number;
  readonly error?: string;
}

export interface IScraperJobDetail {
  readonly jobId: string;
  readonly userId: string;
  readonly platformName: string;
  readonly loginUrl: string;
  readonly cacheKey?: string;
  readonly status: string;
  readonly steps?: ReadonlyArray<{ name: string; status: string; details: unknown }>;
  readonly result?: unknown;
  readonly error?: string;
  readonly retryCount?: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface IScraperJobDetailResponse {
  readonly success: boolean;
  readonly data?: IScraperJobDetail;
  readonly error?: string;
}

export interface IScraperReportItem {
  readonly id: string;
  readonly cacheKey: string;
  readonly platformName?: string;
  readonly status?: string;
  readonly error?: string;
  readonly generatedAt?: string;
  readonly reportedAt?: string;
}

export interface IScraperReportsListResponse {
  readonly success: boolean;
  readonly data?: readonly IScraperReportItem[];
  readonly total?: number;
  readonly page?: number;
  readonly limit?: number;
  readonly totalPages?: number;
  readonly error?: string;
}

export interface IScraperTestRequest {
  readonly loginUrl: string;
  readonly username?: string;
  readonly password?: string;
  readonly cacheKey?: string;
}

export interface IScraperTestResult {
  readonly connect: {
    readonly ok: boolean;
    readonly httpStatus?: number;
    readonly responseTimeMs?: number;
    readonly sslValid?: boolean;
    readonly error?: string;
  };
  readonly crawl: {
    readonly ok: boolean;
    readonly title?: string;
    readonly loginForm?: {
      readonly emailField?: string;
      readonly passwordField?: string;
      readonly submitButton?: string;
      readonly ssoOptions?: string[];
      readonly formAction?: string;
      readonly method?: string;
    };
    readonly navigation?: ReadonlyArray<{ text: string; href: string }>;
    readonly detectedFramework?: string;
    readonly error?: string;
  } | null;
  readonly authenticateCheck: {
    readonly ok: boolean;
    readonly loginFormUsable?: boolean;
    readonly captchaDetected?: boolean;
    readonly mfaRequired?: boolean;
    readonly loginMethod?: string;
    readonly ssoAvailable?: string[];
    readonly error?: string;
  } | null;
  readonly message?: string;
}

export interface IScraperTestResponse {
  readonly success: boolean;
  readonly data?: IScraperTestResult;
  readonly error?: string;
}

/**
 * Admin scrapers API client.
 */
export const adminScrapersApi = {
  async getStats(): Promise<IScrapersStatsResponse> {
    return apiClient.get<IScrapersStatsResponse>('/admin/scrapers/stats', true);
  },

  async getCaches(params?: {
    page?: number;
    limit?: number;
    platformName?: string;
    loginUrl?: string;
    sort?: string;
  }): Promise<IScraperCacheListResponse> {
    const qs = new URLSearchParams();
    if (params?.page != null) qs.set('page', params.page.toString());
    if (params?.limit != null) qs.set('limit', params.limit.toString());
    if (params?.platformName) qs.set('platformName', params.platformName);
    if (params?.loginUrl) qs.set('loginUrl', params.loginUrl);
    if (params?.sort) qs.set('sort', params.sort);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiClient.get<IScraperCacheListResponse>(`/admin/scrapers/caches${suffix}`, true);
  },

  async getCacheById(id: string): Promise<IScraperCacheDetailResponse> {
    return apiClient.get<IScraperCacheDetailResponse>(
      `/admin/scrapers/caches/${encodeURIComponent(id)}`,
      true
    );
  },

  async deleteCache(id: string): Promise<{ success: boolean; deleted?: boolean; error?: string }> {
    return apiClient.delete<{ success: boolean; deleted?: boolean; error?: string }>(
      `/admin/scrapers/caches/${encodeURIComponent(id)}`,
      undefined,
      true
    );
  },

  async getJobs(params?: {
    page?: number;
    limit?: number;
    status?: string;
    userId?: string;
    platformName?: string;
  }): Promise<IScraperJobListResponse> {
    const qs = new URLSearchParams();
    if (params?.page != null) qs.set('page', params.page.toString());
    if (params?.limit != null) qs.set('limit', params.limit.toString());
    if (params?.status) qs.set('status', params.status);
    if (params?.userId) qs.set('userId', params.userId);
    if (params?.platformName) qs.set('platformName', params.platformName);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiClient.get<IScraperJobListResponse>(`/admin/scrapers/jobs${suffix}`, true);
  },

  async getJobById(jobId: string): Promise<IScraperJobDetailResponse> {
    return apiClient.get<IScraperJobDetailResponse>(
      `/admin/scrapers/jobs/${encodeURIComponent(jobId)}`,
      true
    );
  },

  async getReports(params?: {
    page?: number;
    limit?: number;
    cacheKey?: string;
  }): Promise<IScraperReportsListResponse> {
    const qs = new URLSearchParams();
    if (params?.page != null) qs.set('page', params.page.toString());
    if (params?.limit != null) qs.set('limit', params.limit.toString());
    if (params?.cacheKey) qs.set('cacheKey', params.cacheKey);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiClient.get<IScraperReportsListResponse>(`/admin/scrapers/reports${suffix}`, true);
  },

  async testScraper(body: IScraperTestRequest): Promise<IScraperTestResponse> {
    return apiClient.post<IScraperTestResponse>('/admin/scrapers/test', body, true);
  },
};
