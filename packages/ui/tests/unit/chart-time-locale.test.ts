// pdx-chart prints time-axis dates in the page's locale.
//
// Everything the chart prints uses one locale — the `locale` prop, then the nearest `lang`, then the
// browser — and the time scale is part of it: `timeScale().format` with
// toLocaleDateString(undefined, …) takes the browser's locale, so an English page in an Italian
// browser would label its time axis "3 set", "10 set". This machine is it-IT, which is what makes
// the en-US cases below discriminate.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import { timeScale } from '../../src/chart/core/scales';

// The chart draws on a canvas, which happy-dom has not got: a renderer that records the text it is
// asked to draw, and does nothing else.
vi.mock('../../src/chart/core/renderer', () => {
    const noop: object = new Proxy(function () { /* no canvas */ }, { get: () => noop, apply: () => noop, set: () => true });
    class CanvasRenderer {
        canvas = document.createElement('canvas');
        ctx = noop;
        width = 640;
        height = 320;
        constructor(container: HTMLElement) {
            container.appendChild(this.canvas);
            (globalThis as { __chartTexts?: string[] }).__chartTexts = [];
        }
        resize() { return false; }
        clear() { (globalThis as { __chartTexts?: string[] }).__chartTexts = []; }
        line() {} polyline() {} smoothLine() {} fillArea() {} circle() {} rect() {}
        text(s: string) { (globalThis as { __chartTexts?: string[] }).__chartTexts!.push(String(s)); }
        measureText(s: string) { return String(s).length * 7; }
        destroy() {}
    }
    return { CanvasRenderer };
});
import '../../src/chart/pdx-chart';

const day = (d: number) => new Date(2026, 8, d);   // September 2026, local time

describe('timeScale formats dates in the locale it is given', () => {
    it('en-US: "Sep 3"', () => {
        expect(timeScale([day(1), day(20)], [0, 400], 'en-US').format(day(3))).toBe('Sep 3');
    });

    it('de-DE: "3. Sept."', () => {
        expect(timeScale([day(1), day(20)], [0, 400], 'de-DE').format(day(3))).toBe('3. Sept.');
    });

    it('an intraday axis prints times in the locale: en-US 12-hour, de-DE 24-hour', () => {
        const d0 = new Date(2026, 8, 3, 9, 0), d1 = new Date(2026, 8, 3, 17, 0);
        const at = new Date(2026, 8, 3, 15, 30);
        expect(timeScale([d0, d1], [0, 400], 'en-US').format(at)).toMatch(/^03:30\sPM$/);
        expect(timeScale([d0, d1], [0, 400], 'de-DE').format(at)).toBe('15:30');
    });
});

describe('pdx-chart labels its time axis in the page lang', () => {
    beforeEach(cleanup);

    it('lang="en-US": the axis reads "Sep …", whatever the browser', async () => {
        const wrap = document.createElement('div');
        wrap.lang = 'en-US';
        const el = document.createElement('pdx-chart') as HTMLElement & Record<string, unknown>;
        el.setAttribute('type', 'line');
        el.setAttribute('x-field', 'd');
        el.setAttribute('y-field', 'v');
        el.data = [1, 5, 10, 15, 20].map((d, i) => ({ d: day(d), v: 10 + i }));
        wrap.appendChild(el);
        document.body.appendChild(wrap);
        await tick(80);
        const texts = (globalThis as { __chartTexts?: string[] }).__chartTexts ?? [];
        const dates = texts.filter((t) => /\b(Sep|set)\b/i.test(t));
        expect(dates.length, `no date label was drawn: ${JSON.stringify(texts)}`).toBeGreaterThan(0);
        for (const t of dates) expect(t).toMatch(/^Sep \d{1,2}$/);
    });
});
