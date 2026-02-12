export interface ITrendData {
  readonly studentId: string;
  readonly grades: readonly {
    readonly course: string;
    readonly score: number;
    readonly date: string;
  }[];
  readonly assignmentCompletionRate: number;
  readonly recentAlertTypes: readonly string[];
}

export interface IRecommendation {
  readonly type: 'study_habit' | 'time_management' | 'grade_improvement' | 'positive_reinforcement';
  readonly title: string;
  readonly description: string;
  readonly priority: 'high' | 'medium' | 'low';
  readonly relatedCourses?: readonly string[];
}

/**
 * Generates actionable recommendations based on student performance trends.
 * Uses deterministic rules for trend detection and optional LLM for descriptions.
 */
export interface IRecommendationEngine {
  /**
   * Analyze student trends and generate recommendations.
   *
   * @param data - Student performance trend data
   * @returns List of prioritized recommendations
   */
  generateRecommendations(data: ITrendData): Promise<readonly IRecommendation[]>;
}
