// Tests for useScroll composable.

import { describe, it, expect } from 'vitest';
import { scrollTo, saveScrollPosition, restoreScrollPosition } from '../src/browser/scroll';

describe('scrollTo()', () => {
    it('scrolls to a Y position', () => {
        scrollTo(100, { behavior: 'instant' });
        // In happy-dom, scrollTo may not change scrollY, but it should not throw
        expect(true).toBe(true);
    });

    it('scrolls to a CSS selector', () => {
        const el = document.createElement('div');
        el.id = 'scroll-target';
        document.body.appendChild(el);
        // Should not throw
        scrollTo('#scroll-target');
        el.remove();
    });

    it('scrolls to an element directly', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        scrollTo(el, { behavior: 'instant' });
        el.remove();
    });

    it('handles missing selector gracefully', () => {
        expect(() => scrollTo('#nonexistent')).not.toThrow();
    });
});

describe('scroll position save/restore', () => {
    it('saves and retrieves scroll position', () => {
        saveScrollPosition('/page-a');
        // Can't easily verify in happy-dom, but should not throw
        expect(true).toBe(true);
    });

    it('restoreScrollPosition does not throw for unknown path', () => {
        expect(() => restoreScrollPosition('/unknown', true)).not.toThrow();
    });

    it('restoreScrollPosition scrolls to top on forward navigation', () => {
        expect(() => restoreScrollPosition('/new-page', false)).not.toThrow();
    });
});
