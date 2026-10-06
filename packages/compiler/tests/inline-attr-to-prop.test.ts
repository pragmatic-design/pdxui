// With inlineBindings, a bound HTML attribute name reaches the element the way core's html`` path
// sends it.
//
// Writing `el[name]` with the name as written turns `<div class="a" :class="label">` into
// `__el0["class"] = ctx.label()`: an expando property, not `className`, so the dynamic class never
// reaches the element. `:for`, `:tabindex` and `:readonly` are the same case: core maps them
// through `ATTR_TO_PROP` and merges `:class` with the static class.
//
// What a binding compiles to does not show that the element changes, so the cases below also run the generated DOM construction against a minimal element and read the attribute.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from '../src/plugin';
import { parseTemplate } from '../src/parser/template';
import { generateInlineNodes, ATTR_TO_PROP } from '../src/compiler/codegen-template-inline';
// The generated code imports them from core; the harness hands it the real ones, so the stub cases
// measure the rule both builds share, not a copy of it.
import { clearBoundProperty, assignBoundProperty } from '../../core/src/renderer/template';

function inline(template: string, script = "let label = $signal('x');\nlet id = $signal(1);"): string {
    const source = `<template>\n${template}\n</template>\n<script setup>\n${script}\n</script>`;
    return compile(source, 'inline-attr.pdx', [], undefined, { production: true, inlineBindings: true }).code;
}

function parses(code: string): void {
    const body = code.replace(/^import .*$/gm, '');
    expect(() => new Function(body), `generated module is not valid JS:\n${body}`).not.toThrow();
}

/**
 * A plain element's property write: `read` taken once into `__v`, null handed to core's
 * `clearBoundProperty` with the bound attribute `attr` and the property `prop`, anything else
 * assigned to `prop`.
 */
function writesProperty(code: string, attr: string, prop: string, read: string): void {
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(code).toMatch(new RegExp(
        `const __v = ${esc(read)}; if \\(__v == null\\) clearBoundProperty\\(__el\\d+, "${attr}", "${prop}"\\); else __el\\d+\\["${prop}"\\] = __v;`,
    ));
}

const STUB_PROPS: Record<string, Record<string, unknown>> = {
    LABEL: { htmlFor: '' },
    INPUT: { value: '', disabled: false, readOnly: false, checked: false },
    P: { textContent: '' },
    DIV: { tabIndex: -1 },
    TD: { colSpan: 1 },
};

/** Properties that reflect their attribute and coerce what they are given, as a browser's do: `maxLength = null` writes "0". */
const STUB_REFLECTED: Record<string, Record<string, string>> = {
    INPUT: { maxLength: 'maxlength' },
};

/** Just what the generated construction touches: attributes, a class list over the class attribute, properties, children. */
class StubElement {
    attrs = new Map<string, string>();
    children: StubElement[] = [];
    [prop: string]: unknown;
    constructor(public tagName: string) {
        // The DOM properties a real element of this tag has, so `name in el` answers as a browser does.
        Object.assign(this, STUB_PROPS[tagName] ?? {});
        for (const [prop, attr] of Object.entries(STUB_REFLECTED[tagName] ?? {})) {
            Object.defineProperty(this, prop, {
                get: () => (this.attrs.has(attr) ? Number(this.attrs.get(attr)) : -1),
                set: (v: unknown) => { this.attrs.set(attr, String(Number(v))); },
                enumerable: true,
            });
        }
    }
    setAttribute(n: string, v: string): void { this.attrs.set(n, String(v)); }
    getAttribute(n: string): string | null { return this.attrs.get(n) ?? null; }
    removeAttribute(n: string): void { this.attrs.delete(n); }
    appendChild(c: StubElement): StubElement { this.children.push(c); return c; }
    get classList() {
        const tokens = () => (this.attrs.get('class') ?? '').split(/\s+/).filter(Boolean);
        const write = (list: string[]) => this.attrs.set('class', list.join(' '));
        return {
            add: (t: string) => { const l = tokens(); if (!l.includes(t)) write([...l, t]); },
            remove: (t: string) => write(tokens().filter(x => x !== t)),
            toggle: (t: string, on: boolean) => (on ? write(tokens().includes(t) ? tokens() : [...tokens(), t]) : write(tokens().filter(x => x !== t))),
        };
    }
}

/**
 * Run the inline construction of `template` with `values` read as signals (the generator calls
 * `ctx.label()`), a document that makes stub elements, and effects that `set` runs again when a
 * value they READ changes — only those, as the reactive runtime does: re-running every effect would
 * let a `:class.x` put back what a `:class` write had just dropped. `el` is the first element built.
 */
function live(template: string, values: Record<string, unknown>): { el: StubElement; set(next: Record<string, unknown>): void } {
    const current = { ...values };
    let reading: Set<string> | null = null;
    const ctx = Object.fromEntries(Object.keys(values).map(k => [k, () => { reading?.add(k); return current[k]; }]));
    const iife = generateInlineNodes(parseTemplate(template), new Set());
    const document = {
        createDocumentFragment: () => new StubElement('#fragment'),
        createElement: (t: string) => new StubElement(t.toUpperCase()),
        createElementNS: (_ns: string, t: string) => new StubElement(t),
        createTextNode: (t: string) => ({ data: t }),
    };
    const effects: { fn: () => void; deps: Set<string> }[] = [];
    const run = (e: { fn: () => void; deps: Set<string> }) => { reading = e.deps; try { e.fn(); } finally { reading = null; } };
    const effect = (fn: () => void) => { const e = { fn, deps: new Set<string>() }; effects.push(e); run(e); };
    const frag = new Function('document', 'effect', 'ctx', 'clearBoundProperty', 'assignBoundProperty', `return ${iife};`)(document, effect, ctx, clearBoundProperty, assignBoundProperty) as StubElement;
    return {
        el: frag.children[0],
        set(next) {
            Object.assign(current, next);
            for (const e of effects) if (Object.keys(next).some(k => e.deps.has(k))) run(e);
        },
    };
}

function build(template: string, values: Record<string, unknown>): StubElement {
    return live(template, values).el;
}

const classes = (el: StubElement) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).sort();

describe('inlineBindings: :class merges with the static class, as core does', () => {
    it('<div class="a" :class="label"> sets class to "a x", and assigns no ["class"]', () => {
        const code = inline('<div class="a" :class="label"></div>');
        parses(code);
        expect(code, 'an expando property changes nothing').not.toMatch(/\["class"\]/);
        expect(build('<div class="a" :class="label"></div>', { label: 'x' }).getAttribute('class')).toBe('a x');
    });

    it('the order of the two attributes does not matter', () => {
        expect(build('<div :class="label" class="a"></div>', { label: 'x' }).getAttribute('class')).toBe('a x');
    });

    it('an empty dynamic value leaves the static class alone', () => {
        expect(build('<div class="a" :class="label"></div>', { label: '' }).getAttribute('class')).toBe('a');
        expect(build('<div class="a" :class="label"></div>', { label: null }).getAttribute('class')).toBe('a');
    });

    it('with no static class the dynamic value is the class', () => {
        expect(build('<div :class="label"></div>', { label: 'x y' }).getAttribute('class')).toBe('x y');
    });

    it('on SVG the class is the attribute too: className is read-only there', () => {
        const svg = build('<svg class="chart" :class="label"></svg>', { label: 'on' });
        expect(svg.getAttribute('class')).toBe('chart on');
        expect(svg.className).toBeUndefined();
    });
});

describe('inlineBindings: :class and :class.x on one element', () => {
    it('a :class change keeps the class :class.x turned on, and turning it off removes only it', () => {
        const { el, set } = live('<div class="btn" :class="variant" :class.active="on"></div>', { variant: 'primary', on: true });
        expect(classes(el)).toEqual(['active', 'btn', 'primary']);
        set({ variant: 'ghost' });
        expect(classes(el), 'the toggled class was dropped').toEqual(['active', 'btn', 'ghost']);
        set({ on: false });
        expect(classes(el)).toEqual(['btn', 'ghost']);
    });

    it('a static class written after the class bindings does not wipe them', () => {
        expect(classes(build('<div :class.on="flag" class="a"></div>', { flag: true }))).toEqual(['a', 'on']);
    });

    it('a dynamic class that is also static stays when the dynamic value moves on', () => {
        const { el, set } = live('<div class="base b" :class="cls"></div>', { cls: 'a b' });
        set({ cls: 'c' });
        expect(classes(el)).toEqual(['b', 'base', 'c']);
    });

    it('two bound elements in one scope compile to a module that parses', () => {
        parses(inline('<div :class="label"></div><span :class="label"></span>'));
    });
});

describe('inlineBindings: names core maps through ATTR_TO_PROP', () => {
    it(':for, :tabindex and :readonly compile to htmlFor, tabIndex and readOnly', () => {
        const code = inline('<label :for="label"></label><div :tabindex="id"></div><input :readonly="id" />');
        parses(code);
        writesProperty(code, 'for', 'htmlFor', 'ctx.label()');
        writesProperty(code, 'tabindex', 'tabIndex', 'ctx.id()');
        writesProperty(code, 'readonly', 'readOnly', 'ctx.id()');
        expect(code).not.toMatch(/\["(for|tabindex|readonly)"\]/);
    });

    it(':maxlength and :colspan too', () => {
        const code = inline('<input :maxlength="id" /><td :colspan="id"></td>');
        writesProperty(code, 'maxlength', 'maxLength', 'ctx.id()');
        writesProperty(code, 'colspan', 'colSpan', 'ctx.id()');
    });

    it('the built element receives the mapped property', () => {
        expect(build('<label :for="label"></label>', { label: 'email' }).htmlFor).toBe('email');
    });
});

describe('inlineBindings: a name a plain element does not have is its attribute', () => {
    // Core asks `camel in el` on a plain element and writes the attribute when the answer is no.
    // Assigned as a property, `<div :itemprop>` would give `el.itemprop`, an expando, and the
    // attribute would never appear.
    it('<div :itemprop> sets the itemprop attribute, and null removes it', () => {
        const { el, set } = live('<div :itemprop="label"></div>', { label: 'name' });
        expect(el.getAttribute('itemprop')).toBe('name');
        expect(el.itemprop, 'an expando property changes nothing').toBeUndefined();
        set({ label: null });
        expect(el.getAttribute('itemprop')).toBeNull();
    });

    it('<div :for> sets the for attribute: a div has no htmlFor', () => {
        const el = build('<div :for="label"></div>', { label: 'email' });
        expect(el.getAttribute('for')).toBe('email');
        expect(el.htmlFor).toBeUndefined();
    });

    it('the control: <label :for> still sets htmlFor, and <input :value> / :disabled the properties', () => {
        expect(build('<label :for="label"></label>', { label: 'email' }).htmlFor).toBe('email');
        const input = build('<input :value="label" :disabled="flag" />', { label: 'typed', flag: true });
        expect(input.value).toBe('typed');
        expect(input.disabled).toBe(true);
        expect(input.getAttribute('value'), 'the value went to the attribute').toBeNull();
    });

    it('the control: a component prop is still assigned, whatever the element knows', () => {
        expect(build('<pdx-list :item-height="height"></pdx-list>', { height: 40 }).itemHeight).toBe(40);
    });
});

describe('inlineBindings: null on a plain element\'s property removes the attribute', () => {
    // Core's bindProperty removes the attribute for null on a plain element: assigning would coerce,
    // and `maxLength = null` becomes 0, a field that takes no characters.
    it('<input :maxlength> going 5 → null removes maxlength, and does not assign null', () => {
        const { el, set } = live('<input :maxlength="limit" />', { limit: 5 });
        expect(el.getAttribute('maxlength')).toBe('5');
        set({ limit: null });
        expect(el.getAttribute('maxlength'), 'null was assigned and coerced to 0').toBeNull();
        expect(el.maxLength).toBe(-1);
    });

    it('undefined removes it too, as core\'s `v == null` does', () => {
        const { el, set } = live('<input :maxlength="limit" />', { limit: 5 });
        set({ limit: undefined });
        expect(el.getAttribute('maxlength')).toBeNull();
    });

    it('the control: a value after null is assigned again', () => {
        const { el, set } = live('<input :maxlength="limit" />', { limit: null });
        set({ limit: 8 });
        expect(el.maxLength).toBe(8);
    });

    it('the control: a component prop bound to null is still assigned null', () => {
        const { el, set } = live('<pdx-list :item-height="height"></pdx-list>', { height: 40 });
        set({ height: null });
        expect(Object.hasOwn(el, 'itemHeight') && el.itemHeight, 'the prop never saw the change').toBeNull();
    });
});

describe('inlineBindings: a property going to null is cleared by its type, as core does', () => {
    // Removing the attribute alone is right for maxLength and leaves live state on screen: a field's
    // value, a node's text. Both builds call core's clearBoundProperty.
    it('<input :value> going "b" → null empties the field', () => {
        const { el, set } = live('<input :value="label" />', { label: 'b' });
        expect(el.value).toBe('b');
        set({ label: null });
        expect(el.value, 'the previous value stayed').toBe('');
    });

    it('<p :textContent> going "b" → undefined empties the text', () => {
        const { el, set } = live('<p :textContent="label"></p>', { label: 'b' });
        set({ label: undefined });
        expect(el.textContent).toBe('');
    });

    it('<input :checked> going true → null unchecks it', () => {
        const { el, set } = live('<input :checked="on" />', { on: true });
        expect(el.checked).toBe(true);
        set({ on: null });
        expect(el.checked).toBe(false);
    });

    it('the module imports clearBoundProperty from core, and parses', () => {
        const code = inline('<input :value="label" />');
        parses(code);
        expect(code).toMatch(/import \{[^}]*\bclearBoundProperty\b[^}]*\} from '@pdxui\/core'/);
    });
});

describe('the controls', () => {
    it(':value and :disabled still assign the property as written', () => {
        const code = inline('<input :value="label" :disabled="id" />');
        writesProperty(code, 'value', 'value', 'ctx.label()');
        writesProperty(code, 'disabled', 'disabled', 'ctx.id()');
    });

    it('a static class with no binding is still set once, as written', () => {
        const el = build('<div class="a"></div>', {});
        expect(el.getAttribute('class')).toBe('a');
    });

    it(':class.x still toggles one class', () => {
        expect(inline('<div :class.on="id"></div>')).toMatch(/classList\.toggle\("on",/);
    });
});

describe('the table is core\'s ATTR_TO_PROP', () => {
    it('matches renderer/template.ts', () => {
        const src = readFileSync(join(__dirname, '..', '..', 'core', 'src', 'renderer', 'template.ts'), 'utf8');
        // Match: const ATTR_TO_PROP: Record<string, string> = { … };  Groups: [1]=the entries
        const m = src.match(/const ATTR_TO_PROP: Record<string, string> = \{([^}]*)\}/);
        expect(m, 'ATTR_TO_PROP not found in template.ts').not.toBeNull();
        // Match: class: 'className'  Groups: [1]=attribute [2]=property
        const core = Object.fromEntries([...m![1].matchAll(/(\w+):\s*'(\w+)'/g)].map(x => [x[1], x[2]]));
        expect(Object.keys(core).length).toBeGreaterThan(10);
        expect(ATTR_TO_PROP).toEqual(core);
    });
});
