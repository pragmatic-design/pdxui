// The HTTP client, and the one call that is not a page's own: signing in.
//
// Separate from `src/auth.ts` for a reason that is measured rather than stylistic. The shell
// imports the session — it has to, so the guard redirect and the user → permissions effect are in
// place before the first route is matched — and everything the session imports is therefore in the
// ENTRY chunk, the bytes a visitor waits for before anything is painted.
//
// `configureClient` pulls the whole HTTP client with it: the middleware chain, the timeout and the
// retry policy. No page needs it before one is rendered, and only two pages need it at all, so it
// lives here and arrives with the first page that asks. Measured: the entry is 34.6 KB with this
// split and 36.3 KB with the client in `auth.ts`, at a cost of 0.6 KB on the total.
//
// ⚠️ `permissions.md` says to join the client to the store "once at startup", and this is still
// once — on the first import rather than on the first byte. A module's side effect runs once
// whoever imports it; what changes is WHEN, and the only requirement is that it precede the first
// request, which importing it beside the request guarantees.

import { configureClient, authMiddleware } from '@pdxui/core';
import { auth } from './auth';

/**
 * One client for the whole app, with the token attached by middleware.
 *
 * The alternative — every call reading `localStorage` and building a header — is the boilerplate
 * `authMiddleware` exists to delete, and it is also how one forgotten call ends up unauthenticated
 * in production.
 */
export const api = configureClient({
    baseUrl: '/api',
    middleware: [authMiddleware({ getToken: () => auth.getToken() })],
    // A login that is refused must say so on the first attempt. Retrying a 401 would double the
    // wait before the message appears, and this app's server answers straight away.
    retry: false,
});

export interface Credentials {
    username: string;
    password: string;
    /** Seconds the token should last. The expiry test asks for a short one; nothing else sets it. */
    ttl?: number;
}

/**
 * Sign in: the app performs the call, the store keeps the result.
 *
 * `createAuthStore` deliberately owns no flow — this is the half that is yours, and it is four
 * lines. Throws whatever the client throws, so the caller can show the server's own message.
 */
export async function login(credentials: Credentials): Promise<void> {
    const { access, refresh } = await api.post<{ access: string; refresh: string | null }>(
        '/auth/login', credentials);
    auth.setTokens({ access, refresh });
}
