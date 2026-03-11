'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Download, Eye, EyeOff } from 'lucide-react';
import type { IAttachment } from '@/lib/api/students';
import { getAttachmentIcon, isPreviewable, getFileExtension } from '@/lib/attachment-utils';

export interface AttachmentPreviewDialogProps {
  readonly attachments: readonly IAttachment[];
  readonly assignmentTitle: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function AttachmentPreviewDialog({
  attachments,
  assignmentTitle,
  open,
  onOpenChange,
}: AttachmentPreviewDialogProps) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(
    attachments.length === 1 ? 0 : null,
  );

  const handleOpenChange = (next: boolean) => {
    if (!next) setPreviewIndex(attachments.length === 1 ? 0 : null);
    onOpenChange(next);
  };

  const activeAttachment = previewIndex != null ? attachments[previewIndex] : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-8 leading-snug">{assignmentTitle}</DialogTitle>
          <DialogDescription>
            {attachments.length} attachment{attachments.length !== 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1">
          {attachments.map((att, i) => {
            const Icon = getAttachmentIcon(att.type);
            const ext = getFileExtension(att.name);
            const previewing = previewIndex === i;
            const canPreview = isPreviewable(att.type);

            return (
              <li key={`${att.name}-${i}`}>
                <div className="flex items-center gap-3 rounded-md border bg-background px-3 py-2">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{att.name}</p>
                    {ext && (
                      <p className="text-xs text-muted-foreground">{ext}</p>
                    )}
                  </div>

                  {canPreview && (
                    <button
                      type="button"
                      className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title={previewing ? 'Hide preview' : 'Preview'}
                      onClick={() => setPreviewIndex(previewing ? null : i)}
                    >
                      {previewing ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  )}

                  {att.url && (
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title="Download"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  )}
                </div>

                {previewing && <PreviewPane attachment={att} />}
              </li>
            );
          })}
        </ul>

        {activeAttachment && !isPreviewable(activeAttachment.type) && attachments.length === 1 && (
          <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            Preview not available for this file type.
            {activeAttachment.url && (
              <>
                {' '}
                <a
                  href={activeAttachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  Download instead
                </a>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PreviewPane({ attachment }: { attachment: IAttachment }) {
  if (!attachment.url) {
    return (
      <div className="mt-1 rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        No URL available for preview.
      </div>
    );
  }

  const type = attachment.type?.toLowerCase() ?? '';

  if (type.startsWith('image/')) {
    return (
      <div className="mt-1 flex justify-center rounded-lg border bg-muted/10 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={attachment.name}
          className="max-h-[50vh] max-w-full rounded object-contain"
        />
      </div>
    );
  }

  if (type === 'application/pdf') {
    return (
      <div className="mt-1 rounded-lg border">
        <iframe
          src={attachment.url}
          title={attachment.name}
          className="h-[50vh] w-full rounded-lg"
        />
      </div>
    );
  }

  return (
    <div className="mt-1 rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
      Preview not available for this file type.
      {attachment.url && (
        <>
          {' '}
          <a
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            Download instead
          </a>
        </>
      )}
    </div>
  );
}
