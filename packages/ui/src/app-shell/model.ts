// What pdx-app-shell navigates: the app's navigation model, and pure functions over it (#1023).
//
// The app hands the shell groups of entries — the catalogue — and the shell draws what the reader
// may see (`allowedGroups`, through `hasPermission`), lights the entry of the current path
// (`activeEntry`), finds entries by name (`searchGroups`), and keeps the reader's favourites and
// recents as lists of entry keys (`noteRecent`, `keptKeys`). No state here: the component holds it.

/** One place the shell can take the reader. */
export interface AppShellEntry {
    /** Unique among all entries: favourites and recents are stored by it. */
    key: string;
    label: string;
    href: string;
    /** An icon name of the app's icon set, drawn by `pdx-icon`. */
    icon?: string;
    /** A short count or word on the entry, beside its label. */
    badge?: string | number;
    /** The permission the entry needs: without it, the reader does not see it. */
    permission?: string;
    /**
     * Whether only its own path makes it active. `false`: it stays active under its path, as a
     * settings area does over its pages. The default, `true`, still lights a list for its records:
     * see `activeEntry`.
     */
    exact?: boolean;
}

/** A heading of the catalogue and the entries under it. */
export interface AppShellGroup {
    key: string;
    label: string;
    items: AppShellEntry[];
}

/** The groups with only the entries `granted` allows, and without a group that has none left. */
export function allowedGroups(groups: AppShellGroup[], granted: (permission: string) => boolean): AppShellGroup[] {
    return groups
        .map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || granted(i.permission)) }))
        .filter((g) => g.items.length > 0);
}

/** Every entry of the groups, in order. */
export function entries(groups: AppShellGroup[]): AppShellEntry[] {
    return groups.flatMap((g) => g.items);
}

/** Whether `path` is `href` or a path under it, by whole segments: `/ticketsx` is not under `/tickets`. */
function within(path: string, href: string): boolean {
    return path === href || path.startsWith(href.endsWith('/') ? href : href + '/');
}

/**
 * The key of the entry the current path belongs to, or '' when none covers it: the entry whose href
 * is the longest that the path is, or is under. A record under `/tickets/42` lights Tickets: the
 * reader came from its list. `exact: false` says the same thing on purpose, for an area; an entry is
 * `exact` only in that it does not claim the path of a longer entry.
 */
export function activeEntry(path: string, all: AppShellEntry[]): string {
    let best: AppShellEntry | null = null;
    for (const e of all) {
        if (within(path, e.href) && (!best || e.href.length > best.href.length)) best = e;
    }
    return best?.key ?? '';
}

/** Lower case, accents off: «Bòard» finds Board, and «citta» finds «Città». */
export function fold(text: unknown): string {
    return String(text).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** The groups with only the entries whose label has `query`, accents and case aside; all of them for a blank query. */
export function searchGroups(groups: AppShellGroup[], query: string): AppShellGroup[] {
    const q = fold(query.trim());
    if (!q) return groups;
    return groups
        .map((g) => ({ ...g, items: g.items.filter((i) => fold(i.label).includes(q)) }))
        .filter((g) => g.items.length > 0);
}

/** `list` with `key` at the front, once, and at most `kept` keys. */
export function noteRecent(list: string[], key: string, kept: number): string[] {
    return [key, ...list.filter((k) => k !== key)].slice(0, kept);
}

/** The stored keys that are still entries: an entry the app removed leaves no row with nothing to draw. */
export function keptKeys(stored: string[], all: AppShellEntry[]): string[] {
    return stored.filter((k) => all.some((e) => e.key === k));
}
