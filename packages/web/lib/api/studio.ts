import {
  parseTodayView,
  parseWorkPackView,
  type ITodayView,
  type IWorkPackView,
} from '@scholaracle/contracts';
import type { IOfflinePackApiResponse } from '@scholaracle/studio-core';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:2801/api';

export class StudioAuthError extends Error {
  public readonly status: number;

  constructor(status: number) {
    super('Studio authentication failed');
    this.name = 'StudioAuthError';
    this.status = status;
  }
}

export class StudioNotFoundError extends Error {
  constructor() {
    super('Studio resource not found');
    this.name = 'StudioNotFoundError';
  }
}

async function studioFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
}

function throwIfAuthFailed(res: Response): void {
  if (res.status === 401 || res.status === 403) {
    throw new StudioAuthError(res.status);
  }
}

export async function fetchStudioToday(token: string): Promise<ITodayView> {
  const res = await studioFetch('/studio/today', token);
  throwIfAuthFailed(res);
  if (!res.ok) {
    throw new Error(`Studio today failed: ${res.status}`);
  }
  return parseTodayView(await res.json());
}

export async function fetchStudioWorkPack(
  token: string,
  assignmentExternalId: string
): Promise<IWorkPackView> {
  const res = await studioFetch(
    `/studio/assignments/${encodeURIComponent(assignmentExternalId)}`,
    token
  );
  throwIfAuthFailed(res);
  if (res.status === 404) {
    throw new StudioNotFoundError();
  }
  if (!res.ok) {
    throw new Error(`Studio work pack failed: ${res.status}`);
  }
  return parseWorkPackView(await res.json());
}

export async function fetchOfflinePack(
  token: string,
  courseExternalId: string
): Promise<IOfflinePackApiResponse> {
  const res = await studioFetch(
    `/studio/courses/${encodeURIComponent(courseExternalId)}/offline-pack`,
    token
  );
  throwIfAuthFailed(res);
  if (res.status === 404) {
    throw new StudioNotFoundError();
  }
  if (!res.ok) {
    throw new Error(`Offline pack fetch failed: ${res.status}`);
  }
  return res.json() as Promise<IOfflinePackApiResponse>;
}

export async function patchStudioAssignmentStatus(
  token: string,
  assignmentExternalId: string,
  status: 'not_started' | 'working_on_it' | 'need_help' | 'done' | null
): Promise<void> {
  const res = await studioFetch(
    `/studio/assignments/${encodeURIComponent(assignmentExternalId)}/status`,
    token,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }
  );
  throwIfAuthFailed(res);
  if (res.status === 404) {
    throw new StudioNotFoundError();
  }
  if (!res.ok) {
    throw new Error(`Studio status failed: ${res.status}`);
  }
}
