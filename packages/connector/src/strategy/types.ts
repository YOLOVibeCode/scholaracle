/**
 * Strategy caching types — platform-agnostic extraction path persistence.
 */

export interface ISelectorStep {
  readonly type: 'css' | 'regex' | 'xpath' | 'evaluate' | 'ai';
  readonly value: string;
  readonly description?: string;
}

export interface IExtractionStrategy {
  readonly extractionId: string;
  readonly platform: string;
  readonly selectors: readonly ISelectorStep[];
  readonly htmlFingerprint?: string;
  readonly aiSchema?: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly successCount: number;
  readonly failCount: number;
}

export interface IStrategyStore {
  get(extractionId: string): Promise<IExtractionStrategy | null>;
  save(strategy: IExtractionStrategy): Promise<void>;
  invalidate(extractionId: string): Promise<void>;
}

export interface IStrategyAttempt<T> {
  readonly extractionId: string;
  readonly platform: string;
  readonly store?: IStrategyStore;
  readonly tryCached: (strategy: IExtractionStrategy) => Promise<T | null>;
  readonly tryNormal: () => Promise<{ data: T; selectors: readonly ISelectorStep[] } | null>;
  readonly tryAi?: (
    schema: string
  ) => Promise<{ data: T; selectors: readonly ISelectorStep[] } | null>;
  readonly aiSchema?: string;
  readonly htmlFingerprint?: string;
}
