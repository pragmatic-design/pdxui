// `@for (rows as r; track r.id) @virtual(48) { … }` — a keyed list that renders only the rows in view
// (#283). What the compiler emits; written by hand it is the same call.
//
// The shape is the owner's (decisions.md 45): the scroll container is the element the template
// writes around the `@for`, and the rows stay in normal flow, children of their native parent —
// `<li>` of a `<ul>`, `<tr>` of a `<tbody>`. Two spacers, of the rows' own tag, stand for the rows
// above and below the window, sized from `createVirtualizer`'s offsets.
//
// The rows are keyed by `track`, and this keeps its own map from key to row over the WINDOW: a
// scroll adds and removes rows at the window's edges. `each` is not reused because its reconciler
// owns every item of the list.

import { signal, effect, collectDisposers, onDispose, untracked } from '../reactivity/signal';
import type { Signal } from '../utils/types';
import { createVirtualizer } from './virtualizer';
import { DEV } from '../utils/env';

/** What a `@for … @virtual` accepts besides an array: a source that pages (`DataSource`). */
interface PagedSource<T> {
    data: () => T[];
    hasMore: () => boolean;
    loadMore: () => Promise<unknown>;
    isLoading?: () => boolean;
}

function isPaged<T>(value: unknown): value is PagedSource<T> {
    return !!value && typeof value === 'object'
        && typeof (value as PagedSource<T>).data === 'function'
        && typeof (value as PagedSource<T>).loadMore === 'function'
        && typeof (value as PagedSource<T>).hasMore === 'function';
}

export interface VirtualListOptions {
    /** The estimated row size in px (`@virtual(48)`). Without it, the first rendered row is measured. */
    estimate?: number;
    /** The rows' tag, which the spacers take: `li` in a `ul`, `tr` in a `tbody`, `div` otherwise. */
    tag?: string;
    /** Rows rendered beyond the viewport on each side. Default 3. */
    overscan?: number;
    /** `@empty`: rendered when there is nothing to show, and the source is not loading. */
    empty?: () => Node;
    /** The renderer receives getters, `item()` and `index()`, as `eachRow`'s does. */
    getters?: boolean;
}

interface Row<T> {
    key: unknown;
    node: HTMLElement;
    dispose: () => void;
    item?: Signal<T>;
    index?: Signal<number>;
}

/** Until a row has been measured, and with no `@virtual(n)`: a guess that renders a few rows. */
const DEFAULT_ESTIMATE = 40;

/**
 * Render a keyed list virtually inside the element it is placed in. Returns the nodes to place: two
 * markers, and between them the spacers and the rows of the window.
 */
export function eachVirtual<T>(
    items: () => T[] | PagedSource<T> | null | undefined,
    key: string | ((item: T, index: number) => unknown),
    render: ((item: T, index: number) => Node) | ((item: () => T, index: () => number) => Node),
    options: VirtualListOptions = {},
): DocumentFragment {
    const keyFn = typeof key === 'string' ? (item: T) => (item as Record<string, unknown>)[key] : key;
    const tag = options.tag ?? 'div';
    const frag = document.createDocumentFragment();
    const start = document.createComment('virtual');
    const end = document.createComment('/virtual');
    const before = document.createElement(tag);
    const after = document.createElement(tag);
    for (const spacer of [before, after]) {
        spacer.setAttribute('aria-hidden', 'true');
        spacer.style.padding = '0';
        spacer.style.border = '0';
        spacer.style.margin = '0';
    }
    frag.append(start, before, after, end);

    // The container is the element the markers end up in: known once the fragment has been placed.
    const container = signal<HTMLElement | null>(null);
    let attempts = 0;
    const resolve = (): void => {
        const parent = start.parentElement;
        if (parent) { container.set(parent); return; }
        if (++attempts <= 10) requestAnimationFrame(resolve);
    };
    queueMicrotask(resolve);

    // The source: an array, or a paged source whose data is read.
    const source = (): PagedSource<T> | null => {
        const value = items();
        return isPaged<T>(value) ? value : null;
    };
    const list = (): T[] => {
        const value = items();
        if (isPaged<T>(value)) return value.data() ?? [];
        return Array.isArray(value) ? value : [];
    };

    let estimate = options.estimate;
    const virt = createVirtualizer({
        count: () => list().length,
        estimateSize: () => estimate ?? DEFAULT_ESTIMATE,
        getScrollElement: () => container(),
        overscan: options.overscan ?? 3,
    });

    const rows = new Map<unknown, Row<T>>();
    let emptyNode: Node | null = null;
    let loadRequestedAt = -1;
    let warnedUnbounded = false;

    function createRow(item: T, index: number, k: unknown): Row<T> {
        let row: Row<T>;
        if (options.getters) {
            const itemSig = signal(item);
            const indexSig = signal(index);
            const r = render as (item: () => T, index: () => number) => Node;
            const [node, dispose] = collectDisposers(() => untracked(() => r(itemSig, indexSig)));
            row = { key: k, node: rootOf(node), dispose, item: itemSig, index: indexSig };
        } else {
            const r = render as (item: T, index: number) => Node;
            const [node, dispose] = collectDisposers(() => untracked(() => r(item, index)));
            row = { key: k, node: rootOf(node), dispose };
        }
        // Data repetition, marked for `__PDX_DEVTOOLS__.outline()` as `each` marks its rows (#271).
        if (DEV) row.node.setAttribute('data-pdx-item', '');
        return row;
    }

    effect(() => {
        const data = list();
        const window = virt.items();
        const total = virt.totalSize();
        const paged = source();
        const loading = paged?.isLoading?.() ?? false;

        // @empty: nothing to show, and nothing on its way.
        const showEmpty = data.length === 0 && !loading && !!options.empty;
        untracked(() => {
            if (showEmpty && !emptyNode) {
                const [node] = collectDisposers(() => options.empty!());
                emptyNode = node;
                after.after(node);
            } else if (!showEmpty && emptyNode) {
                (emptyNode as ChildNode).remove?.();
                emptyNode = null;
            }

            // The window: the rows it holds, by key; the rest are disposed.
            const wanted = new Map<unknown, number>();
            for (const w of window) if (w.index < data.length) wanted.set(keyFn(data[w.index], w.index), w.index);
            for (const [k, row] of rows) {
                if (wanted.has(k)) continue;
                row.dispose();
                row.node.remove();
                rows.delete(k);
            }
            let cursor: Node = before;
            for (const [k, index] of wanted) {
                let row = rows.get(k);
                if (!row) {
                    row = createRow(data[index], index, k);
                    rows.set(k, row);
                } else if (row.item) {
                    row.item.setRaw(data[index]);
                    row.index!.set(index);
                }
                row.node.dataset.virtualIndex = String(index);
                if (cursor.nextSibling !== row.node) cursor.parentNode?.insertBefore(row.node, cursor.nextSibling);
                cursor = row.node;
            }
            for (const row of rows.values()) {
                virt.measureElement(row.node);
                if (estimate === undefined && row.node.offsetHeight > 0) estimate = row.node.offsetHeight;
            }

            const first = window[0];
            const last = window[window.length - 1];
            before.style.height = `${first ? first.start : 0}px`;
            after.style.height = `${last ? Math.max(0, total - (last.start + last.size)) : 0}px`;

            // Paging: the last row of the data is in the window, there is more, and no load runs.
            if (paged && last && last.index >= data.length - 1 && data.length > 0
                && paged.hasMore() && !loading && loadRequestedAt !== data.length) {
                loadRequestedAt = data.length;
                void paged.loadMore();
            }

            const el = container.peek();
            if (DEV && el && !warnedUnbounded && data.length > 50 && el.clientHeight > 0 && el.clientHeight >= total - 1) {
                warnedUnbounded = true;
                console.warn(`[pdx] @for … @virtual: <${el.localName}${el.className ? ` class="${el.className}"` : ''}> grows with its rows, so every row is rendered. Give the container a bounded height (height, max-height, or a flex/grid track) and overflow: auto.`);
            }
        });
    });

    onDispose(() => {
        for (const row of rows.values()) row.dispose();
        rows.clear();
        virt.dispose();
    });

    return frag;
}

/** A row is one element: the compiler checks it (`PDX_VIRTUAL_SHAPE`); by hand, the first element. */
function rootOf(node: Node): HTMLElement {
    if (node instanceof DocumentFragment) {
        const el = node.firstElementChild;
        if (el) return el as HTMLElement;
    }
    if (node.nodeType === 1) return node as HTMLElement;
    const wrap = document.createElement('div');
    wrap.appendChild(node);
    return wrap;
}
