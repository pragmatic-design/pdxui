// <pdx-router-outlet> — production-grade router outlet.
//
// Keep-alive uses DocumentFragment freeze/resume pattern:
//   - Freeze: move to DocumentFragment -> disconnectedCallback fires but _keepAlive skips cleanup
//   - Resume: re-append to DOM -> connectedCallback fires -> effects re-track -> auto-reconcile
//   - Zero CPU cost while frozen, burst reconciliation on resume
//
// Transitions: uses CSS enter/exit classes from @pdxui/core transitions API.
// Layout: layout chain managed by _resolveLayoutStack() + _diffLayouts().
//
// Default: DESTROY component on navigate away (full mount/destroy lifecycle)
// Opt-in: @page '/path' { keepAlive } -> freeze/resume pattern

import { effect, enter, injectTransitionCSS, hasPermission, signal, provide, announce, registerComponentStrings, getComponentString, splashReady, isSplashUp } from '@pdxui/core';
import { createRouter, navigate, currentRoute, currentNavError, currentNavErrorDepth, currentPath, registerGuardChecker, onBeforeNavigate, routeTable, pageModule } from './active';
import type { RouteConfig, ResolvedRoute, NavigationHop } from './active';
import { prefetchedLoad } from './prefetch';

// The router paints two things a user reads — the loading placeholder and the error page — so their
// text is registered strings, not literals: an app in another language can replace
// "404 · Page not found · ← Back to home".
registerComponentStrings('router', {
    loading: 'Loading...',
    notFound: 'Page not found',
    error: 'Error {code}',
    backHome: '← Back to home',
    loadFailed: 'Failed to load page: {message}',
});

const routerString = (key: string): string => getComponentString('router', key)();

// ─── Transition Preset Resolution ───────────────────────────────────
// @transition 'fade' → enter: 'fade-in', exit: 'fade-out'
// @transition 'slide-left' → enter: 'slide-left', exit: 'slide-left' (same class, different from/to)

const TRANSITION_PRESETS: Record<string, { enter: string; exit: string }> = {
    'fade':        { enter: 'fade-in',     exit: 'fade-out' },
    'slide-left':  { enter: 'slide-left',  exit: 'slide-left' },
    'slide-right': { enter: 'slide-right', exit: 'slide-right' },
    'slide-up':    { enter: 'slide-up',    exit: 'slide-up' },
    'slide-down':  { enter: 'slide-down',  exit: 'slide-down' },
    'scale':       { enter: 'scale-in',    exit: 'scale-out' },
    'collapse':    { enter: 'collapse',    exit: 'collapse' },
};

function resolveTransition(name?: string): { enter?: string; exit?: string } {
    if (!name || name === 'none') return {};
    const preset = TRANSITION_PRESETS[name];
    return preset ?? { enter: name, exit: name };
}

interface RegisteredRoute {
    path: string;
    tag: string;
    guard?: string;
    keepAlive?: boolean | number;
    preload?: boolean;
    lazy?: boolean;
    file?: string;       // relative file path for lazy import()
    prefetch?: string;
    transition?: string;  // CSS transition preset: 'fade', 'slide-left', etc.
    /**
     * The shell this page renders inside, as tags, outermost first.
     *
     * Written by the compiler from `@layout 'admin'`, which resolves the name to the tag
     * (`codegen-shared.ts` → `layoutChain`).
     */
    layouts?: string[];
    redirect?: string;    // route-level redirect target
    scroll?: 'preserve' | 'top';  // @scroll: what the scroll position does when this route is entered
    /** The page renders a <pdx-router-outlet>, so routes below its path nest inside it. */
    hasOutlet?: boolean;
    /** What this route is called in a breadcrumb; a function of the params when it needs them. */
    label?: string | ((params: Record<string, string>) => string);
    /** The crumb as a dictionary key, translated with the params. */
    labelKey?: string;
    meta?: Record<string, unknown>;  // route metadata
    /**
     * The @loader function. A FUNCTION, not its name: the module the compiler generates hoists the
     * declaration to module scope and registers the reference, so `createRouter` receives something
     * it can actually call.
     */
    loader?: () => Promise<unknown>;
    outlets?: { name: string; tag: string }[];  // named outlet mappings
}

// ─── Layout Nesting ─────────────────────────────────────────────────

interface LayoutInstance {
    tag: string;          // CE tag name: 'pdx-layout', 'pdx-admin-layout'
    element: HTMLElement;
    /**
     * Where this layout's pages (or the next layout) go: a `display: contents` host the outlet puts
     * INTO the layout before it renders, so the layout projects it into its slot once and it stays
     * there. The slot itself does not stay: a `.pdx` layout replaces its `<slot>` with what it
     * captured, so looking the slot up again would find nothing, and every navigated page would be
     * appended after the whole layout.
     */
    host: HTMLElement;
}

// The active page, the frozen keep-alive pages and the layout stack are instance fields, not module
// state: module state makes the outlet a singleton by construction, and a second one on the page
// would write over the first one's bookkeeping. Nested routes need a second outlet INSIDE the first.

let routerInitialized = false;

// Distinct from routerInitialized, which stays false when an app registers no routes at
// all: this only says the boot attempt has happened. Until it has, a null route means
// "the table isn't loaded yet", NOT "no such page" — see _handleRouteChange.
let routerBootstrapped = false;

/**
 * Take a page out for good. A keep-alive page carries `_keepAlive = true` from its first activation,
 * and a removal would only freeze it — no cleanup — so the flag is cleared first. For a page that
 * is not kept the flag is already false.
 */
function discard(el: HTMLElement): void {
    el._keepAlive = false;
    el.remove();
}

// Route config lookup
const routeConfigMap = new Map<string, RegisteredRoute>();

function autoInitRouter(): void {
    if (routerInitialized) return;

    // Auto-bridge guard system with core permission system
    // Auto-bridge: router guards use core's permission system (deny by default on error)
    registerGuardChecker((name) => {
        try {
            return hasPermission(name)();
        } catch (err) {
            // Deny by default, but surface the cause — a silent false makes guard
            // denials impossible to diagnose.
            console.warn(`[pdx-router] Guard "${name}" check threw; denying access.`, err);
            return false;
        }
    });

    // The BUILD-TIME table first, the modules' registrations second.
    //
    // `globalThis.__pdx_routes` is filled by a page module WHEN IT IS IMPORTED, so taking it as the
    // only source would mean the app had to import every page before the router knew any of them
    // existed — and `@page`'s code splitting could not happen, because the dynamic import the
    // outlet performs would resolve to a module already in the entry chunk. In a production build
    // the generated router carries the whole table, compiled from the same `@page` declarations, and
    // the outlet imports a page the first time it shows it. In dev `routeTable()` is null and
    // nothing changes: there is no bundle to split.
    const compiled = routeTable() as RegisteredRoute[] | null;
    const registered = (compiled && compiled.length > 0)
        ? compiled
        : globalThis.__pdx_routes as RegisteredRoute[] | undefined;
    if (!registered || registered.length === 0) return;

    for (const r of registered) routeConfigMap.set(r.path, r);

    const routes: RouteConfig[] = registered.map(r => ({
        path: r.path,
        component: () => document.createElement(r.tag),
        guard: r.guard,
        redirect: r.redirect,
        meta: r.meta,
        // Every field below must be carried by this map, and a field dropped here fails in silence.
        // Without `loader` the runtime's loader code — correct, and awaited on every navigation — is
        // unreachable: `currentLoaderData()` stays undefined forever and `currentLoaderState()`
        // never leaves 'idle'.
        loader: r.loader,
        // Without `scroll` the compiler's `@scroll 'top'` never reaches the restoration, and the
        // declaration does nothing at all.
        scroll: r.scroll,
        // And this one is what makes a route a PARENT rather than a sibling with a shared prefix.
        // Dropped here, every nested route would render flat and the nesting would silently not
        // happen — the same failure as the two above, which is why it is spelled out.
        hasOutlet: r.hasOutlet,
        // Without it the breadcrumb's trail is empty and the declaration does nothing.
        label: r.label,
        // The same warning: a key dropped here is a crumb that vanishes.
        labelKey: r.labelKey,
    }));

    // Read redirect table from __pdx_redirects
    const globalRedirects = globalThis.__pdx_redirects as { from: string; to: string }[] | undefined;

    // Guard-fail redirect is opt-in: by default a denied guard surfaces as a 403 error page
    // (reachable). An app that prefers redirecting on denial sets globalThis.__pdx_guard_redirect.
    //
    // A FUNCTION of the denied permission is the other accepted shape, and it is what an app with a
    // session needs: a denial has two causes, and only the app can tell a missing session (the
    // login) from a missing permission (the 403, where the refusal is).
    const guardFailRedirect = globalThis.__pdx_guard_redirect as
        string | ((permission: string) => string | null | undefined) | undefined;

    createRouter(routes, {
        redirects: globalRedirects,
        ...(guardFailRedirect ? { guardFailRedirect } : {}),
    });
    routerInitialized = true;

    // If we are on '/' and there is NO route for '/', go to the first one registered
    // (an app with no landing). If '/' IS a valid route (a landing, say), stay.
    const hasRootRoute = registered.some(r => r.path === '/');
    if (location.pathname === '/' && registered.length > 0 && !hasRootRoute) {
        navigate(registered[0].path);
    }
}

/**
 * The element a route renders.
 *
 * Not `route.config.component()` — a closure the outlet itself put on the RouteConfig it handed to
 * `createRouter`. That works only for a router whose table the outlet built, and the generated one
 * bakes its table in at build time, where a function cannot travel. What both routers do agree on
 * is the PATH, and `routeConfigMap` — built from `globalThis.__pdx_routes`, the same registration
 * in either mode — is what turns a path into a tag. The closure is the fallback for a route the map
 * does not know.
 */
function elementFor(route: ResolvedRoute): HTMLElement {
    const tag = routeConfigMap.get(route.config.path)?.tag;
    return tag ? document.createElement(tag) : (route.config.component() as HTMLElement);
}

/** The routed element and every component inside it that registered an onBeforeLeave guard. */
function leaveGuarded(element: HTMLElement): HTMLElement[] {
    const guarded: HTMLElement[] = element._beforeLeaveCallbacks?.length ? [element] : [];
    for (const el of element.querySelectorAll<HTMLElement>('*')) {
        if (el._beforeLeaveCallbacks?.length) guarded.push(el);
    }
    return guarded;
}

/**
 * Ask every onBeforeLeave guard of the page being left: the routed element's, then those of every
 * component inside it, in tree order. Asking only the routed element would leave a guard registered
 * by a child — a dialog on the page, an editor panel, a warnUnsaved form in either — dead. The
 * first refusal stops the walk, so two dirty forms ask one question; a 'destroy'
 * is kept, but a later refusal still wins over it.
 */
async function checkBeforeLeave(element: HTMLElement): Promise<boolean | 'destroy'> {
    let destroy = false;
    for (const el of leaveGuarded(element)) {
        for (const fn of el._beforeLeaveCallbacks ?? []) {
            const result = await fn();
            if (result === false) return false;
            if (result === 'destroy') destroy = true;
        }
    }
    return destroy ? 'destroy' : true;
}

// ─── Transition Helpers ─────────────────────────────────────────────

/** Animate exit on an element WITHOUT removing it from DOM (outlet manages removal). */
function animateExit(el: HTMLElement, animation?: string): Promise<void> {
    if (!animation) return Promise.resolve();

    el.classList.add(`pdx-${animation}`, 'pdx-exit-from');
    void el.offsetHeight;  // force reflow
    el.classList.remove('pdx-exit-from');
    el.classList.add('pdx-exit-active');

    return new Promise(resolve => {
        const handler = () => {
            el.classList.remove(`pdx-${animation}`, 'pdx-exit-active');
            el.removeEventListener('transitionend', handler);
            resolve();
        };
        el.addEventListener('transitionend', handler, { once: true });
        // Fallback timeout in case transitionend doesn't fire (no transition defined)
        setTimeout(() => {
            el.classList.remove(`pdx-${animation}`, 'pdx-exit-active');
            resolve();
        }, 500);
    });
}

/** Signal for current route params — provided to descendants via Context Protocol. */
export const routeParams = signal<Record<string, string>>({});

class PdxRouterOutlet extends HTMLElement {
    private _dispose: (() => void) | null = null;
    private _previousRoute: ResolvedRoute | null = null;

    /** The page this outlet is showing (the destroy-mode one; a kept page is in `_frozenPages`). */
    private _activeElement: HTMLElement | null = null;
    /** The «Loading...» of a lazy page whose chunk is in flight, while it stands in for the page. */
    private _placeholder: HTMLElement | null = null;
    /** The navigation's focus is owed to the page the placeholder stands in for. */
    private _focusOnArrival = false;
    /** Keep-alive frozen pages of THIS outlet: path → { fragment, element, timeout }. */
    private readonly _frozenPages = new Map<string, {
        fragment: DocumentFragment;
        element: HTMLElement;
        timeout?: ReturnType<typeof setTimeout>;
    }>();
    /** This outlet's active layout stack, outermost first. Only the root outlet builds one. */
    private readonly _layoutStack: LayoutInstance[] = [];

    /**
     * How many outlets are above this one. 0 = the root outlet.
     *
     * It is the index into `route.chain`: the root renders the outermost route, an outlet inside
     * that page renders the next one down. Read once on connect — an outlet does not move between
     * depths without being reconnected, and reading it per navigation would cost a DOM walk on
     * every route change.
     */
    private _depth = 0;

    /**
     * Monotonic navigation generation: async work (a lazy import) from a superseded navigation must
     * not clobber `_activeElement` after a newer one has started.
     *
     * Per outlet, not per module. Shared, a child outlet's navigation would bump the counter the
     * PARENT outlet had captured, and the parent's in-flight lazy import would be dropped as stale
     * when nothing about the parent had changed.
     */
    private _navGen = 0;
    /**
     * The route this outlet has COMMITTED to, written before anything is awaited.
     *
     * `_previousRoute` cannot answer "is this navigation already being handled?", because it is
     * only written after `checkBeforeLeave` has been awaited. A second resolution arriving in that
     * window would read the stale value, miss the same-route early return, and activate the page a
     * second time — one removal, two additions.
     *
     * Released back to the previous route on every exit that does NOT activate, so a refusal or a
     * pre-bootstrap call cannot leave the outlet believing it moved.
     */
    private _claimedRoute: ResolvedRoute | null = null;
    private _swipeDispose: (() => void) | null = null;
    private _name: string = ''; // empty = main outlet
    private _errorElement: HTMLElement | null = null;
    /** Bumped per view transition, so the end of an older one cannot strip a newer one's name. */
    private _vtToken = 0;
    /** The before-navigate hook that asks the page's leave guards; the main outlet's only. */
    private _leaveHookOff: (() => void) | null = null;
    /**
     * The page element the leave guards let go, and the destination they were asked about. A
     * route-level redirect (or a guard's redirect) runs the before-hooks again for the same
     * navigation, and asking twice would show "Unsaved changes" twice.
     */
    private _leaveApproved: { el: HTMLElement; to: string } | null = null;
    /** The route path whose frozen page a guard answered 'destroy' for, applied when it is left. */
    private _destroyOnLeave: string | null = null;

    static get observedAttributes() { return ['name']; }
    attributeChangedCallback(attr: string, _old: string, val: string) {
        if (attr === 'name') this._name = val ?? '';
    }

    connectedCallback() {
        this._name = this.getAttribute('name') ?? '';
        this._depth = this._measureDepth();
        this.style.display = 'block';
        // ⚠️ No view-transition-name here. An element with a view-transition-name is a STACKING
        // CONTEXT: set on connect and left there, every drawer or dialog declared inside a page
        // would have its z-index scoped inside the outlet, so any shell region with a z-index of its
        // own would paint above it — a drawer at 1000 under a header at 20. The name is applied
        // only for the duration of a transition, in `_withViewTransition`.
        injectTransitionCSS();
        injectViewTransitionCSS();

        // Only the ROOT outlet boots the router, owns the layouts, the swipe, the leave hook, the
        // routeParams context and the error page. An outlet nested inside a page is a level of the
        // same navigation, not a second router: it renders its level and nothing else.
        if (!this._name && this._depth === 0) {
            // Main outlet: manages pages, layouts, swipe nav
            this._setupSwipeNavigation();
            queueMicrotask(() => {
                autoInitRouter();
                routerBootstrapped = true;
                // The effect below already ran once, synchronously, before this microtask —
                // with no route table to resolve against. Resolve again now that there is
                // one. A route that resolved during autoInitRouter's own navigation is
                // caught by the same-path early return, so this never renders twice.
                this._handleRouteChange(this._levelRoute(currentRoute()));
            });
            // Provide routeParams to all descendants via hierarchical Context Protocol
            provide('routeParams', routeParams, this);
            // The page's leave guards are asked where onBeforeNavigate is: BEFORE the address is
            // written. Asked once the route has changed, the address bar would name the destination
            // while "Unsaved changes" is open, and a refusal would come back with a push.
            this._leaveHookOff = onBeforeNavigate((from, to, hop) => this._askLeave(from, to, hop));
        }

        this._dispose = effect(() => {
            const route = currentRoute();
            // A failed navigation leaves `currentRoute()` at null, so TWO failures in a row are
            // one unchanged signal and, subscribed to the route alone, this effect would not re-run:
            // the error page would keep the code and the URL of the FIRST one — a 403 reached from
            // a 404 would render "Page not found" for a page that exists but is forbidden, and the
            // path printed on the page would disagree with the address bar. So it subscribes to
            // the failure itself.
            //
            // Only while there is no route, though. `_path` and `_route` are set one after the
            // other and each set flushes, so a permanent dependency on the path would run this
            // effect once with the NEW path and the OLD route, and the outlet would ask
            // onBeforeLeave twice for a single navigation. In the null state there is no route to
            // be inconsistent with.
            if (!route) { currentNavError(); currentNavErrorDepth(); currentPath(); }
            if (this._name) {
                this._handleNamedOutletChange(route);
            } else {
                this._handleRouteChange(this._levelRoute(route));
            }
        });
    }

    /**
     * How many unnamed outlets are above this one.
     *
     * Only unnamed ones count: a named outlet is a PARALLEL region at the same URL
     * (`_handleNamedOutletChange`), not a level of the path, so a page inside one is still at the
     * depth of the outlet that page's route was matched at.
     */
    private _measureDepth(): number {
        let depth = 0;
        for (let el = this.parentElement; el; el = el.parentElement) {
            if (el.tagName === 'PDX-ROUTER-OUTLET' && !el.getAttribute('name')) depth++;
        }
        return depth;
    }

    /**
     * The level of the matched chain that THIS outlet renders, or null when the chain does not
     * reach this deep — a bare `/tickets/1` under an outlet expecting a child.
     *
     * A flat route is a chain of one, so the root outlet gets exactly what it got before and no
     * path through `_handleRouteChange` had to learn about nesting. The one thing that follows from
     * keying on the level: `/tickets/1/interventions/2` → `/tickets/1/interventions/3` is the SAME
     * route for the root outlet, so its existing same-path early return leaves the parent mounted.
     * That is the whole value of nesting, and it comes for free.
     */
    private _levelRoute(route: ResolvedRoute | null): ResolvedRoute | null {
        if (!route) return null;
        const chain = route.chain ?? [route.config];
        const config = chain[this._depth];
        if (!config) return null;
        return config === route.config ? route : { ...route, path: config.path, config };
    }

    disconnectedCallback() {
        this._dispose?.();
        this._dispose = null;
        this._leaveHookOff?.();
        this._leaveHookOff = null;
        this._swipeDispose?.();
        this._swipeDispose = null;
        for (const [, entry] of this._frozenPages) {
            if (entry.timeout) clearTimeout(entry.timeout);
        }
        this._frozenPages.clear();
    }

    /**
     * The before-navigate hook: ask the leave guards of the page on show, before the address moves.
     * A refusal is the router's to handle — a link never writes the address, a Back is put back
     * with `replace` — the same path an `onBeforeNavigate` refusal takes.
     *
     * Asked whenever the PATH changes: a query or hash change keeps the page. A parameter change on
     * the same route (`/owners/1` → `/owners/2`) asks too, because the router cannot say which
     * route a path resolves to before it resolves it.
     *
     * Nothing to ask answers `true` synchronously, and the router does not await a boolean: a
     * promise here on every navigation would defer the resolution of pages with no guard at all,
     * and a page resolved a second time after it has mounted can lose what it rendered.
     */
    private _askLeave(from: string, to: string, hop?: NavigationHop): boolean | Promise<boolean> {
        if (from === to) return true;
        const prevRoute = this._previousRoute;
        if (!prevRoute) return true;
        const el = this._activeElement || this._frozenPages.get(prevRoute.config.path)?.element;
        if (!el || leaveGuarded(el).length === 0) return true;

        // The same navigation, on another hop of itself: asked once per GESTURE, not once per
        // destination the router tries. A redirect table entry, a route's own `redirect` and a
        // denied guard all ask again with a new target, and a dialog that appears twice for one
        // click is the same dialog appearing wrongly.
        //
        // The router says which hop this is. Inferring it from the address bar —
        // `location.pathname.endsWith(approved.to)` — holds only while the router leaves the
        // address on the source path through a redirect: the interpreted router does, the
        // generated one moves it, so a production build would ask twice and dev once.
        // `redirected` is a fact the router has and the address bar is not.
        const approved = this._leaveApproved;
        if (hop?.redirected && approved && approved.el === el) return true;

        return checkBeforeLeave(el).then((result) => {
            if (result === false) {
                this._leaveApproved = null;
                return false;
            }
            this._leaveApproved = { el, to };
            this._destroyOnLeave = result === 'destroy' ? prevRoute.config.path : null;
            return true;
        });
    }

    private async _handleRouteChange(route: ResolvedRoute | null): Promise<void> {
        const prevRoute = this._previousRoute;

        // Everything below this point may await, so the "am I already on this route?" question has
        // to be answered against a value written HERE, synchronously. `_previousRoute` is written
        // after the await and is therefore stale for anything that starts in between. Before the
        // first claim it is `_previousRoute`.
        const claimed = this._claimedRoute ?? prevRoute;
        this._claimedRoute = route;

        // Same route, check param changes
        if (claimed && route && claimed.config.path === route.config.path) {
            if (JSON.stringify(claimed.params) !== JSON.stringify(route.params)) {
                // Update provided routeParams signal (reactive, cascades to all descendants)
                routeParams.set(route.params);
                const el = this._activeElement || this._frozenPages.get(claimed.config.path)?.element;
                if (el) {
                    // The attributes follow the params, not only the event.
                    //
                    // Run only at activation, `_applyParams` would leave the page that stays
                    // across a param change with the attribute it mounted with: `@prop id` would
                    // read 7 while `currentParams()` says 9. Rare on a flat route — you seldom
                    // look at a param twice on the same page — and constant with nested routes,
                    // where moving between siblings is the whole gesture.
                    this._applyParams(el, route.params);
                    el.dispatchEvent(new CustomEvent('pdx-route-change', {
                        detail: route.params, bubbles: false,
                    }));
                }
            }
            this._previousRoute = route;
            return;
        }

        // Bump generation: any in-flight async activation from an earlier call is now stale.
        //
        // AFTER the same-route return. As the first statement of this method, a second
        // notification for the route already being activated would invalidate that activation's
        // own lazy import: the module arrives, finds `gen !== this._navGen`, removes its
        // placeholder and mounts nothing. The outlet stays empty for good, with no error and
        // nothing in the console.
        //
        // It is reachable whenever two flushes land for one route while its chunk is still in
        // flight, and a guard denial redirecting makes it certain: the router sets the path and the
        // route index either side of an await, so the target route is notified twice. A call that
        // returns above has started no activation and must therefore invalidate none.
        this._navGen++;

        // The page's leave guards were asked before the address moved (`_askLeave`), so a route
        // change reaching here was let through. What is left of their answer is 'destroy': the page
        // is deactivated as a page that is not kept. It is passed to `_deactivate`, not applied
        // here as `_destroyFrozen(path)`: before `_deactivate` there is no frozen entry yet, and the
        // page would then be frozen as if the guard had said `true`.
        const destroyPrev = !!prevRoute && this._destroyOnLeave === prevRoute.config.path;
        this._destroyOnLeave = null;
        this._leaveApproved = null;

        // Before the route table exists, NOTHING here is renderable — and that is true of a matched
        // route as much as of a null one. A null route is not "no such page" yet, only "not resolved
        // yet", and rendering a 404 for it would put a spurious one on screen on every hard load. A
        // matched route is worse: `routeConfigMap` is what turns it into an element, so activating
        // before the table lands produces nothing while still marking the route as handled, and the
        // second resolution takes the same-path early return. That is a page that stays blank
        // forever, and the generated router reaches it on every hard load — it resolves the URL
        // when it is IMPORTED, so the effect's first synchronous run already has a route.
        //
        // The microtask in connectedCallback resolves again the moment the table lands.
        if (!routerBootstrapped) {
            // Nothing was rendered, and connectedCallback's microtask calls this again with the
            // SAME route the moment the table lands. Holding the claim would make that second call
            // take the same-route early return and leave the page blank forever — the failure the
            // comment above describes, from the other side.
            this._claimedRoute = prevRoute;
            return;
        }

        this._previousRoute = route;
        // Update provided routeParams signal for new route
        routeParams.set(route?.params ?? {});
        if (!route) {
            if (prevRoute) await this._deactivate(prevRoute.config.path, destroyPrev);
            this._teardownLayouts(0);
            // A nested outlet with no level of its own simply empties: `/tickets/1` under a parent
            // that expects a child is the parent alone, which is what a bare parent URL means —
            // not a 404.
            //
            // Except when the level that would have gone here was REFUSED. A guard denies one level
            // of the chain; the levels above it were allowed and keep rendering, and the refusal
            // belongs to the outlet the denied level would have used — the tab is refused, the page
            // stays. `currentNavErrorDepth()` is the level the runtime denied at, and it is 0 for a
            // 404 and for a denial with nothing allowed above it, which is the whole-page
            // behaviour of a flat route.
            const refusedHere = currentNavError() === '403' && currentNavErrorDepth() === this._depth;
            if (this._depth > 0 && !refusedHere) return;
            // 403 (guard denied) vs 404 (no match) — the runtime tells us which.
            this._showErrorPage(currentNavError() ?? '404', location.pathname);
            this._focusActive(); // error page self-announces via role="alert"
            return;
        }

        // A real route is taking over: the error page goes, whatever `activeElement`
        // happens to point at. Unconditional — an error page is reachable from a matched
        // route too (a guard denial), so `!prevRoute` is not the right condition.
        this._clearErrorPage();

        // Clean up stale elements (e.g. 404 page from initial null route)
        if (!prevRoute && this._activeElement) {
            this._activeElement.remove();
            this._activeElement = null;
        }

        // Layout diff: reuse common layouts, destroy/create divergent ones.
        // Layouts are the root outlet's: a nested level renders into its parent's page, and the
        // shell around that page was already built one level up.
        const newConfig = routeConfigMap.get(route.config.path);
        const newLayouts = this._depth === 0 ? (newConfig?.layouts ?? []) : [];
        this._diffLayouts(newLayouts);

        // Use View Transitions API for smooth cross-fade/slide (baseline 2024)
        const hasTransition = prevRoute && routeConfigMap.get(prevRoute.config.path)?.transition;
        if (hasTransition && 'startViewTransition' in document) {
            this._withViewTransition(() => {
                if (prevRoute) this._deactivateImmediate(prevRoute.config.path, destroyPrev);
                this._activateImmediate(route);
            });
        } else {
            if (prevRoute) await this._deactivate(prevRoute.config.path, destroyPrev);
            await this._activate(route);
        }

        // A11y: move focus to the new page and announce the navigation so
        // keyboard/screen-reader users aren't stranded on the previous focus (WCAG 2.4.3).
        //
        // Once per navigation, from the root: a nested level would move the focus a second time,
        // landing it on the child rather than on the page the user navigated to, and announce the
        // same title twice.
        if (this._depth > 0) return;
        this._focusActive();
        announce(document.title || route.config.path);
    }

    /**
     * Run `update` as a view transition, with the outlet named for exactly as long as it runs.
     *
     * The name must be present when the transition starts (the old snapshot is taken then) and until
     * it finishes (the new one), and absent otherwise — see the note in `connectedCallback`. It is
     * removed whether `finished` fulfils or rejects (a skipped transition rejects), and only by the
     * transition that set it: a newer one started meanwhile keeps its name.
     */
    private _withViewTransition(update: () => void): void {
        const token = ++this._vtToken;
        this.style.setProperty('view-transition-name', this._name ? `pdx-outlet-${this._name}` : 'pdx-page');
        const transition = document.startViewTransition!(update);
        const clear = () => {
            if (token === this._vtToken) this.style.removeProperty('view-transition-name');
        };
        if (transition?.finished) transition.finished.then(clear, clear);
        else clear();
    }

    /** Make the active page programmatically focusable and move focus to it. */
    private _focusActive(): void {
        const el = this._activeElement;
        if (!el || typeof el.focus !== 'function') return;
        // A lazy page still in flight: its placeholder is not the page. Focusing it would draw the
        // browser's focus ring round «Loading...» and lose the focus to <body> when the page
        // replaces it; the page takes it when it arrives instead.
        if (el === this._placeholder) { this._focusOnArrival = true; return; }
        // The root outlet shows a page — or its refusal: either way the app has its first screen.
        firstPageShown();
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
        // `focusVisible: false`: the focus is moved for assistive technology and for the next Tab,
        // not to draw the browser's ring round a whole page. In Chromium, without it, a
        // programmatically focused page matches `:focus-visible` and the design system outlines
        // it. A browser without the option ignores it and draws the ring. The type is
        // widened here because TypeScript's `lib.dom` does not list the option yet.
        const options: FocusOptions & { focusVisible?: boolean } = { preventScroll: true, focusVisible: false };
        el.focus(options);
    }

    /**
     * Deactivate without CSS animation (used when View Transitions API handles the visual).
     * `destroy`: a leave guard answered 'destroy', so a keep-alive page is not kept.
     */
    private _deactivateImmediate(path: string, destroy = false): void {
        const config = routeConfigMap.get(path);
        const isKeepAlive = !destroy && config?.keepAlive !== undefined && config.keepAlive !== false;

        if (isKeepAlive && this._activeElement) {
            const fragment = document.createDocumentFragment();
            this._activeElement._keepAlive = true;
            fragment.appendChild(this._activeElement);
            this._frozenPages.set(path, { fragment, element: this._activeElement });
            this._activeElement = null;
            if (typeof config.keepAlive === 'number' && config.keepAlive > 0) {
                const entry = this._frozenPages.get(path)!;
                entry.timeout = setTimeout(() => this._destroyFrozen(path), config.keepAlive);
            }
        } else if (this._activeElement) {
            discard(this._activeElement);
            this._activeElement = null;
        }
    }

    /** `destroy`: a leave guard answered 'destroy', so a keep-alive page is not kept. */
    private async _deactivate(path: string, destroy = false): Promise<void> {
        const config = routeConfigMap.get(path);
        const isKeepAlive = !destroy && config?.keepAlive !== undefined && config.keepAlive !== false;
        const { exit: exitAnim } = resolveTransition(config?.transition);

        if (isKeepAlive && this._activeElement) {
            // Exit animation before freezing
            if (exitAnim) await animateExit(this._activeElement, exitAnim);

            // Freeze: move to DocumentFragment (disconnects from DOM)
            const fragment = document.createDocumentFragment();
            this._activeElement._keepAlive = true;
            fragment.appendChild(this._activeElement);
            this._frozenPages.set(path, { fragment, element: this._activeElement });
            this._activeElement = null;

            // Start auto-destroy timer if keepAlive has timeout
            if (typeof config.keepAlive === 'number' && config.keepAlive > 0) {
                const entry = this._frozenPages.get(path)!;
                entry.timeout = setTimeout(() => {
                    this._destroyFrozen(path);
                }, config.keepAlive);
            }
        } else if (this._activeElement) {
            // Exit animation before destroying
            if (exitAnim) await animateExit(this._activeElement, exitAnim);

            // Destroy: remove from DOM (full disconnectedCallback cleanup)
            discard(this._activeElement);
            this._activeElement = null;
        }
    }

    private _destroyFrozen(path: string): void {
        const entry = this._frozenPages.get(path);
        if (!entry) return;
        if (entry.timeout) clearTimeout(entry.timeout);
        // Set _keepAlive to false so disconnectedCallback does full cleanup (dispose effects/subs).
        entry.element._keepAlive = false;
        // The element lives in a DocumentFragment (already disconnected), so removing it
        // from the DOM would NOT re-fire disconnectedCallback — its disposers would leak.
        // Invoke the CE lifecycle explicitly to run full teardown, then detach from the fragment.
        (entry.element as { disconnectedCallback?: () => void }).disconnectedCallback?.();
        entry.element.remove();
        this._frozenPages.delete(path);
    }

    /** Synchronous activate — no CSS animation. Used inside View Transition callback. */
    private _activateImmediate(route: ResolvedRoute): void {
        const path = route.config.path;
        const config = routeConfigMap.get(path);
        const container = this._getPageContainer();

        const frozen = this._frozenPages.get(path);
        if (frozen) {
            if (frozen.timeout) { clearTimeout(frozen.timeout); frozen.timeout = undefined; }
            container.appendChild(frozen.element);
            this._activeElement = frozen.element;
            this._frozenPages.delete(path);
            this._applyParams(frozen.element, route.params);
            return;
        }

        const element = elementFor(route);
        if (config?.keepAlive !== undefined && config.keepAlive !== false) {
            element._keepAlive = true;
        }
        container.appendChild(element);
        this._activeElement = element;
        this._applyParams(element, route.params);
    }

    private async _activate(route: ResolvedRoute): Promise<void> {
        const path = route.config.path;
        const config = routeConfigMap.get(path);
        const { enter: enterAnim } = resolveTransition(config?.transition);
        const container = this._getPageContainer();

        // Check frozen cache first (resume from freeze)
        const frozen = this._frozenPages.get(path);
        if (frozen) {
            if (frozen.timeout) {
                clearTimeout(frozen.timeout);
                frozen.timeout = undefined;
            }
            container.appendChild(frozen.element);
            this._activeElement = frozen.element;
            this._frozenPages.delete(path);
            this._applyParams(frozen.element, route.params);
            if (enterAnim) await enter(frozen.element, enterAnim);
            return;
        }

        // Lazy loading — only if CE is NOT already registered (eagerly imported in index.html)
        if (config?.lazy && config.file && !customElements.get(config.tag)) {
            const gen = this._navGen; // capture: a newer navigation invalidates this import result
            // The stand-in, on the design system's tokens (`injectPlaceholderCSS`) and HIDDEN for
            // its first `LOADING_DELAY_MS`: a chunk that arrives sooner is never announced by a
            // flash of «Loading...», and while the start-up splash is up it is the loading state,
            // so this one is not drawn at all. Its text is there from the start, for a
            // reader who asks what the outlet holds.
            injectPlaceholderCSS();
            const placeholder = document.createElement('div');
            placeholder.className = 'pdx-route-loading';
            placeholder.setAttribute('role', 'status');
            placeholder.textContent = routerString('loading');
            placeholder.hidden = true;
            const reveal = setTimeout(() => {
                if (placeholder.isConnected && !isSplashUp()) placeholder.hidden = false;
            }, LOADING_DELAY_MS);
            container.appendChild(placeholder);
            this._activeElement = placeholder;
            this._placeholder = placeholder;
            this._focusOnArrival = false;

            // The generated router's literal `import()` when there is one, the runtime string
            // otherwise. The literal is what makes the page its own chunk: `/* @vite-ignore */`
            // tells Rollup not to look at the specifier, so on its own it produces no split at all
            // and every page stays in the entry. The fallback keeps dev working, where the page is
            // already imported and this branch is never reached.
            //
            // A load a prefetch already started is AWAITED, not repeated: a second `import()` does
            // not wait for the stylesheet the first one is fetching, and the page would paint
            // unstyled and then move (`prefetchedLoad`).
            const prefetched = prefetchedLoad(route.path);
            const load = prefetched
                ? () => prefetched
                : pageModule(route.path) ?? (() => import(/* @vite-ignore */ config.file!));
            load().then(async () => {
                clearTimeout(reveal);
                // Superseded while importing: drop the result. Don't mount, don't clobber
                // activeElement (a newer page now owns it). Remove our stale placeholder.
                if (gen !== this._navGen) {
                    placeholder.remove();
                    if (this._placeholder === placeholder) this._placeholder = null;
                    return;
                }
                const element = document.createElement(config.tag);
                if (config.keepAlive !== undefined && config.keepAlive !== false) {
                    element._keepAlive = true;
                }
                placeholder.replaceWith(element);
                this._activeElement = element;
                this._placeholder = null;
                this._applyParams(element, route.params);
                // The focus the navigation owed this page — unless the reader has put it somewhere
                // since, which is theirs to keep.
                if (this._focusOnArrival) {
                    this._focusOnArrival = false;
                    const active = document.activeElement;
                    if (!active || active === document.body) this._focusActive();
                }
                firstPageShown();
                if (enterAnim) await enter(element, enterAnim);
            }).catch((err: Error) => {
                clearTimeout(reveal);
                if (gen !== this._navGen) {
                    placeholder.remove();
                    if (this._placeholder === placeholder) this._placeholder = null;
                    return;
                }
                // Surface the failure both visually (accessible) and in the console — at once, not
                // after the delay, and over the splash's head: the app is as ready as it will be.
                placeholder.setAttribute('role', 'alert');
                placeholder.textContent = routerString('loadFailed').replace('{message}', String(err.message));
                placeholder.classList.add('pdx-route-error');
                placeholder.hidden = false;
                console.error(`[pdx-router] Lazy load failed for ${config.file}:`, err);
                firstPageShown();
            });
            return;
        }

        // Eager: create element directly
        const element = elementFor(route);
        if (config?.keepAlive !== undefined && config.keepAlive !== false) {
            element._keepAlive = true;
        }
        container.appendChild(element);
        this._activeElement = element;
        this._applyParams(element, route.params);
        if (enterAnim) await enter(element, enterAnim);
    }

    private _applyParams(element: HTMLElement, params: Record<string, string>): void {
        if (!params) return;
        for (const [k, v] of Object.entries(params)) {
            element.setAttribute(k, v);
        }
    }

    // ─── Swipe Navigation ─────────────────────────────────────────

    /** Enable swipe-left to go back in browser history. */
    private _setupSwipeNavigation(): void {
        let startX = 0;
        let startY = 0;
        let startTime = 0;

        const onDown = (e: PointerEvent) => {
            startX = e.clientX; startY = e.clientY; startTime = Date.now();
        };
        const onUp = (e: PointerEvent) => {
            if (Date.now() - startTime > 300) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 80) {
                if (dx > 0 && history.length > 1) {
                    // Swipe right → navigate back
                    history.back();
                }
            }
        };
        this.addEventListener('pointerdown', onDown);
        this.addEventListener('pointerup', onUp);
        this._swipeDispose = () => {
            this.removeEventListener('pointerdown', onDown);
            this.removeEventListener('pointerup', onUp);
        };
    }

    // ─── Named Outlet (parallel) ─────────────────────────────────

    /**
     * Handle route change for a NAMED outlet.
     * Looks for @outlet declarations in the matched route's config.
     * Renders the assigned component, or clears if no assignment.
     */
    private _handleNamedOutletChange(route: ResolvedRoute | null): void {
        const config = route ? routeConfigMap.get(route.config.path) : null;
        const outlets = config?.outlets;
        const assignment = outlets?.find(o => o.name === this._name);

        if (assignment) {
            // Both decisions below are about what THIS outlet is showing, so both read
            // `_namedElement`, not the MAIN outlet's page: compared against the page, the reuse
            // check would skip a render whenever the two share a tag and never skip the rebuild
            // it is for, and a removal guarded by `parentNode === this` is false for a page that
            // lives in another outlet — so nothing would ever be removed, and each new assignment
            // would pile up beside the first.
            const current = this._namedElement;
            if (current?.tagName.toLowerCase() === assignment.tag) return;
            if (current) current.remove();
            // Create and append the named outlet component
            const el = document.createElement(assignment.tag);
            this.appendChild(el);
            // Track per-instance (named outlets don't use module-level activeElement)
            this._namedElement = el;
        } else {
            // No assignment for this outlet in current route — clear
            const el = this._namedElement;
            if (el) { el.remove(); this._namedElement = null; }
        }
    }

    // ─── Error Pages ──────────────────────────────────────────────

    /**
     * Show an error page for a given status code.
     * Looks for registered error page CE tags in __pdx_error_pages,
     * falls back to a default inline error display.
     */
    private _showErrorPage(code: string, path: string): void {
        // An error page REPLACES what is showing, error pages included. Tracked per-outlet
        // because a single shared slot would let a second error render overwrite the pointer to
        // the first, and nothing could reclaim it afterwards — the orphan would stay in the DOM
        // through every later navigation.
        this._clearErrorPage();

        // Look for registered error page components
        const errorPages = globalThis.__pdx_error_pages as Record<string, string> | undefined;
        const tag = errorPages?.[code];

        if (tag && customElements.get(tag)) {
            const el = document.createElement(tag);
            el.setAttribute('code', code);
            el.setAttribute('path', path);
            this.appendChild(el);
            this._errorElement = el;
            this._activeElement = el;
            return;
        }

        // Default fallback: inline error display
        const el = document.createElement('div');
        // A11y: role="alert" so screen readers announce the error; labelled for context.
        el.setAttribute('role', 'alert');
        const headline = code === '404'
            ? routerString('notFound')
            : routerString('error').replace('{code}', code);
        el.setAttribute('aria-label', headline);
        el.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;';
        el.innerHTML = `
            <h1 style="font-size:4rem;margin:0;opacity:.3">${code}</h1>
            <p style="font-size:1.2rem;margin:16px 0 0;opacity:.6"></p>
            <p style="opacity:.4;margin:8px 0 0"><code></code></p>
            <a href="/" style="margin-top:24px;color:inherit"></a>
        `;
        // Through textContent, not innerHTML: a translation is consumer-supplied text, and it is
        // handled the same way the (attacker-controllable) path below already is.
        const _headEl = el.querySelector('p');
        if (_headEl) _headEl.textContent = headline;
        const _homeEl = el.querySelector('a');
        if (_homeEl) _homeEl.textContent = routerString('backHome');
        // `path` is the live URL (attacker-controllable) → inject via textContent, never innerHTML.
        const _codeEl = el.querySelector('code');
        if (_codeEl) _codeEl.textContent = path;
        this.appendChild(el);
        this._errorElement = el;
        this._activeElement = el;
    }

    /** Remove the error page this outlet is showing, if any. */
    private _clearErrorPage(): void {
        if (!this._errorElement) return;
        this._errorElement.remove();
        if (this._activeElement === this._errorElement) this._activeElement = null;
        this._errorElement = null;
    }

    // ─── Layout Management ──────────────────────────────────────────

    /** Get the container where pages should be appended (innermost layout or this outlet). */
    private _getPageContainer(): HTMLElement {
        if (this._layoutStack.length === 0) return this;
        // The host the layout projected into its slot — see `LayoutInstance.host`.
        return this._layoutStack[this._layoutStack.length - 1].host;
    }

    /**
     * Diff layout stacks: reuse common prefix, destroy/create divergent suffix.
     * Example: old=['pdx-layout','pdx-admin'] new=['pdx-layout','pdx-settings']
     *   → keep pdx-layout, destroy pdx-admin, create pdx-settings
     */
    private _diffLayouts(newLayouts: string[]): void {
        const oldTags = this._layoutStack.map(l => l.tag);

        // Find divergence point
        let divergeIdx = 0;
        while (divergeIdx < oldTags.length && divergeIdx < newLayouts.length
               && oldTags[divergeIdx] === newLayouts[divergeIdx]) {
            divergeIdx++;
        }

        // Tear down from divergeIdx onwards (reverse order)
        this._teardownLayouts(divergeIdx);

        // Build new layouts from divergeIdx onwards
        for (let i = divergeIdx; i < newLayouts.length; i++) {
            const tag = newLayouts[i];
            const element = document.createElement(tag);
            element.style.display = 'contents';

            // The page host goes in BEFORE the layout connects: its render captures it and projects
            // it into the slot, and it is the one stable place pages are put from then on.
            const host = document.createElement('div');
            host.setAttribute('data-pdx-layout-host', tag);
            host.style.display = 'contents';
            element.appendChild(host);

            // Nest inside the previous layout's host, or this outlet
            const parent = i === 0 ? this as HTMLElement : this._layoutStack[i - 1].host;
            parent.appendChild(element);
            // A layout that drew a `<slot>` synchronously and does not project (plain HTML, a
            // hand-written element) left the host beside it: the host goes in.
            const slot = element.querySelector('slot');
            if (slot && !slot.contains(host)) slot.appendChild(host);

            this._layoutStack.push({ tag, element, host });
        }
    }

    /** Remove layout instances from index onwards (reverse order). */
    private _teardownLayouts(fromIndex: number): void {
        for (let i = this._layoutStack.length - 1; i >= fromIndex; i--) {
            this._layoutStack[i].element.remove();
        }
        this._layoutStack.length = fromIndex;
    }
}

// ─── The start-up splash and the page placeholder ─────────

/** How long a lazy page's placeholder stays hidden: a chunk that arrives sooner never flashes it. */
const LOADING_DELAY_MS = 300;

/**
 * The splash leaves once the root outlet has shown its first screen — a page, or the refusal of one.
 * Handed to the splash when this module is evaluated, which is before the document's `load`: the
 * entry imports the router.
 */
let firstPageShown: () => void = () => {};
if (typeof document !== 'undefined') splashReady(new Promise<void>((resolve) => { firstPageShown = resolve; }));

let placeholderCssInjected = false;
/** The placeholder's look, on the design system's tokens, with a fallback where there is none. */
function injectPlaceholderCSS(): void {
    if (placeholderCssInjected || typeof document === 'undefined') return;
    placeholderCssInjected = true;
    const style = document.createElement('style');
    style.textContent = `
.pdx-route-loading { display: flex; align-items: center; justify-content: center; padding: var(--pdx-space-3xl, 40px); color: var(--pdx-color-muted, GrayText); }
.pdx-route-loading[hidden] { display: none; }
.pdx-route-loading.pdx-route-error { color: var(--pdx-color-danger-ink, #b3261e); }
`;
    document.head.appendChild(style);
}

// ─── View Transition CSS ────────────────────────────────────────────
let vtCssInjected = false;
function injectViewTransitionCSS(): void {
    if (vtCssInjected || typeof document === 'undefined') return;
    vtCssInjected = true;
    const style = document.createElement('style');
    style.textContent = `
/* Only animate the outlet, not navbar/footer */
::view-transition-old(pdx-page) { animation: pdx-vt-out 150ms ease both; }
::view-transition-new(pdx-page) { animation: pdx-vt-in 150ms ease both; }
::view-transition-old(root),
::view-transition-new(root) { animation: none; }
@keyframes pdx-vt-out { to { opacity: 0; transform: translateX(-20px); } }
@keyframes pdx-vt-in { from { opacity: 0; transform: translateX(20px); } }
`;
    document.head.appendChild(style);
}

if (typeof customElements !== 'undefined') {
    customElements.define('pdx-router-outlet', PdxRouterOutlet);
}

export { PdxRouterOutlet };
