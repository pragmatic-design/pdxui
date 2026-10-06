// pdx-chart says what it shows, and can be driven from the keyboard.
//
// The host is not role="img" named "bar chart, 4 data points": that says no data, and — role="img"
// making its children presentational — nothing inside it could be reached. Legend toggles, tooltips
// and zoom work from the keyboard, not only through the canvas's mousemove and click. A gauge's name
// includes its value.
//
// happy-dom has no 2D canvas, so the engine is mocked (as chart-source.test does): these tests are
// about the accessible layer pdx-chart renders around it.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';

const calls = { visible: [] as [string, boolean][], focus: [] as (number | null)[] };
vi.mock('../../src/chart/core/engine', () => ({
    ChartEngine: class {
        private cfg: { yField?: string[]; seriesNames?: string[] } = {};
        update(cfg: { yField?: string[]; seriesNames?: string[] }) { this.cfg = cfg; }
        destroy() {}
        getLegendItems() {
            const names = this.cfg.seriesNames ?? this.cfg.yField ?? [];
            return names.map((name, i) => ({ name, color: ['#123456', '#654321'][i % 2], visible: true }));
        }
        setSeriesVisible(name: string, visible: boolean) { calls.visible.push([name, visible]); }
        focusPoint(i: number | null) { calls.focus.push(i); }
    },
}));

import '../../src/chart/pdx-chart';

const DATA = [
    { quarter: 'Q1', desktop: 4500, mobile: 3200 },
    { quarter: 'Q2', desktop: 5200, mobile: 3800 },
    { quarter: 'Q3', desktop: 4800, mobile: 4100 },
    { quarter: 'Q4', desktop: 5900, mobile: 4600 },
];

async function mountBar(): Promise<HTMLElement> {
    const el = document.createElement('pdx-chart') as HTMLElement & Record<string, unknown>;
    el.setAttribute('type', 'bar');
    el.setAttribute('x-field', 'quarter');
    el.setAttribute('y-field', 'desktop,mobile');
    el.setAttribute('series-names', 'Desktop,Mobile');
    el.setAttribute('title', 'Traffic by Device');
    el.data = DATA;
    document.body.appendChild(el);
    await tick(60);
    return el;
}

const describedTable = (el: HTMLElement) => {
    const id = el.getAttribute('aria-describedby');
    return id ? document.getElementById(id)?.querySelector('table') ?? document.getElementById(id) as HTMLTableElement | null : null;
};
const key = (t: HTMLElement, k: string) => t.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

describe('pdx-chart data alternative', () => {
    beforeEach(() => { cleanup(); calls.visible.length = 0; calls.focus.length = 0; });

    it('is a figure described by a table of its data: 4 rows, every value', async () => {
        const el = await mountBar();
        expect(el.getAttribute('role')).toBe('figure');
        const table = describedTable(el)!;
        expect(table?.tagName).toBe('TABLE');
        expect(Array.from(table.querySelectorAll('thead th')).map(th => th.textContent)).toEqual(['Category', 'Desktop', 'Mobile']);
        expect(table.querySelectorAll('tbody tr').length).toBe(4);
        const text = table.textContent!;
        // No lang on the page: the browser's language (resolveLocale) — happy-dom's
        // navigator, not the Node process's default locale.
        for (const v of [4500, 3200, 5200, 3800, 4800, 4100, 5900, 4600]) expect(text).toContain(v.toLocaleString(navigator.language));
        // The canvas carries nothing a screen reader could read: it is hidden from it.
        expect(el.querySelector('.pdx-chart-canvas')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('a gauge is named with its value and range', async () => {
        const el = document.createElement('pdx-chart') as HTMLElement & Record<string, unknown>;
        el.setAttribute('type', 'gauge');
        el.setAttribute('title', 'CPU Usage');
        el.setAttribute('value', '72');
        el.setAttribute('format', '{value}%');
        document.body.appendChild(el);
        await tick(60);
        expect(el.getAttribute('aria-label')).toBe('CPU Usage: 72% of 0–100');
    });
});

describe('pdx-chart legend', () => {
    beforeEach(() => { cleanup(); calls.visible.length = 0; calls.focus.length = 0; });

    it('is one button per series; pressing one hides it from the chart and from the table', async () => {
        const el = await mountBar();
        const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>('.pdx-chart-legend button'));
        expect(buttons.map(b => b.textContent?.trim())).toEqual(['Desktop', 'Mobile']);
        expect(buttons.map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'true']);
        buttons[1].click();
        await tick(20);
        expect(buttons[1].getAttribute('aria-pressed')).toBe('false');
        expect(calls.visible).toEqual([['Mobile', false]]);
        expect(Array.from(describedTable(el)!.querySelectorAll('thead th')).map(th => th.textContent)).toEqual(['Category', 'Desktop']);
    });
});

describe('pdx-chart keyboard', () => {
    beforeEach(() => { cleanup(); calls.visible.length = 0; calls.focus.length = 0; });

    it('focused, ArrowRight shows each point and announces it; Escape hides it', async () => {
        const el = await mountBar();
        expect(el.tabIndex).toBe(0);
        const live = el.querySelector('[aria-live="polite"]')!;
        el.focus();
        key(el, 'ArrowRight');
        await tick(20);
        expect(calls.focus).toEqual([0]);
        expect(live.textContent).toBe(`Q1: Desktop ${(4500).toLocaleString(navigator.language)}, Mobile ${(3200).toLocaleString(navigator.language)}`);
        key(el, 'ArrowRight');
        key(el, 'End');
        await tick(20);
        expect(calls.focus).toEqual([0, 1, 3]);
        expect(live.textContent).toContain('Q4');
        key(el, 'Escape');
        await tick(20);
        expect(calls.focus[calls.focus.length - 1]).toBeNull();
        expect(live.textContent).toBe('');
    });
});
