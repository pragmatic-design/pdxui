// A factory default on an Array or Object prop gives each instance its own value.
//
// `resolveDefault` calls the factory: returning `def.default` as written would hand
// `{ type: Array, default: () => [] }` to the component as the FUNCTION. Six @pdxui/ui props declare
// one — select.options, autocomplete.suggestions, color-picker.presets, page-header.crumbs,
// relation-picker.columns, bottom-sheet.detents — and without the call `el.options` on an unset
// pdx-select reads back a function. A Function prop's default IS a function, and stays one.

import { describe, it, expect, afterEach } from 'vitest';
import { html } from '../src/renderer/template';
import { component } from '../src/component/component';

let tagId = 0;

type Probe = HTMLElement & { items: unknown; config: unknown; handler: unknown; plain: unknown };

function define(): string {
    const tag = `test-prop-factory-${tagId++}`;
    const handler = () => 'the handler';
    component(tag, {
        props: {
            items: { type: Array, default: () => [] },
            config: { type: Object, default: () => ({ mode: 'auto' }) },
            handler: { type: Function, default: handler },
            plain: { type: Array, default: ['a'] },
        },
        setup() { return {}; },
        render: () => html`<span></span>`,
    });
    return tag;
}

function mount(tag: string): Probe {
    const el = document.createElement(tag) as Probe;
    document.body.appendChild(el);
    return el;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('a factory default', () => {
    it('an Array prop with default () => [] reads back an array, not the function', () => {
        const el = mount(define());
        expect(Array.isArray(el.items), `items is a ${typeof el.items}`).toBe(true);
        expect(el.items).toEqual([]);
    });

    it('each instance gets its own array', () => {
        const tag = define();
        const a = mount(tag);
        const b = mount(tag);
        expect(a.items).not.toBe(b.items);
    });

    it('an Object prop with a factory default reads back the object', () => {
        const el = mount(define());
        expect(el.config).toEqual({ mode: 'auto' });
    });

    it('setting the prop back to null takes the default again, as a value', () => {
        const el = mount(define());
        el.items = ['x'];
        el.items = null;
        expect(el.items).toEqual([]);
    });
});

describe('the controls', () => {
    it('a Function prop keeps its function default as the function', () => {
        const el = mount(define());
        expect(typeof el.handler).toBe('function');
        expect((el.handler as () => string)()).toBe('the handler');
    });

    it('a plain array default is still the value written', () => {
        const el = mount(define());
        expect(el.plain).toEqual(['a']);
    });
});
