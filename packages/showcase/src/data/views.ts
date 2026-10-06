// A named arrangement of a list.
//
// ── Where a view lives, and why it is not in the grid ──
//
// The grid already publishes everything a view is made of: `saveState()` returns the filter, the
// sort, the column order and the page size, and `loadState()` takes them back. What a view adds is
// not machinery — it is a NAME and somewhere to keep it.
//
// That somewhere is the APPLICATION. A component that grows its own storage is a component with
// opinions about a server it cannot see: whose view is it, does it follow the person or the
// browser, does an administrator publish one for a team. None of those are questions a grid can
// answer. The showcase keeps them in `localStorage`; an application with a backend replaces this
// one module and changes nothing else.

/** What a view holds. Deliberately not the whole `GridState`. */
export interface ViewState {
    filter: unknown[];
    sort: unknown[];
    columnOrder: string[];
    pageSize: number;
    /** The grouping, since a reader can choose one. A view saved without it has none. */
    group: unknown[];
}

export interface SavedView {
    /** Stable, and what the URL carries so a view can be linked. */
    key: string;
    name: string;
    state: ViewState;
}

/**
 * The five fields a view is, written ONCE.
 *
 * `saveState()` returns seven — widths and visibility as well — and a view that captured all of them
 * would be a view that captures whatever the grid grows next. Spreading the object is how a
 * selection or a scroll position ends up in a saved view without anybody deciding it. The grouping
 * is one of them because a reader can choose one, and it belongs to the layout.
 */
const VIEW_FIELDS = ['filter', 'sort', 'columnOrder', 'pageSize', 'group'] as const;

/** Exactly the fields `VIEW_FIELDS` names, from whatever the grid handed over. */
export function pickView(state: Record<string, unknown>): ViewState {
    return {
        filter: (state.filter as unknown[]) ?? [],
        sort: (state.sort as unknown[]) ?? [],
        columnOrder: (state.columnOrder as string[]) ?? [],
        pageSize: (state.pageSize as number) ?? 0,
        group: (state.group as unknown[]) ?? [],
    };
}

/**
 * Two arrangements are the same one.
 *
 * Every field is compared. Most of them are DataSource signals a page can watch; `columnOrder`
 * arrives as `pdx-column-reorder`, because the only other way to read it is a subscription to the
 * grid's `columns()` that a page cannot hold across the grid's rebuild.
 */
export function sameView(a: ViewState | null, b: ViewState | null): boolean {
    if (!a || !b) return a === b;
    return VIEW_FIELDS.every((f) => JSON.stringify(a[f]) === JSON.stringify(b[f]));
}

/** The key of the arrangement a list opens with. It is not stored and cannot be deleted. */
export const DEFAULT_VIEW = 'default';

/**
 * The filter a view put on a list, by the list's source.
 *
 * A view is named in the address by its key, `?view=`. Its filter reaches the source like any other,
 * and without a mark the address filter cannot tell it from one the reader set, so it would write it
 * as `?status=` too — or not, depending on where the page's setup creates the address filter, since
 * that decides whether the address is «live» yet. The list header marks what it applies; the address
 * filter asks.
 */
const viewFilters = new WeakMap<object, string>();

/** The list header is about to put a view's filter on `source`. */
export function markViewFilter(source: object, filter: unknown[] | undefined): void {
    viewFilters.set(source, JSON.stringify(filter ?? []));
}

/** Whether `filter` is the one the view on `source` put there — the view's to name, not the reader's. */
export function isViewFilter(source: object, filter: unknown[] | undefined): boolean {
    return viewFilters.get(source) === JSON.stringify(filter ?? []);
}

/**
 * A view the LIST ships with: «Ending this month» on the contracts. Like the default it
 * is not stored — it is declared by the page — so it can be used and saved-as, never overwritten,
 * renamed or deleted. It names a filter; the rest of the arrangement is the list's default.
 */
export interface BuiltInView {
    key: string;
    name: string;
    filter: unknown[];
}

/**
 * What the list header reaches on the grid element: the grid's own snapshot once it is built, and the
 * call that puts an arrangement back in one batch. The element is `<pdx-data-grid>`, typed here by what
 * this module reads of it.
 */
export interface ListGrid extends HTMLElement {
    grid?: { saveState(): Record<string, unknown> };
    applyState(state: Partial<ViewState>): void;
}

export interface ViewStore {
    /** The saved ones, in the order they were made. The default is NOT among them. */
    list(): SavedView[];
    get(key: string): SavedView | null;
    /** A new view under a name, with a key derived from it. Returns what was stored. */
    saveAs(name: string, state: ViewState): SavedView;
    /** Overwrite the arrangement of one that exists. */
    update(key: string, state: ViewState): void;
    rename(key: string, name: string): void;
    remove(key: string): void;
    /**
     * The view the reader was last working in, or null.
     *
     * The URL carries a view so it can be LINKED; this is what makes it theirs. Without it «the
     * list I arranged» comes back only to someone who kept the address, which is nobody — they
     * click the entry in the rail like everyone else.
     */
    lastUsed(): string | null;
    setLastUsed(key: string): void;
}

/** Keys a reader can read in an address bar, and that two views cannot share. */
function keyFor(name: string, taken: Set<string>): string {
    const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'view';
    if (base === DEFAULT_VIEW) return `${base}-1`;
    let key = base;
    for (let n = 2; taken.has(key); n++) key = `${base}-${n}`;
    return key;
}

export function createViewStore(storageKey: string): ViewStore {
    const key = `pdx.views.${storageKey}`;

    function read(): SavedView[] {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            // Something else's key, or a half-written value: a list of views is a list.
            return Array.isArray(parsed) ? parsed.filter((v) => v && typeof v.key === 'string') : [];
        } catch {
            // Corrupt or unreadable: drop it rather than hand the page rows it will read fields off.
            try { localStorage.removeItem(key); } catch { /* storage is refusing; there is nothing left to try */ }
            return [];
        }
    }

    function write(views: SavedView[]): void {
        try { localStorage.setItem(key, JSON.stringify(views)); } catch { /* private mode: the views live for this session only */ }
    }

    const lastKey = `${key}.last`;

    return {
        list: read,
        get(k: string): SavedView | null {
            return read().find((v) => v.key === k) ?? null;
        },
        saveAs(name: string, state: ViewState): SavedView {
            const views = read();
            const view: SavedView = { key: keyFor(name, new Set(views.map((v) => v.key))), name: name.trim(), state };
            write([...views, view]);
            return view;
        },
        update(k: string, state: ViewState): void {
            write(read().map((v) => (v.key === k ? { ...v, state } : v)));
        },
        rename(k: string, name: string): void {
            write(read().map((v) => (v.key === k ? { ...v, name: name.trim() } : v)));
        },
        remove(k: string): void {
            write(read().filter((v) => v.key !== k));
        },
        lastUsed(): string | null {
            try { return localStorage.getItem(lastKey); } catch { return null; }
        },
        setLastUsed(k: string): void {
            try { localStorage.setItem(lastKey, k); } catch { /* private mode: it lasts this session */ }
        },
    };
}
