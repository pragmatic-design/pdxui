// pdx-scroll-spy — Highlights navigation items based on which section is in view.
// Uses IntersectionObserver for efficient scroll detection.

import { component, html, signal } from '@pdxui/core';

/**
 * Highlights the navigation link of the section currently visible, as the user scrolls.
 */
component('pdx-scroll-spy', {
    props: {
        /** CSS selector for sections to observe */
        sectionSelector: { type: String, default: '[data-section]' },
        /** CSS selector for nav links to highlight */
        linkSelector: { type: String, default: '[data-spy-link]' },
        /** Offset from top for activation threshold (px) */
        offset: { type: Number, default: 100 },
        /** Smooth scroll to section on link click */
        smoothScroll: { type: Boolean, default: true },
    },
    setup(ctx) {
        const _activeSection = signal('');
        let _observer: IntersectionObserver | null = null;
        // Unbind of the links' click handlers: without it they would pile up on every run of the
        // track and stay on the links (which live outside the component) after the destroy.
        const _linkUnbinds: Array<() => void> = [];

        ctx.track(() => {
            const sectionSelector = ctx.sectionSelector() as string;
            const linkSelector = ctx.linkSelector() as string;
            const offset = ctx.offset() as number;
            const smooth = ctx.smoothScroll() as boolean;

            requestAnimationFrame(() => {
                // Cleanup previous observer
                if (_observer) { _observer.disconnect(); _observer = null; }

                const sections = document.querySelectorAll(sectionSelector);
                if (!sections.length) return;

                // IntersectionObserver to track visible sections
                _observer = new IntersectionObserver((entries) => {
                    let topSection = '';
                    let topY = Infinity;

                    for (const entry of entries) {
                        if (entry.isIntersecting) {
                            const rect = entry.boundingClientRect;
                            if (rect.top < topY) {
                                topY = rect.top;
                                topSection = entry.target.getAttribute('data-section') ||
                                    entry.target.id || '';
                            }
                        }
                    }

                    if (topSection) {
                        _activeSection.set(topSection);
                        updateLinks(topSection, linkSelector);
                        ctx.emit('pdx-change', { section: topSection });
                    }
                }, {
                    rootMargin: `-${offset}px 0px -50% 0px`,
                    threshold: 0,
                });

                sections.forEach(s => _observer!.observe(s));

                // Bind link clicks for smooth scroll (named handlers + unbind)
                for (const un of _linkUnbinds) un();
                _linkUnbinds.length = 0;
                if (smooth) {
                    const links = document.querySelectorAll(linkSelector);
                    links.forEach(link => {
                        const onLinkClick = (e: Event) => {
                            const target = link.getAttribute('href')?.replace('#', '') ||
                                link.getAttribute('data-spy-target') || '';
                            const section = document.getElementById(target) ||
                                document.querySelector(`[data-section="${target}"]`);
                            if (section) {
                                e.preventDefault();
                                section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                        };
                        link.addEventListener('click', onLinkClick);
                        _linkUnbinds.push(() => link.removeEventListener('click', onLinkClick));
                    });
                }
            });

            return () => {
                if (_observer) { _observer.disconnect(); _observer = null; }
                for (const un of _linkUnbinds) un();
                _linkUnbinds.length = 0;
            };
        });

        function updateLinks(activeId: string, linkSelector: string): void {
            const links = document.querySelectorAll(linkSelector);
            links.forEach(link => {
                const target = link.getAttribute('href')?.replace('#', '') ||
                    link.getAttribute('data-spy-target') || '';
                link.classList.toggle('active', target === activeId);
                if (target === activeId) {
                    // 'page' is the semantically correct value for a link to the current section or page
                    // (consistent with nav-menu/breadcrumb), not the generic 'true'.
                    link.setAttribute('aria-current', 'page');
                } else {
                    link.removeAttribute('aria-current');
                }
            });
        }

        ctx.expose({
            /** The id of the section marked active, or '' before the first measurement. */
            getActiveSection: () => _activeSection.peek(),
        });
        return {};
    },
    render: () => html`<slot></slot>`,
});
