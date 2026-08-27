import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '@scholaracle/contracts';
import type { IAuthenticatedRequest } from './auth';

/** Parent-only routes (students list, scrape, billing, source invites, …). */
export function requireParent(req: Request, _res: Response, next: NextFunction): void {
  const authReq = req as IAuthenticatedRequest;
  if (authReq.userRole !== 'parent') {
    next(new ForbiddenError('Parent access required'));
    return;
  }
  next();
}

/** Student-only routes (`/api/studio/*`). Requires a scoped studentId claim. */
export function requireStudent(req: Request, _res: Response, next: NextFunction): void {
  const authReq = req as IAuthenticatedRequest;
  if (authReq.userRole !== 'student' || !authReq.studentId) {
    next(new ForbiddenError('Student access required'));
    return;
  }
  next();
}
