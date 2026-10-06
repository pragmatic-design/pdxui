// emit(event, detail, { bubbles: false }) — an event that describes a component's own state stays on
// the component.
//
// With bubbles: true, a select's pdx-close reaches the @pdx-close of the dialog around it, and the
// dialog vanishes whenever an option is picked. The popup events opt out, like the native close of
// <dialog> and toggle of <details>.
import { describe, it, expect, afterEach } from 'vitest';
import { component } from '../src/component/component';
import { html } from '../src/renderer/template';

type Emitting = HTMLElement & { emit(e: string, d?: unknown, o?: { bubbles?: boolean }): void };

let seq = 0;
function mountInParent(): { parent: HTMLElement; child: Emitting } {
    const tag = `x-emitter-${++seq}`;
    component(tag, { setup: () => ({}), render: () => html`<span></span>` });
    const parent = document.createElement('div');
    const child = document.createElement(tag) as Emitting;
    parent.appendChild(child);
    document.body.appendChild(parent);
    return { parent, child };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('emit — bubbles', () => {
    it('{ bubbles: false } is not seen by the parent, and is seen on the element', () => {
        const { parent, child } = mountInParent();
        let onParent = 0;
        let onChild = 0;
        parent.addEventListener('x-close', () => onParent++);
        child.addEventListener('x-close', () => onChild++);
        child.emit('x-close', { a: 1 }, { bubbles: false });
        expect(onParent, 'the event climbed to the parent').toBe(0);
        expect(onChild).toBe(1);
    });

    it('the event it dispatches says so: bubbles and composed both false', () => {
        const { child } = mountInParent();
        let seen: CustomEvent | null = null;
        child.addEventListener('x-close', (e) => { seen = e as CustomEvent; });
        child.emit('x-close', 7, { bubbles: false });
        expect(seen!.bubbles).toBe(false);
        expect(seen!.composed).toBe(false);
        expect(seen!.detail).toBe(7);
    });

    it('control — without options it still bubbles, as every other event does', () => {
        const { parent, child } = mountInParent();
        let onParent = 0;
        parent.addEventListener('x-change', () => onParent++);
        child.emit('x-change', { value: 'a' });
        expect(onParent).toBe(1);
    });

    it('the setup context forwards the option (ctx.emit)', () => {
        const tag = `x-ctx-emitter-${++seq}`;
        let emit!: (e: string, d?: unknown, o?: { bubbles?: boolean }) => void;
        component(tag, {
            setup: (ctx) => { emit = ctx.emit as typeof emit; return {}; },
            render: () => html`<span></span>`,
        });
        const parent = document.createElement('div');
        parent.appendChild(document.createElement(tag));
        document.body.appendChild(parent);
        let onParent = 0;
        parent.addEventListener('x-open', () => onParent++);
        emit('x-open', undefined, { bubbles: false });
        expect(onParent).toBe(0);
    });
});
