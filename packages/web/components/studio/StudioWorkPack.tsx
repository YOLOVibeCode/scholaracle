'use client';

import { useState } from 'react';
import type { IWorkPackView } from '@scholaracle/contracts';
import { WorkPackView } from '@/components/studio/WorkPackView';
import { apiClient } from '@/lib/api/client';

export interface IStudioWorkPackProps {
  readonly view: IWorkPackView;
  readonly assignmentExternalId: string;
}

/**
 * Student studio wrapper: opening the hosted file sets working_on_it.
 * Parent nudge lives on the action board, not here.
 */
export function StudioWorkPack({
  view,
  assignmentExternalId,
}: IStudioWorkPackProps): React.ReactElement {
  const [humanStatus, setHumanStatus] = useState(view.humanStatus);

  const handleOpened = (): void => {
    setHumanStatus('Working on it');
    void apiClient
      .request(`/studio/assignments/${encodeURIComponent(assignmentExternalId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'working_on_it' }),
      })
      .catch(() => {
        /* optimistic local status still stands; parent ingest owns submitted */
      });
  };

  return <WorkPackView view={{ ...view, humanStatus }} onPrimaryOpened={handleOpened} />;
}
