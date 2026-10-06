// pdx-infinite-scroll — Loads more data as user scrolls to the bottom.
// Uses IntersectionObserver on a sentinel element for efficient detection.
// After each load completes, re-checks if sentinel is still visible to continue loading.

import { component, html, tryInject, onDestroy } from '@pdxui/core';
import { uiString } from '../shared/i18n';
import type { DataSource } from '@pdxui/core';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/infinite-scroll';
import '../spinner/pdx-spinner'; // rendered by this component, and registered by nobody else

/**
 * Loads more data as the user scrolls to the bottom, paging a DataSource or firing
 * `pdx-load-more` for manual control.
 */
component('pdx-infinite-scroll', {
    props: {
        /** DataSource instance for auto-paging */
        source: { type: Object, default: null },
        /** Pixels from bottom to trigger load */
        threshold: { type: Number, default: 200 },
        /** Disable loading more */
        disabled: { type: Boolean, default: false },
        /** External loading state override */
        loading: { type: Boolean, default: false },
        /** Message when all data loaded. Empty: the infinite-scroll.end component string, «No more data». */
        endMessage: { type: String, default: '' },
        /** Loading indicator text. Empty: the infinite-scroll.loading component string, «Loading...». */
        loadingMessage: { type: String, default: '' },
        /** Show end message when all data loaded */
        showEndMessage: { type: Boolean, default: true },
    },
    setup(ctx) {
        let _built = false;
        let _sentinelEl: HTMLElement | null = null;
        let _loadingEl: HTMLElement | null = null;
        let _endEl: HTMLElement | null = null;
        let _observer: IntersectionObserver | null = null;
        let _injectedDS: DataSource<unknown> | null = null;
        let _sentinelVisible = false;
        let _wasLoading = false;

        function resolveDS(): DataSource<unknown> | null {
            const explicit = ctx.source() as DataSource<unknown> | null;
            if (explicit) return explicit;
            if (!_injectedDS) {
                try {
                    _injectedDS = tryInject('dataSource', ctx.el) as DataSource<unknown> | null ?? null;
                } catch {
                    _injectedDS = null;
                }
            }
            return _injectedDS;
        }

        function isAtEnd(): boolean {
            const ds = resolveDS();
            if (!ds) return false;
            return !ds.hasMore();
        }

        function isCurrentlyLoading(): boolean {
            if (ctx.loading()) return true;
            const ds = resolveDS();
            return ds ? ds.isLoading() : false;
        }

        function loadMore(): void {
            if (ctx.disabled() || isCurrentlyLoading() || isAtEnd()) return;
            const ds = resolveDS();
            if (ds) {
                ds.loadMore();
            }
            ctx.emit('pdx-load-more', {});
        }

        ctx.track(() => {
            void ctx.source();
            void ctx.threshold();
            void ctx.disabled();
            void ctx.loading();
            // Read in the track, so a locale loaded later reaches them too.
            const endMsg = (ctx.endMessage() as string) || uiString('infinite-scroll', 'end');
            const loadMsg = (ctx.loadingMessage() as string) || uiString('infinite-scroll', 'loading');
            const showEnd = ctx.showEndMessage() as boolean;

            const ds = resolveDS();
            const currentlyLoading = isCurrentlyLoading();
            const atEnd = isAtEnd();

            // Also subscribe to DataSource signals so track re-runs on data changes
            if (ds) {
                void ds.data();
                void ds.isLoading();
            }

            if (!_built) {
                _built = true;
                _wasLoading = currentlyLoading;
                // ctx.frame: a setup a move destroyed does not build again.
                ctx.frame(() => {
                    ctx.el.classList.add('pdx-infinite-scroll-root');

                    _sentinelEl = document.createElement('div');
                    _sentinelEl.className = 'pdx-infinite-scroll-sentinel';
                    _sentinelEl.setAttribute('aria-hidden', 'true');
                    ctx.el.appendChild(_sentinelEl);

                    _loadingEl = document.createElement('div');
                    _loadingEl.className = 'pdx-infinite-scroll-loading';
                    _loadingEl.setAttribute('role', 'status');
                    _loadingEl.setAttribute('aria-live', 'polite');
                    const spinner = document.createElement('pdx-spinner');
                    spinner.setAttribute('size', 'sm');
                    _loadingEl.appendChild(spinner);
                    const loadText = document.createElement('span');
                    loadText.textContent = loadMsg;
                    loadText.className = 'pdx-infinite-scroll-text';
                    _loadingEl.appendChild(loadText);
                    _loadingEl.style.display = 'none';
                    ctx.el.appendChild(_loadingEl);

                    _endEl = document.createElement('div');
                    _endEl.className = 'pdx-infinite-scroll-end';
                    _endEl.setAttribute('role', 'status');
                    _endEl.textContent = endMsg;
                    _endEl.style.display = 'none';
                    ctx.el.appendChild(_endEl);

                    // Find nearest scrollable ancestor
                    let scrollRoot: Element | null = null;
                    let parent = ctx.el.parentElement;
                    while (parent) {
                        const style = getComputedStyle(parent);
                        const overflow = style.overflowY || style.overflow;
                        if (overflow === 'auto' || overflow === 'scroll') {
                            scrollRoot = parent;
                            break;
                        }
                        parent = parent.parentElement;
                    }

                    // threshold read reactively: a post-mount change recreates
                    // the observer instead of staying inert
                    const thresholdPx = ctx.threshold() as number;
                    _observer?.disconnect();
                    _observer = new IntersectionObserver((entries) => {
                        _sentinelVisible = entries[0].isIntersecting;
                        if (_sentinelVisible) {
                            loadMore();
                        }
                    }, {
                        root: scrollRoot,
                        rootMargin: '0px 0px ' + thresholdPx + 'px 0px',
                    });
                    _observer.observe(_sentinelEl);
                });
                return;
            }

            // After loading completes: if sentinel is still visible, load more
            if (_wasLoading && !currentlyLoading && _sentinelVisible && !atEnd) {
                requestAnimationFrame(() => loadMore());
            }
            _wasLoading = currentlyLoading;

            requestAnimationFrame(() => {
                // aria-busy on the region while it loads (WAI-ARIA: dynamic content being loaded).
                ctx.el.setAttribute('aria-busy', currentlyLoading ? 'true' : 'false');
                if (_loadingEl) {
                    _loadingEl.style.display = currentlyLoading ? '' : 'none';
                    const textEl = _loadingEl.querySelector('.pdx-infinite-scroll-text');
                    if (textEl) textEl.textContent = loadMsg;
                }
                if (_endEl) {
                    _endEl.style.display = atEnd && showEnd ? '' : 'none';
                    _endEl.textContent = endMsg;
                }
            });
        });

        // core's onDestroy: `ctx.onDestroy` does not exist, and an optional call would hide that the
        // observer is never disconnected. The built elements sit on the host next to the author's
        // children, and core counts what arrives there after mount as authored: left in place, a
        // move would put them back as children and the next mount would build a second set beside them.
        onDestroy(() => {
            _observer?.disconnect();
            _observer = null;
            for (const el of [_sentinelEl, _loadingEl, _endEl]) el?.remove();
            _sentinelEl = _loadingEl = _endEl = null;
        });

        return {};
    },
    render: () => html`<slot></slot>`,
});
