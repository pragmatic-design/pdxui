// The address bar: what the router writes to it, when, and what it refuses to write.

import { sanitizeUrl } from '@pdxui/core';
import { isBrowser, _query, _search, _state } from './state';

// The URL is written only once the before-hooks accept. Written first, a hook that refused would
// keep the screen and move the URL — and a reload would open the screen it had refused, past the
// very hook that protected unsaved work. A link a person clicks waits too, under the Navigation API
// as well. When the URL has ALREADY moved (Back, Forward, code that
// writes history itself), a refusal puts it back on the screen shown.

/** The URL and history state of the screen on show, or null before the first one. */
let _shownUrl: string | null = null;
let _shownState: unknown = null;

/**
 * True while this module writes the URL itself. Under the Navigation API `pushState` and
 * `replaceState` fire the same `navigate` event the router listens to; answering our own write
 * resolves the navigation twice, which the outlet turns into two mounted pages.
 */
let _writingUrl = false;

export function isWritingUrl(): boolean {
    return _writingUrl;
}

export function writeUrl(mode: 'push' | 'replace', state: unknown, url: string): void {
    _writingUrl = true;
    try {
        if (mode === 'push') history.pushState(state, '', url);
        else history.replaceState(state, '', url);
    } finally {
        _writingUrl = false;
    }
}

/** Record the URL now in the address bar as the one belonging to the screen just published. */
export function markShown(): void {
    if (!isBrowser) return;
    _shownUrl = location.pathname + location.search + location.hash;
    _shownState = history.state;
}

/** A refused navigation whose URL had already moved: put the address bar back on the screen shown. */
export function restoreShown(): void {
    if (!isBrowser || _shownUrl === null) return;
    _state.set((_shownState ?? undefined) as Record<string, unknown> | undefined);
    if (location.pathname + location.search + location.hash === _shownUrl) return;
    writeUrl('replace', _shownState, _shownUrl);
}

/**
 * The main outlet — the one without a name — that the page renders in. Core saves and restores the
 * scroll of the container it scrolls in, not only the window's: pdx-app-layout scrolls the page
 * inside `.pdx-app-main`. Looked up on every navigation, since the layout can change.
 */
export function primaryOutlet(): Element | null {
    return isBrowser ? document.querySelector('pdx-router-outlet:not([name]), pdx-router-outlet[name=""]') : null;
}

/**
 * Is this a target the router may navigate to?
 *
 * Stricter than {@link sanitizeUrl}, deliberately. That function exists for `<a href>`, where
 * `https://stripe.com` is a perfectly good target, and its scheme allow-list contains http and
 * https. A ROUTER target is different: `history.pushState`/`replaceState` cannot leave the origin,
 * so an absolute URL here is never meaningful. Letting one through produces a SecurityError from
 * inside the browser instead of a message naming the configuration mistake.
 *
 * So: sanitize first (control characters, `javascript:`, protocol-relative including the
 * backslash-smuggled forms), then require a same-origin path.
 */
export function isRouterTarget(path: string): boolean {
    if (sanitizeUrl(path) === null) return false;
    // A scheme of any kind, or a leading double slash in either slash flavour, leaves the origin.
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return false;
    if (/^[/\\]{2}/.test(path.replace(/\\/g, '/'))) return false;
    return true;
}

// ─── Query Params ─────────────────────────────────────────────────

/**
 * Publish the query — and only when it actually changed.
 *
 * Every writer builds the map fresh, so the identity check inside the signal suppresses nothing:
 * without this, `?status=closed` written over `?status=closed` would re-run every reader of
 * `currentQuery()`. That breaks the law the rest of the reactivity obeys, that writing the value
 * something already has is not a change, and on a page where the query round-trips it is a pump:
 * a filter builder writes the source, the page's handler writes the parameter, the parameter feeds
 * the builder's `:value` back, and nothing in the circle ever says «this is the same».
 *
 * What that costs is not a slow page. The flush guard breaks the loop at 100 cycles by DROPPING the
 * pending effects, and every computed marked dirty in that flush stays dirty with no reader left
 * to recompute it — `markDirty` returns early while already dirty, so those bindings are never
 * notified again. The screen freezes in silence, one console line away from nothing.
 *
 * Content comparison and not identity: the map is one level of strings, which is what a query is.
 */
export function publishQuery(next: Record<string, string>): void {
    const prev = _query.peek();
    const keys = Object.keys(next);
    if (keys.length === Object.keys(prev).length && keys.every(k => prev[k] === next[k])) return;
    _query.set(next);
}

/** Set the entire query string reactively. Updates URL + signal. */
export function setQuery(params: Record<string, string>): void {
    if (!isBrowser) return;
    const sp = new URLSearchParams(params);
    const newUrl = `${location.pathname}?${sp.toString()}`;
    history.replaceState(null, '', newUrl);
    publishQuery(params);
    _search.set(location.search);
}

/** Set or remove a single query param. Pass null to remove. */
export function setQueryParam(key: string, value: string | null): void {
    if (!isBrowser) return;
    const sp = new URLSearchParams(location.search);
    if (value === null) sp.delete(key);
    else sp.set(key, value);
    const qs = sp.toString();
    history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
    publishQuery(parseQueryString());
    _search.set(location.search);
}

export function parseQueryString(): Record<string, string> {
    if (!isBrowser) return {};
    const result: Record<string, string> = {};
    new URLSearchParams(location.search).forEach((v, k) => { result[k] = v; });
    return result;
}
