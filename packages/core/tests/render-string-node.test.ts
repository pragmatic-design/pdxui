// @vitest-environment node
// Rendering to a string in Node (#160), where static generation runs: no DOM, only the server DOM
// (dom-shim.ts), installed before core and the components are imported, as the build will do. A
// component defined with component() is constructed and runs the client's own body() there.

import { describe, it, expect, beforeAll } from 'vitest';
import { installServerDom } from '../src/server/dom-shim';

type Core = {
    html: typeof import('../src/renderer/template').html;
    renderToStringWithReport: typeof import('../src/server/render-string').renderToStringWithReport;
    component: typeof import('../src/component/component').component;
    prop: typeof import('../src/component/component-descriptor').prop;
    signal: typeof import('../src/reactivity/signal').signal;
    PART_OPEN: string;
    PART_CLOSE: string;
};
let core: Core;

beforeAll(async () => {
    expect(typeof document, 'this suite runs with no DOM').toBe('undefined');
    installServerDom();
    const [template, render, comp, descriptor, signals] = await Promise.all([
        import('../src/renderer/template'), import('../src/server/render-string'),
        import('../src/component/component'), import('../src/component/component-descriptor'),
        import('../src/reactivity/signal'),
    ]);
    core = {
        html: template.html, renderToStringWithReport: render.renderToStringWithReport, component: comp.component,
        prop: descriptor.prop, signal: signals.signal, PART_OPEN: render.PART_OPEN, PART_CLOSE: render.PART_CLOSE,
    };
});

describe('renderToString in Node', () => {
    it('renders a template', () => {
        const { html, signal, PART_OPEN, PART_CLOSE } = core;
        const count = signal(3);
        const { html: markup } = core.renderToStringWithReport(() => html`<p class="n" :title=${() => `${count()} items`}>${count}</p>`);
        expect(markup).toBe(`<p class="n" title="3 items">${PART_OPEN}3${PART_CLOSE}</p>`);
    });

    it('renders a component: props from attributes and properties, setup, its own template, a slot', () => {
        const { html, component, prop, PART_OPEN, PART_CLOSE } = core;
        component('node-card', {
            props: { label: prop('none'), count: prop(0, { type: Number }), items: prop<string[]>([]) },
            variants: { size: ['md', 'lg'] },
            setup: (ctx) => ({ total: () => ctx.count() + ctx.items().length }),
            render: (ctx) => html`<div class="card"><h2>${ctx.label}</h2><span>${() => ctx.total()}</span><slot></slot></div>`,
        });
        const { html: markup, skipped } = core.renderToStringWithReport(() =>
            html`<node-card label="Hi" count="2" size="lg" :items=${['a', 'b']}><em>child</em></node-card>`);
        expect(skipped).toEqual([]);
        expect(markup).toContain('<node-card');
        expect(markup).toContain('data-pdx-ssr=""');
        expect(markup).toContain('size="lg"');
        expect(markup).toContain(`<h2>${PART_OPEN}Hi${PART_CLOSE}</h2>`);
        expect(markup).toContain(`<span>${PART_OPEN}4${PART_CLOSE}</span>`);
        expect(markup, 'the child is projected where the slot was').toContain('<em>child</em></div>');
        expect(markup).not.toContain('<slot');
    });

    it('a component that reaches for document renders as an empty host, and is reported', () => {
        const { html, component } = core;
        component('node-imperative', {
            setup: () => { const el = document.createElement('div'); return { el }; },
            render: () => html`<p>never</p>`,
        });
        const { html: markup, skipped } = core.renderToStringWithReport(() => html`<node-imperative></node-imperative>`);
        expect(markup).toContain('<node-imperative');
        expect(markup).not.toContain('never');
        expect(skipped).toHaveLength(1);
        expect(skipped[0].tag).toBe('node-imperative');
        expect(skipped[0].reason).toMatch(/document/);
    });
});
