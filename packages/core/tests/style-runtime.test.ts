// Tests for Reactive Style Runtime.

import { describe, it, expect, beforeEach } from 'vitest';
import { cssVar, createTheme, applyTheme } from '../src/component/style';
import { viewport, screen, adaptive } from '../src/component/viewport';

describe('cssVar()', () => {
    beforeEach(() => {
        document.documentElement.style.cssText = '';
    });

    it('creates a signal and sets CSS variable', () => {
        const primary = cssVar('--test-primary', '#3b82f6');
        expect(primary()).toBe('#3b82f6');
        expect(document.documentElement.style.getPropertyValue('--test-primary')).toBe('#3b82f6');
    });

    it('updates CSS variable when signal changes', () => {
        const color = cssVar('--test-color', 'red');
        color.set('blue');
        expect(document.documentElement.style.getPropertyValue('--test-color')).toBe('blue');
    });
});

describe('createTheme() + applyTheme()', () => {
    beforeEach(() => {
        document.documentElement.style.cssText = '';
    });

    it('creates a theme record', () => {
        const theme = createTheme({
            '--primary': '#3b82f6',
            '--bg': '#ffffff',
        });
        expect(theme['--primary']).toBe('#3b82f6');
        expect(theme['--bg']).toBe('#ffffff');
    });

    it('applies theme to :root', () => {
        const theme = createTheme({ '--test-theme-a': 'red', '--test-theme-b': 'blue' });
        applyTheme(theme);
        expect(document.documentElement.style.getPropertyValue('--test-theme-a')).toBe('red');
        expect(document.documentElement.style.getPropertyValue('--test-theme-b')).toBe('blue');
    });
});

describe('viewport signals', () => {
    it('viewport.width returns a number', () => {
        expect(typeof viewport.width()).toBe('number');
        expect(viewport.width()).toBeGreaterThan(0);
    });

    it('viewport.height returns a number', () => {
        expect(typeof viewport.height()).toBe('number');
    });

    it('viewport.scrollY returns a number', () => {
        expect(typeof viewport.scrollY()).toBe('number');
    });
});

describe('screen signals', () => {
    it('screen.prefersReducedMotion is a boolean', () => {
        expect(typeof screen.prefersReducedMotion()).toBe('boolean');
    });

    it('screen.prefersDark is a boolean', () => {
        expect(typeof screen.prefersDark()).toBe('boolean');
    });

    it('screen.isTouch is a boolean', () => {
        expect(typeof screen.isTouch()).toBe('boolean');
    });
});

describe('adaptive()', () => {
    beforeEach(() => {
        document.documentElement.removeAttribute('pdx-adaptive');
    });

    it('creates boolean signals from conditions', () => {
        const features = adaptive({
            alwaysTrue: () => true,
            alwaysFalse: () => false,
        });

        expect(features.alwaysTrue()).toBe(true);
        expect(features.alwaysFalse()).toBe(false);
    });

    it('writes active flags to html pdx-adaptive attribute', () => {
        adaptive({
            flagA: () => true,
            flagB: () => false,
            flagC: () => true,
        });

        const attr = document.documentElement.getAttribute('pdx-adaptive');
        expect(attr).toContain('flagA');
        expect(attr).toContain('flagC');
        expect(attr).not.toContain('flagB');
    });
});
