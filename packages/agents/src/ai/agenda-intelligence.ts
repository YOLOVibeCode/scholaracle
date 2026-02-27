import { LlmClient } from './llm-client';
import { ResponseCache } from './response-cache';

export type AgendaImportance = 'critical' | 'high' | 'medium' | 'low';

export interface IAgendaItemInput {
  readonly id: string;
  readonly type: 'assignment' | 'event_occurrence';
  readonly title: string;
  readonly timeAt: string;
  readonly studentName?: string;
  readonly courseName?: string;
  readonly isOverdue?: boolean;
  readonly assignmentStatus?: string;
  readonly eventCategory?: string;
  readonly pointsPossible?: number;
  readonly pointsEarned?: number;
  readonly importance: AgendaImportance;
  readonly labels: string[];
}

export interface IAgendaItemEnhancement {
  readonly importance: AgendaImportance;
  readonly labels: string[];
  readonly aiSummary?: string;
}

export interface IAgendaIntelligenceServiceConfig {
  readonly apiKey?: string;
  readonly model?: string;
  readonly cacheTtlMs?: number;
}

const SYSTEM_PROMPT = `You are an assistant for a parent-facing academic app. Given a list of agenda items (assignments and events) for one or more students, you will:
1. Assign an importance level to each: critical, high, medium, or low. Consider overdue items, missing work, tests/quizzes, and due dates.
2. Optionally add 0-3 extra labels per item (e.g. "needs-attention", "study-recommended", "high-priority"). Use kebab-case.
3. Write a single brief contextual summary line per item (e.g. "Math test tomorrow — last quiz was 72%"). Keep under 80 characters.

Return valid JSON only, no markdown. Format: { "items": [ { "id": "<agenda item id>", "importance": "critical"|"high"|"medium"|"low", "labels": ["label1", "label2"], "aiSummary": "one line" } ] }`;

/**
 * AI-powered agenda item scoring and summarization.
 * Batches items into one LLM call and caches by request fingerprint.
 */
export class AgendaIntelligenceService {
  private readonly _client: LlmClient | undefined;
  private readonly _cache: ResponseCache<Map<string, IAgendaItemEnhancement>>;
  private readonly _enabled: boolean;

  constructor(config: IAgendaIntelligenceServiceConfig = {}) {
    this._enabled = config.apiKey != null && config.apiKey.length > 0;
    this._client = this._enabled
      ? new LlmClient({ apiKey: config.apiKey!, model: config.model })
      : undefined;
    this._cache = new ResponseCache<Map<string, IAgendaItemEnhancement>>(
      config.cacheTtlMs ?? 5 * 60 * 1000
    );
  }

  public isAvailable(): boolean {
    return this._enabled && this._client != null;
  }

  /**
   * Enhance agenda items with AI-derived importance, labels, and summaries.
   * Returns a map of item id -> enhancement; missing ids keep deterministic values.
   */
  public async enhance(
    items: readonly IAgendaItemInput[]
  ): Promise<Map<string, IAgendaItemEnhancement>> {
    if (!this.isAvailable() || !this._client || items.length === 0) {
      return new Map();
    }

    const cacheKey = this._buildCacheKey(items);
    const cached = this._cache.get(cacheKey);
    if (cached) return cached;

    try {
      const userPrompt = this._buildUserPrompt(items);
      const response = await this._client.complete([{ role: 'user', content: userPrompt }], {
        maxTokens: 2048,
        system: SYSTEM_PROMPT,
      });

      const parsed = this._parseResponse(response.content, items);
      this._cache.set(cacheKey, parsed);
      return parsed;
    } catch {
      return new Map();
    }
  }

  private _buildCacheKey(items: readonly IAgendaItemInput[]): string {
    const ids = items.map((i) => i.id).sort();
    const first = items[0];
    const timeAt = first?.timeAt ?? '';
    return `agenda:${ids.join(',')}:${timeAt}`;
  }

  private _buildUserPrompt(items: readonly IAgendaItemInput[]): string {
    const lines = items.map((i) => {
      const parts = [`id: ${i.id}`, `type: ${i.type}`, `title: ${i.title}`, `timeAt: ${i.timeAt}`];
      if (i.studentName) parts.push(`student: ${i.studentName}`);
      if (i.courseName) parts.push(`course: ${i.courseName}`);
      if (i.isOverdue) parts.push('isOverdue: true');
      if (i.assignmentStatus) parts.push(`status: ${i.assignmentStatus}`);
      if (i.eventCategory) parts.push(`category: ${i.eventCategory}`);
      if (i.pointsPossible != null)
        parts.push(`points: ${i.pointsEarned ?? 0}/${i.pointsPossible}`);
      return parts.join(', ');
    });
    return `Agenda items:\n${lines.join('\n')}\n\nReturn JSON with "items" array as specified.`;
  }

  private _parseResponse(
    content: string,
    _items: readonly IAgendaItemInput[]
  ): Map<string, IAgendaItemEnhancement> {
    const map = new Map<string, IAgendaItemEnhancement>();
    const trimmed = content
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/\s*```$/i, '');
    let data: {
      items?: Array<{ id?: string; importance?: string; labels?: string[]; aiSummary?: string }>;
    };
    try {
      data = JSON.parse(trimmed) as typeof data;
    } catch {
      return map;
    }
    const arr = data.items;
    if (!Array.isArray(arr)) return map;

    const validImportance = (s: string): AgendaImportance =>
      ['critical', 'high', 'medium', 'low'].includes(s) ? (s as AgendaImportance) : 'medium';

    for (const row of arr) {
      const id = row.id;
      if (!id || typeof id !== 'string') continue;
      const importance = validImportance(String(row.importance ?? 'medium'));
      const labels = Array.isArray(row.labels)
        ? row.labels.filter((l) => typeof l === 'string')
        : [];
      const aiSummary =
        typeof row.aiSummary === 'string' && row.aiSummary.length > 0 ? row.aiSummary : undefined;
      map.set(id, { importance, labels, aiSummary });
    }
    return map;
  }
}
