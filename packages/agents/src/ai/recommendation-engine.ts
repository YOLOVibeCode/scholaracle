import type { IRecommendationEngine, ITrendData, IRecommendation } from '@scholaracle/interfaces';
import { LlmClient } from './llm-client';
import { buildRecommendationPrompt } from './prompt-templates';

export interface IRecommendationEngineConfig {
  readonly apiKey?: string;
  readonly model?: string;
}

/**
 * Hybrid recommendation engine: deterministic trend detection + optional LLM descriptions.
 * Works without LLM — deterministic rules always produce results.
 */
export class RecommendationEngine implements IRecommendationEngine {
  private readonly _client: LlmClient | undefined;

  constructor(config: IRecommendationEngineConfig = {}) {
    if (config.apiKey) {
      this._client = new LlmClient({
        apiKey: config.apiKey,
        model: config.model,
      });
    }
  }

  public async generateRecommendations(data: ITrendData): Promise<readonly IRecommendation[]> {
    const recommendations: IRecommendation[] = [];

    // Deterministic rule: declining grades
    const isDecliningGrades = this._detectDecliningGrades(data);
    if (isDecliningGrades) {
      const description = await this._getDescription(
        'grade_improvement',
        `Student grades declining across ${isDecliningGrades.courses.join(', ')}. Average drop: ${isDecliningGrades.avgDrop.toFixed(1)}%.`
      );

      recommendations.push({
        type: 'grade_improvement',
        title: 'Focus on Improving Grades',
        description,
        priority: isDecliningGrades.avgDrop > 10 ? 'high' : 'medium',
        relatedCourses: isDecliningGrades.courses,
      });
    }

    // Deterministic rule: low assignment completion
    if (data.assignmentCompletionRate < 0.8) {
      const description = await this._getDescription(
        'time_management',
        `Assignment completion rate is ${(data.assignmentCompletionRate * 100).toFixed(0)}%. Multiple assignments may be missing.`
      );

      recommendations.push({
        type: 'time_management',
        title: 'Improve Assignment Completion',
        description,
        priority: data.assignmentCompletionRate < 0.6 ? 'high' : 'medium',
      });
    }

    // Deterministic rule: frequent missing assignments
    const missingCount = data.recentAlertTypes.filter((t) => t === 'missing_assignment').length;
    if (missingCount >= 2) {
      const description = await this._getDescription(
        'study_habit',
        `${missingCount} missing assignment alerts recently. Student may need help organizing their workload.`
      );

      recommendations.push({
        type: 'study_habit',
        title: 'Build Better Study Habits',
        description,
        priority: missingCount >= 4 ? 'high' : 'medium',
      });
    }

    // Deterministic rule: positive reinforcement
    if (data.assignmentCompletionRate >= 0.95 && !isDecliningGrades) {
      recommendations.push({
        type: 'positive_reinforcement',
        title: 'Keep Up the Great Work!',
        description: 'Consistently completing assignments and maintaining grades. Stay on track!',
        priority: 'low',
      });
    }

    return recommendations;
  }

  private _detectDecliningGrades(
    data: ITrendData
  ): { courses: string[]; avgDrop: number } | undefined {
    if (data.grades.length < 2) return undefined;

    // Group grades by course
    const byCourse = new Map<string, number[]>();
    for (const g of data.grades) {
      const scores = byCourse.get(g.course) ?? [];
      scores.push(g.score);
      byCourse.set(g.course, scores);
    }

    const decliningCourses: string[] = [];
    let totalDrop = 0;

    for (const [course, scores] of byCourse) {
      if (scores.length < 2) continue;
      const first = scores[0]!;
      const last = scores[scores.length - 1]!;
      if (last < first) {
        decliningCourses.push(course);
        totalDrop += first - last;
      }
    }

    if (decliningCourses.length === 0) return undefined;

    return {
      courses: decliningCourses,
      avgDrop: totalDrop / decliningCourses.length,
    };
  }

  private async _getDescription(type: string, context: string): Promise<string> {
    if (!this._client) {
      // Fallback: return the context itself as description
      return context;
    }

    try {
      const prompt = buildRecommendationPrompt(type, context);
      const response = await this._client.complete([{ role: 'user', content: prompt }], {
        maxTokens: 128,
      });
      return response.content || context;
    } catch {
      return context;
    }
  }
}
