// What the two render paths of a .pdx template put in the DOM, row by row (#92).
//
// A template compiles two ways. Dev, and a build with `inlineBindings: false`, emit an html``
// tagged template that core binds at runtime; a production build emits imperative DOM code by
// default — the inline path. Nothing compared what the two actually render, so a feature that works
// in dev and vanishes in a build went unnoticed until someone looked at the build: transitions,
// `:class` with an object, `::value` on a component.
//
// Each row is compiled twice, mounted twice in happy-dom, acted on the same way, and its DOM
// compared after normalising what is allowed to differ: the scope attribute, marker comments and
// whitespace-only text. The router's rule keeps the table honest (router/tests/parity.test.ts):
//   - a row whose two DOMs differ must name the issue that owns the difference, or it fails;
//   - a row with an owner whose DOMs now match fails too: the owner is to be removed.
//
// Here, in core, because the compiled component runs on core and core's suite runs in happy-dom; the
// compiler's runs in Node.

import { describe, it, expect, beforeAll } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

/** The module a lazily loaded component resolves to here: a name, not a file. */
const DEFERRED_MODULE = 'virtual:deferred-probe';

/** Every lazy load a compiled module asked for, by specifier — each names the mount that asked. */
const lazyLoads: string[] = [];

/**
 * What a compiled module's `import()` calls here. The specifier is recorded and the component it
 * stands for is defined: what a row measures is whether its path asks for the load, not whether a
 * bundler can find a file.
 */
function lazyImport(specifier: string): Promise<unknown> {
    lazyLoads.push(specifier);
    if (!customElements.get('pdx-deferred-probe')) customElements.define('pdx-deferred-probe', class extends HTMLElement {});
    return Promise.resolve({});
}

interface Row {
    name: string;
    template: string;
    script?: string;
    /** Done to both mounts before they are compared: a click, an input, a property set. */
    act?: (host: HTMLElement) => void | Promise<void>;
    /** Values read from both mounts and compared too — a property the markup does not show. */
    read?: (host: HTMLElement) => unknown;
    /** The issue that owns a known difference between the two paths. */
    owner?: number;
}

/** The mount a host belongs to: its tag less the `pdx-` prefix, which names the deferred load it asked for. */
const mountName = (host: HTMLElement) => host.localName.slice(4);

let seq = 0;

/** The component compiled on one path, defined, and mounted in the document. */
function mount(row: Row, inline: boolean): HTMLElement {
    const name = `parity${++seq}${inline ? 'i' : 't'}`;
    const src = `<template>${row.template}</template>\n<script setup>\n${row.script ?? ''}\n</script>\n`;
    // The one component a row may load lazily resolves to a specifier naming this mount.
    const importPathOf = (tag: string) => (tag === 'pdx-deferred-probe' ? `${DEFERRED_MODULE}?for=${name}` : null);
    const options = inline ? { production: true, inlineBindings: true, importPathOf } : { importPathOf };
    const { code } = compile(src, `${name}.pdx`, [], undefined, options);
    // The module's one core import becomes a destructure of the core module this test runs on, and a
    // dynamic import becomes the recorder above.
    const body = code
        .replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;')
        .replace(/\bimport\(/g, '__import(');
    new Function('__core', '__import', body)(core, lazyImport);
    const el = document.createElement(`pdx-${name}`);
    document.body.appendChild(el);
    return el;
}

/** Microtasks, then two frames: what a binding, an effect and a deferred render need. */
async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
}

/**
 * A node's markup with what may differ between the paths taken out: comments (each path places its
 * own markers), whitespace-only text, the `data-pdx-*` scope attribute. Attributes sorted; text with
 * its runs of whitespace collapsed.
 */
function normal(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.textContent ?? '').replace(/\s+/g, ' ');
        return text.trim() === '' ? '' : text;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as Element;
    const attrs = [...el.attributes]
        .filter((a) => !a.name.startsWith('data-pdx-'))
        .map((a) => (a.name === 'class' ? `class="${a.value.split(/\s+/).filter(Boolean).sort().join(' ')}"` : `${a.name}="${a.value}"`))
        .sort()
        .join(' ');
    const inner = [...el.childNodes].map(normal).join('');
    const tag = el.tagName.toLowerCase();
    return `<${tag}${attrs ? ' ' + attrs : ''}>${inner}</${tag}>`;
}

const content = (host: HTMLElement) => [...host.childNodes].map(normal).join('').trim();

/**
 * What a row renders on one path: its markup and what `read` returns, after `act` and settling. A path
 * that throws renders the error: a difference like any other, not a crash of the table.
 */
async function render(row: Row, inline: boolean): Promise<{ html: string; read: unknown }> {
    let host: HTMLElement | null = null;
    try {
        host = mount(row, inline);
        await settle();
        if (row.act) { await row.act(host); await settle(); }
        return { html: content(host), read: row.read?.(host) };
    } catch (err) {
        return { html: `threw: ${(err as Error).message}`, read: undefined };
    } finally {
        host?.remove();
    }
}

const click = (sel: string) => (host: HTMLElement) => { (host.querySelector(sel) as HTMLElement).click(); };

// A plain custom element: what a binding to a component's property and a component's event reach.
beforeAll(() => {
    if (!customElements.get('x-probe')) {
        customElements.define('x-probe', class extends HTMLElement { value: unknown = undefined; });
    }
    if (!customElements.get('x-field')) {
        // A component with no native input: ::value has to listen for its event.
        customElements.define('x-field', class extends HTMLElement {
            private v = '';
            get value() { return this.v; }
            set value(next: string) { this.v = next; this.setAttribute('data-value', String(next)); }
            change(next: string) { this.value = next; this.dispatchEvent(new CustomEvent('pdx-change', { detail: next, bubbles: true })); }
        });
    }
});

const ROWS: Row[] = [
    { name: 'static markup', template: '<section class="a"><h2 id="t">Title</h2><p>text <b>bold</b></p></section>' },
    { name: '{{ }} text', template: '<p>{{ n }} items</p>', script: 'let n = $signal(3);' },
    { name: '{{ }} text after a change', template: '<p>{{ n }}</p><button @click="n++">+</button>', script: 'let n = $signal(1);', act: click('button') },
    { name: ':attr', template: '<a :href="url" :title="t">x</a>', script: "let url = $signal('/a'); let t = $signal('T');" },
    { name: ':prop on a custom element', template: '<x-probe :value="v"></x-probe>', script: 'let v = $signal({ a: 1 });', read: (h) => JSON.stringify((h.querySelector('x-probe') as unknown as { value: unknown }).value) },
    { name: ':class with a string', template: "<p :class=\"on ? 'yes' : 'no'\">x</p>", script: 'let on = $signal(true);' },
    // Inline: class="[object Object]".
    { name: ':class with an object', template: '<p :class="{ active: on, off: !on }">x</p>', script: 'let on = $signal(true);', owner: 96 },
    { name: ':class.x', template: '<p class="base" :class.active="on">x</p>', script: 'let on = $signal(true);' },
    // Inline: the object is assigned to el.style, which keeps no colour.
    { name: ':style with an object', template: "<p :style=\"{ color: 'red' }\">x</p>", owner: 96 },
    { name: ':style.x', template: '<p :style.color="c">x</p>', script: "let c = $signal('blue');" },
    { name: ':show', template: '<p :show="on">x</p><p :show="!on">y</p>', script: 'let on = $signal(true);' },
    { name: '@click', template: '<p>{{ n }}</p><button @click="n++">+</button>', script: 'let n = $signal(0);', act: click('button') },
    { name: '@click.once', template: '<p>{{ n }}</p><button @click.once="n++">+</button>', script: 'let n = $signal(0);', act: (h) => { click('button')(h); click('button')(h); } },
    { name: '@click.self', template: '<p>{{ n }}</p><div @click.self="n++"><button>in</button></div>', script: 'let n = $signal(0);', act: click('button') },
    { name: '@click.stop', template: '<p>{{ n }}</p><div @click="n++"><button @click.stop="n = n + 10">in</button></div>', script: 'let n = $signal(0);', act: click('button') },
    { name: '@click.prevent', template: '<a href="#x" @click.prevent="seen = true">a</a><p>{{ seen }}</p>', script: 'let seen = $signal(false);', act: click('a') },
    {
        name: '::value on an <input>',
        template: '<input ::value="q"><p>{{ q }}</p>',
        script: "let q = $signal('a');",
        act: (h) => { const i = h.querySelector('input')!; i.value = 'typed'; i.dispatchEvent(new Event('input', { bubbles: true })); },
        read: (h) => h.querySelector('input')!.value,
    },
    {
        name: '::value on a <select>',
        template: '<select ::value="s"><option value="a">A</option><option value="b">B</option></select><p>{{ s }}</p>',
        script: "let s = $signal('a');",
        act: (h) => { const s = h.querySelector('select')!; s.value = 'b'; s.dispatchEvent(new Event('change', { bubbles: true })); },
        read: (h) => h.querySelector('select')!.value,
        // Inline: listens to `input`, and a <select> reports a choice with `change`.
        owner: 97,
    },
    {
        name: '::value on a component that emits pdx-change',
        template: '<x-field ::value="v"></x-field><p>{{ v }}</p>',
        script: "let v = $signal('a');",
        act: (h) => { (h.querySelector('x-field') as unknown as { change(v: string): void }).change('b'); },
        // Inline: the component's pdx-change never reaches the signal.
        owner: 97,
    },
    { name: '@if / @else', template: '@if (on) { <p>yes</p> } @else { <p>no</p> }<button @click="on = !on">t</button>', script: 'let on = $signal(true);', act: click('button') },
    { name: '@for with track', template: '<ul>@for (items as it; track it.id) { <li>{{ it.label }}</li> }</ul>', script: "let items = $signal([{ id: 1, label: 'a' }, { id: 2, label: 'b' }]);" },
    { name: '@for with @empty', template: '<ul>@for (items as it; track it) { <li>{{ it }}</li> } @empty { <li>none</li> }</ul>', script: 'let items = $signal([]);' },
    { name: '@switch', template: "@switch (mode) { @case ('a') { <p>A</p> } @case ('b') { <p>B</p> } @default { <p>?</p> } }", script: "let mode = $signal('b');" },
    {
        name: '::checked on a checkbox',
        template: '<input type="checkbox" ::checked="on"><p>{{ on }}</p>',
        script: 'let on = $signal(false);',
        act: click('input'),
        read: (h) => h.querySelector('input')!.checked,
    },
    // A key filter applies to keyboard events: a click passes it on the template path.
    // Inline: the key filter applies to the click too, which never fires.
    { name: '@click.enter', template: '<p>{{ n }}</p><button @click.enter="n++">+</button>', script: 'let n = $signal(0);', act: click('button'), owner: 100 },
    // The body, once the promise has settled. (The body reads the promise itself, not its value, on
    // both paths: binding the value is #145.)
    { name: '@await', template: '@await (data) { <p>ready</p> } @loading { <p>…</p> }', script: "let data = $signal(Promise.resolve('done'));" },
    {
        name: '@defer loads a component used only inside it',
        template: '@defer (immediate) { <pdx-deferred-probe></pdx-deferred-probe> }',
        read: (h) => lazyLoads.some((u) => u.endsWith(`?for=${mountName(h)}`)),
        // Inline: defer() gets no loader, so the component is never asked for.
        owner: 98,
    },
    { name: '@try / @catch', template: '@try { <p>{{ boom() }}</p> } @catch (e) { <p>caught</p> }', script: "function boom() { throw new Error('x'); }" },
    // Inline: no transition options reach when()/each(), so no enter classes.
    { name: '@if with @transition', template: "@if (on) @transition('fade') { <p>x</p> }", script: 'let on = $signal(true);', owner: 85 },
    { name: '@for with @transition', template: "<ul>@for (items as it; track it) @transition('fade') { <li>{{ it }}</li> }</ul>", script: "let items = $signal(['a']);", owner: 85 },
    // Inline: reads the @let name as a signal and throws.
    { name: '@let', template: '@let total = a + b; <p>{{ total }}</p>', script: 'let a = $signal(1); let b = $signal(2);', owner: 162 },
    { name: 'an interpolated Node', template: '<div>{{ node }}</div>', script: "const node = document.createElement('em'); node.textContent = 'n';" },
    { name: 'an interpolated Node in a signal', template: '<div>{{ node }}</div>', script: "const el = document.createElement('em'); el.textContent = 'n'; let node = $signal(el);" },
    // Inline: the array becomes its string, "a,b".
    { name: 'an interpolated array', template: '<div>{{ list }}</div>', script: "const list = ['a', 'b'];", owner: 100 },
    { name: 'content inside a component tag', template: '<x-probe><span>child</span></x-probe>' },
    // Neither path wires the gesture. On the template path the handler also runs once at render, and
    // the count is NaN before anyone swipes; on the inline path `.left` is read as a key filter.
    { name: '@swipe.left', template: '<div @swipe.left="n++">s</div><p>{{ n }}</p>', script: 'let n = $signal(0);', owner: 99 },
    // An @name the parser does not know is text on both paths. The divergence #100 names needs a
    // directive a plugin registers; this row keeps the plain case honest.
    { name: 'an unknown @name is text', template: '<p>a</p>@frobnicate { <p>b</p> }' },
];

describe('the two render paths put the same DOM in the page (#92)', () => {
    for (const row of ROWS) {
        it(row.owner ? `${row.name} — differs, owned by #${row.owner}` : row.name, async () => {
            const template = await render(row, false);
            const inline = await render(row, true);
            const same = template.html === inline.html && JSON.stringify(template.read) === JSON.stringify(inline.read);
            const detail = `\n  template path: ${template.html}${row.read ? `  read=${JSON.stringify(template.read)}` : ''}`
                + `\n  inline path:   ${inline.html}${row.read ? `  read=${JSON.stringify(inline.read)}` : ''}`;
            if (row.owner) {
                expect(same, `the paths now agree: remove owner #${row.owner}${detail}`).toBe(false);
            } else {
                expect(template.html, 'the template path rendered nothing: the row measures nothing').not.toBe('');
                expect(same, `the two paths differ and no issue owns it${detail}`).toBe(true);
            }
        });
    }
});
