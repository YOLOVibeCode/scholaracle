'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { IStudioStatusPatchRequest, IWeekView, StudentStatus } from '@scholaracle/contracts';
import { applyStudentStatusLocally } from '@scholaracle/studio-core';
import { apiClient } from '@/lib/api/client';
import { WeekView } from '@/components/studio/WeekView';

export interface IStudioWeekProps {
  readonly view: IWeekView;
}

/**
 * Student studio wrapper for This week: a status pick moves the row at once
 * (done → Done this week), PATCHes the server, then refreshes the page data.
 * The need-help note rides along; the server ignores it until R3.
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
  ): Promise<void> => {
    setLocal((current) => applyStudentStatusLocally(current, assignmentExternalId, status));
    const body: IStudioStatusPatchRequest =
      note !== undefined && note !== '' ? { status, note } : { status };
    try {
      await apiClient.request(
        `/studio/assignments/${encodeURIComponent(assignmentExternalId)}/status`,
        { method: 'PATCH', body: JSON.stringify(body) }
      );
    } catch (err: unknown) {
      // Server said no: back to what the server last gave us.
      setLocal(view);
      throw err;
    }
    router.refresh();
  };

  return <WeekView view={local} onStatusChange={handleStatus} />;
}
