// pdx-navbar v2 — Responsive app header.
// Props for brand + nav. Discovers existing children for actions area.
// Responsive: hamburger + drawer on mobile breakpoint.

import { component, html, signal, sanitizeUrl } from '@pdxui/core';
import { uiString, uiAttr} from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/navbar';
/** `pdx-icon` the first time the brand or an item names an icon: a use that draws none never pays for the icon set. */
function loadIcon(): void {
    if (!customElements.get('pdx-icon')) void import('../icon/pdx-icon');
}

export interface NavbarItem {
    key: string;
    label: string;
    href?: string;
    icon?: string;
    active?: boolean;
}

/** Instance counter for the id that ties the menu toggle to its menu. */
let _navbarSeq = 0;

/**
 * A responsive app header holding the brand, the navigation links and the user's avatar with its
 * dropdown.
 */
component('pdx-navbar', {
    props: {
        /** Brand text */
        brand: { type: String, default: '' },
        /** Brand icon name */
        brandIcon: { type: String, default: '' },
        /** Navigation items */
        items: { type: Array, default: [] },
        /** Sticky */
        sticky: { type: Boolean, default: false },
        /** Compact height */
        compact: { type: Boolean, default: false },
        /**
         * The navigation landmark's name. Empty: the navbar.mainNav component string, «Main
         * navigation». Give each navbar on a page its own: a sub-nav, a footer nav.
         */
        label: { type: String, default: '' },
    },
    setup(ctx) {
        const _mobileOpen = signal(false);
        let _built = false;
        let _hamburgerEl: HTMLButtonElement | null = null;
        let _drawerEl: HTMLElement | null = null;
        const _menuId = `pdx-navbar-${++_navbarSeq}-menu`;

        function setMobile(open: boolean): void {
            _mobileOpen.set(open);
            if (_drawerEl) _drawerEl.classList.toggle('pdx-navbar-drawer-open', open);
            if (_hamburgerEl) _hamburgerEl.setAttribute('aria-expanded', String(open));
        }

        function toggleMobile(): void {
            const next = !_mobileOpen.peek();
            setMobile(next);
            // Into the menu it opened, not left on the toggle.
            if (next) (_drawerEl?.querySelector('a') as HTMLElement | null)?.focus();
        }

        // Escape closes the menu and returns to its toggle.
        ctx.el.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || !_mobileOpen.peek()) return;
            e.preventDefault();
            setMobile(false);
            _hamburgerEl?.focus();
        });

        function navName(): string {
            return (ctx.label() as string) || uiString('navbar', 'mainNav');
        }

        // ── Collapse on the navbar's own width ──
        // Not a viewport media query: at 768px of window a navbar in a column, a sidebar layout or a
        // dialog would never collapse, and its actions would run past the edge. It collapses when its bar overflows, and expands again once the width
        // it needed is back. The media query stays for the CSS-only `.pdx-navbar` markup.
        let _neededWidth = 0;
        function barOverflows(bar: HTMLElement): boolean {
            return bar.scrollWidth > bar.clientWidth + 1;
        }
        function fit(): void {
            const bar = ctx.el.querySelector(':scope > .pdx-navbar-bar') as HTMLElement | null;
            if (!bar) return;
            const collapsed = ctx.el.classList.contains('pdx-navbar-collapsed');
            if (!collapsed) {
                if (barOverflows(bar)) { _neededWidth = bar.scrollWidth; setCollapsed(true); }
                return;
            }
            if (bar.clientWidth < _neededWidth) return;
            setCollapsed(false);
            if (barOverflows(bar)) { _neededWidth = bar.scrollWidth; setCollapsed(true); }
        }
        function setCollapsed(collapsed: boolean): void {
            ctx.el.classList.toggle('pdx-navbar-collapsed', collapsed);
            // An open menu does not outlive the collapse that showed its toggle.
            if (!collapsed && _mobileOpen.peek()) setMobile(false);
        }
        let _resizeObserver: ResizeObserver | null = null;
        ctx.track(() => () => { _resizeObserver?.disconnect(); _resizeObserver = null; });

        ctx.track(() => {
            const items = ctx.items() as NavbarItem[];
            const brand = ctx.brand() as string;
            const brandIcon = ctx.brandIcon() as string;
            const sticky = ctx.sticky() as boolean;
            const compact = ctx.compact() as boolean;
            const name = navName();

            if (!_built) {
                _built = true;
                // ctx.frame: a setup a move destroyed does not build again.
                ctx.frame(() => {
                    const el = ctx.el;
                    el.setAttribute('role', 'banner');
                    // pdx-navbar-fit: the component collapses on its own width, not the media query.
                    el.classList.add('pdx-navbar', 'pdx-navbar-fit');
                    if (sticky) el.classList.add('pdx-navbar-sticky');
                    if (compact) el.classList.add('pdx-navbar-compact');

                    // Capture any existing children (actions area) before restructuring
                    const existingChildren = Array.from(el.childNodes);

                    const bar = document.createElement('div');
                    bar.className = 'pdx-navbar-bar';

                    // Brand
                    if (brand || brandIcon) {
                        const brandEl = document.createElement('div');
                        brandEl.className = 'pdx-navbar-brand';
                        if (brandIcon) {
                            loadIcon();
                            const icon = document.createElement('pdx-icon');
                            icon.setAttribute('name', brandIcon);
                            icon.setAttribute('size', '22');
                            brandEl.appendChild(icon);
                        }
                        if (brand) {
                            const txt = document.createElement('strong');
                            txt.textContent = brand;
                            brandEl.appendChild(txt);
                        }
                        bar.appendChild(brandEl);
                    }

                    // Hamburger
                    _hamburgerEl = document.createElement('button');
                    _hamburgerEl.type = 'button';
                    _hamburgerEl.className = 'pdx-navbar-hamburger';
                    uiAttr(_hamburgerEl, 'aria-label', () => uiString('navbar', 'toggle'));
                    _hamburgerEl.setAttribute('aria-expanded', 'false');
                    _hamburgerEl.setAttribute('aria-controls', _menuId);
                    _hamburgerEl.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg>';
                    _hamburgerEl.addEventListener('click', toggleMobile);
                    bar.appendChild(_hamburgerEl);

                    // Desktop nav
                    const nav = document.createElement('nav');
                    nav.className = 'pdx-navbar-nav';
                    nav.setAttribute('role', 'navigation');
                    nav.setAttribute('aria-label', name);
                    buildNavItems(items, nav);
                    bar.appendChild(nav);

                    // Spacer
                    const spacer = document.createElement('div');
                    spacer.className = 'pdx-navbar-spacer';
                    bar.appendChild(spacer);

                    // Actions: move existing children here
                    if (existingChildren.length > 0) {
                        const actions = document.createElement('div');
                        actions.className = 'pdx-navbar-actions';
                        for (const child of existingChildren) {
                            actions.appendChild(child);
                        }
                        bar.appendChild(actions);
                    }

                    el.appendChild(bar);

                    // Mobile drawer: the same navigation, so the same landmark and name. Only one of
                    // the two is ever displayed.
                    _drawerEl = document.createElement('nav');
                    _drawerEl.className = 'pdx-navbar-drawer';
                    _drawerEl.id = _menuId;
                    _drawerEl.setAttribute('aria-label', name);
                    buildNavItems(items, _drawerEl);
                    el.appendChild(_drawerEl);

                    if (typeof ResizeObserver !== 'undefined') {
                        _resizeObserver = new ResizeObserver(() => fit());
                        _resizeObserver.observe(el);
                        // Its content too: a search that widens or a name that grows needs no host resize.
                        for (const part of bar.querySelectorAll(':scope > .pdx-navbar-nav, :scope > .pdx-navbar-actions')) {
                            _resizeObserver.observe(part);
                        }
                    }
                });
                return;
            }

            // Rebuild on prop changes
            requestAnimationFrame(() => {
                ctx.el.classList.toggle('pdx-navbar-sticky', sticky);
                ctx.el.classList.toggle('pdx-navbar-compact', compact);
                const nav = ctx.el.querySelector('.pdx-navbar-nav') as HTMLElement | null;
                if (nav) { nav.innerHTML = ''; buildNavItems(items, nav); nav.setAttribute('aria-label', name); }
                if (_drawerEl) { _drawerEl.innerHTML = ''; buildNavItems(items, _drawerEl); _drawerEl.setAttribute('aria-label', name); }
                // New items need a new measure: expanded first, then collapse again if they overflow.
                setCollapsed(false);
                fit();
            });
        });

        function buildNavItems(items: NavbarItem[], container: HTMLElement): void {
            for (const item of items) {
                const a = document.createElement('a');
                a.className = 'pdx-navbar-link';
                if (item.active) { a.classList.add('active'); a.setAttribute('aria-current', 'page'); }
                // An item with no (safe) href is still a link: `#`, and the click below keeps it from
                // navigating. With no href the <a> is not a link and takes no focus — keyboard users
                // could not reach the app navigation.
                const safeHref = sanitizeUrl(item.href);
                a.href = safeHref || '#';
                a.setAttribute('data-nav-key', item.key);
                if (item.icon) {
                    loadIcon();
                    const icon = document.createElement('pdx-icon');
                    icon.setAttribute('name', item.icon);
                    icon.setAttribute('size', '16');
                    a.appendChild(icon);
                }
                a.appendChild(document.createTextNode(item.label));
                a.addEventListener('click', (e) => {
                    if (!item.href || item.href === '#') e.preventDefault();
                    ctx.emit('pdx-select', { key: item.key, item });
                    setMobile(false);
                });
                container.appendChild(a);
            }
        }

        ctx.expose({
            /** Open or close the mobile menu, moving focus into it when it opens. */
            toggleMobile,
        });
        return {};
    },
    render: () => html`<slot></slot>`,
});
