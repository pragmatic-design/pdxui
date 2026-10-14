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
//
// What is not rendered is not in the accessibility tree, so the list says it itself (#284), by the
// role the template gives the container: the total and each row's place, keys for the composite
// roles, and a focused row that scrolls out of the window kept where it is.

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
    /** The source's total, when the transport reports one. */
    total?: () => number;
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

/** Roles whose items carry `aria-setsize` and `aria-posinset`. */
const SET_ROLES = new Set(['list', 'listbox', 'tree']);
/** Roles whose rows carry `aria-rowindex`, the role's element `aria-rowcount`. */
const ROW_ROLES = new Set(['grid', 'treegrid', 'table']);
/** The composite roles: the list owns a roving tabindex and the arrow keys. */
const KEY_ROLES = new Set(['listbox', 'tree', 'grid', 'treegrid']);
/** What Tab can reach in a row. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/**
 * The role that decides what the list says, and the element that carries it: the container's
 * `role`, else the implicit role of a `ul`/`ol` (list) or a table (table, from a `tbody` too).
 */
function roleOf(container: HTMLElement): { role: string | null; roleEl: HTMLElement | null } {
    const explicit = container.getAttribute('role');
    if (explicit) return { role: explicit, roleEl: container };
    const tag = container.localName;
    if (tag === 'ul' || tag === 'ol') return { role: 'list', roleEl: container };
    if (tag === 'table') return { role: 'table', roleEl: container };
    if (tag === 'tbody' || tag === 'thead' || tag === 'tfoot') {
        const table = container.closest('table');
        if (table) return { role: table.getAttribute('role') ?? 'table', roleEl: table };
    }
    return { role: null, roleEl: null };
}

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
    const spacer = (): HTMLElement => {
        const el = document.createElement(tag);
        el.setAttribute('aria-hidden', 'true');
        el.style.padding = '0';
        el.style.border = '0';
        el.style.margin = '0';
        return el;
    };
    const before = spacer();
    const after = spacer();
    // The third spacer: between a focused row kept outside the window and the window (#284).
    const middle = spacer();
    frag.append(start, before, after, end);

    // The container is the element the markers end up in: known once the fragment has been placed.
    const container = signal<HTMLElement | null>(null);
    let role: string | null = null;
    let roleEl: HTMLElement | null = null;
    let attempts = 0;
    const resolve = (): void => {
        const parent = start.parentElement;
        if (parent) {
            ({ role, roleEl } = roleOf(parent));
            listen(parent);
            container.set(parent);
            return;
        }
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
    /** The size of the set: the array's length; a source's total, or -1 (unknown) while it has more. */
    const setSize = (data: T[], paged: PagedSource<T> | null): number => {
        if (!paged) return data.length;
        const total = paged.total?.() ?? 0;
        if (total > 0) return total;
        return paged.hasMore() ? -1 : data.length;
    };

    let estimate = options.estimate;
    const virt = createVirtualizer({
        count: () => list().length,
        estimateSize: () => estimate ?? DEFAULT_ESTIMATE,
        getScrollElement: () => container(),
        overscan: options.overscan ?? 3,
    });

    const rows = new Map<unknown, Row<T>>();
    /** The row that holds focus while it is outside the window, kept where it was. */
    let pinned: Row<T> | null = null;
    let emptyNode: Node | null = null;
    let loadRequestedAt = -1;
    let warnedUnbounded = false;
    /** The item the roving tabindex rests on, under a composite role. */
    const active = signal(0);
    /** Bumped when focus moves in or out of the list: the window keeps or lets go of a focused row. */
    const focusTick = signal(0);

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

    const holdsFocus = (row: Row<T>): boolean => {
        const focused = row.node.ownerDocument.activeElement;
        return !!focused && row.node.contains(focused);
    };
    const drop = (row: Row<T>): void => { row.dispose(); row.node.remove(); };
    const indexOfRow = (node: HTMLElement): number => Number(node.dataset.virtualIndex);

    /** What a rendered row says about itself, by the container's role (#284). */
    function describe(node: HTMLElement, index: number, size: number, rowsBefore: number, tabStop: number): void {
        if (role && SET_ROLES.has(role)) {
            node.setAttribute('aria-setsize', String(size));
            node.setAttribute('aria-posinset', String(index + 1));
        } else if (role && ROW_ROLES.has(role)) {
            node.setAttribute('aria-rowindex', String(index + 1 + rowsBefore));
        }
        if (role && KEY_ROLES.has(role)) node.tabIndex = index === tabStop ? 0 : -1;
    }

    /**
     * Whether the container takes a tab stop of its own. A region that scrolls must be reachable from
     * the keyboard (axe's scrollable-region-focusable, WCAG 2.1.1): when the role gives no keys and no
     * rendered row holds anything focusable, the container is the stop. One the author wrote stays.
     */
    let ownTabStop = false;
    function containerTabStop(el: HTMLElement, all: Row<T>[]): void {
        if (role && KEY_ROLES.has(role)) return;
        if (el.hasAttribute('tabindex') && !ownTabStop) return;
        // Only a region that scrolls needs it: an empty list, or one shorter than its box, does not.
        const scrolls = all.length > 0 && el.scrollHeight > el.clientHeight;
        const reachable = all.some((row) => row.node.matches(FOCUSABLE) || row.node.querySelector(FOCUSABLE));
        const needed = scrolls && !reachable;
        if (needed && !ownTabStop) { el.tabIndex = 0; ownTabStop = true; }
        else if (!needed && ownTabStop) { el.removeAttribute('tabindex'); ownTabStop = false; }
    }

    effect(() => {
        const data = list();
        const window = virt.items();
        const total = virt.totalSize();
        const paged = source();
        const loading = paged?.isLoading?.() ?? false;
        active();
        focusTick();
        // The role is read when the container is known: the rows are described again then.
        container();

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

            // The window: the rows it holds, by key. A row leaving it is disposed — unless it holds
            // focus, and then it stays where it is until focus leaves it.
            const wanted = new Map<unknown, number>();
            for (const w of window) if (w.index < data.length) wanted.set(keyFn(data[w.index], w.index), w.index);
            if (pinned && (wanted.has(pinned.key) || !holdsFocus(pinned))) {
                if (wanted.has(pinned.key)) rows.set(pinned.key, pinned);
                else drop(pinned);
                pinned = null;
            }
            for (const [k, row] of rows) {
                if (wanted.has(k)) continue;
                rows.delete(k);
                if (!pinned && holdsFocus(row)) pinned = row;
                else drop(row);
            }

            const first = window[0];
            const last = window[window.length - 1];
            const pinnedIndex = pinned ? indexOfRow(pinned.node) : -1;
            const pinnedAbove = pinned !== null && first !== undefined && pinnedIndex < first.index;
            const pinnedBelow = pinned !== null && last !== undefined && pinnedIndex > last.index;

            // A focused row is never moved: a moved element loses focus. The rest is placed around it.
            let cursor: Node = before;
            if (pinnedAbove) {
                if (pinned!.node.nextSibling !== middle) pinned!.node.after(middle);
                cursor = middle;
            } else if (pinnedBelow) {
                if (pinned!.node.previousSibling !== middle) pinned!.node.before(middle);
            } else if (middle.isConnected) {
                middle.remove();
            }
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
            const all = pinned ? [...rows.values(), pinned] : [...rows.values()];
            for (const row of all) {
                virt.measureElement(row.node);
                if (estimate === undefined && row.node.offsetHeight > 0) estimate = row.node.offsetHeight;
            }

            const windowStart = first ? first.start : 0;
            const windowEnd = last ? last.start + last.size : 0;
            const pin = pinned ? virt.itemRect(pinnedIndex) : null;
            if (pinnedAbove && pin) {
                before.style.height = `${pin.start}px`;
                middle.style.height = `${Math.max(0, windowStart - (pin.start + pin.size))}px`;
                after.style.height = `${Math.max(0, total - windowEnd)}px`;
            } else if (pinnedBelow && pin) {
                before.style.height = `${windowStart}px`;
                middle.style.height = `${Math.max(0, pin.start - windowEnd)}px`;
                after.style.height = `${Math.max(0, total - (pin.start + pin.size))}px`;
            } else {
                before.style.height = `${windowStart}px`;
                after.style.height = `${last ? Math.max(0, total - windowEnd) : 0}px`;
            }

            // The set, for assistive technology: the total and each row's place.
            const size = setSize(data, paged);
            const rowsBefore = role && ROW_ROLES.has(role) && roleEl ? headerRows(roleEl, container.peek()) : 0;
            if (role && ROW_ROLES.has(role) && roleEl) roleEl.setAttribute('aria-rowcount', String(size < 0 ? -1 : size + rowsBefore));
            // The roving tab stop is the active item; when that one is not rendered, the first
            // rendered item, so Tab always enters the list.
            const indices = all.map((row) => indexOfRow(row.node));
            const tabStop = indices.includes(active.peek()) ? active.peek() : Math.min(...indices);
            for (const row of all) describe(row.node, indexOfRow(row.node), size, rowsBefore, tabStop);
            const host = container.peek();
            if (host) containerTabStop(host, all);

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

    /** The row element rendered for item `index`, if it is. */
    function renderedAt(index: number): HTMLElement | null {
        for (const row of rows.values()) if (indexOfRow(row.node) === index) return row.node;
        if (pinned && indexOfRow(pinned.node) === index) return pinned.node;
        return null;
    }

    /** Move the roving tabindex to `index` and focus it: scrolled to and rendered first if it is not. */
    function focusIndex(index: number, align: 'start' | 'end'): void {
        active.set(index);
        const now = renderedAt(index);
        if (now) { now.focus(); return; }
        virt.scrollTo(index, { align });
        let frames = 0;
        const attempt = (): void => {
            const el = renderedAt(index);
            if (el) { el.focus(); return; }
            if (++frames < 60) requestAnimationFrame(attempt);
        };
        requestAnimationFrame(attempt);
    }

    /** Focus and keys on the container, once it is known. */
    function listen(el: HTMLElement): void {
        const bump = (): void => { queueMicrotask(() => focusTick.set((n) => n + 1)); };
        el.addEventListener('focusin', (e) => {
            const row = (e.target as Element).closest?.('[data-virtual-index]') as HTMLElement | null;
            if (row && el.contains(row) && role && KEY_ROLES.has(role)) active.set(indexOfRow(row));
            bump();
        });
        el.addEventListener('focusout', bump);
        if (!role || !KEY_ROLES.has(role)) return;
        el.addEventListener('keydown', (e) => {
            const row = (e.target as Element).closest?.('[data-virtual-index]') as HTMLElement | null;
            if (!row || !el.contains(row)) return;
            const n = list().length;
            if (n === 0) return;
            const current = indexOfRow(row);
            const page = Math.max(1, Math.floor(el.clientHeight / Math.max(1, virt.itemRect(current).size)));
            let next: number;
            switch (e.key) {
                case 'ArrowDown': next = current + 1; break;
                case 'ArrowUp': next = current - 1; break;
                case 'Home': next = 0; break;
                case 'End': next = n - 1; break;
                case 'PageDown': next = current + page; break;
                case 'PageUp': next = current - page; break;
                default: return;
            }
            e.preventDefault();
            next = Math.min(n - 1, Math.max(0, next));
            focusIndex(next, next > current ? 'end' : 'start');
        });
    }

    onDispose(() => {
        for (const row of rows.values()) row.dispose();
        rows.clear();
        pinned?.dispose();
        pinned = null;
        virt.dispose();
    });

    return frag;
}

/** The rows of the table or grid that are not the list's: a header row is counted in each index. */
function headerRows(roleEl: HTMLElement, container: HTMLElement | null): number {
    let n = 0;
    for (const r of Array.from(roleEl.querySelectorAll('tr, [role=row]'))) {
        if (container && container.contains(r)) continue;
        n++;
    }
    return n;
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
