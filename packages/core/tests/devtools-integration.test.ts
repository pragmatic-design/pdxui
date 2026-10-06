// The devtools overlay, reading the real inspector — no mock of either.
//
// A mock written in the overlay's own idea of the data can disagree with what the inspector
// returns, and then a tab renders a header and no row while its tests pass. Here the panel is
// opened over what the inspector actually holds.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { signal, effect } from '../src/reactivity/signal';
import { component } from '../src/component/component';
import { html } from '../src/renderer/template';
import { initDevTools, toggle } from '../src/devtools/overlay';
import { getTelemetryLevel, setTelemetryLevel } from '../src/debug/inspector';

let before: ReturnType<typeof getTelemetryLevel>;
let panel: HTMLElement;
const content = () => panel.querySelector('#pdx-devtools-content')!;
const tab = (name: string) => (panel.querySelector(`[data-tab="${name}"]`) as HTMLElement).click();

beforeAll(() => {
    before = getTelemetryLevel();
    setTelemetryLevel(0);
    // The devtools are installed before the app builds anything — the plugin puts their script
    // first — and that is what makes the registries fill.
    initDevTools();
    toggle();
    panel = document.getElementById('pdx-devtools')!;
});

afterAll(() => {
    if (!panel.classList.contains('hidden')) toggle();
    setTelemetryLevel(before);
});

describe('the devtools overlay over the real inspector', () => {
    it('lists a named signal, with no manual level change', () => {
        signal(41, { name: 'cart:items' });
        tab('signals');
        expect(content().textContent).toContain('cart:items');
        expect(content().textContent).toContain('41');
    });

    it('shows a component and its props, read through tree() and inspect()', () => {
        component('pdx-805-widget', { props: { foo: { type: String, default: '' } }, render: () => html`<p></p>` });
        const widget = document.createElement('pdx-805-widget');
        widget.setAttribute('foo', 'bar');
        document.body.appendChild(widget);
        tab('components');
        expect(content().textContent).toContain('pdx-805-widget');
        expect(content().textContent).toContain('foo');
        expect(content().textContent).toContain('bar');
        widget.remove();
    });

    it('records a trace row, by the signal\'s name, once tracing is enabled from the panel', () => {
        const total = signal(1, { name: 'cart:total' });
        effect(() => { total(); });
        tab('trace');
        (content().querySelector('[data-action="enable-trace"]') as HTMLElement).click();

        total.set(2);
        tab('trace');

        const rows = content().querySelectorAll('.trace-entry');
        expect(rows.length, 'the trace log rendered no row').toBeGreaterThan(0);
        expect(content().textContent).toContain('cart:total');
        expect(content().textContent).toContain('2');
    });

    it('carries no inline handler, which a strict CSP blocks', () => {
        for (const name of ['components', 'signals', 'trace']) {
            tab(name);
            expect(panel.innerHTML).not.toContain('onclick=');
        }
    });

    it('installs one global, __PDX_DEVTOOLS__, and says the level it set', () => {
        expect((window as unknown as { __pdx_debug?: unknown }).__pdx_debug).toBeUndefined();
        expect((window as unknown as { __PDX_DEVTOOLS__?: { debug?: unknown } }).__PDX_DEVTOOLS__?.debug).toBeDefined();
        expect(getTelemetryLevel()).toBe(2);
        expect(panel.textContent).toContain('level 2');
    });
});
