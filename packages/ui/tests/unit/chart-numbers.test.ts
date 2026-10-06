// pdx-chart prints numbers in the page's locale, currencies in their own sign, and funnel values
// that can be read.
//
// Numbers do not go through toLocaleString() — the browser's locale: an English page in an Italian
// browser would show "24.500" on a gauge, and a currency axis '$' + that. Funnel values are not
// written in the background colour over the slice (dark on blue, white on yellow), and slices
// narrower than 60 px still show their value.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import { chartNumbers } from '../../src/chart/core/numbers';
import { resolveFormatter } from '../../src/chart/core/axis';
import { showTooltip, hideTooltip } from '../../src/chart/core/tooltip';
import { drawFunnel } from '../../src/chart/series/funnel';
import { parseRgb, contrastRatio } from '../../src/chart/core/color';
import type { ChartTheme, ChartArea } from '../../src/chart/core/types';
import type { CanvasRenderer } from '../../src/chart/core/renderer';

vi.mock('../../src/chart/core/engine', () => ({
    ChartEngine: class {
        update() {}
        destroy() {}
        getLegendItems() { return []; }
    },
}));
import '../../src/chart/pdx-chart';

const theme: ChartTheme = {
    palette: ['#1d4ed8', '#f5c542', '#0f766e', '#e11d48', '#7c3aed'],
    textColor: 'rgb(24, 24, 27)', mutedColor: '#666', gridColor: '#ccc', bgColor: 'rgb(250, 250, 250)',
    fontFamily: 'sans-serif', fontSize: 13,
};

describe('axis formatters speak the chart locale', () => {
    it('currency: the currency asked for, in the locale\'s form — not a fixed "$"', () => {
        const eur = resolveFormatter('currency', chartNumbers('de-DE', 'EUR'))!;
        expect(eur(24500)).toContain('€');
        expect(eur(24500)).not.toContain('$');
    });

    it('a {value} template gets a locale-formatted number', () => {
        expect(resolveFormatter('{value} pts', chartNumbers('de-DE'))!(1234.5)).toBe('1.234,5 pts');
    });
});

describe('tooltip', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('formats values with the chart\'s numbers, not the browser locale', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        showTooltip({
            x: 10, y: 10, label: 'Q1',
            points: [{ series: { name: 'Revenue', data: [], color: '#000' }, point: { x: 'Q1', y: 24500, raw: {}, index: 0 }, px: 0, py: 0 }],
        }, theme, host, chartNumbers('en-US'));
        expect(document.querySelector('.pdx-chart-tooltip')?.textContent).toContain('24,500');
        hideTooltip();
    });
});

describe('funnel labels', () => {
    function recorder() {
        const texts: { text: string; x: number; color: string }[] = [];
        let fill = '';
        const ctx = {
            beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, stroke() {},
            set fillStyle(v: string) { fill = v; }, get fillStyle() { return fill; },
            fill() {}, strokeStyle: '', lineWidth: 1,
        };
        const r = {
            ctx,
            measureText: (s: string) => s.length * 7,
            text(text: string, x: number, _y: number, color: string) { texts.push({ text, x, color }); },
        } as unknown as CanvasRenderer;
        return { r, texts };
    }
    const area: ChartArea = { x: 0, y: 0, width: 400, height: 300 };
    const data = [10000, 6000, 3000, 900, 200].map((y, index) => ({ x: `Stage ${index + 1}`, y, raw: {}, index }));

    it('every slice shows its value, and a value inside a slice contrasts 4.5:1 with it', () => {
        const { r, texts } = recorder();
        drawFunnel(r, data, area, theme, theme.palette, false, 1, chartNumbers('en-US'));
        const values = texts.filter(t => /\d/.test(t.text) && !t.text.startsWith('Stage'));
        expect(values.length).toBe(5);
        expect(values[0].text).toBe('10,000 (100%)');
        const cx = area.x + area.width / 2;
        values.forEach((v, i) => {
            if (v.x === cx) {   // drawn inside, centred on its slice
                expect(contrastRatio(parseRgb(v.color)!, parseRgb(theme.palette[i])!), `slice ${i + 1}`).toBeGreaterThanOrEqual(4.5);
            } else {            // drawn outside, on the surface
                expect(v.color).toBe(theme.textColor);
            }
        });
    });
});

describe('pdx-chart in the page locale', () => {
    beforeEach(cleanup);

    async function inLang(lang: string, attrs: Record<string, string>, data?: unknown[]): Promise<HTMLElement> {
        const wrap = document.createElement('div');
        wrap.lang = lang;
        const el = document.createElement('pdx-chart') as HTMLElement & Record<string, unknown>;
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        if (data) el.data = data;
        wrap.appendChild(el);
        document.body.appendChild(wrap);
        await tick(60);
        return el;
    }

    // en-US on purpose: this machine's own locale is it-IT, which writes 24500 as "24.500" like
    // de-DE does — a German page would pass with the browser's locale too.
    it('the data table formats values in the page lang', async () => {
        const el = await inLang('en-US', { type: 'bar', 'x-field': 'q', 'y-field': 'v' }, [{ q: 'Q1', v: 24500 }]);
        const table = document.getElementById(el.getAttribute('aria-describedby')!)!;
        expect(table.querySelector('tbody td')?.textContent).toBe('24,500');
    });

    it('y-format="currency" with currency="EUR" under lang="de" prints euros', async () => {
        const el = await inLang('de', { type: 'bar', 'x-field': 'q', 'y-field': 'v', 'y-format': 'currency', currency: 'EUR' }, [{ q: 'Q1', v: 24500 }]);
        const table = document.getElementById(el.getAttribute('aria-describedby')!)!;
        const cell = table.querySelector('tbody td')?.textContent ?? '';
        // German has no compact form for thousands: "24.500 €", with no stray ",0".
        expect(cell).toMatch(/^24\.500\s€$/);
    });

    it('a gauge\'s name reads its value in the page lang', async () => {
        const el = await inLang('en-US', { type: 'gauge', title: 'Revenue', value: '24500', max: '50000' });
        expect(el.getAttribute('aria-label')).toBe('Revenue: 24,500 of 0–50,000');
    });
});
