import { AgentType, AlertType } from '@scholaracle/contracts';

/**
 * Deterministic audience map (slice 7). LLM may tone copy, not who to tell.
 * Per-household override is a follow-up — do not add it here.
 *
 * @see docs/alert-audience.md
 */
export const alertAudience: Record<AlertType, { student: boolean; parent: boolean }> = {
  [AlertType.MISSING_ASSIGNMENT]: { student: true, parent: true },
  [AlertType.DEADLINE]: { student: true, parent: false },
  [AlertType.GRADE_DROP]: { student: true, parent: true },
  [AlertType.TEST]: { student: true, parent: false },
  [AlertType.WORKLOAD]: { student: true, parent: false },
  [AlertType.POSITIVE]: { student: true, parent: false },
  [AlertType.RECOMMENDATION]: { student: false, parent: true },
};

export function shouldNotifyStudent(alertType: AlertType): boolean {
  return alertAudience[alertType]?.student ?? true;
}

export function shouldNotifyParent(alertType: AlertType): boolean {
  return alertAudience[alertType]?.parent ?? true;
}

export function shouldDeliverToAgent(alertType: AlertType, agentType: AgentType): boolean {
  if (agentType === AgentType.STUDENT) return shouldNotifyStudent(alertType);
  if (agentType === AgentType.PARENT) return shouldNotifyParent(alertType);
  return true;
}
