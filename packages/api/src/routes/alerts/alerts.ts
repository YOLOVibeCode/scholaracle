import { Router, type Request, type Response } from 'express';
import { NotificationService, type IProcessAlertResult, MongoQueue } from '@scholaracle/agents';
import { Alert, AlertType, NotificationError } from '@scholaracle/contracts';

export interface ICreateAlertRequest {
  readonly studentId: string;
  readonly type: string;
  readonly severity: string;
  /** Optional parent email for delivery (otherwise falls back to studentId). */
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
  try {
    const alertData = req.body as ICreateAlertRequest;

    const validationError = validateAlertRequest(alertData);
    if (validationError) {
      res.status(400).json({
        success: false,
        error: validationError,
      });
      return;
    }

    const alert = new Alert({
      studentId: alertData.studentId,
      type: alertData.type as AlertType,
      severity: alertData.severity,
      userId: alertData.userId,
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

    const result = await notificationService.processAlert(alert);

    if (!result) {
      throw new Error('Invalid result from notification service');
    }

    const response = formatNotificationResponse(result);

    res.status(201).json(response);
  } catch (error) {
    if (error instanceof NotificationError) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
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

  router.post('/', (req: Request, res: Response) => {
    void handleCreateAlert(req, res, notificationService, options);
  });

  return router;
}
