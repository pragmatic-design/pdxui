// <pdx-link> — declarative navigation link with prefetch and active state.
//
// Usage:
//   <pdx-link to="/dashboard">Dashboard</pdx-link>
//   <pdx-link to="/users/:id" params='{"id":"42"}'>User</pdx-link>
//   <pdx-link to="/settings" prefetch="never" active-class="current">Settings</pdx-link>
//
// Features:
//   - Calls navigate() on click (SPA navigation, no full reload)
//   - `active-class` applied when currentPath matches `to`
//   - Fetches the target route's chunk on hover, focus or pointerdown — see ./prefetch — and,
//     for a `viewport` route, when the link scrolls into view. The ROUTE's `@prefetch` decides
//     the policy; `prefetch="never"` here is a local override.
//   - Renders as <a> for accessibility + SEO (right-click → open in new tab)

import { effect, sanitizeUrl } from '@pdxui/core';
import { navigate, currentPath } from './active';
import { prefetchRoute, policyFor, whenInView } from './prefetch';

class PdxLink extends HTMLElement {
    private _dispose: (() => void) | null = null;
    private _unwatch: (() => void) | null = null;
    private _prefetchDone = false;

    static get observedAttributes() { return ['to', 'active-class', 'exact']; }

    /**
     * `to` as a PROPERTY, reflected to the attribute.
     *
     * Everything below reads `getAttribute('to')`, which is right for `<pdx-link to="/about">`.
     * A template binding like `:to="'/tickets/' + id"` sets the PROPERTY, and without the
     * reflection the attribute would stay empty: the anchor would keep `href="#"`, the click
     * handler would find no `to` and return, and a link whose target is computed — a row in a
     * list, a tab, any detail link there is — would do nothing at all.
     *
     * Reflecting keeps one source of truth: the attribute. `attributeChangedCallback` then
     * updates the href, and the active-class effect re-reads it, with no second code path.
     */
    get to(): string { return this.getAttribute('to') ?? ''; }
    set to(value: string) {
        if (value === null || value === undefined) this.removeAttribute('to');
        else this.setAttribute('to', String(value));
    }

    /**
     * `exact` reflects for the same reason `to` does: a template binding writes the PROPERTY, this
     * element reads `hasAttribute('exact')`, and without the reflection an exact link to `/` would
     * match every path — `/` is a prefix of everything — and be highlighted on every screen.
     */
    get exact(): boolean { return this.hasAttribute('exact'); }
    set exact(value: boolean) {
        if (value) this.setAttribute('exact', '');
        else this.removeAttribute('exact');
    }

    connectedCallback() {
        // A property set BEFORE the upgrade is an own property, and it hides the accessor above.
        // That is the ordinary case, not an edge one: a template binding writes `el.to = …` while
        // the element is still an unknown tag, so the setter never runs, the attribute is never
        // written, and the link stays dead. `component.ts` does this for every PDX component;
        // this element is hand-written and has to do it itself.
        for (const name of ['to', 'exact'] as const) {
            const own = Object.getOwnPropertyDescriptor(this, name);
            if (!own || !('value' in own)) continue;
            delete (this as unknown as Record<string, unknown>)[name];
            (this as unknown as Record<string, unknown>)[name] = own.value;
        }

        // Render as <a> for a11y if not already wrapped
        if (!this.querySelector('a')) {
            const a = document.createElement('a');
            a.href = sanitizeUrl(this.getAttribute('to')) ?? '#';
            while (this.firstChild) a.appendChild(this.firstChild);
            this.appendChild(a);
            this.style.display = 'contents';
        }

        this.addEventListener('click', this._onClick);

        // The three signals that a navigation is about to happen. Hover is the obvious
        // one, focus is the keyboard's, and `pointerdown` is the only one a touch device gives —
        // it fires before `click`, which is the whole margin there is on a phone. `prefetchRoute`
        // is idempotent per route, so registering all three costs one fetch, not three.
        //
        // No `prefetch="hover"` attribute is needed: the ROUTE's `@prefetch` decides, and
        // the attribute is kept as a local override — `prefetch="never"` on a link the page draws
        // a hundred times, or one nobody is expected to follow.
        if (this.getAttribute('prefetch') !== 'never') {
            this.addEventListener('pointerenter', this._onPrefetchSignal);
            this.addEventListener('focusin', this._onPrefetchSignal);
            this.addEventListener('pointerdown', this._onPrefetchSignal);
            this._applyPrefetchPolicy();
        }

        // Active class tracking. The effect follows the PATH; `attributeChangedCallback` follows
        // `to`, because a template binding writes it after the element is connected and on a deep
        // link the path never moves afterwards — the link a visitor arrived at would never be marked.
        if (this.getAttribute('active-class')) {
            this._dispose = effect(() => {
                currentPath();
                this._applyActiveClass();
            });
        }
    }

    disconnectedCallback() {
        this.removeEventListener('click', this._onClick);
        this.removeEventListener('pointerenter', this._onPrefetchSignal);
        this.removeEventListener('focusin', this._onPrefetchSignal);
        this.removeEventListener('pointerdown', this._onPrefetchSignal);
        this._unwatch?.();
        this._unwatch = null;
        this._dispose?.();
        this._dispose = null;
    }

    /**
     * What the target route's `@prefetch` asks of this link beyond hover, focus and press.
     *
     * `eager` means "with the route that links to it": fetch now, not on a signal. `viewport`
     * means "once this link is seen": a link far down a long page costs nothing until the visitor
     * scrolls to it. Run at connect time AND when `to` changes: a bound `:to` is written after the
     * element connects, and read only at connect time the policy was always `hover`.
     */
    private _applyPrefetchPolicy(): void {
        this._unwatch?.();
        this._unwatch = null;
        if (!this.isConnected || this._prefetchDone || this.getAttribute('prefetch') === 'never') return;
        const policy = policyFor(sanitizeUrl(this.getAttribute('to')) ?? '');
        if (policy === 'eager') this._onPrefetchSignal();
        // The anchor, not this element: the host is `display: contents`, has no box, and an
        // IntersectionObserver never reports it as intersecting.
        else if (policy === 'viewport') this._unwatch = whenInView(this.querySelector('a') ?? this, this._onPrefetchSignal);
    }

    /**
     * Mark, or unmark, this link as the one the visitor is on.
     *
     * Boundary-aware: '/dash' must NOT light up on '/dashboard'.
     */
    private _applyActiveClass(): void {
        const activeClass = this.getAttribute('active-class');
        if (!activeClass) return;
        const current = currentPath();
        const to = this.getAttribute('to') ?? '';
        const isActive = this.hasAttribute('exact')
            ? current === to
            : current === to || current.startsWith(to.endsWith('/') ? to : to + '/');
        this.classList.toggle(activeClass, isActive);
        // And to a screen reader, on the anchor it lands on: `page` for the link to the
        // page itself, `true` for one active because the page is below it — which is not the page.
        const a = this.querySelector('a');
        if (a) {
            if (!isActive) a.removeAttribute('aria-current');
            else a.setAttribute('aria-current', current === to ? 'page' : 'true');
        }
    }

    attributeChangedCallback(name: string) {
        // `exact` changes what the active state MEANS, so it re-applies it too.
        if (name === 'exact') this._applyActiveClass();
        if (name === 'to') {
            const a = this.querySelector('a');
            if (a) a.href = sanitizeUrl(this.getAttribute('to')) ?? '#';
            // And the active state, which cannot be left to the effect above: that one re-runs on
            // a navigation, and a link told where it points AFTER it is connected — every `:to`
            // binding — sees no navigation on the page it was rendered into.
            this._applyActiveClass();
            // And the prefetch policy, for the same reason: the route is known only now.
            this._applyPrefetchPolicy();
        }
    }

    private _onClick = (e: Event) => {
        const me = e as MouseEvent;
        // Allow ctrl/meta click for open-in-new-tab
        if (me.ctrlKey || me.metaKey || me.shiftKey || me.altKey) return;

        e.preventDefault();
        const to = this.getAttribute('to');
        if (!to) return;

        const paramsAttr = this.getAttribute('params');
        let params: Record<string, string> | undefined;
        if (paramsAttr) {
            try {
                params = JSON.parse(paramsAttr);
            } catch {
                // Malformed params attribute → ignore rather than throwing out of the click handler.
                params = undefined;
            }
        }
        navigate(to, params);
    };

    /**
     * Fetch the chunk this link will need.
     *
     * Not `<link rel="prefetch" href="/dest">`, which in a single-page app asks the server for the
     * SPA fallback — `index.html`, a document the router will never navigate to — and never for
     * the route's JavaScript. `prefetchRoute` calls the route's own `import()` instead, and the
     * module cache makes the load on the click a no-op.
     */
    private _onPrefetchSignal = () => {
        if (this._prefetchDone) return;
        const safe = sanitizeUrl(this.getAttribute('to'));
        if (!safe) return;
        // Only mark it done once something was actually started: a route whose table has not
        // landed yet must still be prefetchable on the next hover.
        if (prefetchRoute(safe)) this._prefetchDone = true;
    };
}

if (typeof customElements !== 'undefined') {
    customElements.define('pdx-link', PdxLink);
}

export { PdxLink };
