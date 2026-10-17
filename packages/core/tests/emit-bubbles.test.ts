// emit(event, detail) — a component's event stays on the component unless it says otherwise (#138).
//
// Bubbling by default, an application event named `change` or `close` was indistinguishable, on an
// ancestor, from the native events of the same name rising from the inputs inside it; and a select's
// pdx-close reached the @pdx-close of the dialog around it, and the dialog vanished whenever an option
// was picked. Like Angular's `output()`, an event bubbles only when it is declared to.
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

    it('without options it does not bubble: the parent does not see it, the element does', () => {
        const { parent, child } = mountInParent();
        let onParent = 0;
        let onChild = 0;
        parent.addEventListener('x-change', () => onParent++);
        child.addEventListener('x-change', () => onChild++);
        child.emit('x-change', { value: 'a' });
        expect(onParent, 'an undeclared bubble reached the parent').toBe(0);
        expect(onChild).toBe(1);
    });

    it('{ bubbles: true } reaches the parent, and is composed', () => {
        const { parent, child } = mountInParent();
        let seen: CustomEvent | null = null;
        parent.addEventListener('x-change', (e) => { seen = e as CustomEvent; });
        child.emit('x-change', 3, { bubbles: true });
        expect(seen, 'an event that asked to bubble did not reach the parent').not.toBeNull();
        expect(seen!.composed).toBe(true);
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
