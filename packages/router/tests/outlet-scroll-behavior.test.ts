// The outlet carries `scroll` into the RouteConfigs it builds, or `@scroll` does nothing.
//
// The same chain as `loader`, through the same map: the compiler emits `scroll:"top"` into
// `__pdx_routes`, the outlet maps those entries into the RouteConfig list `createRouter` receives,
// and the runtime hands `config.scroll` to the restoration. If the map drops this field, the
// declaration reaches the route object and stops there — parsed, typed, completed by the LSP,
// documented, and read by nobody.
//
// What is measured here is the WIRING: that the value the compiler emitted arrives at the function
// that acts on it. What it means once it arrives is measured in core's browser-scroll.test.ts, where
// the scroll positions actually exist.

import { describe, it, expect, beforeAll, vi } from 'vitest';

customElements.define('pdx-sb-home', class extends HTMLElement {});
customElements.define('pdx-sb-top', class extends HTMLElement {});
customElements.define('pdx-sb-keep', class extends HTMLElement {});
customElements.define('pdx-sb-plain', class extends HTMLElement {});

(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-sb-home' },
    { path: '/always-top', tag: 'pdx-sb-top', scroll: 'top' },
    { path: '/keep-place', tag: 'pdx-sb-keep', scroll: 'preserve' },
    { path: '/plain', tag: 'pdx-sb-plain' },
];

const restored: (string | undefined)[] = [];
vi.mock('@pdxui/core', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@pdxui/core');
    return {
        ...actual,
        restoreScrollPosition: (_path: string, _isBack: boolean, _el?: Element | null, behavior?: string) => {
            restored.push(behavior);
        },
    };
});

const { navigate } = await import('../src/runtime');
await import('../src/outlet');

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

beforeAll(async () => {
    history.replaceState(null, '', '/');
    document.body.innerHTML = '<pdx-router-outlet></pdx-router-outlet>';
    await tick();
});

describe('a route carries its @scroll declaration to the restoration', () => {
    it("passes 'top' through", async () => {
        restored.length = 0;
        navigate('/always-top');
        await tick();
        expect(restored, "the declaration stopped at the route object").toEqual(['top']);
    });

    it("passes 'preserve' through", async () => {
        restored.length = 0;
        navigate('/keep-place');
        await tick();
        expect(restored).toEqual(['preserve']);
    });

    it('passes nothing for a route that declares nothing', async () => {
        restored.length = 0;
        navigate('/plain');
        await tick();
        expect(restored, 'a route with no @scroll acquired one').toEqual([undefined]);
    });
});
