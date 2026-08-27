'use client';

import { cn } from '@/lib/utils';

export type AssetViewerKind = 'pdf' | 'image' | 'video' | 'download';

export interface IAssetViewerProps {
  readonly url: string;
  readonly contentType: string;
  readonly title: string;
  readonly cacheKey?: string;
  readonly fromCache?: boolean;
  readonly className?: string;
}

export function viewerKindFor(contentType: string): AssetViewerKind {
  const type = contentType.toLowerCase();
  if (type === 'application/pdf' || type.includes('pdf')) return 'pdf';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  return 'download';
}

/**
 * In-page hosted file. Blob URL in, iframe/img/video out — never window.open.
 */
export function AssetViewer({
  url,
  contentType,
  title,
  cacheKey,
  fromCache,
  className,
}: IAssetViewerProps): React.ReactElement {
  const kind = viewerKindFor(contentType);
  const cacheAttrs = {
    'data-testid': 'studio-asset-viewer',
    'data-viewer-kind': kind,
    'data-cache-key': cacheKey ?? '',
    'data-from-cache': fromCache === true ? 'true' : 'false',
  } as const;

  if (kind === 'pdf') {
    return (
      <div className={cn('flex w-full flex-col gap-2', className)}>
        <iframe
          title={title}
          src={url}
          className="min-h-[70vh] w-full rounded-md border bg-muted/30"
          {...cacheAttrs}
        />
        <DownloadLink url={url} title={title} />
      </div>
    );
  }

  if (kind === 'image') {
    return (
      <div className={cn('flex w-full flex-col gap-2', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- blob URL from IAssetCache */}
        <img
          alt={title}
          src={url}
          className="w-full rounded-md border bg-muted/30"
          {...cacheAttrs}
        />
        <DownloadLink url={url} title={title} />
      </div>
    );
  }

  if (kind === 'video') {
    return (
      <div className={cn('flex w-full flex-col gap-2', className)}>
        <video
          controls
          src={url}
          className="w-full rounded-md border bg-muted/30"
          {...cacheAttrs}
        >
          {title}
        </video>
        <DownloadLink url={url} title={title} />
      </div>
    );
  }

  return (
    <div
      className={cn('flex w-full flex-col gap-2 rounded-md border px-4 py-3 text-sm', className)}
      {...cacheAttrs}
    >
      <p className="text-muted-foreground">This file type can’t play in the page.</p>
      <DownloadLink url={url} title={title} />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline-offset-4 hover:underline"
      >
        Open in new tab
      </a>
    </div>
  );
}

function DownloadLink({ url, title }: { readonly url: string; readonly title: string }): React.ReactElement {
  return (
    <a
      href={url}
      download={title}
      data-testid="studio-asset-download"
      className="text-sm text-primary underline-offset-4 hover:underline"
    >
      Download {title}
    </a>
  );
}
