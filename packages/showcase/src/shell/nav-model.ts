// What the rail and the catalogue navigate: data and pure functions, no state.
//
// It is data because `pdx-nav-menu` draws it: each group a heading that folds, the counter ON the item rather than in a bell (the
// reference has no notification bell), and the two affordances an expanded entry carries. `glyph`
// rather than an icon name: an icon component in the shell is in the ENTRY chunk, and this rail is a
// dozen entries.
//
// `data.test` carries the selector the suites use, so an entry keeps its name wherever the
// navigation draws it. `exact: false` is an entry that stays active under its own path, as
// `<pdx-link>` without `exact` does.
//
// EVERY entity lives in the catalogue, the rail's second level, as in the reference. Kinds of
// record, never a record: a record is reached from its list. The
// rail is personal: Dashboard, the Favourites the reader pinned, and the lists opened lately.
import { $t } from '@pdxui/core';

/** One entry of the navigation, as the shell's data describes it before the menu sees it. */
export interface NavEntry {
    key: string;
    label: () => string;
    href: string;
    exact: boolean;
    glyph: string;
    fixed?: boolean;
    count?: string;
    data: { test: string };
}

/** A group of entries under a heading that folds. */
export interface NavGroup {
    type: 'header';
    key: string;
    label: () => string;
    data: { test: string };
    children: NavEntry[];
}

export const DASHBOARD: NavEntry = { key: 'dashboard', label: () => $t('app.nav.dashboard'), href: '/', exact: true, glyph: '◳', fixed: true, data: { test: 'to-dashboard' } };

export const CATALOG: NavGroup[] = [
    { type: 'header', key: 'h-work', label: () => $t('app.rail.groups.work'), data: { test: 'group-h-work' }, children: [
        { key: 'tickets', label: () => $t('app.nav.tickets'), href: '/tickets', exact: true, glyph: '☷', data: { test: 'to-tickets' }, count: '12' },
        // The guided creation of a ticket: a screen for the kind, beside it, as the reference puts its «new».
        { key: 'intake', label: () => $t('app.nav.intake'), href: '/intake', exact: true, glyph: '✚', data: { test: 'to-intake' } },
        { key: 'board', label: () => $t('app.nav.board'), href: '/board', exact: true, glyph: '▦', data: { test: 'to-board' } },
        { key: 'customers', label: () => $t('app.nav.customers'), href: '/customers', exact: true, glyph: '◔', data: { test: 'to-customers' } },
        { key: 'import', label: () => $t('app.nav.import'), href: '/customers/import', exact: true, glyph: '⤓', data: { test: 'to-import' } },
        { key: 'employees', label: () => $t('app.nav.employees'), href: '/employees', exact: true, glyph: '◍', data: { test: 'to-employees' } },
        { key: 'sites', label: () => $t('app.nav.sites'), href: '/sites', exact: true, glyph: '⌂', data: { test: 'to-sites' } },
        { key: 'assets', label: () => $t('app.nav.assets'), href: '/assets', exact: true, glyph: '▣', data: { test: 'to-assets' } },
        { key: 'contracts', label: () => $t('app.nav.contracts'), href: '/contracts', exact: true, glyph: '§', data: { test: 'to-contracts' } },
        { key: 'services', label: () => $t('app.nav.services'), href: '/services', exact: true, glyph: '◈', data: { test: 'to-services' } },
    ] },
    { type: 'header', key: 'h-you', label: () => $t('app.rail.groups.you'), data: { test: 'group-h-you' }, children: [
        { key: 'account', label: () => $t('app.nav.account'), href: '/account', exact: true, glyph: '◑', data: { test: 'to-account' } },
        { key: 'settings', label: () => $t('app.nav.settings'), href: '/settings', exact: false, glyph: '⚙', data: { test: 'to-settings' } },
    ] },
];

/** Every entry anything can navigate to. */
export const ALL_LINKS: NavEntry[] = [DASHBOARD, ...CATALOG.flatMap(h => h.children)];

/** The entry with that key, or undefined. */
export const byKey = (k: string): NavEntry | undefined => ALL_LINKS.find(i => i.key === k);

/**
 * The LISTS a path belongs to, for the recents: a record counts as its list, so `/tickets/7` is
 * Tickets (the owner's choice).
 */
export const RECENT_LISTS: { key: string; match: RegExp }[] = [
    { key: 'tickets', match: /^\/tickets(\/|$)/ },
    { key: 'board', match: /^\/board$/ },
    { key: 'customers', match: /^\/customers(\/(?!import)|$)/ },
    { key: 'employees', match: /^\/employees(\/|$)/ },
    { key: 'sites', match: /^\/sites(\/|$)/ },
    { key: 'assets', match: /^\/assets(\/|$)/ },
    { key: 'contracts', match: /^\/contracts$/ },
    { key: 'services', match: /^\/services(\/|$)/ },
];

/** The list key a path counts as, or undefined. */
export function listOf(path: string | null | undefined): string | undefined {
    return RECENT_LISTS.find(l => l.match.test(path ?? ''))?.key;
}

/** Lower case, accents off: «Bòard» finds Board, and «citta» finds «Città». */
export function fold(text: unknown): string {
    return String(text).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** The entry the current path belongs to: the longest href that matches it. */
export function activeFor(path: string): string {
    let best: NavEntry | null = null;
    for (const i of ALL_LINKS) {
        const hit = i.exact ? path === i.href : path === i.href || path.startsWith(i.href + '/');
        if (hit && (!best || i.href.length > best.href.length)) best = i;
    }
    return best?.key ?? '';
}
