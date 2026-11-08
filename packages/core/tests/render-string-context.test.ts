// @vitest-environment node
// provide/inject while rendering to a string in Node (#160): a component provides to the components
// inside it — its template's, and the ones its parent gave it, which a slot projects — and they inject
// it in their setup, as in the browser. On the server no element is in a tree, so the render keeps
// the chain itself: a host built while another renders its content has that one as its parent.

import { describe, it, expect, beforeAll } from 'vitest';
import { installServerDom } from '../src/server/dom-shim';

type Api = {
    html: typeof import('../src/renderer/template').html;
    renderToStringWithReport: typeof import('../src/server/render-string').renderToStringWithReport;
    component: typeof import('../src/component/component').component;
    context: typeof import('../src/component/context').context;
    provide: typeof import('../src/component/context').provide;
    inject: typeof import('../src/component/context').inject;
};
let api: Api;

beforeAll(async () => {
    expect(typeof document, 'this suite runs with no DOM').toBe('undefined');
    installServerDom();
    const [template, render, comp, ctx] = await Promise.all([
        import('../src/renderer/template'), import('../src/server/render-string'),
        import('../src/component/component'), import('../src/component/context'),
    ]);
    api = {
        html: template.html, renderToStringWithReport: render.renderToStringWithReport, component: comp.component,
        context: ctx.context, provide: ctx.provide, inject: ctx.inject,
    };
});

describe('provide and inject on the server', () => {
    it('a component injects what an ancestor component provides, in its own template and through a slot', () => {
        const { html, component, context, provide, inject, renderToStringWithReport } = api;
        const Theme = context<string>('theme');
        component('ctx-provider', {
            setup: (c) => { provide(Theme, 'dark', c.el); return {}; },
            render: () => html`<section><ctx-reader></ctx-reader><slot></slot></section>`,
        });
        component('ctx-reader', {
            setup: (c) => ({ theme: inject(Theme, c.el, 'none') }),
            render: (c) => html`<em>${c.theme}</em>`,
        });
        const { html: markup, skipped } = renderToStringWithReport(() => html`<ctx-provider><ctx-reader></ctx-reader></ctx-provider>`);
        expect(skipped).toEqual([]);
        // Twice: the one the provider's template renders, and the one its parent projected into the slot.
        expect(markup.match(/<em><!--pdx-->dark<!--\/pdx--><\/em>/g)).toHaveLength(2);
        expect(markup).not.toContain('none');
    });

    it('a component that puts its DOM work off to a frame renders; on the server the frame never comes', () => {
        const { html, component, renderToStringWithReport } = api;
        let ran = false;
        component('ctx-framed', {
            // The pattern the framework teaches: read in the effect, touch the DOM in a frame.
            setup: (c) => { c.track(() => { requestAnimationFrame(() => { ran = true; }); }); return {}; },
            render: () => html`<i>framed</i>`,
        });
        const { html: markup, skipped } = renderToStringWithReport(() => html`<ctx-framed></ctx-framed>`);
        expect(skipped).toEqual([]);
        expect(markup).toContain('<i>framed</i>');
        expect(ran, 'a frame ran on the server').toBe(false);
    });

    it('a component that queries its own DOM once mounted finds nothing on the server, and is no error', async () => {
        const { html, component, renderToStringWithReport } = api;
        let found: unknown = 'not asked';
        component('ctx-query', {
            // As pdx-select does: the query is put off until the render has landed.
            setup: (c) => { queueMicrotask(() => { found = c.el.querySelector('.inner'); c.el.querySelectorAll('.inner').length; }); return {}; },
            render: () => html`<span class="inner">x</span>`,
        });
        const { html: markup, skipped } = renderToStringWithReport(() => html`<ctx-query></ctx-query>`);
        await Promise.resolve();
        expect(skipped).toEqual([]);
        expect(markup).toContain('<span class="inner">x</span>');
        expect(found, 'a server element holds no nodes: its query finds none').toBeNull();
    });

    it('closest() walks the hosts it was rendered in, as a field looks for the nearest lang', () => {
        const { html, component, renderToStringWithReport } = api;
        component('ctx-lang-box', { render: () => html`<div><slot></slot></div>` });
        component('ctx-lang-field', {
            setup: (c) => ({ lang: c.el.closest('[lang]:not([lang=""])')?.getAttribute('lang') ?? 'none', box: c.el.closest('ctx-lang-box') !== null }),
            render: (c) => html`<i>${c.lang} ${String(c.box)}</i>`,
        });
        const { html: markup, skipped } = renderToStringWithReport(() =>
            html`<ctx-lang-box lang="it"><ctx-lang-field></ctx-lang-field></ctx-lang-box><ctx-lang-field></ctx-lang-field>`);
        expect(skipped).toEqual([]);
        expect(markup).toContain('<i><!--pdx-->it<!--/pdx--> <!--pdx-->true<!--/pdx--></i>');
        expect(markup).toContain('<i><!--pdx-->none<!--/pdx--> <!--pdx-->false<!--/pdx--></i>');
    });

    it('a selector the server DOM cannot match is an error that names it, not a silent miss', () => {
        const { html, component, renderToStringWithReport } = api;
        component('ctx-sel', { setup: (c) => ({ x: c.el.closest('div > p') }), render: () => html`<b></b>` });
        const { skipped } = renderToStringWithReport(() => html`<ctx-sel></ctx-sel>`);
        expect(skipped[0]?.reason).toContain('div > p');
    });

    it('a component that observes its host renders; on the server nothing mutates, resizes or comes into view', () => {
        const { html, component, renderToStringWithReport } = api;
        let called = false;
        component('ctx-observer', {
            setup: (c) => {
                const notify = () => { called = true; };
                new MutationObserver(notify).observe(c.el, { childList: true });
                new ResizeObserver(notify).observe(c.el);
                new IntersectionObserver(notify).observe(c.el);
                return {};
            },
            render: () => html`<i>watched</i>`,
        });
        const { html: markup, skipped } = renderToStringWithReport(() => html`<ctx-observer></ctx-observer>`);
        expect(skipped).toEqual([]);
        expect(markup).toContain('<i>watched</i>');
        expect(called).toBe(false);
    });

    it('with no provider above, inject gives its fallback', () => {
        const { html, component, context, inject, renderToStringWithReport } = api;
        const Missing = context<string>('missing');
        component('ctx-orphan', {
            setup: (c) => ({ value: inject(Missing, c.el, 'fallback') }),
            render: (c) => html`<b>${c.value}</b>`,
        });
        const { html: markup, skipped } = renderToStringWithReport(() => html`<ctx-orphan></ctx-orphan>`);
        expect(skipped).toEqual([]);
        expect(markup).toContain('<b><!--pdx-->fallback<!--/pdx--></b>');
    });
});
