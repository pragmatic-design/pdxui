// The model of pdx-app-shell (#1023): data and pure functions, no state. The app hands the shell a
// navigation model — groups of entries, each with an href, an icon, a badge and the permission it
// needs — and the shell draws what the reader may see, lights the entry of the current path, finds
// entries by name, and keeps the reader's favourites and recents.
import { describe, it, expect } from 'vitest';
import { allowedGroups, entries, activeEntry, searchGroups, fold, noteRecent, keptKeys } from '../../src/app-shell/model';
import type { AppShellGroup } from '../../src/app-shell/model';

const groups: AppShellGroup[] = [
    { key: 'work', label: 'Work', items: [
        { key: 'tickets', label: 'Tickets', href: '/tickets' },
        { key: 'board', label: 'Board', href: '/board' },
        { key: 'billing', label: 'Billing', href: '/billing', permission: 'billing.read' },
    ] },
    { key: 'admin', label: 'Admin', items: [
        { key: 'users', label: 'Users', href: '/settings/users', permission: 'admin' },
    ] },
    { key: 'you', label: 'You', items: [
        { key: 'settings', label: 'Impostazioni città', href: '/settings', exact: false },
    ] },
];

describe('allowedGroups', () => {
    it('drops the entries whose permission is not granted, and a group left empty', () => {
        const allowed = allowedGroups(groups, (p) => p === 'billing.read');
        expect(allowed.map((g) => [g.key, g.items.map((i) => i.key)])).toEqual([
            ['work', ['tickets', 'board', 'billing']],
            ['you', ['settings']],
        ]);
    });

    it('an entry with no permission is always there', () => {
        expect(allowedGroups(groups, () => false).flatMap((g) => g.items.map((i) => i.key))).toEqual(['tickets', 'board', 'settings']);
    });
});

describe('activeEntry', () => {
    const all = entries(groups);

    it('an exact entry is active on its own path only', () => {
        expect(activeEntry('/tickets', all)).toBe('tickets');
        expect(activeEntry('/tickets/42', all), 'a record lights its list').toBe('tickets');
    });

    it('the longest href wins: /settings/users is Users, not Settings', () => {
        expect(activeEntry('/settings/users', all)).toBe('users');
        expect(activeEntry('/settings/views', all)).toBe('settings');
    });

    it('a path no entry covers is none', () => {
        expect(activeEntry('/elsewhere', all)).toBe('');
        expect(activeEntry('/ticketsx', all), 'a prefix that is not a segment is not a match').toBe('');
    });
});

describe('searchGroups', () => {
    it('keeps the entries whose label has the query, accents and case aside, and drops empty groups', () => {
        expect(searchGroups(groups, 'CITTA').map((g) => [g.key, g.items.map((i) => i.key)])).toEqual([['you', ['settings']]]);
        expect(searchGroups(groups, 'b').map((g) => g.items.map((i) => i.key))).toEqual([['board', 'billing']]);
    });

    it('an empty or blank query is everything', () => {
        expect(searchGroups(groups, '  ')).toEqual(groups);
    });

    it('fold lowers the case and takes the accents off', () => {
        expect(fold('Città Bòard')).toBe('citta board');
    });
});

describe('recents', () => {
    it('a visit goes to the front, once, and the list keeps at most `kept`', () => {
        let list: string[] = [];
        for (const k of ['a', 'b', 'c', 'a', 'd']) list = noteRecent(list, k, 3);
        expect(list).toEqual(['d', 'a', 'c']);
    });

    it('keptKeys drops the stored keys that are no longer entries', () => {
        expect(keptKeys(['tickets', 'gone', 'board'], entries(groups))).toEqual(['tickets', 'board']);
    });
});
