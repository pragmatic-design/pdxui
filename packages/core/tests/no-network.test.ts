// The BEHAVIOUR of the guard in tests/setup/no-network.ts: what it refuses, what it says, and what
// it lets through.
//
// It does NOT prove the guard is installed for the suite — this file imports the module, and that
// import is itself what activates it here. The first version of this file claimed otherwise and
// passed with `setupFiles` removed from the config, which is a check that cannot fail. The
// installation is asserted in suite-hygiene.test.ts, from a file that imports nothing.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { UnmockedFetchError } from './setup/no-network';

describe('the core suite refuses to touch the network', () => {
    afterEach(() => { vi.unstubAllGlobals(); });

    it('refuses an unstubbed fetch, by name', () => {
        // Synchronously, deliberately. A rejected promise would be the faithful imitation of fetch,
        // and that is exactly the problem: code written as `fetch(u).catch(handle)` would swallow
        // it and the test would go quiet again — which is the behaviour this issue exists to end.
        // A throw at the call site cannot be caught by a handler attached to the promise.
        expect(() => fetch('/api/thing')).toThrow(UnmockedFetchError);
    });

    it('names the URL it refused, so the culprit is findable', () => {
        expect(() => fetch('/api/users?page=2')).toThrow('/api/users?page=2');
    });

    it('reads a Request object rather than stringifying it', () => {
        expect(() => fetch(new Request('http://example.test/thing'))).toThrow('http://example.test/thing');
    });

    it('says what to do about it', () => {
        expect(() => fetch('/x')).toThrow(/vi\.stubGlobal/);
    });

    it('lets a test that stubs fetch through', () => {
        // The control. A guard that refused everything would satisfy the four cases above and make
        // the whole suite unwritable.
        vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
        expect(() => fetch('/api/thing')).not.toThrow();
    });

    it('restores the guard when a stub is cleaned up, not the runtime fetch', () => {
        // Why the assignment lives at module scope in the setup file: vitest restores whatever the
        // global was when the stub was installed. If the guard were installed later — in a hook —
        // unstubAllGlobals would hand back Node's real fetch and the next test could reach the
        // network again.
        vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
        vi.unstubAllGlobals();
        expect(() => fetch('/api/thing')).toThrow(UnmockedFetchError);
    });
});
