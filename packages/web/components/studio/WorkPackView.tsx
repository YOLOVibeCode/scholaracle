'use client';

import { useState } from 'react';
import type { IWorkPackAsset, IWorkPackView } from '@scholaracle/contracts';
import type { ICachedAsset } from '@scholaracle/studio-core';
import { Button } from '@/components/ui/button';
import { openCachedAsset } from '@/lib/studio/openCachedAsset';
import { cn } from '@/lib/utils';
import { AssetViewer } from './AssetViewer';

export interface IWorkPackViewProps {
  readonly view: IWorkPackView;
  readonly className?: string;
  /** `full` is the student studio. `stack` is the pack body only (parent header already exists). */
  readonly chrome?: 'full' | 'stack';
  /** Defaults to the browser IAssetCache. Injected in tests. */
  readonly openPrimaryAsset?: (asset: IWorkPackAsset) => Promise<ICachedAsset>;
  /** Student studio: opening the pack marks working_on_it. Parent drawers omit this. */
  readonly onPrimaryOpened?: () => void;
}

/**
 * Student (and parent) work-pack stack. Presentational — takes IWorkPackView.
 * One loud Open for the hosted file; LMS / other links are quieter fallbacks.
 * Open goes through IAssetCache (bytes keyed by assetId + contentHash).
 */
export function WorkPackView({
  view,
  className,
  chrome = 'full',
  openPrimaryAsset = openCachedAsset,
  onPrimaryOpened,
}: IWorkPackViewProps): React.ReactElement {
  const overdue = isOverdue(view.dueAt);
  const primaryLabel = view.primaryAsset ? `Open ${view.primaryAsset.fileName}` : null;
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerType, setViewerType] = useState<string>('application/pdf');
  const [fromCache, setFromCache] = useState(false);
  const [cacheKey, setCacheKey] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const handleOpen = (): void => {
    const asset = view.primaryAsset;
    if (asset == null) return;
    void (async () => {
      setOpenError(null);
      try {
        const opened = await openPrimaryAsset(asset);
        const copy = new Uint8Array(opened.bytes.byteLength);
        copy.set(opened.bytes);
        const blob = new Blob([copy], {
          type: opened.contentType !== '' ? opened.contentType : 'application/pdf',
        });
        const url = URL.createObjectURL(blob);
        setViewerType(opened.contentType !== '' ? opened.contentType : 'application/pdf');
        setViewerUrl((prev) => {
          if (prev != null) URL.revokeObjectURL(prev);
          return url;
        });
        setFromCache(opened.fromCache);
        setCacheKey(opened.cacheKey);
        setStaleNotice(opened.stale === true || opened.requestedHashMissing === true);
        onPrimaryOpened?.();
      } catch {
        setOpenError('Could not open the file right now.');
      }
    })();
  };

  const innerClass =
    chrome === 'full' ? 'mx-auto flex w-full max-w-2xl flex-col gap-6 px-6' : 'contents';

  return (
    <div
      className={cn(
        chrome === 'full'
          ? 'flex w-full flex-col gap-6 py-10'
          : 'mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10',
        className
      )}
      data-testid="studio-work-pack"
    >
      <div className={innerClass}>
        {chrome === 'full' ? (
          <header className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{view.title}</h1>
              <p
                className="text-sm font-medium text-muted-foreground"
                data-testid="studio-pack-status"
              >
                {view.humanStatus}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {view.courseName}
              {view.dueAt ? ` · Due ${formatDue(view.dueAt)}` : ''}
              {overdue ? ' · Overdue' : ''}
            </p>
          </header>
        ) : null}

        {primaryLabel ? (
          <Button
            size="lg"
            className="w-fit"
            onClick={handleOpen}
            data-testid="studio-pack-primary-cta"
          >
            {primaryLabel}
          </Button>
        ) : null}

        {openError != null ? (
          <p className="text-sm text-destructive" data-testid="studio-pack-open-error">
            {openError}
          </p>
        ) : null}

        {staleNotice ? (
          <p className="text-sm text-muted-foreground" data-testid="studio-pack-stale">
            May be outdated until next parent sync
          </p>
        ) : null}
      </div>

      {viewerUrl != null ? (
        <div className={chrome === 'full' ? 'w-full px-4 sm:px-6' : undefined}>
          <AssetViewer
            url={viewerUrl}
            contentType={viewerType}
            title={view.primaryAsset?.fileName ?? 'Worksheet'}
            cacheKey={cacheKey ?? undefined}
            fromCache={fromCache}
            className="min-h-[70vh] w-full"
          />
        </div>
      ) : null}

      <div className={innerClass}>
        <section data-testid="studio-pack-instructions">
          <p className="whitespace-pre-line text-base leading-relaxed text-foreground/90">
            {view.instructionsText}
          </p>
        </section>

        {view.capturedPages.length > 0 ? (
          <section data-testid="studio-pack-captured" className="flex flex-col gap-4">
            <h2 className="text-sm font-medium text-muted-foreground">
              Read here — saved for offline
            </h2>
            {view.capturedPages.map((page) => (
              <article key={page.title} className="rounded-md border px-4 py-3">
                <h3 className="text-sm font-semibold">{page.title}</h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                  {page.text}
                </p>
                {page.href != null && page.href !== '' ? (
                  <a
                    href={page.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline"
                  >
                    Open original
                  </a>
                ) : null}
              </article>
            ))}
          </section>
        ) : null}

        {view.needsSchoolLogin.length > 0 ? (
          <section data-testid="studio-pack-fallbacks" className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Needs school login / other links
            </h2>
            <ul className="space-y-1">
              {view.needsSchoolLogin.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary underline-offset-4 hover:underline"
                  >
                    {link.kind === 'needs-internet' ? `${link.label} (needs internet)` : link.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {view.moreFromCourse.length > 0 ? (
          <details data-testid="studio-more-from-course" className="rounded-md border px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">More from this course</summary>
            <ul className="mt-3 space-y-2 text-sm text-foreground/80">
              {view.moreFromCourse.map((item) => (
                <li key={item.title}>
                  {item.title}
                  {item.asset?.fileName ? (
                    <span className="text-muted-foreground"> · {item.asset.fileName}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function formatDue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function isOverdue(dueAt: string | undefined): boolean {
  if (dueAt == null || dueAt === '') return false;
  const ms = Date.parse(dueAt);
  if (Number.isNaN(ms)) return false;
  return ms < Date.now();
}
