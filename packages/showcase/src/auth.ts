// The session: who is signed in, what they may do, and how a route and a button find out.
//
// `permissions.md` draws the whole slice as one line:
//
//   login → setTokens() → user → setPermissions(from that user) → hasPermission / @guard
//         → expiry → clear()
//
// Every arrow in it is here, and the one the documentation warns about is the third: **nothing
// wires the user to the permissions for you**. The `effect` below is that wire, and it is also
// what makes a reload work — permissions are in-memory state and do not come back with the
// tokens, so the effect running on startup is what rebuilds them.
//
// This module is in the ENTRY chunk (the shell imports it), which is why it holds no markup and
// no component: the session has to exist before the first route is matched, the login page does
// not.

import { createAuthStore, effect, setPermissions } from '@pdxui/core';
import { navigate, onAfterNavigate, onBeforeNavigate } from '@pdxui/router';
import { grants } from './data/grants';

/** The user this app decodes out of the token. Not the claims — the claims are the source. */
export interface SessionUser {
    sub: string;
    name: string;
    email: string;
    roles: string[];
}

// What each role may do lives in `data/grants.ts`: the SERVER's roles
// (`mock-auth.ts`), which Settings › Permissions edits, as the browser last read them. The server
// checks every action again: this decides what is rendered, that decides what happens.
// `permissions.md` ends on exactly that point — a permission is a UI affordance, never the enforcement.

/**
 * The store. `storageKey` is the trade the documentation names: the session survives a reload, and
 * the tokens sit in `localStorage` with the exposure that implies.
 *
 * `decodeUser` reads the claims the mock signs — `realm_access.roles`, the shape `permissions.md`
 * documents — so what this app does is what a reader is told to do.
 */
export const auth = createAuthStore<SessionUser>({
    storageKey: 'showcase.auth',
    decodeUser: (claims) => ({
        sub: String(claims.sub ?? ''),
        name: String(claims.name ?? ''),
        email: String(claims.email ?? ''),
        roles: (claims.realm_access as { roles?: string[] } | undefined)?.roles ?? [],
    }),
});

/**
 * The wire the documentation says is not there: user → permissions.
 *
 * Two things it must read, and the second is the one that is easy to miss. `user()` alone stays
 * populated when the token lapses — the store decodes it once and it is still a valid decoding —
 * so a page that checked only the user would keep its admin buttons after the session died.
 * `isAuthenticated()` is the reactive half that flips on `exp`, and reading it here is what makes
 * an expired session drop its permissions, which is what makes `@guard` send the visitor to the
 * login.
 */
effect(() => {
    const user = auth.user();
    if (!user || !auth.isAuthenticated()) { setPermissions([]); return; }
    // Read here, so a grant changed in Settings rebuilds the permissions at once.
    const table = grants();
    setPermissions((key) => user.roles.some((role) => table[role]?.includes(key)));
});

// The server's roles, once there is a session to ask with. Lazily: the HTTP client is not in the
// entry chunk (`api.ts`), and the seed in `grants.ts` holds until the answer arrives.
effect(() => {
    if (auth.isAuthenticated()) void import('./data/access').then((m) => m.loadAccess());
});

/**
 * Where a denied guard sends the visitor — and it depends on WHY the guard denied.
 *
 * A denial has two causes and they want two answers:
 *
 *   · **no session** → the login, with the refused path remembered. The visitor signs in and lands
 *     where they were going;
 *   · **a session without the permission** → `null`: the refusal is shown where it happened, in the
 *     outlet of the level that was denied, and the page around it stays.
 *
 * Not the string `'/login'`, which gives the first answer to both questions: signed in as `admin`,
 * the Billing tab of `/tickets/1/interventions/2` — a permission no role in this showcase holds —
 * would send the whole app to a sign-in form that cannot help, and signing in again would land back
 * on the same denial. The redirect would also fire before the router keeps the parent on screen
 * when a child is refused, so the reference app would demonstrate the opposite of what the router
 * does.
 *
 * Read by `<pdx-router-outlet>` when it boots the router, so it has to be set before the outlet
 * connects — which is why it is a module side effect of something the shell imports, and not a
 * call inside a page.
 */
globalThis.__pdx_guard_redirect = () => (auth.isAuthenticated() ? null : '/login');

// ─── Every route behind the login ─────────────────────────────────────────────
//
// A visitor without a session sees the sign-in and nothing else: every route but `/login` sends
// them there, and the address they asked for travels with them as `?next=`, so signing in lands on
// it — a reload of the sign-in included, which an in-memory path would not survive.
//
// Here and not as a `@guard` on every page: a declaration repeated on thirty pages is the one that
// gets forgotten on the thirty-first. The router has no guard for a whole layout (INVESTIGATE: a
// layout-level or default guard would make this a declaration), so the session is checked at the
// three places a page can be reached from.

const LOGIN = '/login';

/** Whether `path` (with or without a query) is the sign-in. */
export const isLoginPath = (path: string): boolean =>
    path === LOGIN || path.startsWith(`${LOGIN}?`) || path.startsWith(`${LOGIN}/`);

/** The sign-in, carrying the address to come back to. */
export const loginFor = (path: string): string =>
    isLoginPath(path) || path === '/' ? LOGIN : `${LOGIN}?next=${encodeURIComponent(path)}`;

/**
 * Where signing in lands: `next` when it is a path of THIS app, else the dashboard.
 *
 * A `next` is whatever the address bar says, so it is refused unless it is a same-origin path —
 * `//evil.example` and `/\evil.example` are other origins to a browser — and never the sign-in
 * itself, which would land a signed-in visitor back on the form.
 */
export function nextAfterSignIn(search: string): string {
    const next = new URLSearchParams(search).get('next') ?? '';
    if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || isLoginPath(next)) return '/';
    return next;
}

// 1. The cold load. The outlet boots the router on the address it finds, so the address is
//    rewritten BEFORE it does: this module is imported by `app.pdx` ahead of the outlet, and the
//    page asked for is never drawn — not drawn and then taken away.
if (typeof location !== 'undefined' && !auth.isAuthenticated() && !isLoginPath(location.pathname)) {
    history.replaceState(history.state, '', loginFor(location.pathname + location.search));
}

// 2. A navigation without a session — the browser's Back after signing out, a link in a page left
//    open. Refused: the router puts the address back, and the sign-in stays.
onBeforeNavigate((_from, to) => auth.isAuthenticated() || isLoginPath(to));

// 3. The session ending under a page — signing out, or the token passing its `exp`. To the
//    sign-in, carrying the page it ended on.
let wasSignedIn = auth.isAuthenticated();
effect(() => {
    const signedIn = auth.isAuthenticated();
    if (wasSignedIn && !signedIn && typeof location !== 'undefined' && !isLoginPath(location.pathname)) {
        navigate(loginFor(location.pathname + location.search));
    }
    wasSignedIn = signedIn;
});

// ─── The flow ─────────────────────────────────────────────────────────────────

/** Sign out. `clear()` drops the tokens; the effect above drops the permissions with them. */
export function logout(): void {
    auth.clear();
}

/**
 * Sign out from a page someone is on: to the sign-in FIRST, and the session cleared only once that
 * navigation went through.
 *
 * The other order — `logout()`, then the session-end effect navigating — asks a page with unsaved
 * work about leaving AFTER its session is gone: «Stay» keeps the page and nothing behind it, the next
 * request a 401 and the next navigation refused. Here a refused navigation clears nothing.
 *
 * The hook is the next navigation's, whatever it is: a cancelled one fires no hook, so the next that
 * lands elsewhere removes it without signing anybody out.
 */
export function signOut(): void {
    const here = location.pathname + location.search;
    const off = onAfterNavigate((_from, to) => {
        off();
        if (isLoginPath(to)) logout();
    });
    navigate(loginFor(here));
}
