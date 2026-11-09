// A virtual list rendered to a string (#930): the first window of rows, and spacers for the rest.
//
// On the client the window depends on layout: the list measures its scroll container and renders the
// rows it sees. The server has no layout, so it writes the window the list starts at — the first
// `serverRows` rows — between the spacers the client places, the one after sized for the rows it did not
// write by the estimate. The page has the top of the list in it, and the list's height before the client
// has measured anything. With nothing to show, it writes `@empty`, after the spacers, as the client does.

import { DEV } from '../utils/env';
import { listOf, isPaged, setSize, implicitRole, rowAttributes, spacerStyle, DEFAULT_ESTIMATE } from '../renderer/virtual-set';
import type { VirtualCall } from '../renderer/virtual-list';
import { serverBlock, serverElement, writtenElements, type ServerBlock } from './mode';

/**
 * The rows the server writes when `@virtual` does not say (#930). Measured on a list of 32 px rows as tall
 * as the screen (`showcase/tests/scenario-ssg-virtual.spec.ts`, slow 4G, CPU 4×): a page whose rows fill
 * its first screen has it full at the first paint, ~0.24 s, and one with fewer at ~1.2 s, once the client
 * has rendered them; the first and largest paints, the take-over and the layout shift (0) do not change
 * with the count, and a row costs ~125 bytes of HTML. A 390 × 844 screen shows 25 such rows and a
 * 1280 × 800 one 23: 40, the smallest count measured that fills both, also fills a screen up to ~1350 px
 * tall. 80 adds 5 KB for nothing at those sizes.
 */
export const DEFAULT_SERVER_ROWS = 40;

/** The role of the element the list is written in, as the client reads it from the DOM (`roleOf`). */
function containerRole(): string | null {
    const around = writtenElements();
    const container = around[around.length - 1];
    if (!container) return null;
    return implicitRole(container.tag, container.role, () => {
        for (let i = around.length - 2; i >= 0; i--) if (around[i].tag === 'table') return around[i].role;
        return undefined;
    });
}

/** The virtual list's block: its markers, the spacers, the first rows — or `@empty` — as markup. */
export function serverVirtual<T>(call: VirtualCall<T>): ServerBlock {
    return serverBlock('virtual', '/virtual', () => {
        const { options } = call;
        const value = call.items();
        const data = listOf<T>(value);
        const paged = isPaged<T>(value) ? value : null;
        const tag = options.tag ?? 'div';
        const estimate = options.estimate ?? DEFAULT_ESTIMATE;
        const count = Math.min(data.length, Math.max(0, options.serverRows ?? DEFAULT_SERVER_ROWS));
        const role = containerRole();
        const size = setSize(data, paged);
        const spacer = (height: number) => serverElement(tag, { 'aria-hidden': 'true', style: spacerStyle(height) });

        const rows = data.slice(0, count).map((item, index) => {
            // The roving tab stop is on the first row, as the client puts it before anything is focused.
            const attributes = rowAttributes(role, index, size, 0, 0);
            // A row index in a table counts the header rows outside the list, which are not known while
            // it is written: the client sets `aria-rowindex` when it takes the list over.
            delete attributes['aria-rowindex'];
            attributes['data-virtual-index'] = String(index);
            const render = () => [options.getters
                ? (call.render as (item: () => T, index: () => number) => Node)(() => item, () => index)
                : (call.render as (item: T, index: number) => Node)(item, index)];
            return serverBlock(null, null, render, { item: DEV, hidden: false, attributes });
        });
        const loading = paged?.isLoading?.() ?? false;
        const empty = data.length === 0 && !loading && options.empty ? [options.empty()] : [];
        return [spacer(0), ...rows, spacer((data.length - count) * estimate), ...empty];
    });
}
