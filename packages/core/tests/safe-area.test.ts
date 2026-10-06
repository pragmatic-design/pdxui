// Coverage (C): safe-area — env(safe-area-inset-*) signals + CSS helper.

import { describe, it, expect } from 'vitest';
import { useSafeArea, injectSafeAreaCSS } from '../src/mobile/safe-area';

describe('safe area', () => {
    it('exposes numeric insets and a boolean hasInsets', () => {
        const sa = useSafeArea();
        const insets = sa.insets();
        expect(typeof insets.top).toBe('number');
        expect(typeof insets.right).toBe('number');
        expect(typeof insets.bottom).toBe('number');
        expect(typeof insets.left).toBe('number');
        expect(typeof sa.hasInsets()).toBe('boolean');
    });

    it('is a singleton', () => {
        expect(useSafeArea()).toBe(useSafeArea());
    });

    it('refresh() re-reads without throwing', () => {
        const sa = useSafeArea();
        expect(() => sa.refresh()).not.toThrow();
        // Environment with no insets → all zero, hasInsets false.
        expect(sa.hasInsets()).toBe(false);
    });

    it('injectSafeAreaCSS adds the style once (idempotent)', () => {
        injectSafeAreaCSS();
        injectSafeAreaCSS();
        const els = document.querySelectorAll('#pdx-safe-area-css');
        expect(els.length).toBe(1);
        expect(els[0].textContent).toContain('--pdx-safe-top');
    });
});
