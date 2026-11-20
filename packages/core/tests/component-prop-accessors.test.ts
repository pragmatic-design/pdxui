// A prop's property is the class's accessor, defined once, not one defined on every instance at every
// mount (#1246, part 3b). Measured: a third of a mount's own time, and half the time of a removal.
//
// What the accessor did on the instance it does from the class: a value set before the mount is taken
// by it, one set while mounted is coerced and notified, the value is carried to a later mount, and a
// prop named after an HTMLElement member kept on purpose (`id`) is that member while unmounted.
import { describe, it, expect, afterEach } from 'vitest';
import { component, prop, onPropsChange } from '../src/index';

let n = 0;
const tag = () => `x-acc-${++n}`;
afterEach(() => { document.body.innerHTML = ''; });

type El = HTMLElement & Record<string, unknown>;

function define(extra: Record<string, unknown> = {}): string {
    const name = tag();
    component(name, {
        props: { label: prop('none'), count: prop(0), items: prop.optional<number[]>({ type: Array }), id: prop<string>() },
        render: (ctx) => document.createTextNode(`${ctx.label()}:${ctx.count()}`),
        ...extra,
    });
    return name;
}

describe('a prop is the class\'s accessor', () => {
    it('is not defined on the instance by a mount', () => {
        const el = document.createElement(define()) as El;
        document.body.appendChild(el);
        expect(Object.getOwnPropertyDescriptor(el, 'label'), 'the mount defined the prop on the instance').toBeUndefined();
        expect(el.label).toBe('none');
    });

    it('takes a value set before the mount, and coerces one set while mounted', () => {
        const el = document.createElement(define()) as El;
        el.label = 'early';
        el.items = [1, 2];
        expect(el.label, 'read before the mount').toBe('early');
        document.body.appendChild(el);
        expect(el.textContent).toBe('early:0');
        expect(el.items).toEqual([1, 2]);
        el.count = '7';
        expect(el.count, 'not coerced by the prop\'s type').toBe(7);
    });

    it('carries the value to a later mount', () => {
        const el = document.createElement(define()) as El;
        document.body.appendChild(el);
        el.label = 'kept';
        el.remove();
        expect(el.label, 'read after the removal').toBe('kept');
        document.body.appendChild(el);
        expect(el.textContent).toBe('kept:0');
    });

    it('is HTMLElement\'s own member while unmounted, for a name kept on purpose', () => {
        const el = document.createElement(define()) as El;
        el.id = 'native';
        expect(el.getAttribute('id'), 'the id did not reach the attribute before the mount').toBe('native');
        document.body.appendChild(el);
        expect(el.id).toBe('native');
    });

    it('notifies onPropsChange when set', () => {
        const seen: string[] = [];
        const el = document.createElement(define({
            setup() { onPropsChange((changes) => { for (const c of changes) seen.push(`${c.name}=${String(c.newValue)}`); }); return {}; },
        })) as El;
        document.body.appendChild(el);
        el.label = 'changed';
        expect(seen).toEqual(['label=changed']);
    });
});
