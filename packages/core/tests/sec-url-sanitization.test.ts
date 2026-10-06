// URL sanitization.
// Covers sanitizeUrl() policy + the DOM binding paths (bindProperty / setProp) that
// must drop dangerous URLs assigned to URL attributes (:href, :src, …).
//
// These tests fail if the sanitization is removed.

import { describe, it, expect } from 'vitest';
import { sanitizeUrl } from '../src/security/sanitize-url';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { setProp } from '../src/renderer/dom';

describe('sanitizeUrl — accepts safe targets', () => {
    it('passes relative / fragment / query URLs unchanged', () => {
        for (const u of ['/users/1', './x', '../y', '#section', '?q=1', 'page.html']) {
            expect(sanitizeUrl(u)).toBe(u);
        }
    });

    it('passes safe-scheme URLs unchanged', () => {
        for (const u of ['http://x.com', 'https://x.com/a?b=1', 'mailto:a@b.com', 'tel:+1555']) {
            expect(sanitizeUrl(u)).toBe(u);
        }
    });
});

describe('sanitizeUrl — rejects dangerous targets (→ null)', () => {
    it('rejects javascript: in any casing', () => {
        expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
        expect(sanitizeUrl('JaVaScRiPt:alert(1)')).toBeNull();
        expect(sanitizeUrl('JAVASCRIPT:void(0)')).toBeNull();
    });

    it('rejects data: / vbscript: schemes', () => {
        expect(sanitizeUrl('data:text/html,<script>1</script>')).toBeNull();
        expect(sanitizeUrl('vbscript:msgbox(1)')).toBeNull();
    });

    it('rejects control-char scheme smuggling (\\x09 inside javascript:)', () => {
        expect(sanitizeUrl('java\tscript:alert(1)')).toBeNull(); // \x09 TAB
        expect(sanitizeUrl('java\x09script:alert(1)')).toBeNull();
        expect(sanitizeUrl('java\nscript:alert(1)')).toBeNull();
    });

    it('rejects protocol-relative and backslash-smuggled URLs', () => {
        expect(sanitizeUrl('//evil.com')).toBeNull();
        expect(sanitizeUrl('\\\\evil.com')).toBeNull(); // \\evil.com
        expect(sanitizeUrl('/\\evil.com')).toBeNull();  // /\evil.com — browsers normalise \ → /
    });
});

// ─── DOM binding: dangerous URLs must never reach the live attribute ─────────

const DANGEROUS = ['javascript:alert(1)', '//evil.com'];

describe('template :href / :src binding drops dangerous URLs (reactive)', () => {
    it('reactive :href never exposes a javascript:/protocol-relative URL', () => {
        for (const bad of DANGEROUS) {
            const url = signal<string>(bad);
            const frag = html`<a :href=${() => url()}>x</a>`;
            document.body.appendChild(frag);
            const a = document.body.querySelector('a')!;

            // Dangerous value → href attribute removed / not pointing at the payload.
            expect(a.getAttribute('href')).toBeNull();

            // A safe value flows through normally.
            url.set('/safe/path');
            expect(a.getAttribute('href')).toBe('/safe/path');

            // Switching back to dangerous removes it again.
            url.set(bad);
            expect(a.getAttribute('href')).toBeNull();

            document.body.innerHTML = '';
        }
    });

    it('reactive :src never exposes a dangerous URL', () => {
        const url = signal<string>('javascript:alert(1)');
        const frag = html`<img :src=${() => url()} />`;
        document.body.appendChild(frag);
        const img = document.body.querySelector('img')!;

        expect(img.getAttribute('src')).toBeNull();

        url.set('/img.png');
        // src DOM property reflects to the attribute path; just assert the payload is gone.
        expect(img.getAttribute('src') ?? '').not.toContain('javascript:');
        document.body.innerHTML = '';
    });
});

describe('template :href binding drops dangerous URLs (static)', () => {
    it('static :href with a dangerous string is removed; safe string is kept', () => {
        const bad = html`<a :href=${'javascript:alert(1)'}>x</a>`;
        document.body.appendChild(bad);
        const a1 = document.body.querySelector('a')!;
        expect(a1.getAttribute('href')).toBeNull();
        document.body.innerHTML = '';

        const ok = html`<a :href=${'/dashboard'}>x</a>`;
        document.body.appendChild(ok);
        const a2 = document.body.querySelector('a')!;
        expect(a2.getAttribute('href')).toBe('/dashboard');
        document.body.innerHTML = '';
    });
});

describe('setProp() sanitizes URL attributes directly', () => {
    it('removes the attribute for a dangerous href/src value', () => {
        const a = document.createElement('a');
        setProp(a, 'href', 'javascript:alert(1)');
        expect(a.hasAttribute('href')).toBe(false);

        setProp(a, 'href', '//evil.com');
        expect(a.hasAttribute('href')).toBe(false);
    });

    it('keeps a safe href/src value', () => {
        const a = document.createElement('a');
        setProp(a, 'href', '/users/1');
        expect(a.getAttribute('href')).toBe('/users/1');
    });
});

// Regression: `data` must NOT be URL-sanitized. It is an overloaded property name —
// grids/charts/lists bind arrays/objects via :data. Sanitizing it stringified the value
// (`[object Object],…`), so <pdx-data-grid :data="rows"> received a 79-char string instead
// of the array (columns auto-detected to "0", empty rows). It is a URL only on <object>.
describe('data property is not treated as a URL', () => {
    it(':data binding in html`` assigns the array property, not a string', () => {
        const rows = signal<unknown[]>([{ id: 1 }, { id: 2 }, { id: 3 }]);
        const frag = html`<pdx-data-grid :data=${rows}></pdx-data-grid>`;
        document.body.appendChild(frag);
        const el = document.body.querySelector('pdx-data-grid')!;
        const bound = (el as unknown as { data: unknown }).data;
        expect(Array.isArray(bound)).toBe(true);
        expect((bound as unknown[]).length).toBe(3);
        document.body.innerHTML = '';
    });
});

// Inline event-handler attributes (onclick, onmouseover, …) are never a legitimate
// binding target — the framework's event syntax is @event. setProp must refuse them so a
// bound value can't create a live handler from data.
describe('setProp refuses inline on* handler attributes', () => {
    it('drops onclick set via setProp', () => {
        const el = document.createElement('div');
        setProp(el, 'onclick', 'alert(1)');
        expect(el.getAttribute('onclick')).toBeNull();
        expect((el as unknown as { onclick: unknown }).onclick).toBeNull();
    });
    it('drops onerror/onmouseover regardless of value', () => {
        const el = document.createElement('div');
        setProp(el, 'onerror', 'x()');
        setProp(el, 'onmouseover', 'y()');
        expect(el.getAttribute('onerror')).toBeNull();
        expect(el.getAttribute('onmouseover')).toBeNull();
    });
});
