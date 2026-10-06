// pdx-app-layout — Application shell with header, navbar, aside, main, footer.
// CSS Grid layout with responsive collapse. Semantic HTML elements.
// Props: navbarWidth, navbarCollapsed, navbarBreakpoint, asideWidth, headerHeight, footerHeight.

import { component, html, signal, moveMounted, DEV } from '@pdxui/core';
import { uiString, uiAttr} from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/app-layout';

/**
 * The regions `pdx-app-layout` places, in the order it looks for them.
 *
 * Declared once so the projection below and the warning above cannot drift apart — a message listing
 * a name the code does not handle would be worse than no message.
 */
const REGIONS = ['header', 'navbar', 'aside', 'footer'];

/**
 * An application shell that places a header, side bars, main content and a footer on a CSS grid that
 * collapses responsively.
 */
component('pdx-app-layout', {
    props: {
        /** Header height (CSS value). Empty = no header. */
        headerHeight: { type: String, default: '52px' },
        /** Footer height (CSS value). Empty = no footer. */
        footerHeight: { type: String, default: '' },
        /** Navbar (left sidebar) width (CSS value) */
        navbarWidth: { type: String, default: '260px' },
        /** Navbar collapsed width for mini mode. A non-zero rail keeps icon-only nav visible
         *  when collapsed (set to '0px' explicitly for a fully-hidden navbar). */
        navbarCollapsedWidth: { type: String, default: '60px' },
        /** Navbar collapsed state */
        navbarCollapsed: { type: Boolean, default: false },
        /** Breakpoint (px) below which navbar auto-collapses to overlay */
        navbarBreakpoint: { type: Number, default: 768 },
        /** Aside (right sidebar) width. Empty = no aside. */
        asideWidth: { type: String, default: '' },
        /** Full-height navbar: the left sidebar spans header+main+footer (logo lives in the
         *  navbar), and the header only sits above main. Default false = header spans full width. */
        navbarFullHeight: { type: Boolean, default: false },
        /** Show border between regions */
        withBorder: { type: Boolean, default: true },
        /** Transition duration (ms) */
        transitionDuration: { type: Number, default: 200 },
    },
    setup(ctx) {
        // A named handler + teardown: otherwise the listener on the MediaQueryList survives
        // the destroy, holding on to the component's closure.
        const _onMediaChange = (): void => {
            _mobileCollapsed.set(true);
            updateLayout();
        };
        ctx.track(() => () => { _mediaQuery?.removeEventListener('change', _onMediaChange); });

        let _built = false;
        let _headerEl: HTMLElement | null = null;
        let _navbarEl: HTMLElement | null = null;
        let _asideEl: HTMLElement | null = null;
        let _footerEl: HTMLElement | null = null;
        let _overlayEl: HTMLElement | null = null;
        let _mediaQuery: MediaQueryList | null = null;
        // Below the breakpoint the navbar is an overlay drawer with a life of its own: the media
        // query closes it, the backdrop closes it, and the imperative API toggles it — none of which
        // the author asked for, so none of them should overwrite the author's own prop.
        //
        // ⚠️ But the prop has to REACH it. Read only on desktop, binding
        // `:navbar-collapsed="!open()"` — the obvious, documented way to drive a hamburger — would do
        // nothing at all on a phone, with no warning. Two sources of truth is the right shape here
        // (controlled input, internal state); ignoring the input is not. `_lastPropCollapsed` is what
        // makes the difference: the internal state follows the prop when the AUTHOR changes it, and
        // stays put when the media query or the backdrop changed it.
        const _mobileCollapsed = signal(true);
        let _lastPropCollapsed: boolean | null = null;

        function updateLayout(): void {
            const el = ctx.el;
            const headerH = ctx.headerHeight() as string;
            const footerH = ctx.footerHeight() as string;
            const navW = ctx.navbarWidth() as string;
            const navCollapsedW = ctx.navbarCollapsedWidth() as string;
            const navCollapsed = ctx.navbarCollapsed() as boolean;
            const asideW = ctx.asideWidth() as string;
            const fullHeight = ctx.navbarFullHeight() as boolean;
            const withBorder = ctx.withBorder() as boolean;
            const duration = ctx.transitionDuration() as number;
            void ctx.navbarBreakpoint();

            const isMobile = _mediaQuery ? _mediaQuery.matches : false;
            const isCollapsed = navCollapsed || (isMobile && _mobileCollapsed.peek());
            const currentNavW = isCollapsed ? navCollapsedW : navW;

            // On mobile the navbar is an overlay drawer (out of grid flow) → the grid navbar
            // column is 0 so the content takes full width; the mini-collapsed rail is a
            // desktop-only concept. On desktop the column follows the collapsed/expanded width.
            const gridNavW = isMobile ? '0px' : currentNavW;

            // Grid template
            const cols = [
                navW || navCollapsedW ? gridNavW : '',
                '1fr',
                asideW || '',
            ].filter(Boolean).join(' ');

            const rows = [
                headerH || '',
                '1fr',
                footerH || '',
            ].filter(Boolean).join(' ');

            el.style.gridTemplateColumns = cols;
            el.style.gridTemplateRows = rows;
            el.style.setProperty('--pdx-app-transition', duration + 'ms');

            // Grid areas — generated to match the dynamic column/row set (aside/footer optional).
            // Default: header & footer span full width. Full-height: the navbar column spans every
            // row (logo at top of the sidebar) and header/footer sit only over main(+aside).
            const colTokens: ('nav' | 'main' | 'aside')[] = [];
            if (navW || navCollapsedW) colTokens.push('nav');
            colTokens.push('main');
            if (asideW) colTokens.push('aside');
            const rowTokens: ('header' | 'mainrow' | 'footer')[] = [];
            if (headerH) rowTokens.push('header');
            rowTokens.push('mainrow');
            if (footerH) rowTokens.push('footer');
            const areaAt = (row: string, col: string): string => {
                if (col === 'nav') {
                    if (fullHeight) return 'navbar';
                    if (row === 'header') return 'header';
                    if (row === 'footer') return 'footer';
                    return 'navbar';
                }
                if (row === 'header') return 'header';
                if (row === 'footer') return 'footer';
                return col === 'aside' ? 'aside' : 'main';
            };
            el.style.gridTemplateAreas = rowTokens
                .map(r => '"' + colTokens.map(c => areaAt(r, c)).join(' ') + '"')
                .join(' ');

            // Navbar: desktop = in-grid (collapsible rail); mobile = fixed overlay drawer that
            // slides off-screen when collapsed (full navbar width when open, never the rail width).
            if (_navbarEl) {
                if (isMobile) {
                    _navbarEl.classList.add('pdx-app-navbar-overlay');
                    _navbarEl.classList.remove('pdx-app-navbar-collapsed');
                    const offScreen = _mobileCollapsed.peek();
                    _navbarEl.classList.toggle('pdx-app-navbar-hidden', offScreen);
                    // ⚠️ Off screen is not hidden. The closed drawer slides away with a transform and
                    // nothing else, so its entries would keep their place in the tab order and in the
                    // accessibility tree: Tab would walk into an invisible menu. `inert` removes both in
                    // one attribute, and it has to come OFF when the drawer opens or the menu opens
                    // unusable.
                    _navbarEl.toggleAttribute('inert', offScreen);
                    _navbarEl.style.width = navW;
                } else {
                    _navbarEl.classList.remove('pdx-app-navbar-overlay', 'pdx-app-navbar-hidden');
                    // On desktop the navbar is in the grid and always reachable, collapsed or not:
                    // the rail is a visual state, not a hidden one.
                    _navbarEl.removeAttribute('inert');
                    _navbarEl.classList.toggle('pdx-app-navbar-collapsed', isCollapsed);
                    _navbarEl.style.width = currentNavW;
                    // ⚠️ `width: 0` does NOT hide an element that has padding: with border-box the
                    // padding is a floor, so a navbar with 12px padding and a 1px border still
                    // occupies 25px — a sliver where the prop promises "a fully-hidden navbar".
                    // Done here rather than in a CSS class because the author's padding may be an
                    // inline style, which no selector outranks.
                    const gone = isCollapsed && parseFloat(currentNavW || '0') === 0;
                    _navbarEl.classList.toggle('pdx-app-navbar-gone', gone);
                    if (gone) {
                        _navbarEl.style.setProperty('padding-left', '0', 'important');
                        _navbarEl.style.setProperty('padding-right', '0', 'important');
                        _navbarEl.style.setProperty('border-left-width', '0', 'important');
                        _navbarEl.style.setProperty('border-right-width', '0', 'important');
                    } else {
                        for (const p of ['padding-left', 'padding-right', 'border-left-width', 'border-right-width']) {
                            _navbarEl.style.removeProperty(p);
                        }
                    }
                }
            }

            // Overlay backdrop — visible only when the mobile drawer is open
            if (_overlayEl) {
                _overlayEl.classList.toggle('pdx-app-overlay-visible', isMobile && !_mobileCollapsed.peek());
            }

            // Border
            el.classList.toggle('pdx-app-with-border', withBorder);
        }

        ctx.track(() => {
            // Read all props to subscribe
            void ctx.headerHeight();
            void ctx.footerHeight();
            void ctx.navbarWidth();
            void ctx.asideWidth();

            // The author wrote the prop → the mobile drawer follows. First run only records the
            // value: an initial `navbar-collapsed` is the starting state, not a command to open.
            const propCollapsed = ctx.navbarCollapsed() as boolean;
            if (_lastPropCollapsed === null) _lastPropCollapsed = propCollapsed;
            else if (propCollapsed !== _lastPropCollapsed) {
                _lastPropCollapsed = propCollapsed;
                _mobileCollapsed.set(propCollapsed);
            }

            void ctx.navbarFullHeight();
            void ctx.withBorder();

            if (!_built) {
                _built = true;
                // ctx.frame: a setup a move destroyed does not build again.
                ctx.frame(() => {
                    const el = ctx.el;
                    el.classList.add('pdx-app-layout');

                    // Discover slot children and wrap remaining in main
                    const children = Array.from(el.children) as HTMLElement[];
                    const slotMap: Record<string, HTMLElement> = {};

                    for (const child of children) {
                        const slotName = child.getAttribute('data-region');
                        if (slotName) {
                            // An unrecognised name falls between two stools: it is not one of the four,
                            // so no region claims it, and it HAS the attribute, so the `<main>` wrap
                            // below skips it. It stays where it is with no class and no grid-area — out
                            // of the layout, silently. `content` is the name a reader tries first, and
                            // it is not one of them: the main area is whatever carries no data-region.
                            if (DEV && !REGIONS.includes(slotName)) {
                                console.warn(`[pdx] <pdx-app-layout>: data-region="${slotName}" is not a region, `
                                    + `so that element is left out of the layout. The regions are `
                                    + `${REGIONS.join(', ')}; everything WITHOUT a data-region goes into <main>.`);
                            }
                            slotMap[slotName] = child;
                        }
                    }

                    // Header
                    if (slotMap['header']) {
                        _headerEl = slotMap['header'];
                        _headerEl.classList.add('pdx-app-header');
                        _headerEl.setAttribute('role', 'banner');
                    }

                    // Navbar (left sidebar)
                    if (slotMap['navbar']) {
                        _navbarEl = slotMap['navbar'];
                        _navbarEl.classList.add('pdx-app-navbar');
                        _navbarEl.setAttribute('role', 'navigation');
                        // An accessible name: it disambiguates the landmark (axe landmark-unique with several <nav>).
                        if (!_navbarEl.hasAttribute('aria-label')) uiAttr(_navbarEl, 'aria-label', () => uiString('app-layout', 'mainNav'));
                    }

                    // Aside (right sidebar)
                    if (slotMap['aside']) {
                        _asideEl = slotMap['aside'];
                        _asideEl.classList.add('pdx-app-aside');
                        _asideEl.setAttribute('role', 'complementary');
                        if (!_asideEl.hasAttribute('aria-label')) uiAttr(_asideEl, 'aria-label', () => uiString('app-layout', 'aside'));
                    }

                    // Footer
                    if (slotMap['footer']) {
                        _footerEl = slotMap['footer'];
                        _footerEl.classList.add('pdx-app-footer');
                        _footerEl.setAttribute('role', 'contentinfo');
                    }

                    // Main — everything without a slot attribute. The children have mounted by now, and
                    // moving them is a disconnect: done plainly, every component in the main area would
                    // be set up a second time and come out with its content twice. So the move,
                    // and the insertion that puts them back in the document, run inside moveMounted.
                    const main = document.createElement('main');
                    main.className = 'pdx-app-main';
                    moveMounted(el, () => {
                        for (const child of children) {
                            if (!child.getAttribute('data-region')) {
                                main.appendChild(child);
                            }
                        }
                        // Insert main after navbar (if exists) or after header
                        if (_navbarEl) {
                            _navbarEl.after(main);
                        } else if (_headerEl) {
                            _headerEl.after(main);
                        } else {
                            el.prepend(main);
                        }
                    });

                    // Overlay for mobile navbar
                    _overlayEl = document.createElement('div');
                    _overlayEl.className = 'pdx-app-overlay';
                    _overlayEl.addEventListener('click', () => {
                        _mobileCollapsed.set(true);
                        updateLayout();
                    });
                    el.appendChild(_overlayEl);

                    // Media query for responsive
                    const bp = ctx.navbarBreakpoint() as number;
                    if (bp > 0) {
                        _mediaQuery = window.matchMedia(`(max-width: ${bp}px)`);
                        _mediaQuery.addEventListener('change', _onMediaChange);
                    }

                    updateLayout();
                });
                return;
            }

            requestAnimationFrame(() => updateLayout());
        });

        function setNavbarOpen(open: boolean): void {
            if (_mediaQuery?.matches) _mobileCollapsed.set(!open);
            else (ctx.el as unknown as { navbarCollapsed: boolean }).navbarCollapsed = !open;
            updateLayout();
        }

        // Imperative API
        ctx.expose({
            /** Open or close the navbar: the mobile drawer under the breakpoint, the `navbar-collapsed` prop above it. */
            toggleNavbar: () => {
                if (_mediaQuery?.matches) {
                    _mobileCollapsed.set(!_mobileCollapsed.peek());
                } else {
                    // Toggle via property
                    (ctx.el as any).navbarCollapsed = !(ctx.navbarCollapsed() as boolean);
                }
                updateLayout();
            },
            // Both modes, as toggleNavbar: the drawer below the breakpoint, the navbarCollapsed
            // property above it, so they act on desktop too.
            /** Open the navbar, on either side of the breakpoint. */
            openNavbar: () => setNavbarOpen(true),
            /** Close the navbar, on either side of the breakpoint. */
            closeNavbar: () => setNavbarOpen(false),
        });

        return {};
    },
    render: () => html`<slot></slot>`,
});
