import type { ITodayView } from '@scholaracle/contracts';

export interface ITodayPrimaryCta {
  readonly assignmentExternalId: string;
  readonly label: string;
  readonly title: string;
}

export interface ITodayAlsoItem {
  readonly assignmentExternalId: string;
  readonly title: string;
  readonly courseName: string;
}

export interface ITodayViewModel {
  readonly testId: 'studio-today';
  readonly encouragement: string;
  readonly primary: ITodayPrimaryCta | null;
  readonly alsoToday: readonly ITodayAlsoItem[];
}

/** Maps ITodayView to phone chrome. Drops any extra grade fields. */
export function todayViewModel(view: ITodayView): ITodayViewModel {
  return {
    testId: 'studio-today',
    encouragement: view.encouragement,
    primary: view.next
      ? {
          assignmentExternalId: view.next.assignmentExternalId,
          label: view.next.primaryCtaLabel,
          title: view.next.title,
        }
      : null,
    alsoToday: view.alsoToday.map((step) => ({
      assignmentExternalId: step.assignmentExternalId,
      title: step.title,
      courseName: step.courseName,
    })),
  };
}
