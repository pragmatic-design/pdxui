// The rail's Favourites: one kind of entry. A pin in the catalogue adds it at
// the end, the pin in the rail takes it away. A first visit is not an empty rail — Tickets, Board and
// Customers are favourites already pinned, and unpinned like any other. Kept in the browser: a
// preference of this visitor, not of this session. One owner for pins, outside the shell.
import { signal } from '@pdxui/core';
import type { Signal } from '@pdxui/core';
import { ALL_LINKS } from './nav-model';

const PIN_KEY = 'showcase.pins';
const FIRST_FAVOURITES = ['tickets', 'board', 'customers'];

/**
 * The stored favourites that are still entries: a key whose entry is no longer in the menu is
 * dropped, and the storage with it, not kept as a row with nothing to draw.
 */
function readPins(): string[] {
    const stored: string[] = JSON.parse(localStorage.getItem(PIN_KEY) ?? JSON.stringify(FIRST_FAVOURITES));
    const kept = stored.filter(k => ALL_LINKS.some(i => i.key === k));
    if (kept.length !== stored.length) localStorage.setItem(PIN_KEY, JSON.stringify(kept));
    return kept;
}

export interface Favourites {
    /** The pinned keys, in the order they were pinned. */
    pins: Signal<string[]>;
    isPinned(key: string): boolean;
    togglePin(key: string): void;
}

/** The favourites, read from storage once and written through on every change. */
export function createFavourites(): Favourites {
    const pins = signal<string[]>(readPins());
    return {
        pins,
        isPinned: (key) => pins().includes(key),
        togglePin(key) {
            const current = pins();
            const next = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
            pins.set(next);
            localStorage.setItem(PIN_KEY, JSON.stringify(next));
        },
    };
}
