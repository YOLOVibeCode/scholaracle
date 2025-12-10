import { Alert } from '@scholaracle/contracts';

export interface IAnalysisResult {
  readonly alertId: string;
  readonly priority: 'critical' | 'high' | 'medium' | 'low';
  readonly recommendedChannels: string[];
  readonly recommendedTime?: Date;
  readonly reasoning: string;
}

/**
 * Analyzes alerts to determine notification priority and delivery strategy.
 */
export interface INotificationAnalyzer {
  /**
   * Analyze an alert and determine notification strategy.
   *
   * @param alert - The alert to analyze
   * @returns Analysis result with priority and recommendations
   */
  analyze(alert: Alert): Promise<IAnalysisResult>;
}
