// Safe Area — signals for env(safe-area-inset-*) + CSS helpers.
// For notch, home indicator, and status bar on mobile devices.

import { signal } from '../reactivity/signal';
import type { ReadonlySignal } from '../utils/types';

const isBrowser = typeof document !== 'undefined';

// ─── Types ─────────────────────────────────────────────────────

export interface SafeAreaInsets {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

export interface SafeAreaReturn {
    /** Current safe area insets in px (reactive). */
    insets: ReadonlySignal<SafeAreaInsets>;
    /** Whether the device has any safe area insets (reactive). */
    hasInsets: ReadonlySignal<boolean>;
    /** Force re-read insets (e.g. after orientation change). */
    refresh(): void;
}

// ─── Read insets via CSS env() ────────────────────────────────

function readInsets(): SafeAreaInsets {
    if (!isBrowser) return { top: 0, right: 0, bottom: 0, left: 0 };

    // Create a temporary element to read env() values
    const el = document.createElement('div');
    el.style.cssText = `
        position:fixed;visibility:hidden;pointer-events:none;
        padding-top:env(safe-area-inset-top,0px);
        padding-right:env(safe-area-inset-right,0px);
        padding-bottom:env(safe-area-inset-bottom,0px);
        padding-left:env(safe-area-inset-left,0px);
    `;
    document.body.appendChild(el);
    const cs = getComputedStyle(el);
    const insets: SafeAreaInsets = {
        top: parseFloat(cs.paddingTop) || 0,
        right: parseFloat(cs.paddingRight) || 0,
        bottom: parseFloat(cs.paddingBottom) || 0,
        left: parseFloat(cs.paddingLeft) || 0,
    };
    el.remove();
    return insets;
}

// ─── useSafeArea ──────────────────────────────────────────────

let _instance: SafeAreaReturn | null = null;

/** Singleton safe area signal. Re-reads on orientation change and resize. */
export function useSafeArea(): SafeAreaReturn {
    if (_instance) return _instance;

    const _insets = signal<SafeAreaInsets>(readInsets());
    const _hasInsets = signal(false);

    function refresh(): void {
        const insets = readInsets();
        _insets.set(insets);
        _hasInsets.set(insets.top > 0 || insets.right > 0 || insets.bottom > 0 || insets.left > 0);
    }

    if (isBrowser) {
        // Re-read on orientation change and resize
        window.addEventListener('orientationchange', () => setTimeout(refresh, 100));
        window.addEventListener('resize', refresh, { passive: true });
        // Initial read after DOM is ready
        refresh();
    }

    _instance = {
        insets: _insets as ReadonlySignal<SafeAreaInsets>,
        hasInsets: _hasInsets as ReadonlySignal<boolean>,
        refresh,
    };
    return _instance;
}

// ─── CSS Helper ───────────────────────────────────────────────

/**
 * Inject a <style> with CSS custom properties for safe area insets.
 * Usage in CSS: `padding-bottom: var(--pdx-safe-bottom, 0px);`
 */
export function injectSafeAreaCSS(): void {
    if (!isBrowser) return;
    if (document.getElementById('pdx-safe-area-css')) return;

    const style = document.createElement('style');
    style.id = 'pdx-safe-area-css';
    style.textContent = `
        :root {
            --pdx-safe-top: env(safe-area-inset-top, 0px);
            --pdx-safe-right: env(safe-area-inset-right, 0px);
            --pdx-safe-bottom: env(safe-area-inset-bottom, 0px);
            --pdx-safe-left: env(safe-area-inset-left, 0px);
        }
    `;
    document.head.appendChild(style);
}
