// Regression tests for router navigation security + param-replacement correctness
// (review #6.2: URL sanitization in navigate(), param boundary + encoding, pdx-link JSON guard).
//
// These pass with the fixes in runtime.ts/link.ts and would fail if they were removed.

import { describe, it, expect, beforeEach } from 'vitest';
import { createRouter, navigate, currentPath } from '../src/runtime';

beforeEach(() => {
    if (typeof history !== 'undefined') history.replaceState(null, '', '/');
});

describe('navigate() rejects external / dangerous targets', () => {
    it('does not navigate to a protocol-relative URL (//evil.com)', () => {
        createRouter([{ path: '/', component: () => document.createElement('div') }]);
        navigate('/');
        const before = currentPath();

        navigate('//evil.com');

        // Path unchanged, browser location not pointed at evil.com.
        expect(currentPath()).toBe(before);
        expect(location.href).not.toContain('evil.com');
    });

    it('does not navigate to a javascript: URL', () => {
        createRouter([{ path: '/', component: () => document.createElement('div') }]);
        navigate('/');
        const before = currentPath();

        // Must not throw and must not change the path.
        expect(() => navigate('javascript:alert(1)')).not.toThrow();
        expect(currentPath()).toBe(before);
        expect(location.href).not.toContain('javascript');
    });
});

describe('navigate() param replacement — boundary safety', () => {
    it(':id does NOT match inside :idCard (no /u/5Card)', () => {
        createRouter([
            { path: '/u/:idCard', component: () => document.createElement('div') },
        ]);

        navigate('/u/:idCard', { id: '5' });

        // The :id placeholder must not partially replace :idCard.
        expect(currentPath()).not.toBe('/u/5Card');
        // :idCard is left untouched (no param named idCard supplied), so it stays literal.
        expect(currentPath()).toBe('/u/:idCard');
    });

    it('replaces the exact :id placeholder when present', () => {
        createRouter([
            { path: '/u/:id', component: () => document.createElement('div') },
        ]);
        navigate('/u/:id', { id: '5' });
        expect(currentPath()).toBe('/u/5');
    });

    it('url-encodes param values containing spaces / unsafe chars', () => {
        createRouter([
            { path: '/u/:id', component: () => document.createElement('div') },
        ]);
        navigate('/u/:id', { id: 'a b' });
        expect(currentPath()).toBe('/u/' + encodeURIComponent('a b'));
        expect(currentPath()).toBe('/u/a%20b');
    });

    it('replaces ALL occurrences of a placeholder', () => {
        createRouter([
            { path: '/x/:id/y/:id', component: () => document.createElement('div') },
        ]);
        navigate('/x/:id/y/:id', { id: '7' });
        expect(currentPath()).toBe('/x/7/y/7');
    });
});

describe('pdx-link — malformed params attribute does not throw', () => {
    it('JSON.parse failure on params is swallowed in the click handler', async () => {
        // link.ts registers the custom element on import (side-effect).
        await import('../src/link');

        createRouter([
            { path: '/', component: () => document.createElement('div') },
            { path: '/dest', component: () => document.createElement('div') },
        ]);
        navigate('/');

        const link = document.createElement('pdx-link');
        link.setAttribute('to', '/dest');
        link.setAttribute('params', '{not valid json'); // malformed
        link.textContent = 'go';
        document.body.appendChild(link);

        const anchor = link.querySelector('a')!;
        // Clicking must not throw despite the malformed params attribute.
        expect(() => anchor.click()).not.toThrow();
        // Navigation still proceeds to the literal `to` (params ignored).
        expect(currentPath()).toBe('/dest');

        document.body.innerHTML = '';
    });
});
