// An empty <pdx-alert-dialog> does not take its host's content.
//
// A <pdx-alert-dialog> with only title/message — the normal case — must not end up holding a
// second copy of its host screen (two page headers, two `.page`, in
// `pdx-alert-dialog > .pdx-dialog-backdrop > .pdx-dialog-panel > .pdx-dialog-body`). Invisible while
// closed; visible as a doubled DOM count, duplicated ids, doubled handlers.
import { describe, it, expect, afterEach } from 'vitest';
import { component, html } from '@pdxui/core';
import '../../src/alert-dialog/pdx-alert-dialog';
import { uniqueTag, tick, cleanup } from './helpers';

afterEach(() => cleanup());

describe('an empty pdx-alert-dialog inside a component', () => {
    it("does not project the host's light-DOM children into its own slot", async () => {
        const host = uniqueTag('screen');
        component(host, {
            render: () => html`<div class="page"><slot></slot></div><pdx-alert-dialog title="t"></pdx-alert-dialog>`,
        });
        const el = document.createElement(host);
        el.innerHTML = '<p class="content">x</p>';
        document.body.appendChild(el);
        await tick();

        expect(el.querySelectorAll('p.content').length, 'the host content appears more than once').toBe(1);
        const body = el.querySelector('pdx-alert-dialog .pdx-dialog-body')!;
        expect(body.querySelector('p.content'), "the dialog took the host's content").toBeNull();
        expect(el.querySelector('.page')!.querySelector('p.content'), 'the content left its own slot').not.toBeNull();
    });

    it('when the host has no slot of its own, its children still do not end up in the dialog', async () => {
        const host = uniqueTag('screen');
        component(host, {
            render: () => html`<header class="head">h</header><pdx-alert-dialog title="t"></pdx-alert-dialog>`,
        });
        const el = document.createElement(host);
        el.innerHTML = '<p class="content">x</p>';
        document.body.appendChild(el);
        await tick();

        expect(el.querySelector('pdx-alert-dialog .pdx-dialog-body p.content'), "the dialog took the host's light DOM").toBeNull();
    });

    it("control — a host's own slot inside a child component's light DOM is filled", async () => {
        // `<inner><slot></slot></inner>` in the host's template: the slot is the HOST's, even though
        // it ends up inside another component. Telling slots apart by "is there a component between
        // it and the host" would break this, which is how content is passed down — measured: that
        // filter left this host's children nowhere.
        const inner = uniqueTag('inner');
        component(inner, { render: () => html`<div class="inner"><slot></slot></div>` });
        const host = uniqueTag('screen');
        const tpl = document.createElement('template');
        tpl.innerHTML = `<${inner}><slot></slot></${inner}>`;
        component(host, { render: () => document.importNode(tpl.content, true) });
        const el = document.createElement(host);
        el.innerHTML = '<p class="content">x</p>';
        document.body.appendChild(el);
        await tick();
        expect(el.querySelectorAll('p.content').length).toBe(1);
        expect(el.querySelector('.inner p.content'), "the host's children did not reach the slot it passed down").not.toBeNull();
    });

    it('control — an alert dialog WITH children projects exactly those', async () => {
        const host = uniqueTag('screen');
        component(host, {
            render: () => html`<div class="page"><slot></slot></div><pdx-alert-dialog title="t"><em class="mine">own</em></pdx-alert-dialog>`,
        });
        const el = document.createElement(host);
        el.innerHTML = '<p class="content">x</p>';
        document.body.appendChild(el);
        await tick();

        const body = el.querySelector('pdx-alert-dialog .pdx-dialog-body')!;
        expect(body.querySelectorAll('em.mine').length).toBe(1);
        expect(body.querySelector('p.content')).toBeNull();
        expect(el.querySelectorAll('p.content').length).toBe(1);
    });
});
