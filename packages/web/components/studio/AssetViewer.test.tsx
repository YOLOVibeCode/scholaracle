/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { AssetViewer } from './AssetViewer';

describe('AssetViewer', () => {
  it('renders a PDF in an iframe and does not call window.open', () => {
    const open = jest.fn();
    window.open = open;
    render(
      <AssetViewer url="blob:pdf" contentType="application/pdf" title="lab-safety.pdf" cacheKey="a:h" />
    );
    const viewer = screen.getByTestId('studio-asset-viewer');
    expect(viewer.tagName).toBe('IFRAME');
    expect(viewer).toHaveAttribute('src', 'blob:pdf');
    expect(viewer).toHaveAttribute('data-viewer-kind', 'pdf');
    expect(open).not.toHaveBeenCalled();
    const download = screen.getByRole('link', { name: 'Download lab-safety.pdf' });
    expect(download).toHaveAttribute('href', 'blob:pdf');
    expect(download).toHaveAttribute('download', 'lab-safety.pdf');
  });

  it('renders an image in page', () => {
    window.open = jest.fn();
    render(
      <AssetViewer url="blob:img" contentType="image/png" title="diagram.png" />
    );
    const viewer = screen.getByTestId('studio-asset-viewer');
    expect(viewer.tagName).toBe('IMG');
    expect(viewer).toHaveAttribute('src', 'blob:img');
    expect(window.open).not.toHaveBeenCalled();
  });

  it('renders a video in page', () => {
    window.open = jest.fn();
    render(
      <AssetViewer url="blob:vid" contentType="video/mp4" title="clip.mp4" />
    );
    const viewer = screen.getByTestId('studio-asset-viewer');
    expect(viewer.tagName).toBe('VIDEO');
    expect(viewer).toHaveAttribute('src', 'blob:vid');
    expect(window.open).not.toHaveBeenCalled();
  });

  it('unsupported type stays on the pack page as download / open-in-new', () => {
    const open = jest.fn();
    window.open = open;
    render(
      <AssetViewer url="blob:zip" contentType="application/zip" title="notes.zip" />
    );
    const viewer = screen.getByTestId('studio-asset-viewer');
    expect(viewer).toHaveAttribute('data-viewer-kind', 'download');
    expect(screen.getByRole('link', { name: 'Download notes.zip' })).toHaveAttribute(
      'href',
      'blob:zip'
    );
    expect(screen.getByRole('link', { name: 'Open in new tab' })).toHaveAttribute(
      'href',
      'blob:zip'
    );
    expect(open).not.toHaveBeenCalled();
  });
});
