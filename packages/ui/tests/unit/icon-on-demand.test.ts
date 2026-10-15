// pdx-icon draws the icons the page imported at once, and loads any other name of the set on demand
// (#47).
//
// pdx-icon used to register the whole «pragmatic» set when it loaded, so every page with one icon
// shipped 359. Now an icon is on the page when something imported its module, and a name that is not
// — one that arrived through data — imports its own module the first time it is drawn: once per name,
// however many icons draw it. This file is its own module graph: it imports pdx-icon, one icon module,
// and the loader map it spies on.
//
// An icon module is data and registers nothing itself: importing one is not enough, it is handed to
// `defineIcons` (what the compiler emits beside the import).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import { defineIcons } from '../../src/icon/pdx-icon';
import check from '../../src/icon/pragmatic/check';
import { PRAGMATIC_LOADERS } from '../../src/icon/pragmatic-loaders';
import { definedIcon } from '../../src/icon/icon-map';

// What the compiler emits for `<pdx-icon name="check">`: the icon's module, handed to defineIcons.
defineIcons({ check });

async function icons(...names: string[]): Promise<HTMLElement[]> {
    const els = names.map(name => {
        const el = document.createElement('pdx-icon');
        el.setAttribute('name', name);
        document.body.appendChild(el);
        return el;
    });
    // A frame: enough to draw an icon the page has. One that loads is awaited by the test (#380).
    await tick();
    return els;
}

/**
 * Spy on a name's loader and slow it by 200 ms, longer than any fixed wait would cover: a test
 * waits for the load it asserts on, not for a time (#380). The calls' promises are kept, so a
 * test can await the load itself.
 */
function slowLoader(name: string) {
    const real = PRAGMATIC_LOADERS[name];
    const loads: Promise<unknown>[] = [];
    const spy = vi.spyOn(PRAGMATIC_LOADERS, name).mockImplementation(() => {
        const load = new Promise<void>(r => setTimeout(r, 200)).then(real);
        loads.push(load);
        return load;
    });
    return { spy, loads };
}

const drawn = (el: HTMLElement): string => el.querySelector('svg path, svg line, svg circle, svg rect, svg polyline, svg polygon')?.outerHTML ?? '';

describe('pdx-icon and the icons of the set', () => {
    beforeEach(cleanup);
    afterEach(() => vi.restoreAllMocks());

    it('does not put the whole set on the page', () => {
        expect(definedIcon('check'), 'the icon this file defined').toBe(check);
        expect(definedIcon('trash'), 'pdx-icon loaded an icon nobody imported or drew').toBeUndefined();
    });

    it('draws an imported icon without loading anything', async () => {
        const load = vi.spyOn(PRAGMATIC_LOADERS, 'check');
        const [el] = await icons('check');
        expect(drawn(el)).toContain('M20 6L9 17l-5-5');
        expect(load).not.toHaveBeenCalled();
    });

    it('loads a name it does not have once, however many icons draw it, and draws every one', async () => {
        expect(definedIcon('archive')).toBeUndefined();
        const { spy: load, loads } = slowLoader('archive');
        const els = await icons('archive', 'archive', 'archive');
        expect(load).toHaveBeenCalledTimes(1);
        await Promise.all(loads);
        await tick();
        for (const el of els) expect(drawn(el), 'an icon loaded on demand was not drawn').not.toBe('');
        expect(definedIcon('archive')).toBeDefined();
    });

    it('draws nothing for a name outside the set, and says so in development', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const [el] = await icons('no-such-icon');
        expect(drawn(el)).toBe('');
        expect(warn.mock.calls.flat().join(' ')).toContain('no-such-icon');
    });

    it('an icon that arrives after the name changed is not drawn over the new one', async () => {
        expect(definedIcon('bell')).toBeUndefined();
        const { spy: load, loads } = slowLoader('bell');
        const el = document.createElement('pdx-icon');
        el.setAttribute('name', 'bell');
        document.body.appendChild(el);
        // Before `bell` has loaded, the name becomes an icon the page already has.
        el.setAttribute('name', 'check');
        await tick();
        expect(load, 'bell was never asked for, so nothing could arrive late').toHaveBeenCalledTimes(1);
        // Wait for `bell` to arrive, then for what it would draw: only then is "not drawn over" seen.
        await Promise.all(loads);
        await tick();
        expect(definedIcon('bell'), 'bell has not arrived yet').toBeDefined();
        expect(drawn(el)).toContain('M20 6L9 17l-5-5');
    });
});
