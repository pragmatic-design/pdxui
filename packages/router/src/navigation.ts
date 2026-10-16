// Resolving a navigation: redirects, before-hooks, the match, guards, loaders, then publishing.

import { saveScrollPosition as saveScroll, restoreScrollPosition as restoreScroll } from '@pdxui/core';
import { compileMatcher, type Matcher } from './matcher';
import { clearLoaders, planLoaders, runLoaders, startChunks } from './loaders';
import { publishTrail } from './trail';
import { tableRedirect } from './route-table';
import {
    isBrowser, _path, _params, _search, _meta, _state, _route, _navError, _navErrorDepth, _loaderFocus,
    _navTarget,
} from './state';
import {
    isRouterTarget, markShown, restoreShown, writeUrl, publishQuery, parseQueryString, primaryOutlet,
} from './address';
import type { NavigationHop, RouteConfig, RouterOptions } from './types';

/** What `createRouter` and `configureRouter` set, and every navigation reads. */
export const config: {
    basePath: string;
    guardFailRedirect: NonNullable<RouterOptions['guardFailRedirect']> | null;
    redirects: Map<string, string> | null;
    matcher: Matcher<RouteConfig>;
} = {
    basePath: '',
    guardFailRedirect: null,
    redirects: null,
    matcher: compileMatcher<RouteConfig>([]),
};

// ─── Guard System ─────────────────────────────────────────────────

type GuardChecker = (name: string) => boolean | Promise<boolean>;
let guardChecker: GuardChecker | null = null;

/**
 * Warn once — and loudly — when a route declares a guard nothing can answer.
 *
 * Denying in silence would be as confusing as a silent admission: the developer sees
 * a 403 on a route they believe they are allowed to reach, with nothing pointing at the cause.
 */
let _warnedNoChecker = false;
function warnMissingGuardChecker(guard: string): void {
    if (_warnedNoChecker) return;
    _warnedNoChecker = true;
    console.warn(
        `[pdx-router] Route guard "${guard}" was denied because no guard checker is registered. ` +
        `Mount <pdx-router-outlet>, which registers one, or call registerGuardChecker() yourself. ` +
        `A declared guard that cannot be evaluated is denied, never allowed.`,
    );
}

/** Register a guard checker. Called with the guard name from @guard declarations. */
export function registerGuardChecker(checker: GuardChecker): void {
    guardChecker = checker;
    _warnedNoChecker = false;
}

/**
 * The guard's answer now, for the devtools map: denied with no checker, as a navigation is; null
 * when the checker answers asynchronously.
 */
export function guardAnswer(guard: string): boolean | null {
    if (!guardChecker) return false;
    const answer = guardChecker(guard);
    return typeof answer === 'boolean' ? answer : null;
}

/**
 * Whether every level of `chain` may be entered — what a navigation's guards would answer, asked
 * ahead of one. A prefetch asks before it runs a loader (#119): a declared guard with nothing to
 * evaluate it is a no, as it is for a navigation.
 */
export async function chainAllowed(chain: RouteConfig[]): Promise<boolean> {
    for (const level of chain) {
        if (!level.guard) continue;
        if (!guardChecker || !await guardChecker(level.guard)) return false;
    }
    return true;
}

// ─── Navigation Middleware ─────────────────────────────────────────

type BeforeNavigateHook = (from: string, to: string, hop: NavigationHop) => boolean | Promise<boolean>;
type AfterNavigateHook = (from: string, to: string) => void;

const beforeHooks: BeforeNavigateHook[] = [];
const afterHooks: AfterNavigateHook[] = [];

export function onBeforeNavigate(hook: BeforeNavigateHook): () => void {
    beforeHooks.push(hook);
    return () => {
        const idx = beforeHooks.indexOf(hook);
        if (idx >= 0) beforeHooks.splice(idx, 1);
    };
}

export function onAfterNavigate(hook: AfterNavigateHook): () => void {
    afterHooks.push(hook);
    return () => {
        const idx = afterHooks.indexOf(hook);
        if (idx >= 0) afterHooks.splice(idx, 1);
    };
}

// ─── Navigating ────────────────────────────────────────────────────

/** Strip basePath from an absolute pathname. */
export function stripBase(pathname: string): string {
    if (!config.basePath) return pathname;
    return pathname.startsWith(config.basePath)
        ? (pathname.slice(config.basePath.length) || '/')
        : pathname;
}

/**
 * Navigate programmatically.
 * @param path — route path (can include :param placeholders)
 * @param params — URL path params to replace :param segments
 * @param state — ephemeral navigation state (not in URL, accessible via currentState)
 */
export function navigate(path: string, params?: Record<string, string>, state?: Record<string, unknown>): void {
    let resolved = path;
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            // Escape the key for the RegExp; URL-encode the value so /, ?, #, %, spaces… in a param
            // can't change the path's semantics or break the route match.
            const escKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const enc = encodeURIComponent(String(value));
            // Strip constraint from placeholder: :id(number) → value, :id → value.
            // Global + trailing non-word-char guard so :idCard is NOT matched by :id, and all
            // occurrences are replaced.
            resolved = resolved.replace(new RegExp(`:${escKey}(\\([^)]*\\))?(?![A-Za-z0-9_])`, 'g'), () => enc);
        }
    }

    // Reject external/protocol-relative/javascript: targets — navigate() is for internal routes
    // only. The <a href> is already sanitized, but the click handler reaches here with the raw `to`.
    //
    // `isRouterTarget`, not `sanitizeUrl`: sanitizeUrl answers "is this URL safe to put in an
    // href", and http/https ARE safe there. So `navigate('https://example.com/x')` would pass that
    // check and reach `history.pushState` with a cross-origin URL, which throws a SecurityError
    // — an unhandled one, from inside a click handler. handleNavigation applies the right test
    // too, but only AFTER navigate has written the address bar. Checked on `resolved`, i.e. on
    // what pushState will receive.
    if (!isRouterTarget(resolved)) {
        console.warn(
            `[pdx-router] Refused to navigate to "${resolved}": a router target must be a path `
            + `inside this origin. Use location.href for an external destination.`,
        );
        return;
    }

    if (!isBrowser) {
        _state.set(state); // ephemeral, not in the URL
        return;
    }
    saveScroll(_path.peek(), primaryOutlet());
    // Resolved here and not through the Navigation API's event, with or without the API: the
    // hooks have to run BEFORE the address bar is written, and the event arrives after.
    // The commit receives the final target, so a redirect table entry pushes its target, once.
    handleNavigation(resolved, false, 0, (target) => {
        _state.set(state); // ephemeral, not in the URL
        writeUrl('push', state ?? null, config.basePath + target);
    });
}

const MAX_REDIRECTS = 5;

// Monotonic navigation token: async work (guards, loaders) from a superseded navigation must not
// write global state after a newer navigation has started (A→B fast, A's loader resolving last).
let _navSeq = 0;

/** Where a redirect table sends this path: the router's options, the build's table, a late module. */
function redirectFor(path: string): string | undefined {
    return config.redirects?.get(path)
        ?? tableRedirect(path)
        ?? (globalThis.__pdx_redirects as { from: string; to: string }[] | undefined)
            ?.find(r => r.from === path)?.to;
}

function refuse(source: string, target: string): void {
    console.warn(`[pdx-router] Refused ${source} to "${target}": a router target must be a path inside this origin.`);
}

/**
 * Resolve a navigation. `commit` is present when the address bar has NOT been written yet — a
 * `navigate()` call, or a clicked link under the Navigation API — and writes it once the
 * before-hooks accept. Without it the URL has already moved (Back/Forward, a history write by other
 * code, the landing page), and a refusal puts it back.
 */
export async function handleNavigation(fullPath: string, isBack = false, depth = 0, commit?: (target: string) => void): Promise<void> {
    const navId = ++_navSeq;
    try {
        await resolveNavigation(navId, fullPath, isBack, depth, commit);
    } finally {
        // Published, refused, denied, failed: whatever ended the CURRENT navigation ends what
        // `navigation.pending()` reports. A superseded one leaves it to the navigation that replaced it.
        if (navId === _navSeq) _navTarget.set(null);
    }
}

async function resolveNavigation(navId: number, fullPath: string, isBack: boolean, depth: number, commit?: (target: string) => void): Promise<void> {
    const isCurrent = () => navId === _navSeq;

    // Every path that reaches the address bar comes through here — `navigate()`, the redirect
    // table, a route's `redirect`, and `guardFailRedirect` — so all four are checked, and none can
    // hand `replaceState` a target it cannot use. All four are developer-authored, so this is
    // defence in depth, not an open redirect; redirects are not exempt.
    if (!isRouterTarget(fullPath)) {
        console.warn(
            `[pdx-router] Refused to navigate to "${fullPath}": a router target must be a path inside `
            + `this origin. Use location.href for an external destination.`,
        );
        return;
    }
    // Redirect loop protection
    if (depth > MAX_REDIRECTS) {
        console.warn(`[pdx-router] Redirect loop detected (max ${MAX_REDIRECTS})`);
        return;
    }

    // The query and the hash are not part of the route pattern: matching operates on the path,
    // while currentSearch() exposes the raw query — set once the hooks have accepted, so a refused
    // navigation does not leak its query.
    const qIdx = fullPath.indexOf('?');
    const hIdx = fullPath.indexOf('#');
    const cut = qIdx >= 0 ? (hIdx >= 0 ? Math.min(qIdx, hIdx) : qIdx) : hIdx;
    const path = cut >= 0 ? fullPath.slice(0, cut) : fullPath;
    const searchFromPath = qIdx >= 0 ? fullPath.slice(qIdx, hIdx > qIdx ? hIdx : undefined) : '';

    const redirectTarget = redirectFor(path);
    if (redirectTarget) {
        // Checked HERE, not only on re-entry: the address bar is written before the recursive call,
        // so a guard at the top of this function would let `replaceState` see the raw target first
        // — the URL would already be written by the time the refusal happened.
        if (!isRouterTarget(redirectTarget)) { refuse(`a redirect from "${path}"`, redirectTarget); return; }
        // Update browser URL to reflect the redirect target — unless it has not been written yet,
        // in which case the pending commit will write the target instead of the source.
        if (isBrowser && !commit) writeUrl('replace', null, config.basePath + redirectTarget);
        return handleNavigation(redirectTarget, isBack, depth + 1, commit);
    }

    const prevPath = _path.peek();

    // Run before-hooks (can cancel navigation)
    for (const hook of beforeHooks) {
        // A boolean is not awaited. Awaiting it would defer the rest of the resolution to a
        // microtask, so registering any hook — the outlet's leave check, for one — would make every
        // navigation asynchronous, pages with nothing to ask included.
        const answer = hook(prevPath, path, { redirected: depth > 0 });
        const result = typeof answer === 'boolean' ? answer : await answer;
        if (!isCurrent()) return; // a newer navigation superseded us while the async hook ran
        if (result === false) {
            if (!commit) restoreShown(); // the URL had already moved: put it back
            return;
        }
    }

    // Accepted: now the address bar may say where we are going, and the app that it is on its way.
    commit?.(fullPath);
    _navTarget.set(fullPath);
    // Prefer the URL bar (kept in sync by navigate/setQuery), fall back to the query carried
    // in the incoming path when the environment hasn't reflected it into location.search.
    _search.set(isBrowser ? (location.search || searchFromPath) : searchFromPath);
    const query = parseQueryString();

    const match = config.matcher.match(path);
    if (!match) return publishNotFound(path, query, isBack, prevPath);
    const route = match.route;

    // Route-level redirect: matched, and sends the navigation on — address included. A before-hook
    // recognises the hop without reading the address bar, which is what `NavigationHop` is for.
    if (route.redirect) {
        if (!isRouterTarget(route.redirect)) { refuse(`a redirect from "${path}"`, route.redirect); return; }
        if (isBrowser) writeUrl('replace', null, config.basePath + route.redirect);
        return handleNavigation(route.redirect, isBack, depth + 1);
    }

    const chain = config.matcher.chain(route);
    const params = match.params;

    // Every level's guard, outermost first: a parent that denies stops the child, which is the point
    // of declaring a guard on the parent at all. A flat route is a chain of one.
    //
    // A declared guard with nothing able to evaluate it FAILS CLOSED. Otherwise a route declaring
    // `@guard` would open whenever nothing has called registerGuardChecker — which is the state of
    // any app that calls createRouter() directly instead of mounting <pdx-router-outlet>. The
    // registration deliberately stays outside createRouter: wiring core's permission system in here
    // would make every consumer of @pdxui/router depend on it, and the outlet is the seam that
    // already knows about both.
    for (let level = 0; level < chain.length; level++) {
        const guard = chain[level].guard;
        if (!guard) continue;
        const allowed = guardChecker ? await guardChecker(guard) : false;
        if (!guardChecker) warnMissingGuardChecker(guard);
        if (!isCurrent()) return; // superseded while the guard ran
        if (allowed) continue;

        // Resolved per denial, because it may be a FUNCTION of the permission that was refused: an
        // app answers the login for a visitor with no session and `null` for one whose session is
        // fine and whose permission is not — a sign-in form cannot help an authenticated visitor.
        const redirectTo = typeof config.guardFailRedirect === 'function'
            ? config.guardFailRedirect(guard)
            : config.guardFailRedirect;
        // Loop-safe: only when configured and not already the target.
        if (redirectTo && redirectTo !== path) {
            // And WRITE THE ADDRESS. The commit was spent before the route was matched — the
            // address bar already says the route that was refused — so the hop has to move it
            // itself. Without this the login would render under the URL of the page it refused: a
            // reload would go straight back to the denial, and a bookmark would save it.
            if (!isRouterTarget(redirectTo)) { refuse(`the guard redirect from "${path}"`, redirectTo); return; }
            if (isBrowser) writeUrl('replace', null, config.basePath + redirectTo);
            return handleNavigation(redirectTo, isBack, depth + 1);
        }
        return publishDenied(path, query, params, chain, level, prevPath);
    }

    // Every level's chunk starts now, all at once, and beside it every level's loader, outermost
    // first — the same rule as the guards above (#119). The focus is set first so
    // `currentLoaderState()` reads 'loading' for the page that is about to render. The planning is
    // synchronous and the await happens only when something actually has to load.
    const chunks = startChunks(chain);
    _loaderFocus.set(route.path);
    const pendingLoaders = planLoaders(chain, params);
    if (pendingLoaders.length > 0
        && !await runLoaders(pendingLoaders, isCurrent, { chunks, params, search: _search.peek() })) return;

    _path.set(path);
    _params.set(params);
    publishQuery(query);
    _meta.set(route.meta);
    _navError.set(null); // successful match clears any prior 403/404
    _route.set({ path: route.path, params, query, config: route, chain });
    publishTrail(route, params, config.matcher.ancestors(route));

    markShown();
    restoreScroll(path, isBack, primaryOutlet(), route.scroll);
    for (const hook of afterHooks) hook(prevPath, path);
}

/**
 * A guard denied the level at `depth`.
 *
 * The levels ABOVE it were allowed, and they stay. `_route = null` is right only at the top: below
 * it, it would take a page down for a permission on one of its tabs, and leave the visitor on a 403
 * whose only way back is the browser's Back button. The chain is truncated to the allowed prefix,
 * so each outlet above the denial renders the level it already had, and the outlet at `depth`
 * finds no level of its own and shows the refusal there.
 */
function publishDenied(
    path: string, query: Record<string, string>, params: Record<string, string>,
    chain: RouteConfig[], depth: number, prevPath: string,
): void {
    _path.set(path);
    _navError.set('403'); // distinguishes guard denial from 404 in the outlet
    _navErrorDepth.set(depth);
    clearLoaders();         // a denied branch leaves nothing readable behind it
    if (depth === 0) {
        _route.set(null); // nothing was allowed: the error page is the page
    } else {
        const allowed = chain.slice(0, depth);
        const deepest = allowed[allowed.length - 1];
        _params.set(params);
        publishQuery(query);
        _route.set({ path: deepest.path, params, query, config: deepest, chain: allowed });
    }
    markShown();
    for (const hook of afterHooks) hook(prevPath, path);
}

/** Nothing matched: the 404, which belongs to the outlet that owns the whole navigation. */
function publishNotFound(path: string, query: Record<string, string>, isBack: boolean, prevPath: string): void {
    _path.set(path);
    _params.set({});
    publishQuery(query);
    _meta.set(undefined);
    _navError.set('404');
    _navErrorDepth.set(0);
    clearLoaders();
    _route.set(null);
    markShown();
    restoreScroll(path, isBack, primaryOutlet());
    for (const hook of afterHooks) hook(prevPath, path);
}
