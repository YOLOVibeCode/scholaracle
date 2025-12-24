"use client";

import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import type { IAdminAuditLogItem } from '@/lib/api/admin/audit-logs';

export interface IAuditLogDetailSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly item: IAdminAuditLogItem | null;
}

export function AuditLogDetailSheet(props: IAuditLogDetailSheetProps) {
  const { open, onOpenChange, item } = props;

  const body = item ? (
    <div className="space-y-4 p-4 text-sm">
      <div className="grid grid-cols-3 gap-2">
        <div className="text-muted-foreground">Time</div>
        <div className="col-span-2" data-testid="audit-detail-time">
          {new Date(item.timestamp).toLocaleString()}
        </div>

        <div className="text-muted-foreground">Admin</div>
        <div className="col-span-2" data-testid="audit-detail-admin">
          {item.adminEmail}
        </div>

        <div className="text-muted-foreground">Action</div>
        <div className="col-span-2" data-testid="audit-detail-action">
          {item.action}
        </div>

        <div className="text-muted-foreground">Entity</div>
        <div className="col-span-2" data-testid="audit-detail-entity">
          {item.entityType}
          {item.entityId ? `:${item.entityId}` : ''}
        </div>

        <div className="text-muted-foreground">Severity</div>
        <div className="col-span-2" data-testid="audit-detail-severity">
          {item.severity ?? ''}
        </div>

        <div className="text-muted-foreground">Reason</div>
        <div className="col-span-2" data-testid="audit-detail-reason">
          {item.reason ?? ''}
        </div>

        <div className="text-muted-foreground">IP</div>
        <div className="col-span-2" data-testid="audit-detail-ip">
          {item.ipAddress ?? ''}
        </div>

        <div className="text-muted-foreground">User Agent</div>
        <div className="col-span-2 break-all" data-testid="audit-detail-ua">
          {item.userAgent ?? ''}
        </div>
      </div>

      <div>
        <div className="mb-2 text-muted-foreground">Metadata</div>
        <pre className="max-h-[50vh] overflow-auto rounded-md border bg-muted/30 p-3 text-xs" data-testid="audit-detail-metadata">
          {JSON.stringify(item.metadata ?? {}, null, 2)}
        </pre>
      </div>
    </div>
  ) : (
    <div className="p-4 text-sm text-muted-foreground">No audit log selected.</div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" data-testid="audit-detail-sheet">
        <SheetHeader>
          <SheetTitle>Audit Event Details</SheetTitle>
          <SheetDescription>Inspect the full context of a sensitive action.</SheetDescription>
        </SheetHeader>

        {body}

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}


