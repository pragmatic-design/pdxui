/**
 * Pragmatic Design CSS — Adaptive Runtime (~2KB)
 *
 * Provides JS-powered adaptive behaviors that CSS alone cannot handle:
 * - data-pdx-collapse: smooth collapse/expand with height animation
 * - data-pdx-drawer: off-canvas slide panel
 * - data-pdx-scheme-toggle: cycle light → dark → auto
 *
 * Auto-initializes on DOMContentLoaded + observes DOM for dynamic elements.
 * Also exports functions for programmatic use.
 */

// ==========================================================================
// Helpers: read CSS duration tokens at runtime
// ==========================================================================

function getDuration(token = '--pdx-duration-base') {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return parseInt(raw, 10) || 200; // fallback 200ms
}

// ==========================================================================
// Collapse: smooth height toggle via WAAPI
// ==========================================================================

function initCollapse(trigger) {
    const targetId = trigger.getAttribute('data-pdx-collapse');
    const target = document.getElementById(targetId);
    if (!target) return;

    // Initial state
    const isExpanded = target.getAttribute('data-pdx-collapse') !== 'collapsed';
    if (!isExpanded) {
        target.style.maxHeight = '0';
        target.style.overflow = 'hidden';
    }

    trigger.addEventListener('click', () => toggleCollapse(target));
}

export function toggleCollapse(target) {
    const isCollapsed = target.style.maxHeight === '0px' || target.style.maxHeight === '0';

    if (isCollapsed) {
        // Expand: measure natural height, animate from 0
        target.style.maxHeight = 'none';
        target.style.overflow = 'hidden';
        const height = target.scrollHeight;
        target.style.maxHeight = '0';

        // Force reflow
        void target.offsetHeight;

        const dur = getDuration('--pdx-duration-base');
        target.animate(
            [{ maxHeight: '0px' }, { maxHeight: height + 'px' }],
            { duration: dur, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }
        ).onfinish = () => {
            target.style.maxHeight = 'none';
            target.style.overflow = '';
            target.setAttribute('data-pdx-collapse', 'expanded');
        };
    } else {
        // Collapse: animate from current to 0
        const height = target.scrollHeight;
        target.style.overflow = 'hidden';

        const dur = getDuration('--pdx-duration-base');
        target.animate(
            [{ maxHeight: height + 'px' }, { maxHeight: '0px' }],
            { duration: dur, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }
        ).onfinish = () => {
            target.style.maxHeight = '0';
            target.setAttribute('data-pdx-collapse', 'collapsed');
        };
    }
}

// ==========================================================================
// Drawer: off-canvas panel with backdrop
// ==========================================================================

function initDrawer(trigger) {
    const drawerId = trigger.getAttribute('data-pdx-drawer');
    const drawer = document.getElementById(drawerId);
    if (!drawer) return;

    // Ensure drawer has transition styles
    drawer.style.transition = `transform ${getDuration('--pdx-duration-base')}ms cubic-bezier(0.4, 0, 0.2, 1)`;
    drawer.style.position = 'fixed';
    drawer.style.top = '0';
    drawer.style.bottom = '0';
    drawer.style.zIndex = 'var(--pdx-z-overlay, 300)';
    drawer.style.transform = 'translateX(-100%)';

    // Create backdrop
    let backdrop = drawer.parentElement.querySelector('.pdx-drawer-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'pdx-drawer-backdrop';
        backdrop.style.cssText = `
            position: fixed; inset: 0; z-index: calc(var(--pdx-z-overlay, 300) - 1);
            background: oklch(0 0 0 / 0.4); opacity: 0; pointer-events: none;
            transition: opacity ${getDuration('--pdx-duration-base')}ms cubic-bezier(0.4, 0, 0.2, 1);
        `;
        drawer.parentElement.insertBefore(backdrop, drawer);
    }

    trigger.addEventListener('click', () => toggleDrawer(drawer, backdrop));
    backdrop.addEventListener('click', () => closeDrawer(drawer, backdrop));
}

export function toggleDrawer(drawer, backdrop) {
    const isOpen = drawer.getAttribute('data-pdx-open') === 'true';
    if (isOpen) {
        closeDrawer(drawer, backdrop);
    } else {
        openDrawer(drawer, backdrop);
    }
}

function openDrawer(drawer, backdrop) {
    drawer.style.transform = 'translateX(0)';
    drawer.setAttribute('data-pdx-open', 'true');
    backdrop.style.opacity = '1';
    backdrop.style.pointerEvents = 'auto';

    // Trap focus (basic)
    const focusable = drawer.querySelector('a, button, input, [tabindex]');
    if (focusable) focusable.focus();

    // Close on Escape
    const onEscape = (e) => {
        if (e.key === 'Escape') {
            closeDrawer(drawer, backdrop);
            document.removeEventListener('keydown', onEscape);
        }
    };
    document.addEventListener('keydown', onEscape);
}

function closeDrawer(drawer, backdrop) {
    drawer.style.transform = 'translateX(-100%)';
    drawer.setAttribute('data-pdx-open', 'false');
    backdrop.style.opacity = '0';
    backdrop.style.pointerEvents = 'none';
}

// ==========================================================================
// Scheme Toggle: cycle light → dark → auto
// ==========================================================================

const SCHEMES = ['light', 'dark', 'auto'];

function initSchemeToggle(trigger) {
    trigger.addEventListener('click', () => cycleScheme());
}

export function cycleScheme() {
    const html = document.documentElement;
    const current = html.getAttribute('pdx-scheme') || 'auto';
    const idx = SCHEMES.indexOf(current);
    const next = SCHEMES[(idx + 1) % SCHEMES.length];
    html.setAttribute('pdx-scheme', next);
    return next;
}

export function setScheme(scheme) {
    document.documentElement.setAttribute('pdx-scheme', scheme);
}

export function setTheme(theme) {
    document.documentElement.setAttribute('pdx-theme', theme);
}

export function setDensity(density) {
    document.documentElement.setAttribute('pdx-density', density);
}

// ==========================================================================
// Auto-init: scan DOM on load + observe mutations
// ==========================================================================

function initAll(root = document) {
    root.querySelectorAll('[data-pdx-collapse]:not([data-pdx-init])').forEach((el) => {
        // Is it a trigger (has value pointing to target id)?
        const val = el.getAttribute('data-pdx-collapse');
        if (val && val !== 'collapsed' && val !== 'expanded' && document.getElementById(val)) {
            initCollapse(el);
            el.setAttribute('data-pdx-init', '');
        }
    });

    root.querySelectorAll('[data-pdx-drawer]:not([data-pdx-init])').forEach((el) => {
        initDrawer(el);
        el.setAttribute('data-pdx-init', '');
    });

    root.querySelectorAll('[data-pdx-scheme-toggle]:not([data-pdx-init])').forEach((el) => {
        initSchemeToggle(el);
        el.setAttribute('data-pdx-init', '');
    });
}

// Init on DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initAll());
} else {
    initAll();
}

// Observe DOM for dynamically added elements
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) initAll(node);
        }
    }
});

observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
});
