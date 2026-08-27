/**
 * Wire contract for GET /api/students/:id/action-board.
 *
 * Server is source of truth: packages/api/src/routes/students/students.ts
 * (action-board handler; these types were moved here verbatim from that file).
 * Web keeps a hand-mirror at packages/web/lib/api/students.ts — update it
 * manually if this changes.
 */

export interface IActionAsset {
  readonly assetId: string;
  readonly fileName: string;
  readonly materialType: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly downloadUrl: string;
  /** Hash of stored bytes. Cache key is assetId + contentHash. */
  readonly contentHash?: string;
}

export interface IActionItem {
  readonly assignmentExternalId: string;
  readonly title: string;
  readonly dueAt?: string;
  readonly status: string;
  readonly termExternalId?: string;
  readonly pointsPossible?: number;
  readonly pointsEarned?: number;
  readonly isOverdue: boolean;
  readonly course: {
    readonly externalId: string;
    readonly name: string;
    readonly currentGrade?: number;
    readonly letterGrade?: string;
    readonly riskLevel: string;
  };
  readonly assets: readonly IActionAsset[];
  readonly materials: readonly IActionAsset[];
  readonly studentStatus?: string;
  readonly lastNudgedAt?: string;
}

export interface IActionBucket {
  readonly id: 'needs_attention' | 'due_soon' | 'in_progress' | 'recently_graded' | 'caught_up';
  readonly label: string;
  readonly count: number;
  readonly items: readonly IActionItem[];
}

export interface IActionBoardResponse {
  readonly studentId: string;
  readonly studentName: string;
  readonly buckets: readonly IActionBucket[];
}
