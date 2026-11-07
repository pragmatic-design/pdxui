// A custom element that is not a component renders to a string through what it registers (#160):
// the router's outlet writes the route it shows this way. And an element created by its tag
// (ServerElement) holds children, projected into a component's default slot.

import { describe, it, expect } from 'vitest';
import { html } from '../src/renderer/template';
import { component } from '../src/component/component';
import { prop } from '../src/component/component-descriptor';
import { renderToString, registerServerElement } from '../src/server/render-string';
import { serverElement } from '../src/server/mode';

describe('an element that renders itself on the server', () => {
    it('writes the attributes and the content its render gives, with the ones its template wrote', () => {
        registerServerElement('x-own-shell', (attrs) => ({
            attributes: { 'data-shown': attrs.get('name') ?? 'main' },
            content: html`<p>${'inside'}</p>`,
        }));
        const markup = renderToString(() => html`<x-own-shell name="side"><b>ignored</b></x-own-shell>`);
        expect(markup).toBe('<x-own-shell name="side" data-shown="side"><p><!--pdx-->inside<!--/pdx--></p></x-own-shell>');
    });

    it('without one, a custom element is a plain element with its template\'s children', () => {
        expect(renderToString(() => html`<x-not-registered><b>kept</b></x-not-registered>`)).toBe('<x-not-registered><b>kept</b></x-not-registered>');
    });
});

describe('an element created by its tag, with children', () => {
    it('projects them into a component\'s default slot, and holds them in a plain element', () => {
        component('own-frame', { props: { label: prop('') }, render: (ctx) => html`<section><h2>${ctx.label}</h2><slot></slot></section>` });
        registerServerElement('x-own-route', () => ({
            content: serverElement('own-frame', { label: 'Frame' }, {}, serverElement('div', { class: 'host' }, {}, serverElement('em', {}, {}, 'page'))),
        }));
        const markup = renderToString(() => html`<x-own-route></x-own-route>`);
        expect(markup).toContain('<own-frame label="Frame"');
        expect(markup).toContain('<h2><!--pdx-->Frame<!--/pdx--></h2>');
        expect(markup).toMatch(/<!--pdx-slot:\d+:--><div class="host"><em>page<\/em><\/div><!--\/pdx-slot-->/);
    });
});
