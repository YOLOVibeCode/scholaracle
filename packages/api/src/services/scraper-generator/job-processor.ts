/**
 * Processes a single scraper generation job: connect → crawl → authenticate_check → generate → validate.
 * Updates job document at each step for dashboard polling.
 */

import type { Db } from 'mongodb';
import {
  connectStep,
  crawlStep,
  authenticateCheckStep,
  type IConnectResult,
  type ICrawlResult,
  type IAuthenticateCheckResult,
} from './crawler';
import { generateScraperWithAI, type IGenerateRequest } from './ai-generator';
import { validateGeneratedScraper } from './validator';
import type { IPageAnalysis } from './crawler';

export interface IJobStep {
  name: string;
  status: 'pending' | 'in_progress' | 'complete';
  startedAt?: Date;
  completedAt?: Date;
  details?: Record<string, unknown> | null;
}

export interface IScraperGenerationJob {
  _id?: import('mongodb').ObjectId;
  jobId: string;
  userId: string;
  platformName: string;
  loginUrl: string;
  cacheKey: string;
  status:
    | 'queued'
    | 'connecting'
    | 'crawling'
    | 'authenticating'
    | 'crawl_complete'
    | 'generating'
    | 'validating'
    | 'ready'
    | 'failed';
  createdAt: Date;
  updatedAt: Date;
  steps: IJobStep[];
  result?: {
    scraperId: string;
    scraperCode: string;
    transformerCode: string;
    metadata: string;
  } | null;
  error?: string | null;
  retryCount?: number;
}

const KNOWN_PLATFORMS = new Set(['canvas', 'aeries', 'skyward']);

export function isKnownPlatform(platformName: string): boolean {
  return KNOWN_PLATFORMS.has(platformName.toLowerCase().trim());
}

/**
 * Process a single job. Call this when a job is created or when worker picks from queue.
 */
export async function processScraperGenerationJob(db: Db, jobId: string): Promise<void> {
  const jobsCollection = db.collection<IScraperGenerationJob>('scraper_generation_jobs');
  const generatedCollection = db.collection('generated_scrapers');

  const job = await jobsCollection.findOne({ jobId });
  if (!job || job.status !== 'queued') {
    return;
  }

  const updateStep = async (
    stepName: string,
    stepStatus: IJobStep['status'],
    details?: Record<string, unknown> | null
  ) => {
    const steps = [...(job.steps || [])];
    const idx = steps.findIndex((s) => s.name === stepName);
    if (idx === -1) {
      steps.push({
        name: stepName,
        status: stepStatus,
        startedAt: stepStatus === 'in_progress' ? new Date() : undefined,
        completedAt: stepStatus === 'complete' ? new Date() : undefined,
        details: details ?? null,
      });
    } else {
      steps[idx] = {
        ...steps[idx]!,
        status: stepStatus,
        startedAt: steps[idx]!.startedAt ?? (stepStatus === 'in_progress' ? new Date() : undefined),
        completedAt: stepStatus === 'complete' ? new Date() : steps[idx]!.completedAt,
        details: details ?? steps[idx]!.details,
      };
    }
    let newJobStatus: IScraperGenerationJob['status'] = job.status;
    if (stepName === 'connect') {
      newJobStatus = stepStatus === 'in_progress' ? 'connecting' : 'connecting';
    } else if (stepName === 'crawl') {
      newJobStatus = stepStatus === 'in_progress' ? 'crawling' : 'crawl_complete';
    } else if (stepName === 'authenticate_check') {
      newJobStatus = stepStatus === 'in_progress' ? 'authenticating' : 'crawl_complete';
    } else if (stepName === 'generate') {
      newJobStatus = stepStatus === 'in_progress' ? 'generating' : 'validating';
    } else if (stepName === 'validate') {
      newJobStatus = stepStatus === 'complete' ? 'ready' : 'validating';
    }
    await jobsCollection.updateOne(
      { jobId },
      { $set: { steps, status: newJobStatus, updatedAt: new Date() } }
    );
    Object.assign(job, { steps, status: newJobStatus, updatedAt: new Date() });
  };

  const fail = async (error: string) => {
    await jobsCollection.updateOne(
      { jobId },
      {
        $set: {
          status: 'failed',
          error,
          updatedAt: new Date(),
        },
      }
    );
  };

  try {
    // Step 1: Connect
    await updateStep('connect', 'in_progress');
    const connectResult: IConnectResult = await connectStep(job.loginUrl);
    await updateStep('connect', connectResult.ok ? 'complete' : 'complete', {
      httpStatus: connectResult.httpStatus,
      responseTimeMs: connectResult.responseTimeMs,
      sslValid: connectResult.sslValid,
    });
    if (!connectResult.ok) {
      await fail(connectResult.error ?? 'Could not connect to the site');
      return;
    }

    // Step 2: Crawl
    await updateStep('crawl', 'in_progress');
    const crawlResult: ICrawlResult = await crawlStep(job.loginUrl);
    await updateStep('crawl', 'complete', {
      pageTitle: crawlResult.title,
      loginForm: crawlResult.loginForm,
      navigation: crawlResult.navigation?.length ? crawlResult.navigation : undefined,
      detectedFramework: crawlResult.detectedFramework,
    });
    if (!crawlResult.ok) {
      await fail(crawlResult.error ?? 'Could not find a login form at this URL');
      return;
    }

    // Step 3: Authenticate check
    await updateStep('authenticate_check', 'in_progress');
    const authResult: IAuthenticateCheckResult = await authenticateCheckStep(
      job.loginUrl,
      crawlResult
    );
    await updateStep('authenticate_check', 'complete', {
      loginFormUsable: authResult.loginFormUsable,
      captchaDetected: authResult.captchaDetected,
      mfaRequired: authResult.mfaRequired,
      loginMethod: authResult.loginMethod,
      ssoAvailable: authResult.ssoAvailable,
    });
    if (!authResult.ok) {
      await fail(authResult.error ?? 'Login cannot be automated');
      return;
    }

    const pageAnalysis: IPageAnalysis = {
      url: job.loginUrl,
      title: crawlResult.title ?? '',
      loginForm: crawlResult.loginForm!,
      navigation: crawlResult.navigation ?? [],
      detectedFramework: crawlResult.detectedFramework,
      pageHtml: crawlResult.pageHtml,
    };

    // Step 4: Generate with Claude
    await updateStep('generate', 'in_progress');
    const genRequest: IGenerateRequest = {
      platformName: job.platformName,
      loginUrl: job.loginUrl,
      loginMethod: 'email_password',
      dataTypes: ['grades', 'assignments', 'attendance', 'messages', 'documents', 'teachers'],
      pageAnalysis,
    };
    const generated = await generateScraperWithAI({ ...genRequest, pageAnalysis });
    await updateStep('generate', 'complete');

    // Step 5: Validate
    await updateStep('validate', 'in_progress');
    const validation = validateGeneratedScraper(generated);
    if (!validation.valid) {
      await fail(`Generated scraper failed validation: ${validation.errors.join('; ')}`);
      return;
    }
    await updateStep('validate', 'complete');

    // Cache result
    const insertResult = await generatedCollection.insertOne({
      cacheKey: job.cacheKey,
      platformName: job.platformName,
      loginUrl: job.loginUrl,
      loginMethod: 'email_password',
      scraperCode: generated.scraperCode,
      transformerCode: generated.transformerCode,
      metadata: generated.metadata,
      createdAt: new Date(),
      generatedBy: job.userId,
      pageFingerprint: job.cacheKey,
    });

    await jobsCollection.updateOne(
      { jobId },
      {
        $set: {
          status: 'ready',
          result: {
            scraperId: insertResult.insertedId.toString(),
            scraperCode: generated.scraperCode,
            transformerCode: generated.transformerCode,
            metadata: generated.metadata,
          },
          updatedAt: new Date(),
        },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await fail(msg);
  }
}
