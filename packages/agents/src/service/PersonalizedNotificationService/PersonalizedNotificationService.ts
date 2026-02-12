import type { IPersonalizationService } from '@scholaracle/interfaces';
import { Alert, AgentType } from '@scholaracle/contracts';
import { NotificationService, type IProcessAlertResult } from '../NotificationService';

export interface IPersonalizedNotificationServiceConfig {
  readonly notificationService: NotificationService;
  readonly personalizationService: IPersonalizationService;
  readonly defaultTone?: 'formal' | 'casual' | 'encouraging';
}

/**
 * Wraps NotificationService with AI personalization.
 * After generating notifications, enhances subject/body via PersonalizationService.
 */
export class PersonalizedNotificationService {
  private readonly _notificationService: NotificationService;
  private readonly _personalizationService: IPersonalizationService;
  private readonly _defaultTone: 'formal' | 'casual' | 'encouraging';

  constructor(config: IPersonalizedNotificationServiceConfig) {
    this._notificationService = config.notificationService;
    this._personalizationService = config.personalizationService;
    this._defaultTone = config.defaultTone ?? 'encouraging';
  }

  public async processAlert(
    alert: Alert,
    options?: {
      studentTone?: 'formal' | 'casual' | 'encouraging';
      parentTone?: 'formal' | 'casual' | 'encouraging';
    }
  ): Promise<IProcessAlertResult> {
    const result = await this._notificationService.processAlert(alert);

    if (!this._personalizationService.isAvailable()) {
      return result;
    }

    // Enhance student notification
    const studentTone = options?.studentTone ?? this._defaultTone;
    const studentEnhanced = await this._personalizationService.enhance({
      subject: result.studentNotification.subject,
      body: result.studentNotification.body,
      alertType: alert.type,
      agentType: AgentType.STUDENT,
      tone: studentTone,
      context: alert.relatedData as Record<string, unknown> | undefined,
    });

    if (studentEnhanced.wasPersonalized) {
      result.studentNotification.updateContent(studentEnhanced.subject, studentEnhanced.body);
    }

    // Enhance parent notification
    const parentTone = options?.parentTone ?? this._defaultTone;
    const parentEnhanced = await this._personalizationService.enhance({
      subject: result.parentNotification.subject,
      body: result.parentNotification.body,
      alertType: alert.type,
      agentType: AgentType.PARENT,
      tone: parentTone,
      context: alert.relatedData as Record<string, unknown> | undefined,
    });

    if (parentEnhanced.wasPersonalized) {
      result.parentNotification.updateContent(parentEnhanced.subject, parentEnhanced.body);
    }

    return result;
  }
}
