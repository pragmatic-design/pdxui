// auth-store: reactive expiry, Bearer allowlist, UTF-8 decoding.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createAuthStore } from '../src/auth/auth-store';

/** A fake JWT (header.payload.signature) with an arbitrary payload, base64url. */
function fakeJwt(claims: Record<string, unknown>): string {
    const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    // encodeURIComponent/unescape: btoa only takes latin1 — we serialise the UTF-8 into bytes
    const payload = b64url(unescape(encodeURIComponent(JSON.stringify(claims))));
    return `${b64url('{"alg":"none"}')}.${payload}.x`;
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('isAuthenticated is reactive to expiry', () => {
    it('flips to false when the token expires', async () => {
        vi.useFakeTimers();
        const exp = Math.floor(Date.now() / 1000) + 2; // expires in 2s
        const store = createAuthStore();
        store.setTokens({ access: fakeJwt({ sub: 'u1', exp }) });
        expect(store.isAuthenticated()).toBe(true);

        await vi.advanceTimersByTimeAsync(3_000);
        expect(store.isAuthenticated()).toBe(false); // not reactive, it would stay true
    });

    it('a token with no exp stays authenticated', () => {
        const store = createAuthStore();
        store.setTokens({ access: fakeJwt({ sub: 'u1' }) });
        expect(store.isAuthenticated()).toBe(true);
    });
});

describe('authFetch — the Bearer only goes to trusted origins', () => {
    it('does not send the token to a third-party origin', async () => {
        const calls: { url: string; auth: string | null }[] = [];
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const headers = new Headers(init?.headers);
            calls.push({ url: String(input), auth: headers.get('Authorization') });
            return new Response('{}');
        }));

        const store = createAuthStore();
        store.setTokens({ access: fakeJwt({ sub: 'u1' }) });

        await store.authFetch('/api/data'); // relative → same origin → token OK
        await store.authFetch('https://evil.example.com/steal'); // a third-party origin → NO token

        expect(calls[0].auth).toMatch(/^Bearer /);
        expect(calls[1].auth).toBeNull(); // with no allowlist, the Bearer would leave for evil
    });

    it('an origin on the allowlist gets the token', async () => {
        const calls: { auth: string | null }[] = [];
        vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            calls.push({ auth: new Headers(init?.headers).get('Authorization') });
            return new Response('{}');
        }));

        const store = createAuthStore({ allowedOrigins: ['https://api.example.com'] });
        store.setTokens({ access: fakeJwt({ sub: 'u1' }) });
        await store.authFetch('https://api.example.com/v1/x');
        expect(calls[0].auth).toMatch(/^Bearer /);
    });
});

describe('decodeJwt UTF-8', () => {
    it('claims with non-ASCII characters are decoded correctly', () => {
        const store = createAuthStore<{ name: string }>();
        store.setTokens({ access: fakeJwt({ name: 'Càffè Größe' }) });
        expect(store.user()?.name).toBe('Càffè Größe'); // decoded as latin1, it would be garbled
    });
});
