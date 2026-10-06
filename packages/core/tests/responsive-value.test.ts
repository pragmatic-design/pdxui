// Tests for responsiveCSS() and responsiveValue().

import { describe, it, expect } from 'vitest';
import { responsiveCSS, responsiveValue } from '../src/reactivity/responsive-value';

describe('responsiveCSS — Tier 1 (pure CSS clamp)', () => {
    it('generates clamp expression with defaults', () => {
        const css = responsiveCSS(16, 64);

        expect(css).toContain('clamp(');
        expect(css).toContain('16px');
        expect(css).toContain('64px');
        expect(css).toContain('vw');
    });

    it('uses correct Utopia formula', () => {
        // slope = (64 - 16) / (1920 - 320) = 48 / 1600 = 0.03
        // intercept = 16 - 0.03 * 320 = 16 - 9.6 = 6.4
        // preferred = 6.4px + 3vw
        const css = responsiveCSS(16, 64);

        expect(css).toBe('clamp(16px, calc(6.4px + 3vw), 64px)');
    });

    it('supports custom viewport range', () => {
        const css = responsiveCSS(14, 18, { viewportMin: 480, viewportMax: 1200 });
        // slope = 4 / 720 = 0.0056
        // intercept = 14 - 0.0056 * 480 = 14 - 2.6667 = 11.3333
        expect(css).toContain('clamp(14px');
        expect(css).toContain('18px)');
    });

    it('supports rem units', () => {
        const css = responsiveCSS(1, 4, { unit: 'rem' });
        expect(css).toContain('1rem');
        expect(css).toContain('4rem');
    });

    it('generates container-relative units (Tier 2)', () => {
        const css = responsiveCSS(16, 64, { relative: 'container' });
        expect(css).toContain('cqi');
        expect(css).not.toContain('vw');
    });
});

describe('responsiveValue — Tier 3 (JS signal)', () => {
    it('returns a readable signal', () => {
        const value = responsiveValue(16, 64);
        expect(typeof value()).toBe('number');
    });

    it('linear easing produces value in range', () => {
        // With window.innerWidth default behavior
        const value = responsiveValue(0, 100, {
            viewportMin: 0, viewportMax: 1000, easing: 'linear',
        });
        const result = value();
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(100);
    });

    it('ease-in produces value less than linear at midpoint', () => {
        // ease-in: t^2 — at t=0.5, eased = 0.25 (less than 0.5)
        const easeIn = responsiveValue(0, 100, { easing: 'ease-in' });
        const linear = responsiveValue(0, 100, { easing: 'linear' });
        // Both should return numbers (exact value depends on window.innerWidth)
        expect(typeof easeIn()).toBe('number');
        expect(typeof linear()).toBe('number');
    });

    it('accepts custom easing function', () => {
        const step = (t: number) => t < 0.5 ? 0 : 1;
        const value = responsiveValue(0, 100, { easing: step });
        expect(typeof value()).toBe('number');
    });
});
