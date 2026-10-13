// An exposed method is also an invoker command (#140): `<button commandfor="d" command="--show">`
// makes the browser dispatch a `command` event on the element `d`, whose `command` is `--show`, and
// the component calls its exposed `show()`.
//
// happy-dom has no CommandEvent, so the event is built here as the browser delivers it to the target:
// an Event named `command` with a `command` property. That a real button reaches it is measured in
// Chromium (packages/responsive/tests/integration/ui-components/invoker-commands.spec.ts).

import { describe, it, expect, afterEach } from 'vitest';
import { component } from '../src/component/component';
import { html } from '../src/renderer/template';

let seq = 0;
const tag = () => `x-cmd-${++seq}`;
const mounted: HTMLElement[] = [];
afterEach(() => { for (const el of mounted.splice(0)) el.remove(); });

function mount(name: string): HTMLElement {
    const el = document.createElement(name);
    document.body.appendChild(el);
    mounted.push(el);
    return el;
}

/** What the browser dispatches on the `commandfor` target when the button is pressed. */
function command(el: HTMLElement, value: string): void {
    const e = new Event('command', { cancelable: true });
    Object.defineProperty(e, 'command', { value });
    el.dispatchEvent(e);
}

/** A component exposing show() and close(), recording each call, and a value that is not a method. */
function dialogLike(): { name: string; calls: string[] } {
    const name = tag();
    const calls: string[] = [];
    component(name, {
        setup(ctx) {
            ctx.expose({ show: () => calls.push('show'), close: () => calls.push('close'), count: 3 });
        },
        render: () => html`<p>x</p>`,
    });
    return { name, calls };
}

describe('an exposed method is an invoker command', () => {
    it('command="--show" calls the exposed show()', () => {
        const { name, calls } = dialogLike();
        const el = mount(name);
        command(el, '--show');
        command(el, '--close');
        expect(calls).toEqual(['show', 'close']);
    });

    it('a command that names nothing exposed, or a value that is not a method, calls nothing', () => {
        const { name, calls } = dialogLike();
        const el = mount(name);
        command(el, '--open');
        command(el, '--count');
        expect(calls).toEqual([]);
    });

    it('a built-in command (no --) is the platform\'s, not the component\'s', () => {
        const name = tag();
        const calls: string[] = [];
        component(name, {
            setup(ctx) { ctx.expose({ close: () => calls.push('close') }); },
            render: () => html`<p>x</p>`,
        });
        command(mount(name), 'close');
        expect(calls).toEqual([]);
    });

    it('re-exposing on reconnect does not call a method twice', () => {
        const { name, calls } = dialogLike();
        const el = mount(name);
        el.remove();
        document.body.appendChild(el);
        command(el, '--show');
        expect(calls).toEqual(['show']);
    });
});
