// Chart export — PNG download and SVG string generation.

import { saveBlob } from '@pdxui/core';
import type { CanvasRenderer } from './renderer';

/** Download the chart canvas as PNG. */
export function exportPng(renderer: CanvasRenderer, filename = 'chart.png'): void {
    const canvas = renderer.canvas;
    // Create a temporary canvas with white background (transparent canvas → white bg)
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = canvas.width;
    tmpCanvas.height = canvas.height;
    const tmpCtx = tmpCanvas.getContext('2d')!;
    tmpCtx.fillStyle = '#ffffff';
    tmpCtx.fillRect(0, 0, tmpCanvas.width, tmpCanvas.height);
    tmpCtx.drawImage(canvas, 0, 0);

    // The anchor/object-URL dance lives in core: a second copy of it is how `revokeObjectURL`
    // gets dropped.
    tmpCanvas.toBlob((blob) => {
        if (blob) saveBlob(blob, filename);
    }, 'image/png');
}

/** Get chart as PNG data URL. */
export function toPngDataUrl(renderer: CanvasRenderer): string {
    const canvas = renderer.canvas;
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = canvas.width;
    tmpCanvas.height = canvas.height;
    const tmpCtx = tmpCanvas.getContext('2d')!;
    tmpCtx.fillStyle = '#ffffff';
    tmpCtx.fillRect(0, 0, tmpCanvas.width, tmpCanvas.height);
    tmpCtx.drawImage(canvas, 0, 0);
    return tmpCanvas.toDataURL('image/png');
}

/** Copy chart to clipboard as PNG. */
export async function copyToClipboard(renderer: CanvasRenderer): Promise<boolean> {
    try {
        const canvas = renderer.canvas;
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = canvas.width;
        tmpCanvas.height = canvas.height;
        const tmpCtx = tmpCanvas.getContext('2d')!;
        tmpCtx.fillStyle = '#ffffff';
        tmpCtx.fillRect(0, 0, tmpCanvas.width, tmpCanvas.height);
        tmpCtx.drawImage(canvas, 0, 0);

        const blob = await new Promise<Blob | null>((resolve) =>
            tmpCanvas.toBlob(resolve, 'image/png'),
        );
        if (!blob) return false;
        await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
        ]);
        return true;
    } catch {
        return false;
    }
}
