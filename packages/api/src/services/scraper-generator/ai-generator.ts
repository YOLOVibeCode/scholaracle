import Anthropic from '@anthropic-ai/sdk';
import { getScraperSystemPrompt, getScraperGeneratePrompt } from './prompts';
import type { IPageAnalysis } from './crawler';

export interface IGenerateRequest {
  readonly platformName: string;
  readonly loginUrl: string;
  readonly loginMethod: 'email_password' | 'google_sso' | 'clever_sso' | 'other_sso';
  readonly dataTypes: readonly string[];
  readonly notes?: string;
  readonly pageAnalysis?: IPageAnalysis | null;
}

export interface IGeneratedScraper {
  readonly scraperCode: string;
  readonly transformerCode: string;
  readonly metadata: string;
  /** When set, packager embeds these so the scraper can extend BaseScraper (reference platforms). */
  readonly baseScraperCode?: string;
  readonly typesCode?: string;
}

/**
 * Calls Claude to generate scraper code for a given platform.
 */
export async function generateScraperWithAI(request: IGenerateRequest): Promise<IGeneratedScraper> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required for scraper generation');
  }

  const anthropic = new Anthropic({ apiKey });

  const systemPrompt = getScraperSystemPrompt();
  const userPrompt = getScraperGeneratePrompt(request, request.pageAnalysis);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 12000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content[0] && 'text' in response.content[0] ? response.content[0].text : '';

  return parseGeneratedFiles(text, request.platformName);
}

function parseGeneratedFiles(response: string, platformName: string): IGeneratedScraper {
  const platformId = platformName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // Parse sections separated by --- filename ---
  const sections = response.split(/---\s*(.+?)\s*---/);
  let scraperCode = '';
  let transformerCode = '';
  let metadata = '';

  for (let i = 1; i < sections.length; i += 2) {
    const fileName = sections[i]?.trim() ?? '';
    let content = sections[i + 1]?.trim() ?? '';

    // Strip markdown code fences
    content = content
      .replace(/^```\w*\n?/, '')
      .replace(/\n?```$/, '')
      .trim();

    if (fileName.includes('metadata')) {
      metadata = content;
    } else if (fileName.includes('transformer')) {
      transformerCode = content;
    } else if (fileName.includes('scraper')) {
      scraperCode = content;
    }
  }

  // If parsing failed, try to extract code blocks
  if (!scraperCode && !transformerCode) {
    const codeBlocks = response.match(/```(?:typescript|ts)?\n([\s\S]*?)```/g) ?? [];
    if (codeBlocks.length >= 2) {
      transformerCode = codeBlocks[0]!
        .replace(/```\w*\n?/, '')
        .replace(/\n?```$/, '')
        .trim();
      scraperCode = codeBlocks[1]!
        .replace(/```\w*\n?/, '')
        .replace(/\n?```$/, '')
        .trim();
    }
    if (codeBlocks.length >= 3) {
      metadata = codeBlocks[2]!
        .replace(/```\w*\n?/, '')
        .replace(/\n?```$/, '')
        .trim();
    }
  }

  if (!metadata) {
    metadata = JSON.stringify(
      {
        id: `${platformId}-browser`,
        name: platformName,
        version: '1.0.0',
        description: `Scrapes student data from ${platformName}`,
        platforms: ['*'],
        capabilities: {
          grades: true,
          assignments: true,
          attendance: true,
          schedule: false,
          messages: true,
          documents: true,
        },
      },
      null,
      2
    );
  }

  return { scraperCode, transformerCode, metadata };
}
