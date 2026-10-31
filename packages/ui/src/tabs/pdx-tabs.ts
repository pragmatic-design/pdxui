// pdx-tabs — Tab list + panels with animated indicator, focusGroup keyboard nav.
// Compound: discovers [data-tab] and [data-tab-panel] children linked by value.
// Supports: vertical, lazy mount, closable tabs, scroll overflow.

import { component, html, focusGroup, generatedId, model, event } from '@pdxui/core';
import type { Dispose } from '@pdxui/core';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/tabs';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Tabs the user switches between, each showing its own panel, with keyboard navigation, lazy
 * mounting and closable tabs.
 *
 * @csspart list - The strip of tabs, the `role="tablist"` element the author wrote (`.pdx-tabs`).
 * @csspart tab - A tab, an element with `data-tab`.
 * @csspart panel - A panel, an element with `data-tab-panel`.
 * @csspart indicator - The bar under the active tab, which slides to it (not with `variant="pills"`).
 *
 * @cssstate loading - `loading` is set: the active panel is `aria-busy`.
 * @cssstate bordered - `bordered` is set: a border around the strip and the panels.
 * @cssstate overflow - The tabs do not fit in one row: the strip keeps one row and scrolls.
 *
 * @alphaevent pdx-change
 * @alphadetail value $event.detail.value
 */
component('pdx-tabs', {
    // The active tab (#289). A click, a key and `select()`/`next()`/`prev()` write it, and the write
    // dispatches `value-change` `{ value }`, which `::value` follows; a parent's write moves the tabs.
    models: { value: model<string>('', { type: String }) },
    events: {
        /** A tab's close button removed it and its panel; the value is the removed tab's. */
        'pdx-close': event<{ value: string }>(),
    },
    // On the host as custom states (#132, #289): the design CSS draws the border and the scrolled strip
    // from them, and neither carries a class or an attribute for it.
    states: ['loading', 'bordered', 'overflow'],
    parts: ['list', 'tab', 'panel', 'indicator'],
    // The axis tabs.css keys by (#632), reflected on the host and drawn from it; the host is the
    // element the old `.pdx-tabs-card`/`.pdx-tabs-pills` classes went on, so no native class is kept.
    variants: {
        /** line (the default), card (a bordered container) or pills (rounded buttons). */
        variant: ['line', 'card', 'pills'],
    },
    props: {
        /** Orientation: horizontal (default) or vertical */
        orientation: { type: String, default: 'horizontal' },
        /** Add border around entire tabs + panels */
        bordered: { type: Boolean, default: false },
        /** Mount strategy: eager (all mounted), lazy (mount on first activate), unmount (destroy on deactivate) */
        mount: { type: String, default: 'eager' },
        /** Activation: automatic (activate on focus) or manual (Enter/Space to activate) */
        activation: { type: String, default: 'automatic' },
        /** The tablist's accessible name ("Account settings"). */
        label: { type: String, default: '' },
        /** Show loading state */
        loading: { type: Boolean, default: false },
    },
    setup(ctx) {
        // Generated ids carry a per-instance uid: as `pdx-tab-${value}`, two tabs on a page with a
        // shared value would repeat them, and one's tabs would control the other's panels.
        const uid = generatedId('pdx-tabs');
        let activeValue = '';
        let focusGroupDispose: Dispose | null = null;
        let indicatorEl: HTMLElement | null = null;
        let resizeObserver: ResizeObserver | null = null;
        const mountedPanels = new Set<string>();

        // This instance's own elements: a pdx-tabs in one of its panels has its own tabs, panels and
        // tablist, and querySelectorAll reaches them too — the outer would hide the inner active panel
        // and re-select the inner tabs by its own value.
        function own(selector: string): HTMLElement[] {
            return Array.from(ctx.el.querySelectorAll<HTMLElement>(selector)).filter(n => n.closest('pdx-tabs') === ctx.el);
        }
        function getTabs(): HTMLElement[] {
            return own('[data-tab]');
        }
        function getPanels(): HTMLElement[] {
            return own('[data-tab-panel]');
        }
        function getTabList(): HTMLElement | null {
            return own('[role="tablist"]')[0] || own('.pdx-tabs')[0] || null;
        }
        function tabFor(value: string): HTMLElement | null {
            return getTabs().find(t => t.getAttribute('data-tab') === value) ?? null;
        }

        function activate(value: string) {
            if (!value) return;
            activeValue = value;
            mountedPanels.add(value);

            const tabs = getTabs();
            const panels = getPanels();
            const mountMode = ctx.mount() as string;

            // Update tab states
            tabs.forEach(t => {
                const v = t.getAttribute('data-tab') || '';
                const isActive = v === value;
                t.setAttribute('data-part', 'tab');
                t.setAttribute('aria-selected', String(isActive));
                t.setAttribute('tabindex', isActive ? '0' : '-1');
            });

            // Update panel visibility
            panels.forEach(p => {
                const v = p.getAttribute('data-tab-panel') || '';
                const isActive = v === value;
                p.setAttribute('data-part', 'panel');
                // The active panel is a tab stop when nothing inside it takes focus (APG): otherwise Tab from
                // the tablist would skip it and go on down the page.
                if (isActive && !p.querySelector(FOCUSABLE)) p.setAttribute('tabindex', '0');
                else p.removeAttribute('tabindex');
                if (mountMode === 'unmount') {
                    // Destroy inactive panel content
                    p.style.display = isActive ? '' : 'none';
                } else if (mountMode === 'lazy') {
                    // Only show if ever activated
                    p.style.display = (isActive || mountedPanels.has(v)) ? '' : 'none';
                    if (!isActive) p.setAttribute('hidden', '');
                    else p.removeAttribute('hidden');
                } else {
                    // Eager: all mounted, toggle visibility
                    p.style.display = isActive ? '' : 'none';
                }
            });

            markBusy();
            revealActive();
            updateIndicator();
            // The model's write announces `value-change` when the tab changed, and nothing when a
            // parent's write brought it here: the value is already this one. The value track below sees
            // its own write as the active tab, a no-op.
            ctx.value.set(value);
        }

        /** A4: the active panel is busy while `loading`, and no other panel is. */
        function markBusy(): void {
            const loading = ctx.loading.peek() as boolean;
            for (const p of getPanels()) {
                if (loading && p.getAttribute('data-tab-panel') === activeValue) p.setAttribute('aria-busy', 'true');
                else p.removeAttribute('aria-busy');
            }
        }

        // A strip narrower than its tabs keeps one row and scrolls it. The CSS alone
        // wraps the tabs, the only thing it can do without measuring; here the strip is measured on
        // one row, and keeps the `overflow` state (one row, scrolled) only while that row does not fit.
        let overflowing = false;
        function fitStrip(): void {
            const tabList = getTabList();
            if (!tabList || (ctx.orientation() as string) === 'vertical') return;
            ctx.state('overflow', true);
            overflowing = tabList.scrollWidth > tabList.clientWidth + 1;
            ctx.state('overflow', overflowing);
            revealActive();
            updateIndicator();
        }

        /** Scroll the strip, and only the strip, so the active tab is in view. */
        function revealActive(): void {
            const tabList = getTabList();
            if (!tabList || !overflowing) return;
            const tab = tabFor(activeValue);
            if (!tab) return;
            // offsetLeft is from the strip's padding edge: the strip is position: relative (tabs.css).
            const start = tab.offsetLeft;
            const end = start + tab.offsetWidth;
            if (start < tabList.scrollLeft) tabList.scrollLeft = start;
            else if (end > tabList.scrollLeft + tabList.clientWidth) tabList.scrollLeft = end - tabList.clientWidth;
        }

        function updateIndicator() {
            if (!indicatorEl) return;
            const tabList = getTabList();
            if (!tabList) return;
            const activeTab = tabFor(activeValue);
            if (!activeTab) return;

            const isVert = (ctx.orientation() as string) === 'vertical';
            const listRect = tabList.getBoundingClientRect();
            const tabRect = activeTab.getBoundingClientRect();

            // Use CSS custom properties instead of inline styles
            // so vertical tabs CSS can override without !important
            const s = indicatorEl.style;
            if (isVert) {
                s.setProperty('--_tab-top', (tabRect.top - listRect.top) + 'px');
                s.setProperty('--_tab-height', tabRect.height + 'px');
                s.removeProperty('--_tab-left');
                s.removeProperty('--_tab-width');
            } else {
                s.setProperty('--_tab-left', (tabRect.left - listRect.left + tabList.scrollLeft) + 'px');
                s.setProperty('--_tab-width', tabRect.width + 'px');
                s.removeProperty('--_tab-top');
                s.removeProperty('--_tab-height');
            }
        }

        function onClick(e: MouseEvent) {
            // A click in an inner pdx-tabs bubbles here too: its tab is not this instance's.
            const tab = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement;
            if (!tab || tab.closest('pdx-tabs') !== ctx.el || tab.hasAttribute('disabled')) return;

            // Close button — remove tab + panel, activate neighbor
            const closeBtn = (e.target as HTMLElement).closest('[data-tab-close]');
            if (closeBtn) {
                e.stopPropagation();
                const value = tab.getAttribute('data-tab') || '';
                const tabs = getTabs();
                const idx = tabs.indexOf(tab);
                // Remove tab and panel
                tab.remove();
                const panel = getPanels().find(p => p.getAttribute('data-tab-panel') === value);
                if (panel) panel.remove();
                // Activate neighbor if this was active
                if (value === activeValue) {
                    const remaining = getTabs();
                    const nextIdx = Math.min(idx, remaining.length - 1);
                    const nextTab = remaining[nextIdx];
                    if (nextTab) activate(nextTab.getAttribute('data-tab') || '');
                }
                ctx.emit('pdx-close', { value }, { bubbles: false });
                return;
            }

            const value = tab.getAttribute('data-tab') || '';
            if (value) activate(value);
        }

        // Reactive: loading → its state and the active panel's aria-busy (A4), bordered → its state.
        // Kept SEPARATE from the one-shot bind below so that reading a prop here never tears down the
        // click listener/focusGroup.
        ctx.track(() => {
            ctx.state('loading', ctx.loading() as boolean);
            markBusy();
        });
        ctx.track(() => { ctx.state('bordered', ctx.bordered() as boolean); });

        let _bound = false;
        // One-shot bind. This track reads NO reactive prop synchronously, so it runs exactly
        // once; its cleanup therefore fires only on component destroy — not on every prop change
        // (a re-run on value/orientation changes would run the teardown, then skip the rebind via
        // `if(!_bound)`, leaving the tabs permanently non-interactive).
        ctx.track(() => {
            const el = ctx.el;

            if (!_bound) {
                _bound = true;
                el.addEventListener('click', onClick);

                requestAnimationFrame(() => {
                    // Read props here (inside rAF, non-subscribing) for initial setup.
                    const propValue = ctx.value() as string;
                    const orient = ctx.orientation() as string;
                    // ARIA setup
                    const tabs = getTabs();
                    const panels = getPanels();
                    const tabList = getTabList();

                    // An id the author wrote stays, and the links use it; the rest are generated per
                    // instance.
                    const tabIds = new Map<string, string>();
                    const panelIds = new Map<string, string>();
                    tabs.forEach(t => {
                        const v = t.getAttribute('data-tab') || '';
                        if (!t.id) t.id = `${uid}-tab-${v}`;
                        tabIds.set(v, t.id);
                    });
                    panels.forEach(p => {
                        const v = p.getAttribute('data-tab-panel') || '';
                        if (!p.id) p.id = `${uid}-panel-${v}`;
                        panelIds.set(v, p.id);
                    });
                    tabs.forEach(t => {
                        const v = t.getAttribute('data-tab') || '';
                        t.setAttribute('role', 'tab');
                        const panelId = panelIds.get(v);
                        if (panelId) t.setAttribute('aria-controls', panelId);
                    });
                    panels.forEach(p => {
                        const v = p.getAttribute('data-tab-panel') || '';
                        p.setAttribute('role', 'tabpanel');
                        const tabId = tabIds.get(v);
                        if (tabId) p.setAttribute('aria-labelledby', tabId);
                    });

                    if (tabList) {
                        tabList.setAttribute('role', 'tablist');
                        tabList.setAttribute('data-part', 'list');
                        tabList.setAttribute('aria-orientation', orient);
                        // Named: a tablist needs an accessible name.
                        const label = ctx.label() as string;
                        if (label) tabList.setAttribute('aria-label', label);
                    }

                    // Create animated indicator (not for pills variant)
                    const variant = ctx.variant() as string;
                    if (tabList && variant !== 'pills') {
                        indicatorEl = document.createElement('span');
                        indicatorEl.className = 'pdx-tab-indicator';
                        indicatorEl.setAttribute('data-part', 'indicator');
                        tabList.style.position = 'relative';
                        tabList.appendChild(indicatorEl);
                    }

                    // focusGroup for keyboard nav
                    if (focusGroupDispose) focusGroupDispose();
                    focusGroupDispose = focusGroup(el, {
                        // Its own tabs, not an inner pdx-tabs'; a disabled tab is skipped.
                        items: () => getTabs().filter(t => !t.hasAttribute('disabled')),
                        orientation: orient === 'vertical' ? 'vertical' : 'horizontal',
                        wrap: true,
                        onFocus: (tabEl) => {
                            if ((ctx.activation() as string) === 'automatic') {
                                const v = tabEl.getAttribute('data-tab') || '';
                                if (v) activate(v);
                            }
                        },
                        onSelect: (tabEl) => {
                            const v = tabEl.getAttribute('data-tab') || '';
                            if (v) activate(v);
                        },
                    });

                    // Activate initial tab
                    const initial = propValue || tabs[0]?.getAttribute('data-tab') || '';
                    if (initial) activate(initial);
                    fitStrip();

                    // ResizeObserver to re-measure indicator on resize. The strip is refitted a frame
                    // later: fitting changes the strip's height, and changing an observed box inside
                    // its own callback is a ResizeObserver loop.
                    resizeObserver = new ResizeObserver(() => {
                        updateIndicator();
                        requestAnimationFrame(fitStrip);
                    });
                    if (tabList) resizeObserver.observe(tabList);
                });
            }

            return () => {
                el.removeEventListener('click', onClick);
                if (focusGroupDispose) { focusGroupDispose(); focusGroupDispose = null; }
                if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
            };
        });

        // React to external value changes after mount. The tab already active is not activated again:
        // that is also how the component's own reflection of `value` passes through here.
        ctx.track(() => {
            const v = ctx.value() as string;
            if (v && _bound && v !== activeValue) activate(v);
        });

        // Imperative API: el.select(value) / el.next() / el.prev() / el.active
        ctx.expose({
            /** Activate a tab by its `data-tab` value, not by its position. */
            select(value: string) { activate(value); },
            next() {
                const vals = getTabs().map(t => t.getAttribute('data-tab') || '');
                const i = vals.indexOf(activeValue);
                if (i >= 0 && i < vals.length - 1) activate(vals[i + 1]);
            },
            prev() {
                const vals = getTabs().map(t => t.getAttribute('data-tab') || '');
                const i = vals.indexOf(activeValue);
                if (i > 0) activate(vals[i - 1]);
            },
            get active() { return activeValue; },
        });

        return {};
    },
    render: () => html`<slot></slot>`,
});
