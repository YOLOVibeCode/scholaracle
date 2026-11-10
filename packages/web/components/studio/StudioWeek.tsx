'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  parseStudentStatusUpdateResponse,
  studioStatusPatchBody,
  type IStudentStatusUpdateResponse,
  type IWeekView,
  type StudentStatus,
} from '@scholaracle/contracts';
import { applyStudentStatusLocally, submitWithRollback } from '@scholaracle/studio-core';
import { apiClient } from '@/lib/api/client';
import { WeekView } from '@/components/studio/WeekView';

export interface IStudioWeekProps {
  readonly view: IWeekView;
}

/**
 * Student studio wrapper for This week: a status pick moves the row at once
 * (done → Done this week), PATCHes the server with the shared body, hands the
 * server's answer to the sheet, then refreshes the page data. A refused PATCH
 * puts the snapshot back.
 */
export function StudioWeek({ view }: IStudioWeekProps): React.ReactElement {
  const router = useRouter();
  const [local, setLocal] = useState(view);

  // A refresh from the server replaces the optimistic copy.
  useEffect(() => {
    setLocal(view);
  }, [view]);

  const handleStatus = async (
    assignmentExternalId: string,
    status: StudentStatus,
    note?: string
  ): Promise<IStudentStatusUpdateResponse> => {
    const response = await submitWithRollback<IWeekView, IStudentStatusUpdateResponse>({
      current: local,
      optimistic: (current) => applyStudentStatusLocally(current, assignmentExternalId, status),
      set: setLocal,
      submit: async () =>
        parseStudentStatusUpdateResponse(
          await apiClient.request<unknown>(
            `/studio/assignments/${encodeURIComponent(assignmentExternalId)}/status`,
            { method: 'PATCH', body: JSON.stringify(studioStatusPatchBody(status, note)) }
          )
        ),
    });
    router.refresh();
    return response;
  };

  return <WeekView view={local} onStatusChange={handleStatus} />;
}
