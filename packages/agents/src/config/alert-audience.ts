import { AlertType } from '@scholaracle/contracts';

/**
 * Which audience receives notifications for each alert type.
 * Used by NotificationService to decide whether to generate/deliver student and/or parent notifications.
 * Default: both true for all types (current behavior). Adjust per docs/alert-audience.md.
 */
export const alertAudience: Record<AlertType, { student: boolean; parent: boolean }> = {
  [AlertType.MISSING_ASSIGNMENT]: { student: true, parent: true },
  [AlertType.DEADLINE]: { student: true, parent: true },
  [AlertType.GRADE_DROP]: { student: true, parent: true },
  [AlertType.TEST]: { student: true, parent: true },
  [AlertType.WORKLOAD]: { student: true, parent: true },
  [AlertType.POSITIVE]: { student: true, parent: true },
  [AlertType.RECOMMENDATION]: { student: true, parent: true },
};

export function shouldNotifyStudent(alertType: AlertType): boolean {
  return alertAudience[alertType]?.student ?? true;
}

export function shouldNotifyParent(alertType: AlertType): boolean {
  return alertAudience[alertType]?.parent ?? true;
}
