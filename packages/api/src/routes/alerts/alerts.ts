import { Router, type Request, type Response } from 'express';
import { NotificationService, type IProcessAlertResult, MongoQueue } from '@scholaracle/agents';
import type { IStudentReader } from '@scholaracle/database';
import {
  Alert,
  AlertType,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  NotificationError,
  ValidationError,
} from '@scholaracle/contracts';
import type { IAuthenticatedRequest } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/asyncHandler';

export interface ICreateAlertRequest {
  readonly studentId: string;
  readonly type: string;
  readonly severity: string;
  /**
   * @deprecated Body-supplied userId is ignored; the authenticated request user is authoritative.
   * Retained on the type for backwards-compatible payload shape.
   */
  readonly userId?: string;
  readonly relatedData?: Record<string, unknown>;
}

/**
 * Validate alert request data.
 *
 * @param alertData - Alert data to validate
 * @returns Error message if invalid, undefined if valid
 */
function validateAlertRequest(alertData: ICreateAlertRequest): string | undefined {
  if (!alertData.studentId || !alertData.type || !alertData.severity) {
    return 'Missing required fields: studentId, type, severity';
  }

  if (!Object.values(AlertType).includes(alertData.type as AlertType)) {
    return `Invalid alert type: ${alertData.type}`;
  }

  return undefined;
}

/**
 * Format notification response.
 *
 * @param result - Process alert result
 * @returns Formatted response object
 */
function formatNotificationResponse(result: IProcessAlertResult): Record<string, unknown> {
  return {
    success: true,
    studentNotification: {
      id: result.studentNotification.id,
      agentType: result.studentNotification.agentType,
      subject: result.studentNotification.subject,
      priority: result.studentNotification.priority,
    },
    parentNotification: {
      id: result.parentNotification.id,
      agentType: result.parentNotification.agentType,
      subject: result.parentNotification.subject,
      priority: result.parentNotification.priority,
    },
    deliveryResults: (Array.isArray(result.deliveryResults) ? result.deliveryResults : []).map(
      (r) => ({
        success: r.success,
        channel: r.channel,
        messageId: r.messageId,
      })
    ),
  };
}

export interface IAlertsRouterOptions {
  /** When set, POST /api/alerts enqueues a notify job and returns 202; otherwise processes in-process and returns 201. */
  readonly queue?: MongoQueue;
  /**
   * Read-only repository slice (ISP) for verifying the authenticated user owns or has shared
   * access to the requested studentId. Required to close DEF-003 (cross-tenant IDOR).
   * Optional only so legacy direct-construction callers without DB still build; production
   * wiring (server.ts) always supplies it.
   */
  readonly studentReader?: IStudentReader;
}

/**
 * Handle alert creation request.
 * When queue is provided, enqueues a notify job and returns 202.
 * Otherwise processes in-process and returns 201.
 *
 * @param req - Express request
 * @param res - Express response
 * @param notificationService - Notification service (used when queue is not provided)
 * @param options - Optional queue for async processing
 */
async function handleCreateAlert(
  req: Request,
  res: Response,
  notificationService: NotificationService,
  options: IAlertsRouterOptions = {}
): Promise<void> {
  const alertData = req.body as ICreateAlertRequest;

  const validationError = validateAlertRequest(alertData);
  if (validationError) {
    throw new ValidationError(validationError);
  }

  const authUserId = (req as IAuthenticatedRequest).userId;
  if (!authUserId) {
    throw new AuthenticationError('Unauthorized');
  }

  if (options.studentReader) {
    let student;
    try {
      student = await options.studentReader.findById(alertData.studentId);
    } catch {
      throw new NotFoundError('Student not found');
    }
    if (!student) {
      throw new NotFoundError('Student not found');
    }
    if (!student.hasAccess(authUserId)) {
      throw new ForbiddenError('Forbidden');
    }
  }

  const alert = new Alert({
    studentId: alertData.studentId,
    type: alertData.type as AlertType,
    severity: alertData.severity,
    userId: authUserId,
    relatedData: alertData.relatedData ?? {},
  });

  if (options.queue) {
    const jobId = await options.queue.add(
      'notify',
      'deliver-notification',
      {
        alert: {
          studentId: alert.studentId,
          type: alert.type,
          severity: alert.severity,
          relatedData: alert.relatedData,
          ...(alert.userId != null && { userId: alert.userId }),
        },
      },
      { maxAttempts: 5 }
    );
    res.status(202).json({
      jobId,
      message: 'Notification queued',
    });
    return;
  }

  let result;
  try {
    result = await notificationService.processAlert(alert);
  } catch (error) {
    // Preserve the legacy NotificationError -> 400 mapping (same message).
    if (error instanceof NotificationError) {
      throw new ValidationError(error.message);
    }
    throw error;
  }

  if (!result) {
    throw new Error('Invalid result from notification service');
  }

  const response = formatNotificationResponse(result);

  res.status(201).json(response);
}

/**
 * Create alerts router with notification service dependency.
 * When options.queue is provided, POST /api/alerts enqueues and returns 202; otherwise processes in-process and returns 201.
 *
 * @param notificationService - Notification service instance (used when queue is not provided)
 * @param options - Optional queue for async processing
 * @returns Express router
 */
export function alertsRouter(
  notificationService: NotificationService,
  options: IAlertsRouterOptions = {}
): Router {
  const router = Router();

  router.post(
    '/',
    asyncHandler((req: Request, res: Response) =>
      handleCreateAlert(req, res, notificationService, options)
    )
  );

  return router;
}
