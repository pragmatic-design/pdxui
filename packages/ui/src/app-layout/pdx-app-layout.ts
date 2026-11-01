// pdx-app-layout — Application shell with header, navbar, aside, main, footer.
// CSS Grid layout with responsive collapse. Semantic HTML elements.
// Props: navbarWidth, navbarCollapsed, navbarBreakpoint, asideWidth, headerHeight, footerHeight.

import { component, html, signal, moveMounted, DEV, model } from '@pdxui/core';
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
 *
 * @csspart header - The app's `data-region="header"` element (`.pdx-app-header`, `role="banner"`).
 * @csspart navbar - The app's `data-region="navbar"` element (`.pdx-app-navbar`, `role="navigation"`).
 * @csspart aside - The app's `data-region="aside"` element (`.pdx-app-aside`, `role="complementary"`).
 * @csspart main - The `<main class="pdx-app-main">` it wraps everything without a region in; the element that scrolls.
 * @csspart footer - The app's `data-region="footer"` element (`.pdx-app-footer`, `role="contentinfo"`).
 * @csspart overlay - The backdrop behind the open drawer, below the breakpoint.
 *
 * @cssstate bordered - `withBorder` is set: a line between the regions.
 * @cssstate drawer - Below `navbarBreakpoint`: the navbar is an overlay drawer, off screen until opened.
 * @cssstate drawer-open - The drawer is open, with its backdrop.
 * @cssstate navbar-collapsed - Above the breakpoint, the navbar is collapsed to its rail.
 * @cssstate navbar-gone - Collapsed to a `0px` rail: the navbar takes no width at all.
 */
component('pdx-app-layout', {
    // Collapsed above the breakpoint (#290). `toggleNavbar()`, `openNavbar()` and `closeNavbar()` write
    // it, and the write dispatches `navbar-collapsed-change` `{ value }`, which `::navbar-collapsed`
    // follows; a parent's write moves the navbar. Below the breakpoint the drawer is the layout's own
    // state, `drawer-open`, which the prop drives but the drawer does not write back.
    models: {
        /** Navbar collapsed state */
        navbarCollapsed: model<boolean>(false, { type: Boolean }),
    },
    // On the host as custom states (#132): app-layout.css draws the border, the drawer and the rail
    // from them, and none of them carries a class.
    states: ['bordered', 'drawer', 'drawer-open', 'navbar-collapsed', 'navbar-gone'],
    parts: ['header', 'navbar', 'aside', 'main', 'footer', 'overlay'],
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
            // The states are the host's (#290): app-layout.css draws the drawer, its backdrop and the rail
            // from them, on the app's navbar and the layout's own backdrop.
            const drawerOpen = isMobile && !_mobileCollapsed.peek();
            const railGone = !isMobile && isCollapsed && parseFloat(currentNavW || '0') === 0;
            ctx.state('drawer', !!_navbarEl && isMobile);
            ctx.state('drawer-open', !!_navbarEl && drawerOpen);
            ctx.state('navbar-collapsed', !!_navbarEl && !isMobile && isCollapsed);
            ctx.state('navbar-gone', !!_navbarEl && railGone);
            if (_navbarEl) {
                if (isMobile) {
                    const offScreen = _mobileCollapsed.peek();
                    // ⚠️ Off screen is not hidden. The closed drawer slides away with a transform and
                    // nothing else, so its entries would keep their place in the tab order and in the
                    // accessibility tree: Tab would walk into an invisible menu. `inert` removes both in
                    // one attribute, and it has to come OFF when the drawer opens or the menu opens
                    // unusable.
                    _navbarEl.toggleAttribute('inert', offScreen);
                    _navbarEl.style.width = navW;
                } else {
                    // On desktop the navbar is in the grid and always reachable, collapsed or not:
                    // the rail is a visual state, not a hidden one.
                    _navbarEl.removeAttribute('inert');
                    _navbarEl.style.width = currentNavW;
                    // ⚠️ `width: 0` does NOT hide an element that has padding: with border-box the
                    // padding is a floor, so a navbar with 12px padding and a 1px border still
                    // occupies 25px — a sliver where the prop promises "a fully-hidden navbar".
                    // Done here rather than in a CSS class because the author's padding may be an
                    // inline style, which no selector outranks.
                    if (railGone) {
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

            // The backdrop is drawn while `drawer-open` holds, and the border from `bordered`.
            ctx.state('bordered', withBorder);
        }

        ctx.track(() => {
            // Read all props to subscribe
            void ctx.headerHeight();
            void ctx.footerHeight();
            void ctx.navbarWidth();
            void ctx.navbarCollapsedWidth();
            void ctx.asideWidth();
            void ctx.transitionDuration();

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
                    // The host carries no class (#290): app-layout.css draws the grid on the tag.
                    const el = ctx.el;

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
                        _headerEl.setAttribute('data-part', 'header');
                        _headerEl.setAttribute('role', 'banner');
                    }

                    // Navbar (left sidebar)
                    if (slotMap['navbar']) {
                        _navbarEl = slotMap['navbar'];
                        _navbarEl.classList.add('pdx-app-navbar');
                        _navbarEl.setAttribute('data-part', 'navbar');
                        _navbarEl.setAttribute('role', 'navigation');
                        // An accessible name: it disambiguates the landmark (axe landmark-unique with several <nav>).
                        if (!_navbarEl.hasAttribute('aria-label')) uiAttr(_navbarEl, 'aria-label', () => uiString('app-layout', 'mainNav'));
                    }

                    // Aside (right sidebar)
                    if (slotMap['aside']) {
                        _asideEl = slotMap['aside'];
                        _asideEl.classList.add('pdx-app-aside');
                        _asideEl.setAttribute('data-part', 'aside');
                        _asideEl.setAttribute('role', 'complementary');
                        if (!_asideEl.hasAttribute('aria-label')) uiAttr(_asideEl, 'aria-label', () => uiString('app-layout', 'aside'));
                    }

                    // Footer
                    if (slotMap['footer']) {
                        _footerEl = slotMap['footer'];
                        _footerEl.classList.add('pdx-app-footer');
                        _footerEl.setAttribute('data-part', 'footer');
                        _footerEl.setAttribute('role', 'contentinfo');
                    }

                    // Main — everything without a slot attribute. The children have mounted by now, and
                    // moving them is a disconnect: done plainly, every component in the main area would
                    // be set up a second time and come out with its content twice. So the move,
                    // and the insertion that puts them back in the document, run inside moveMounted.
                    const main = document.createElement('main');
                    main.className = 'pdx-app-main';
                    main.setAttribute('data-part', 'main');
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
                    _overlayEl.setAttribute('data-part', 'overlay');
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

        // Above the breakpoint the methods write the model, which announces `navbar-collapsed-change`;
        // the `_lastPropCollapsed` track sees the new value and the drawer follows it, as for a parent's
        // write. Below it they move the drawer only.
        function setNavbarOpen(open: boolean): void {
            if (_mediaQuery?.matches) _mobileCollapsed.set(!open);
            else ctx.navbarCollapsed.set(!open);
            updateLayout();
        }

        // Imperative API
        ctx.expose({
            /** Open or close the navbar: the mobile drawer under the breakpoint, the `navbar-collapsed` prop above it. */
            toggleNavbar: () => {
                if (_mediaQuery?.matches) setNavbarOpen(_mobileCollapsed.peek());
                else setNavbarOpen(ctx.navbarCollapsed.peek() as boolean);
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
