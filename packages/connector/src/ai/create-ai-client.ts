/**
 * Factory for IAiClient used by Skyward browser scraper AI fallback.
 * Supports Gemini, OpenAI, and Anthropic. Implements parseHtml only (ISP).
 */

export interface IAiClient {
  parseHtml(html: string, schema: string): Promise<Record<string, unknown>>;
}

const PARSE_HTML_MAX_CHARS = 50_000;

function getParseHtmlPrompt(schema: string): string {
  return `You are a precise HTML parser. Extract structured data from the provided HTML snippet.

Rules:
- Return ONLY a single JSON object matching this schema. No markdown, no code fences, no explanation.
- Schema: ${schema}
- Preserve field names and types. Use null for missing values. Use [] for empty arrays.
- If the HTML contains a table, map columns to schema fields by header text or position.
- If you cannot extract any data, return an empty object {} or the minimal structure (e.g. { "courses": [] }).`;
}

export type AiProvider = 'openai' | 'anthropic' | 'gemini';

/**
 * Creates an IAiClient that implements parseHtml using the given provider and API key.
 */
export function createAiClient(provider: AiProvider, apiKey: string): IAiClient {
  return {
    async parseHtml(html: string, schema: string): Promise<Record<string, unknown>> {
      const truncated =
        html.length > PARSE_HTML_MAX_CHARS
          ? `${html.slice(0, PARSE_HTML_MAX_CHARS)}\n...[truncated]`
          : html;
      const systemPrompt = getParseHtmlPrompt(schema);
      const raw = await chat(provider, apiKey, systemPrompt, truncated);
      const trimmed = raw.trim();
      const jsonStr =
        trimmed.startsWith('```') && trimmed.includes('```', 3)
          ? trimmed
              .replace(/^```\w*\n?/, '')
              .replace(/\n?```$/, '')
              .trim()
          : trimmed;
      return JSON.parse(jsonStr) as Record<string, unknown>;
    },
  };
}

async function chat(
  provider: AiProvider,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (provider === 'gemini') {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: systemPrompt,
      generationConfig: { temperature: 0.2, maxOutputTokens: 8000 },
    });
    const result = await model.generateContent(userPrompt);
    return result.response.text() ?? '';
  }

  if (provider === 'openai') {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 8000,
      temperature: 0.2,
    });
    return response.choices[0]?.message?.content ?? '';
  }

  if (provider === 'anthropic') {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const block = response.content[0];
    return block && 'text' in block ? block.text : '';
  }

  throw new Error(`Unknown AI provider: ${provider}`);
}
