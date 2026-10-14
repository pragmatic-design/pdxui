// A `@for` that receives more than LIST_SLICE_THRESHOLD new rows at once renders them in slices
// (#242). The list renders a first slice of LIST_SLICE_MS of work in the same task, so the first
// rows are in the same frame, and appends the rest through processInSlices (#240), which yields to
// input between slices. Only the
// append path does this (a replace with no row in common is a clear and an append): the rows still
// pending go after the ones rendered, so each slice's rows land at their final positions.
//
// Both numbers were set against js-framework-benchmark and the INP of a 10 000-row append
// (`append-slices.spec.ts`), measured on one machine in one session:
//   · 5 ms slices answered input most often, but each yield is a frame, and every frame lays out
//     and paints a list that is still growing: create 10 000 rows took 1170 ms to its last paint,
//     against 491 ms in one pass (vanillajs 415), and the geometric mean of the totals went from
//     1.27× vanillajs to 1.66×;
//   · 40 ms slices, still under the 50 ms of a long task, brought create 10 000 to 547 ms (1.34×)
//     and the geometric mean to 1.33×, the script's to 1.12× (from 3.14×), with the INP of the
//     10 000-row append at 72-80 ms against about 600 ms in one pass;
//   · a threshold of 1 000 instead of the 500 first proposed keeps the benchmark's 1 000-row
//     cases (create, replace, append) in one pass, as on main: one task of 1 000 rows measured
//     32-72 ms of INP locally, and up to 200 ms on a CI runner;
//   · so the first slice, the rows painted in the frame after the click, is not the threshold's
//     1 000 rows but LIST_FIRST_SLICE: a first slice of 1 000 rows was that same task, and put the
//     10 000-row append's INP at 88-112 ms locally, on the CI runner's edge. Not a time budget
//     either: the script of a row is a small part of its cost, layout and paint are the rest, so
//     40 ms of script made about 5 000 rows and an INP of 184-208 ms.

import { processInSlices, yieldToBrowser } from '../utils/slices';
import { placePartNodes } from './part-nodes';

/** Above this many new rows in one reconciliation, the list renders them in slices. */
export const LIST_SLICE_THRESHOLD = 1000;

/** The rows a sliced reconciliation renders in its own task, painted in the frame after it. */
export const LIST_FIRST_SLICE = 250;

/** Rows are created and inserted this many at a time: one DOM insertion per chunk, not per row. */
const CHUNK = 50;

/** The work of one slice of rows, in ms: fewer frames of a growing list than processInSlices' 5. */
const LIST_SLICE_MS = 40;

/**
 * Resolve once the next frame has been painted: a requestAnimationFrame callback runs before that
 * frame's rendering, and a task queued from it runs after. Without requestAnimationFrame (a
 * non-browser host), the browser's turn alone.
 */
function afterNextPaint(): Promise<void> {
    if (typeof requestAnimationFrame !== 'function') return yieldToBrowser();
    return new Promise((resolve) => requestAnimationFrame(() => { void yieldToBrowser().then(resolve); }));
}

/**
 * Create rows `from` … `to - 1` with `create`, in slices, appending each chunk's nodes before
 * `endMarker` and pushing each row onto `rows`. Returns the controller that stops it: a new
 * reconciliation of the list, and the list's teardown, abort it before they touch `rows`.
 *
 * `onDone` runs when every row exists. An error a row's render throws is not swallowed: the
 * promise rejects, as the error would have escaped the single pass.
 */
export function appendInSlices<R extends { nodes: Node[] }>(
    rows: R[],
    from: number,
    to: number,
    create: (index: number) => R,
    endMarker: Comment,
    onDone: () => void,
): AbortController {
    const controller = new AbortController();
    const chunks: number[] = [];
    for (let start = from; start < to; start += CHUNK) chunks.push(start);
    // The first slice was this task's, and the frame after it paints those rows: the rest starts
    // after that frame. A slice queued at once runs ahead of that frame's rendering, and the
    // interaction that wrote the list waits for it (measured: INP 184-208 ms against 88-112).
    void afterNextPaint().then(() => processInSlices(chunks, (start) => {
        const parent = endMarker.parentNode;
        if (!parent) { controller.abort(); return; }
        const added: Node[] = [];
        const end = Math.min(start + CHUNK, to);
        for (let i = start; i < end; i++) {
            const row = create(i);
            rows.push(row);
            for (const n of row.nodes) added.push(n);
        }
        placePartNodes(parent, added, endMarker);
    }, { signal: controller.signal, sliceMs: LIST_SLICE_MS })).then(onDone, (error: unknown) => {
        // Stopped on purpose: a newer reconciliation or the teardown owns the list now.
        if (controller.signal.aborted) return;
        throw error;
    });
    return controller;
}
