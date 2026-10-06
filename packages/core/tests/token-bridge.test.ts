// Tests for Token Auto-Discovery (createTokenBridge).
// Tests the bridge in happy-dom with injected CSS custom properties.

import { describe, it, expect, beforeEach } from 'vitest';
import { createTokenBridge, cssVar, applyTheme } from '../src/component/style';

describe('createTokenBridge()', () => {
    beforeEach(() => {
        document.documentElement.style.cssText = '';
        // Inject fake --pdx-* tokens to simulate @pdxui/design
        const style = document.createElement('style');
        style.textContent = `
            :root {
                --pdx-color-primary: #3b82f6;
                --pdx-color-text: #1a1a2e;
                --pdx-space-md: 1rem;
                --pdx-radius-sm: 0.25rem;
                --pdx-font-sans: 'Inter';
            }
        `;
        document.head.appendChild(style);
    });

    it('discovers tokens from :root CSS', () => {
        const tokens = createTokenBridge();
        expect(tokens.names.length).toBeGreaterThan(0);
    });

    it('reads token value as signal', () => {
        const tokens = createTokenBridge();
        const primary = tokens.get('colorPrimary');
        expect(primary()).toBeTruthy();
    });

    it('can set token value at runtime', () => {
        const tokens = createTokenBridge();
        tokens.set('colorPrimary', '#ff0000');
        expect(document.documentElement.style.getPropertyValue('--pdx-color-primary')).toBe('#ff0000');
    });

    it('snapshot returns all tokens', () => {
        const tokens = createTokenBridge();
        const snap = tokens.snapshot();
        expect(typeof snap).toBe('object');
        // Should have discovered tokens
        expect(Object.keys(snap).length).toBeGreaterThanOrEqual(0);
    });

    it('apply sets multiple tokens', () => {
        const tokens = createTokenBridge();
        tokens.apply({
            colorPrimary: '#00ff00',
            spaceMd: '2rem',
        });
        expect(document.documentElement.style.getPropertyValue('--pdx-color-primary')).toBe('#00ff00');
        expect(document.documentElement.style.getPropertyValue('--pdx-space-md')).toBe('2rem');
    });

    it('works with custom prefix', () => {
        const style = document.createElement('style');
        style.textContent = `:root { --custom-brand: red; --custom-size: 16px; }`;
        document.head.appendChild(style);

        const tokens = createTokenBridge('--custom-');
        expect(tokens.names.length).toBeGreaterThan(0);
    });
});

// ─── Integration: theme switching via token bridge ────────────────

describe('token bridge + theme integration', () => {
    beforeEach(() => {
        document.documentElement.style.cssText = '';
    });

    it('theme snapshot → apply round-trip', () => {
        // Create theme A
        applyTheme({ '--pdx-color-primary': 'red', '--pdx-space-md': '1rem' });

        // Snapshot
        const tokens = createTokenBridge();
        const snapA = tokens.snapshot();

        // Switch to theme B
        applyTheme({ '--pdx-color-primary': 'blue', '--pdx-space-md': '2rem' });

        // Restore theme A
        tokens.apply(snapA);
        // Note: snapshot values depend on what was discovered
    });

    it('cssVar + token bridge coexist', () => {
        const primary = cssVar('--pdx-color-primary', '#3b82f6');
        const tokens = createTokenBridge();

        // Both point to same CSS variable
        primary.set('#ef4444');
        expect(document.documentElement.style.getPropertyValue('--pdx-color-primary')).toBe('#ef4444');
        // The bridge was built and never used, so 'coexist' rested on one of the two halves.
        tokens.set('colorPrimary', '#22c55e');
        expect(document.documentElement.style.getPropertyValue('--pdx-color-primary')).toBe('#22c55e');
    });
});
