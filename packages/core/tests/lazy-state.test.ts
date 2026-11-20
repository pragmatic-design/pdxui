// Core's global state starts on first use, not at load (#1246).
//
// Viewport, screen, adaptive, online, rtl, overlay stack, context protocol, theme: each used to create
// its signals and install its listeners when its module loaded, in every app, whatever it used. Each
// case here loads the module fresh, as a page does, and holds three things: loading it installs
// nothing; its first read returns the value of that moment; a later change notifies.
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';

/**
 * The `type`s of the listeners `target.addEventListener` received while `load` ran, among `watched`:
 * the ones the module under test installed at load before #1246. Reloading it reloads core's
 * development-only devtools API too (`error`, `unhandledrejection`), which leaves production builds in
 * #1246's second part and is not this module's.
 */
async function listenersAdded<T>(target: EventTarget, watched: string[], load: () => Promise<T>): Promise<{ types: string[]; module: T }> {
    const spy = vi.spyOn(target, 'addEventListener');
    try {
        const module = await load();
        return { types: spy.mock.calls.map((c) => String(c[0])).filter((t) => watched.includes(t)), module };
    } finally {
        spy.mockRestore();
    }
}

/**
 * Each module under test, by its loader: written here, outside the tests, and warmed in `beforeAll`, so
 * that no test pays for a module's first transform (suite-hygiene.test.ts).
 */
const load = {
    viewport: () => import('../src/component/viewport'),
    adaptive: () => import('../src/component/adaptive'),
    online: () => import('../src/browser/online'),
    rtl: () => import('../src/i18n/rtl'),
    overlayStack: () => import('../src/component/overlay-stack'),
    context: () => import('../src/component/context'),
    style: () => import('../src/component/style'),
};

beforeAll(async () => {
    for (const loader of Object.values(load)) await loader();
});

/** The module `load` imports, loaded afresh: its state is a page's, once per load. */
async function fresh<T>(load: () => Promise<T>): Promise<T> {
    vi.resetModules();
    return load();
}

afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('dir');
    document.documentElement.removeAttribute('pdx-scheme');
    document.documentElement.removeAttribute('pdx-theme');
    localStorage.clear();
});

describe('viewport and screen', () => {
    it('loading installs no listener; the first read is the size then; a resize notifies', async () => {
        const { types, module } = await listenersAdded(window, ['resize', 'scroll'], () => fresh(load.viewport));
        expect(types).toEqual([]);
        Object.defineProperty(window, 'innerWidth', { value: 640, configurable: true });
        expect(module.viewport.width()).toBe(640);
        Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true });
        window.dispatchEvent(new Event('resize'));
        expect(module.viewport.width()).toBe(900);
        // One set of signals, however many reads.
        expect(module.viewport.width).toBe(module.viewport.width);
    });

    it('a media query is asked on its first read, once', async () => {
        const match = vi.spyOn(window, 'matchMedia');
        const module = await fresh(load.viewport);
        expect(match).not.toHaveBeenCalled();
        const dark = module.screen.prefersDark;
        expect(typeof dark()).toBe('boolean');
        expect(module.screen.prefersDark).toBe(dark);
        expect(match).toHaveBeenCalledTimes(1);
    });
});

describe('useAdaptive', () => {
    it('loading installs no listener; the width is read on the first use, and a resize notifies', async () => {
        const { types, module } = await listenersAdded(window, ['resize'], () => fresh(load.adaptive));
        expect(types).toEqual([]);
        Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
        const a = module.useAdaptive({ breakpoint: 768 });
        expect(a.isMobile()).toBe(true);
        Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
        window.dispatchEvent(new Event('resize'));
        expect(a.isMobile()).toBe(false);
    });
});

describe('useOnline', () => {
    it('loading installs no listener; the first use reads navigator.onLine; offline notifies', async () => {
        const { types, module } = await listenersAdded(window, ['online', 'offline'], () => fresh(load.online));
        expect(types).toEqual([]);
        const online = module.useOnline();
        expect(online()).toBe(navigator.onLine);
        window.dispatchEvent(new Event('offline'));
        expect(online()).toBe(false);
        window.dispatchEvent(new Event('online'));
        expect(online()).toBe(true);
    });
});

describe('direction', () => {
    it('loading observes nothing; the first read is <html dir> then; a change notifies', async () => {
        const observe = vi.spyOn(MutationObserver.prototype, 'observe');
        const module = await fresh(load.rtl);
        expect(observe).not.toHaveBeenCalled();
        document.documentElement.setAttribute('dir', 'rtl');
        expect(module.direction()).toBe('rtl');
        expect(module.isRTL()).toBe(true);
        document.documentElement.setAttribute('dir', 'ltr');
        await new Promise((r) => setTimeout(r, 0));
        expect(module.direction()).toBe('ltr');
        expect(module.flipPlacement('top-start')).toBe('top-start');
    });
});

describe('overlayStack', () => {
    it('loading installs no Escape listener; the first push does, and Escape dismisses the top', async () => {
        const { types, module } = await listenersAdded(document, ['keydown'], () => fresh(load.overlayStack));
        expect(types).toEqual([]);
        const { overlayStack } = module;
        expect(overlayStack.count()).toBe(0);
        const dismissed = vi.fn();
        overlayStack.push('a', { modal: true });
        overlayStack.onDismiss('a', dismissed);
        expect(document.body.style.overflow, 'a modal locks the body').toBe('hidden');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(dismissed).toHaveBeenCalledTimes(1);
        overlayStack.pop('a');
        expect(document.body.style.overflow).toBe('');
    });
});

describe('the context protocol', () => {
    it('loading installs no listener; the first global provide does, and answers a request', async () => {
        const { types, module } = await listenersAdded(document, ['context-request'], () => fresh(load.context));
        await new Promise((r) => setTimeout(r, 0));
        expect(types).toEqual([]);
        const token = module.context<string>('lazy-test');
        module.provide(token, 'answered');
        let answer: unknown;
        const request = new Event('context-request', { bubbles: true, composed: true }) as Event & Record<string, unknown>;
        request.context = token;
        request.callback = (v: unknown) => { answer = v; };
        document.body.dispatchEvent(request);
        expect(answer).toBe('answered');
        module.clearProviders();
    });
});

describe('the theme', () => {
    it('loading reads no storage; the first read follows the saved choice, then the author, then the OS', async () => {
        const read = vi.spyOn(localStorage, 'getItem');
        const module = await fresh(load.style);
        // The theme's keys: reloading the module reloads the development-only inspector too, whose
        // `pdx.telemetry` read leaves production builds in #1246's second part.
        expect(read.mock.calls.map((c) => c[0]).filter((k) => k === 'pdx-theme' || k === 'pdx-scheme')).toEqual([]);
        document.documentElement.setAttribute('pdx-scheme', 'light');
        expect(module.getScheme(), 'the author\'s scheme').toBe('light');
        module.setScheme('dark');
        expect(module.currentScheme()).toBe('dark');
        expect(localStorage.getItem('pdx-scheme')).toBe('dark');
    });

    it('the saved choice wins over the author\'s, read on first use', async () => {
        localStorage.setItem('pdx-theme', 'material');
        localStorage.setItem('pdx-scheme', 'dark');
        document.documentElement.setAttribute('pdx-scheme', 'light');
        const module = await fresh(load.style);
        expect(module.getTheme()).toBe('material');
        expect(module.getScheme()).toBe('dark');
    });
});
