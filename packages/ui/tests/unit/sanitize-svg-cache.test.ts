// sanitizeSVG parses an input once, not once per call (#896).
//
// Every named `pdx-icon` and every menu icon goes through it, so the same handful of icons was parsed
// again for every instance that drew one: 23% of a `pdx-rich-text` mount, whose toolbar draws about
// 20. Memoised, 100 editors draw in 68 ms instead of 114.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { sanitizeSVG } from '../../src/shared/sanitize';

afterEach(() => { vi.restoreAllMocks(); });

const parses = () => vi.spyOn(DOMParser.prototype, 'parseFromString');

describe('sanitizeSVG — one parse per input', () => {
    it('parses the same input once, however often it is asked', () => {
        const svg = '<svg viewBox="0 0 24 24"><path d="M1 1h22"/></svg>';
        const spy = parses();
        const first = sanitizeSVG(svg);
        for (let i = 0; i < 1000; i++) expect(sanitizeSVG(svg)).toBe(first);
        expect(spy.mock.calls.length, 'the input was parsed again').toBeLessThanOrEqual(1);
    });

    it('strips what it stripped, on the first call and on the next', () => {
        const svg = '<svg onload="alert(1)"><path d="M0 0"/><script>alert(2)</script></svg>';
        for (let i = 0; i < 2; i++) {
            const out = sanitizeSVG(svg);
            expect(out).not.toMatch(/onload|script/);
            expect(out).toMatch(/<path/);
        }
    });

    it('keeps at most 256 inputs: past them, the oldest is parsed again', () => {
        const first = '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>';
        sanitizeSVG(first);
        for (let i = 0; i < 300; i++) sanitizeSVG(`<svg viewBox="0 0 ${i + 2} 1"><path d="M0 0"/></svg>`);
        const spy = parses();
        sanitizeSVG(first);
        expect(spy.mock.calls.length, 'the cache grew past its bound').toBe(1);
    });
});
