import type {
  IStudentMaterialsResponse,
  IStudentSession,
  IWorkPackView,
} from '@scholaracle/contracts';

/**
 * One assignment, stacked for doing the work. Reads a narrow port
 * (IWorkPackSource) — never grades, siblings, or parent nudge.
 */

export interface IWorkPackAssignment {
  readonly assignmentExternalId: string;
  readonly title: string;
  readonly courseName: string;
  readonly dueAt?: string;
  readonly status: string;
  readonly descriptionHtml?: string;
  readonly lmsUrl?: string;
  /** Present on the source doc; must not leak into the view when showGrades is false. */
  readonly pointsEarned?: number;
  readonly pointsPossible?: number;
  readonly letterGrade?: string;
}

export interface IWorkPackSource {
  loadAssignment(assignmentExternalId: string): Promise<IWorkPackAssignment>;
  loadMaterials(assignmentExternalId: string): Promise<IStudentMaterialsResponse>;
}

export interface IWorkPack {
  load(session: IStudentSession, assignmentExternalId: string): Promise<IWorkPackView>;
}
