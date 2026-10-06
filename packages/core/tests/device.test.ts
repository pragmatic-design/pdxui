// Tests for device detection signals

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

let listeners: Map<string, Set<(e: { matches: boolean }) => void>>;
let matchResults: Map<string, boolean>;

function setupMockMatchMedia() {
    listeners = new Map();
    matchResults = new Map();
    // Default: desktop landscape
    matchResults.set('(max-width: 767px)', false);
    matchResults.set('(min-width: 768px) and (max-width: 1023px)', false);
    matchResults.set('(min-width: 1024px)', true);
    matchResults.set('(orientation: portrait)', false);
    matchResults.set('(min-width: 1536px)', false);
    matchResults.set('(min-width: 1280px)', false);
    matchResults.set('(min-width: 1024px)', true);
    matchResults.set('(min-width: 768px)', true);
    matchResults.set('(min-width: 640px)', true);

    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: matchResults.get(query) ?? false,
        media: query,
        addEventListener: (_: string, handler: (e: { matches: boolean }) => void) => {
            if (!listeners.has(query)) listeners.set(query, new Set());
            listeners.get(query)!.add(handler);
        },
        removeEventListener: () => {},
    }));
}

describe('device detection', () => {
    // Imported ONCE, in a hook, and not in any test's budget. Re-imported inside each test, the
    // first of them would pay for vite transforming device.ts and its whole dependency graph —
    // inside a 5s timeout, on a machine compiling six packages at the same time. That times out on
    // a clean tree and passes alone, which is the shape of a gate that teaches you to re-run
    // instead of look.
    //
    // The mock still has to precede the module's FIRST ACCESS: device.ts creates its matchMedia
    // listeners lazily, on first read, not at import. So it goes in beforeAll ahead of the import
    // and is reinstalled per test for isolation.
    let device: (typeof import('../src/component/device'))['device'];

    beforeAll(async () => {
        setupMockMatchMedia();
        ({ device } = await import('../src/component/device'));
    });

    beforeEach(() => {
        setupMockMatchMedia();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('detects desktop by default', () => {
        expect(device.isDesktop()).toBe(true);
        expect(device.isMobile()).toBe(false);
        expect(device.type()).toBe('desktop');
    });

    it('detects landscape by default', () => {
        expect(device.isLandscape()).toBe(true);
        expect(device.isPortrait()).toBe(false);
    });

    it('breakpoint resolves to lg for 1024px+', () => {
        expect(device.breakpoint()).toBe('lg');
    });

    it('isMobile is reactive signal', () => {
        expect(typeof device.isMobile).toBe('function');
        expect(typeof device.isMobile.peek).toBe('function');
    });
});
