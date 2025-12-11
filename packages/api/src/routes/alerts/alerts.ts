import { Router, type Request, type Response } from 'express';
import { NotificationService, type IProcessAlertResult } from '@scholaracle/agents';
import { Alert, AlertType, NotificationError } from '@scholaracle/contracts';

export interface ICreateAlertRequest {
  readonly studentId: string;
  readonly type: string;
  readonly severity: string;
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
    deliveryResults: (result.deliveryResults ?? []).map((r) => ({
      success: r.success,
      channel: r.channel,
      messageId: r.messageId,
    })),
  };
}

/**
 * Handle alert creation request.
 *
 * @param req - Express request
 * @param res - Express response
 * @param notificationService - Notification service
 */
async function handleCreateAlert(
  req: Request,
  res: Response,
  notificationService: NotificationService
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
      relatedData: alertData.relatedData ?? {},
    });

    const result = await notificationService.processAlert(alert);

    if (!result || !result.deliveryResults) {
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
 *
 * @param notificationService - Notification service instance
 * @returns Express router
 */
export function alertsRouter(notificationService: NotificationService): Router {
  const router = Router();

  router.post('/', (req: Request, res: Response) => {
    void handleCreateAlert(req, res, notificationService);
  });

  return router;
}
