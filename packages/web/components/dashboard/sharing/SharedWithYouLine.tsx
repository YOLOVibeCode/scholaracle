import type { StudentAccess } from '@scholaracle/contracts';
import { Users } from 'lucide-react';

export interface SharedWithYouLineProps {
  /** The viewer's access to the student; nothing renders for the owner. */
  access?: StudentAccess;
  /** Display name of the person who shared the student, when known. */
  sharedByName?: string;
  className?: string;
}

/** "Shared with you · by Ricardo" under a shared student's name (sharing-spec §4.8). */
export function SharedWithYouLine({ access, sharedByName, className }: SharedWithYouLineProps) {
  if (access === undefined || access === 'owner') return null;
  const by = sharedByName?.trim() ? ` · by ${sharedByName.trim()}` : '';
  return (
    <p
      className={`flex items-center gap-1 text-xs text-muted-foreground ${className ?? ''}`}
      data-testid="shared-with-you"
    >
      <Users className="h-3 w-3" aria-hidden="true" />
      <span>Shared with you{by}</span>
    </p>
  );
}
