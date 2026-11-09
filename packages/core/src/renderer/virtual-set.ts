// What a virtual list says about its rows (#284), shared by the list a page mounts (virtual-list.ts) and
// the one the server writes (server/virtual.ts, #930): the source it reads, the size of the set, and the
// attributes each rendered row carries by the role of the element around it.

/** What a `@for … @virtual` accepts besides an array: a source that pages (`DataSource`). */
export interface PagedSource<T> {
    data: () => T[];
    hasMore: () => boolean;
    loadMore: () => Promise<unknown>;
    isLoading?: () => boolean;
    /** The source's total, when the transport reports one. */
    total?: () => number;
}

/** Whether `value` is a source that pages. */
export function isPaged<T>(value: unknown): value is PagedSource<T> {
    return !!value && typeof value === 'object'
        && typeof (value as PagedSource<T>).data === 'function'
        && typeof (value as PagedSource<T>).loadMore === 'function'
        && typeof (value as PagedSource<T>).hasMore === 'function';
}

/** The rows of what `items` gives: an array as it is, a paged source's data, or none. */
export function listOf<T>(value: T[] | PagedSource<T> | null | undefined): T[] {
    if (isPaged<T>(value)) return value.data() ?? [];
    return Array.isArray(value) ? value : [];
}

/** The size of the set: the array's length; a source's total, or -1 (unknown) while it has more. */
export function setSize<T>(data: T[], paged: PagedSource<T> | null): number {
    if (!paged) return data.length;
    const total = paged.total?.() ?? 0;
    if (total > 0) return total;
    return paged.hasMore() ? -1 : data.length;
}

/** Until a row has been measured, and with no `@virtual(n)`: a guess that renders a few rows. */
export const DEFAULT_ESTIMATE = 40;

/** Roles whose items carry `aria-setsize` and `aria-posinset`. */
export const SET_ROLES = new Set(['list', 'listbox', 'tree']);
/** Roles whose rows carry `aria-rowindex`, the role's element `aria-rowcount`. */
export const ROW_ROLES = new Set(['grid', 'treegrid', 'table']);
/** The composite roles: the list owns a roving tabindex and the arrow keys. */
export const KEY_ROLES = new Set(['listbox', 'tree', 'grid', 'treegrid']);

/**
 * The role of the element a list is placed in, from its tag and `role`: the explicit role, else the
 * implicit role of a `ul`/`ol` (list) or a table (table — for a `tbody`, `thead` or `tfoot` the table's,
 * which `tableRole` gives: its `role`, or null when it has none or there is no table).
 */
export function implicitRole(tag: string, role: string | null, tableRole: () => string | null | undefined): string | null {
    if (role) return role;
    if (tag === 'ul' || tag === 'ol') return 'list';
    if (tag === 'table') return 'table';
    if (tag === 'tbody' || tag === 'thead' || tag === 'tfoot') {
        const table = tableRole();
        return table === undefined ? null : (table ?? 'table');
    }
    return null;
}

/**
 * The attributes a rendered row carries, by the container's role: its place in the set, or its row index
 * after `rowsBefore` header rows, and under a composite role the roving tab stop.
 */
export function rowAttributes(role: string | null, index: number, size: number, rowsBefore: number, tabStop: number): Record<string, string> {
    const out: Record<string, string> = {};
    if (role && SET_ROLES.has(role)) {
        out['aria-setsize'] = String(size);
        out['aria-posinset'] = String(index + 1);
    } else if (role && ROW_ROLES.has(role)) {
        out['aria-rowindex'] = String(index + 1 + rowsBefore);
    }
    if (role && KEY_ROLES.has(role)) out.tabindex = index === tabStop ? '0' : '-1';
    return out;
}

/** The style of a spacer standing for `height` px of rows: nothing of its own but the height. */
export function spacerStyle(height: number): string {
    return `padding: 0px; border: 0px; margin: 0px; height: ${height}px;`;
}
