// pdx-icon says so when a name draws nothing (#1017).
//
// A name its set does not have draws nothing: a reference app shipped menus with blank icons (`tree`,
// `calendar-off`, a row menu's `ellipsis`) and nobody noticed. The «pragmatic» resolver warned (#333),
// but on every draw — a list of 100 rows with one wrong icon warned 100 times — and a set the app
// registered said nothing. pdx-icon warns now, for any set, once per name and set; a production build
// drops the line with every other diagnostic behind DEV.
//
// The warning is once per (name, set) for the module's life, so each test uses names of its own.

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { registerIconSet } from '@pdxui/core';
import { cleanup } from './helpers';
import { defineIcons } from '../../src/icon/pdx-icon';
import check from '../../src/icon/pragmatic/check';

defineIcons({ check });

function icon(name: string, set?: string): HTMLElement {
    const el = document.createElement('pdx-icon');
    el.setAttribute('name', name);
    if (set) el.setAttribute('set', set);
    document.body.appendChild(el);
    return el;
}

type WarnSpy = MockInstance<typeof console.warn>;

const iconWarnings = (warn: WarnSpy): string[] =>
    warn.mock.calls.map((c) => String(c[0])).filter((m) => m.startsWith('[pdx-icon]'));

describe('pdx-icon with a name its set does not have', () => {
    let warn: WarnSpy;
    beforeEach(() => { cleanup(); warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
    afterEach(() => vi.restoreAllMocks());

    it('warns, naming the icon and the set', async () => {
        icon('no-such-icon-a');
        await vi.waitFor(() => expect(iconWarnings(warn)).toHaveLength(1));
        expect(iconWarnings(warn)[0]).toContain('"no-such-icon-a"');
        expect(iconWarnings(warn)[0]).toContain('"pragmatic"');
    });

    it('warns once for a name, however many icons draw it', async () => {
        icon('no-such-icon-b');
        await vi.waitFor(() => expect(iconWarnings(warn)).toHaveLength(1));
        icon('no-such-icon-b');
        // A second unknown name, drawn after it: when its warning is in, the repeat has been resolved too.
        icon('no-such-icon-c');
        await vi.waitFor(() => expect(iconWarnings(warn).some((m) => m.includes('"no-such-icon-c"'))).toBe(true));
        expect(iconWarnings(warn).filter((m) => m.includes('"no-such-icon-b"'))).toHaveLength(1);
    });

    it('warns for a set the app registered too, not only the library\'s own', async () => {
        registerIconSet('app-set-1017', (name) => (name === 'known' ? '<svg viewBox="0 0 24 24"><path d="M0 0h1"/></svg>' : ''));
        icon('no-such-icon-d', 'app-set-1017');
        await vi.waitFor(() => expect(iconWarnings(warn).some((m) => m.includes('"no-such-icon-d"'))).toBe(true));
        expect(iconWarnings(warn).find((m) => m.includes('"no-such-icon-d"'))).toContain('"app-set-1017"');
    });

    it('the control: a name the set has draws, and says nothing', async () => {
        const el = icon('check');
        await vi.waitFor(() => expect(el.querySelector('svg')).not.toBeNull());
        expect(iconWarnings(warn)).toEqual([]);
    });
});
