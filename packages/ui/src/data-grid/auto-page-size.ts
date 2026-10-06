// autoPageSize — density-aware paging: set the grid's pageSize to the number of WHOLE rows that fit the
// available height, so the page fills the space with no partial row or scrollbar. Recomputes on resize.
// Framework-level promotion of the pattern every list screen re-implemented (UI-15c).
//
// Usage:
//   import { autoPageSize } from '@pdxui/ui';
//   autoPageSize({ grid: gridEl, source: ds });            // measures the grid's own container
//   autoPageSize({ grid: gridEl, source: ds, container: sectionEl, reserve: () => headerEl.offsetHeight });

import { DEV } from '@pdxui/core';

const FALLBACK_ROW_H = 46;

export interface AutoPageSizeOptions {
    /** The <pdx-data-grid> element (or any element containing `.pdx-dg-body`). */
    grid: HTMLElement;
    /** A DataSource exposing `pageSize()` and `setPageSize(n)`. */
    source: { pageSize(): number; setPageSize(n: number): void };
    /** The height-defining container to fit into. Defaults to the grid's offsetParent (or the grid itself). */
    container?: HTMLElement;
    /** Extra vertical space to subtract from the container (e.g. a page header above the grid). */
    reserve?: () => number;
}

/** Attaches density-aware paging. Returns a disposer that stops the ResizeObserver. */
export function autoPageSize(opts: AutoPageSizeOptions): () => void {
    const { grid, source } = opts;
    let ro: ResizeObserver | null = null;
    let raf = 0;
    let tries = 0;

    function container(): HTMLElement {
        return opts.container ?? (grid.offsetParent as HTMLElement | null) ?? grid;
    }

    function recompute(): void {
        const body = grid.querySelector('.pdx-dg-body') as HTMLElement | null;
        const box = container();
        if (!body || !box) return;

        const firstRow = body.querySelector('.pdx-dg-row, [role="row"]') as HTMLElement | null;
        const rowH = firstRow ? firstRow.getBoundingClientRect().height : FALLBACK_ROW_H;
        const chrome = grid.offsetHeight - body.offsetHeight; // header + filters + footer + borders
        const cs = getComputedStyle(box);
        const padV = parseFloat(cs.paddingTop || '0') + parseFloat(cs.paddingBottom || '0');
        const reserve = opts.reserve ? opts.reserve() : 0;
        const avail = box.clientHeight - padV - reserve;

        const n = Math.max(1, Math.floor((avail - chrome - 2) / rowH)); // -2px sub-pixel guard
        if (n !== source.pageSize()) source.setPageSize(n);
    }

    function start(): void {
        const body = grid.querySelector('.pdx-dg-body');
        const firstRow = body && body.querySelector('.pdx-dg-row, [role="row"]');
        if (!firstRow) {
            if (tries++ < 60) { raf = requestAnimationFrame(start); return; }
            // An explicit give-up, not a silent one: with slow or empty sources the user needs to know why paging is off
            if (DEV) console.warn('[pdx] autoPageSize: no row rendered after ~1s — automatic paging not enabled. The container must have a defined height and the grid at least one row.');
            return;
        }
        recompute();
        // Observe the CONTAINER (not the body, whose height now depends on pageSize → would loop).
        ro = new ResizeObserver(() => recompute());
        ro.observe(container());
    }

    start();

    return () => {
        if (raf) cancelAnimationFrame(raf);
        if (ro) ro.disconnect();
    };
}
