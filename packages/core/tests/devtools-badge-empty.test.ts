// The dev devtools stay out of a phone layout, and their empty panel says what is actually missing.
//
// The «PDX» badge is fixed at bottom:8px right:8px, z-index 999998. At 390px it would sit on the
// right end of an app's bottom navigation, and a tap on its last item would open the devtools
// instead of the app. And the empty panel names the missing debug HOOK, because that is what it
// detects: «No Pragmatic components detected.» on a page made only of Pragmatic components is wrong.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { toggle, initDevTools } from '../src/devtools/overlay';

/** Make `window.matchMedia` answer as a device would: coarse pointer, or a given width. */
function device(opts: { coarse?: boolean; width?: number }): void {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
        const coarse = /pointer:\s*coarse/.test(query) && !!opts.coarse;
        const m = /max-width:\s*(\d+)px/.exec(query);
        const narrow = !!m && (opts.width ?? 1280) <= Number(m[1]);
        return {
            matches: coarse || narrow, media: query, onchange: null,
            addEventListener: () => {}, removeEventListener: () => {},
            addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
        } as unknown as MediaQueryList;
    });
}

/** The badge the last initDevTools() appended (the overlay module is a singleton across tests). */
function lastBadge(): HTMLElement | undefined {
    return [...document.body.querySelectorAll<HTMLElement>('div')].filter(d => d.textContent === 'PDX').at(-1);
}
const visible = (el: HTMLElement | undefined): boolean => !!el && !el.hidden && el.style.display !== 'none';

function openPanel(): HTMLElement {
    const el = document.getElementById('pdx-devtools');
    if (!el || el.classList.contains('hidden')) toggle();
    return document.querySelector('#pdx-devtools-content') as HTMLElement;
}

// The overlay reads the one global the inspector installs; each test may replace it.
const hooked = window as { __PDX_DEVTOOLS__?: unknown };
const realHook = hooked.__PDX_DEVTOOLS__;

afterEach(() => {
    const el = document.getElementById('pdx-devtools');
    if (el && !el.classList.contains('hidden')) toggle();
    vi.restoreAllMocks();
    hooked.__PDX_DEVTOOLS__ = realHook;
    for (const b of document.body.querySelectorAll('div')) if (b.textContent === 'PDX') b.remove();
});

describe('devtools badge on a phone', () => {
    it('with a coarse pointer there is no visible badge, and Ctrl+Shift+D still opens the panel', () => {
        device({ coarse: true });
        initDevTools();
        expect(visible(lastBadge()), 'the badge covers a phone layout').toBe(false);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'D', ctrlKey: true, shiftKey: true, bubbles: true }));
        expect(document.getElementById('pdx-devtools')?.classList.contains('hidden')).toBe(false);
    });

    it('below 768px there is no visible badge either', () => {
        device({ width: 390 });
        initDevTools();
        expect(visible(lastBadge())).toBe(false);
    });

    it('the control: a fine pointer on a wide screen shows the badge, as before', () => {
        device({ width: 1280 });
        initDevTools();
        expect(visible(lastBadge())).toBe(true);
    });
});

describe('devtools empty panel says what is missing', () => {
    it('with no debug hook, it names the hook and dev mode — not the page\'s components', () => {
        delete hooked.__PDX_DEVTOOLS__;
        const content = openPanel();
        expect(content.textContent).toContain('Debug hook not found');
        expect(content.textContent).toContain('dev mode');
        expect(content.textContent, 'it blamed the page').not.toContain('No Pragmatic components');
    });

    it('with the hook and no components mounted, it says there are no components on this page', () => {
        hooked.__PDX_DEVTOOLS__ = { debug: { componentTree: () => [], signals: () => [], traceLog: () => [], trace: () => {}, tracing: () => false } };
        const el = document.getElementById('pdx-devtools');
        const content = openPanel();
        (el ?? document).querySelector<HTMLElement>('[data-tab="components"]')?.click();
        expect(content.textContent).toContain('No components on this page');
    });
});
