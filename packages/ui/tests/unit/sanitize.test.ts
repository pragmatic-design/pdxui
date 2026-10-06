// XSS / sanitizer tests — especially nested payloads inside disallowed wrappers,
// which previously bypassed sanitization when children were promoted unvisited.

import { describe, it, expect } from 'vitest';
import { sanitizeHTML, sanitizeSVG } from '../../src/shared/sanitize';

describe('sanitizeHTML', () => {
    it('strips event handlers on top-level elements', () => {
        const out = sanitizeHTML('<img src="x" onerror="alert(1)">');
        expect(out).not.toMatch(/onerror/i);
    });

    it('strips event handlers on children promoted from a DISALLOWED wrapper', () => {
        // Regression: <wrapper> is not allowed → removed, its <img> promoted. The img must
        // still be sanitized (no onerror), not bypass the walk.
        const out = sanitizeHTML('<wrapper><img src="x" onerror="alert(1)"></wrapper>');
        expect(out).not.toMatch(/onerror/i);
        expect(out).toMatch(/<img/i);
    });

    it('sanitizes deeply nested payloads through multiple disallowed wrappers', () => {
        const out = sanitizeHTML('<a-x><b-y><img src=x onerror="alert(1)"><span onclick="x()">t</span></b-y></a-x>');
        expect(out).not.toMatch(/onerror/i);
        expect(out).not.toMatch(/onclick/i);
    });

    it('removes script tags even inside disallowed wrappers', () => {
        const out = sanitizeHTML('<wrapper><script>alert(1)</script><b>ok</b></wrapper>');
        expect(out).not.toMatch(/<script/i);
        expect(out).toMatch(/<b>ok<\/b>/i);
    });

    it('drops javascript: URLs', () => {
        const out = sanitizeHTML('<a href="javascript:alert(1)">x</a>');
        expect(out).not.toMatch(/javascript:/i);
    });
});

// An image's src gets the media policy, as a bound src does: a raster data:image and a blob: URL are
// pictures, not navigation. The link policy drops them, and pdx-rich-text would lose every pasted
// image when HTML came back in. Links keep the link policy.
describe('sanitizeHTML: an image src gets the media policy', () => {
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const src = (html: string) => new DOMParser().parseFromString(html, 'text/html').querySelector('img, source')?.getAttribute('src') ?? null;

    it('keeps a raster data:image and a blob: src on img and source', () => {
        expect(src(sanitizeHTML(`<img src="${PNG}" alt="x">`))).toBe(PNG);
        expect(src(sanitizeHTML('<img src="blob:http://localhost/1b2c">'))).toBe('blob:http://localhost/1b2c');
        expect(src(sanitizeHTML(`<picture><source src="${PNG}"></picture>`))).toBe(PNG);
    });

    it('the controls: an html or svg data: src and a javascript: src are still removed', () => {
        for (const bad of ['data:text/html,<script>alert(1)</script>', 'data:image/svg+xml,<svg onload="alert(1)"/>', 'javascript:alert(1)']) {
            expect(src(sanitizeHTML(`<img src='${bad}' alt="x">`)), bad).toBeNull();
        }
    });

    it('the control: a link keeps the link policy, a data:image href is removed', () => {
        const out = sanitizeHTML(`<a href="${PNG}">x</a>`);
        expect(out).not.toMatch(/href=/i);
    });
});

describe('sanitizeSVG', () => {
    it('strips event handlers on children promoted from a disallowed wrapper', () => {
        const out = sanitizeSVG('<foo><image href="x" onerror="alert(1)"></foo>');
        expect(out).not.toMatch(/onerror/i);
    });

    it('removes script inside disallowed wrappers', () => {
        const out = sanitizeSVG('<foo><script>alert(1)</script><circle r="4"></circle></foo>');
        expect(out).not.toMatch(/<script/i);
    });
});
