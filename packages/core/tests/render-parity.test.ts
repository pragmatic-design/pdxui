// What a .pdx template puts in the DOM, row by row (#92), against recorded expectations (#237).
//
// The table began as a comparison of the two render paths — the html`` tagged template core binds at
// runtime, and the inline path's imperative DOM code — because nothing compared what the two
// rendered, and a feature that worked in dev vanished in a build: transitions, `:class` with an
// object, `::value` on a component. Since #107 every .pdx takes the inline path, and the template
// path is going (#238). Each row's `expected` is what the TEMPLATE path rendered when the two still
// both ran — recorded once, written here as a literal, the same DOM the inline path rendered then —
// so the forms the table holds keep the cross-check they had.
//
// Each row is compiled as a production build compiles it, mounted in happy-dom, acted on, and its DOM
// compared with `expected` (and `read` with `expectedRead`) after normalising what is allowed to
// vary: the scope attribute, marker comments and whitespace-only text. The router's rule keeps the
// table honest (router/tests/parity.test.ts):
//   - a row whose DOM differs from its expectation must name the issue that owns the difference;
//   - a row with an owner whose DOM now matches fails too: the owner is to be removed.
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
    /** The normalised markup the row renders, as the template path rendered it (#237). */
    expected: string;
    /** What `read` returns, as the template path returned it. */
    expectedRead?: unknown;
    template: string;
    script?: string;
    /** Done to the mount before it is compared: a click, an input, a property set. */
    act?: (host: HTMLElement) => void | Promise<void>;
    /** A value read from the mount and compared too — a property the markup does not show. */
    read?: (host: HTMLElement) => unknown;
    /** The issue that owns a known difference from the expectation. */
    owner?: number;
}

/** The mount a host belongs to: its tag less the `pdx-` prefix, which names the deferred load it asked for. */
const mountName = (host: HTMLElement) => host.localName.slice(4);

let seq = 0;

/** The component compiled as a production build compiles it, defined, and mounted in the document. */
function mount(row: Row): HTMLElement {
    const name = `parity${++seq}`;
    const src = `<template>${row.template}</template>\n<script>\n${row.script ?? ''}\n</script>\n`;
    // The one component a row may load lazily resolves to a specifier naming this mount.
    const importPathOf = (tag: string) => (tag === 'pdx-deferred-probe' ? `${DEFERRED_MODULE}?for=${name}` : null);
    const { code } = compile(src, `${name}.pdx`, [], undefined, { production: true, importPathOf });
    // The module's one core import becomes a destructure of the core module this test runs on, and a
    // dynamic import becomes the recorder above.
    const body = code
        .replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;')
        .replace(/\bimport\(/g, '__import(');
    new Function('__core', '__import', body)(core, lazyImport);
    const el = document.createElement(`app-${name}`);
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
 * A node's markup with what may vary taken out: comments (a render path places its own markers),
 * whitespace-only text, the `data-pdx-*` scope attribute. Attributes sorted; text with its runs of
 * whitespace collapsed.
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
 * What a row renders: its markup and what `read` returns, after `act` and settling. A row that throws
 * renders the error: a difference like any other, not a crash of the table.
 */
async function render(row: Row): Promise<{ html: string; read: unknown }> {
    let host: HTMLElement | null = null;
    try {
        host = mount(row);
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
    { name: 'static markup', expected: '<section class="a"><h2 id="t">Title</h2><p>text <b>bold</b></p></section>', template: '<section class="a"><h2 id="t">Title</h2><p>text <b>bold</b></p></section>' },
    { name: '{{ }} text', expected: '<p>3 items</p>', template: '<p>{{ n }} items</p>', script: 'let n = $signal(3);' },
    { name: '{{ }} text after a change', expected: '<p>2</p><button>+</button>', template: '<p>{{ n }}</p><button @click="n++">+</button>', script: 'let n = $signal(1);', act: click('button') },
    { name: ':attr', expected: '<a href="/a" title="T">x</a>', template: '<a :href="url" :title="t">x</a>', script: "let url = $signal('/a'); let t = $signal('T');" },
    { name: ':prop on a custom element', expected: '<x-probe></x-probe>', expectedRead: '{"a":1}', template: '<x-probe :value="v"></x-probe>', script: 'let v = $signal({ a: 1 });', read: (h) => JSON.stringify((h.querySelector('x-probe') as unknown as { value: unknown }).value) },
    { name: ':class with a string', expected: '<p class="yes">x</p>', template: "<p :class=\"on ? 'yes' : 'no'\">x</p>", script: 'let on = $signal(true);' },
    // The inline path wrote class="[object Object]" (#96).
    { name: ':class with an object', expected: '<p class="active">x</p>', template: '<p :class="{ active: on, off: !on }">x</p>', script: 'let on = $signal(true);' },
    { name: ':class with an object beside a static class', expected: '<p class="active base">x</p>', template: '<p class="base" :class="{ active: on }">x</p>', script: 'let on = $signal(true);' },
    // The specialised forms (#112), each after a change, so the update is measured, not the first write.
    { name: ':class conditional, after a change', expected: '<p class="no">x</p><button>t</button>', template: "<p :class=\"on ? 'yes' : 'no'\">x</p><button @click=\"on = !on\">t</button>", script: 'let on = $signal(true);', act: click('button') },
    { name: ':class with &&, after a change', expected: '<p class="">x</p><button>t</button>', template: "<p :class=\"on && 'danger'\">x</p><button @click=\"on = !on\">t</button>", script: 'let on = $signal(true);', act: click('button') },
    { name: ':class with a plain value, after a change', expected: '<p class="b c">x</p><button>t</button>', template: "<p :class=\"name\">x</p><button @click=\"name = 'b c'\">t</button>", script: "let name = $signal('a');", act: click('button') },
    // `false` is no class, in every form (#112): the generic routine wrote class="false".
    { name: ':class with && on a value, after a change', expected: '<p class="base">x</p><button>t</button>', template: "<p class=\"base\" :class=\"on && name\">x</p><button @click=\"on = !on\">t</button>", script: "let on = $signal(true); let name = $signal('a');", act: click('button') },
    { name: ':class beside a static class, after a change', expected: '<p class="b base">x</p><button>t</button>', template: "<p class=\"base\" :class=\"name\">x</p><button @click=\"name = 'b'\">t</button>", script: "let name = $signal('a');", act: click('button') },
    // The inline path assigned the object to el.style, which keeps no colour (#96).
    { name: ':style with an object', expected: '<p style="color: red;">x</p>', template: "<p :style=\"{ color: 'red' }\">x</p>" },
    { name: ':style with an object over a signal', expected: '<p style="color: blue;">x</p>', template: '<p :style="{ color: c }">x</p>', script: "let c = $signal('blue');" },
    { name: '@show over an element', expected: '<p>x</p><p style="display: none;">y</p>', template: '@show (on) { <p>x</p> }@show (!on) { <p>y</p> }', script: 'let on = $signal(true);' },
    { name: '@click', expected: '<p>1</p><button>+</button>', template: '<p>{{ n }}</p><button @click="n++">+</button>', script: 'let n = $signal(0);', act: click('button') },
    { name: '@click.once', expected: '<p>1</p><button>+</button>', template: '<p>{{ n }}</p><button @click.once="n++">+</button>', script: 'let n = $signal(0);', act: (h) => { click('button')(h); click('button')(h); } },
    { name: '@click.self', expected: '<p>0</p><div><button>in</button></div>', template: '<p>{{ n }}</p><div @click.self="n++"><button>in</button></div>', script: 'let n = $signal(0);', act: click('button') },
    { name: '@click.stop', expected: '<p>10</p><div><button>in</button></div>', template: '<p>{{ n }}</p><div @click="n++"><button @click.stop="n = n + 10">in</button></div>', script: 'let n = $signal(0);', act: click('button') },
    { name: '@click.prevent', expected: '<a href="#x">a</a><p>true</p>', template: '<a href="#x" @click.prevent="seen = true">a</a><p>{{ seen }}</p>', script: 'let seen = $signal(false);', act: click('a') },
    {
        name: '::value on an <input>', expected: '<input></input><p>typed</p>', expectedRead: 'typed',
        template: '<input ::value="q"><p>{{ q }}</p>',
        script: "let q = $signal('a');",
        act: (h) => { const i = h.querySelector('input')!; i.value = 'typed'; i.dispatchEvent(new Event('input', { bubbles: true })); },
        read: (h) => h.querySelector('input')!.value,
    },
    {
        name: '::value on a <select>', expected: '<select><option value="a">A</option><option value="b">B</option></select><p>b</p>', expectedRead: 'b',
        template: '<select ::value="s"><option value="a">A</option><option value="b">B</option></select><p>{{ s }}</p>',
        script: "let s = $signal('a');",
        act: (h) => { const s = h.querySelector('select')!; s.value = 'b'; s.dispatchEvent(new Event('change', { bubbles: true })); },
        read: (h) => h.querySelector('select')!.value,
    },
    {
        name: '::value on a component that emits pdx-change', expected: '<x-field data-value="b"></x-field><p>b</p>',
        template: '<x-field ::value="v"></x-field><p>{{ v }}</p>',
        script: "let v = $signal('a');",
        act: (h) => { (h.querySelector('x-field') as unknown as { change(v: string): void }).change('b'); },
    },
    { name: '@if / @else', expected: '<p>no</p><button>t</button>', template: '@if (on) { <p>yes</p> } @else { <p>no</p> }<button @click="on = !on">t</button>', script: 'let on = $signal(true);', act: click('button') },
    { name: '@for with track', expected: '<ul><li>a</li><li>b</li></ul>', template: '<ul>@for (items as it; track it.id) { <li>{{ it.label }}</li> }</ul>', script: "let items = $signal([{ id: 1, label: 'a' }, { id: 2, label: 'b' }]);" },
    { name: '@for with @empty', expected: '<ul><li>none</li></ul>', template: '<ul>@for (items as it; track it) { <li>{{ it }}</li> } @empty { <li>none</li> }</ul>', script: 'let items = $signal([]);' },
    // #283: no template-path recording exists — it landed after #238. happy-dom lays nothing out, so
    // the window is the overscan, three rows: all of these. A `ul` is a list: each row says the set's
    // size and its place (#284).
    { name: '@for … @virtual', expected: '<ul><li aria-hidden="true" style="padding: 0px; border: 0px; margin: 0px; height: 0px;"></li><li aria-posinset="1" aria-setsize="3" data-virtual-index="0">a</li><li aria-posinset="2" aria-setsize="3" data-virtual-index="1">b</li><li aria-posinset="3" aria-setsize="3" data-virtual-index="2">c</li><li aria-hidden="true" style="padding: 0px; border: 0px; margin: 0px; height: 0px;"></li></ul>', template: '<ul>@for (items as it; track it) @virtual(20) { <li>{{ it }}</li> }</ul>', script: "let items = $signal(['a', 'b', 'c']);" },
    { name: '@for … @virtual with @empty', expected: '<ul><li aria-hidden="true" style="padding: 0px; border: 0px; margin: 0px; height: 0px;"></li><li aria-hidden="true" style="padding: 0px; border: 0px; margin: 0px; height: 0px;"></li><li>none</li></ul>', template: '<ul>@for (items as it; track it) @virtual { <li>{{ it }}</li> } @empty { <li>none</li> }</ul>', script: 'let items = $signal([]);' },
    // Whitespace between table-internal elements renders nothing and is not emitted (#111): the read
    // counts the text nodes inside the table that are not in a cell.
    {
        name: '@for rows in a table, spaced', expected: '<table><tbody><tr><td>1</td><td>a</td></tr><tr><td>2</td><td>b</td></tr></tbody></table>', expectedRead: 0,
        template: '<table>\n  <tbody>\n    @for (items as it; track it.id) {\n      <tr> <td>{{ it.id }}</td> <td>{{ it.label }}</td> </tr>\n    }\n  </tbody>\n</table>',
        script: "let items = $signal([{ id: 1, label: 'a' }, { id: 2, label: 'b' }]);",
        read: (h) => [...h.querySelectorAll('table, tbody, tr')].reduce((n, el) => n + [...el.childNodes].filter(c => c.nodeType === 3 && c.textContent !== '').length, 0),
    },
    // Events inside a @for are delegated to one listener per type (#113): a row's click, a row's .stop
    // under a handler of the same type, and $event.currentTarget, which is the row, not the component.
    { name: '@for row @click (delegated)', expected: '<p>2</p><ul><li>1</li><li>2</li></ul>', template: '<p>{{ n }}</p><ul>@for (items as it; track it) {<li @click="n = n + it">{{ it }}</li>}</ul>', script: 'let n = $signal(0); let items = $signal([1, 2]);', act: click('li:last-child') },
    { name: '@for row @click.stop under a @click', expected: '<p>1</p><ul><li>1</li></ul>', template: '<p>{{ n }}</p><ul @click="n = n + 10">@for (items as it; track it) {<li @click.stop="n = n + 1">{{ it }}</li>}</ul>', script: 'let n = $signal(0); let items = $signal([1]);', act: click('li') },
    { name: '@for row $event.currentTarget', expected: '<p>LI</p><ul><li><b>1</b></li></ul>', template: '<p>{{ tag }}</p><ul>@for (items as it; track it) {<li @click="tag = $event.currentTarget.tagName"><b>{{ it }}</b></li>}</ul>', script: "let tag = $signal(''); let items = $signal([1]);", act: click('b') },
    // A row's handler is declared once per @for and reads the row from the scope it stores (#375): an
    // inner row's handler still reaches the outer row and the index, a destructured row its names, and
    // a row whose item was replaced reads the new item, as its own closure did.
    {
        name: '@for nested row @click reads the outer row and the index', expected: '<p>b:y:1</p><div><ul><li>x</li></ul></div><div><ul><li>x</li><li>y</li></ul></div>',
        template: "<p>{{ out }}</p>@for (groups as g; track g.id) {<div><ul>@for (g.kids as k, i; track k) {<li @click=\"out = g.id + ':' + k + ':' + i\">{{ k }}</li>}</ul></div>}",
        script: "let out = $signal(''); let groups = $signal([{ id: 'a', kids: ['x'] }, { id: 'b', kids: ['x', 'y'] }]);",
        act: click('div:last-of-type li:last-child'),
    },
    { name: '@for destructured row @click', expected: '<p>2</p><ul><li>a</li><li>b</li></ul>', template: '<p>{{ out }}</p><ul>@for (items as { id, label }; track id) {<li @click="out = id">{{ label }}</li>}</ul>', script: "let out = $signal(0); let items = $signal([{ id: 1, label: 'a' }, { id: 2, label: 'b' }]);", act: click('li:last-child') },
    {
        name: '@for row @click after its item is replaced', expected: '<p>new</p><ul><li>new</li></ul><button>replace</button>',
        template: "<p>{{ out }}</p><ul>@for (items as it; track it.id) {<li @click=\"out = it.label\">{{ it.label }}</li>}</ul><button @click=\"items = [{ id: 1, label: 'new' }]\">replace</button>",
        script: "let out = $signal(''); let items = $signal([{ id: 1, label: 'old' }]);",
        act: (h) => { click('button')(h); click('li')(h); },
    },
    // `key === sig` in a @for reads a keyed selector (#117): the selection moves, the rows follow.
    { name: '@for row selected by a keyed selector, after a change', expected: '<ul><li class="">1</li><li class="">2</li><li class="on">3</li></ul>', template: "<ul>@for (items as it; track it) {<li :class=\"it === sel ? 'on' : ''\" @click=\"sel = it\">{{ it }}</li>}</ul>", script: 'let sel = $signal(1); let items = $signal([1, 2, 3]);', act: click('li:last-child') },
    { name: '@switch', expected: '<p>B</p>', template: "@switch (mode) { @case ('a') { <p>A</p> } @case ('b') { <p>B</p> } @default { <p>?</p> } }", script: "let mode = $signal('b');" },
    {
        name: '::checked on a checkbox', expected: '<input type="checkbox"></input><p>true</p>', expectedRead: true,
        template: '<input type="checkbox" ::checked="on"><p>{{ on }}</p>',
        script: 'let on = $signal(false);',
        act: click('input'),
        read: (h) => h.querySelector('input')!.checked,
    },
    // A key filter applies to keyboard events: a click passes it. The inline path applied it to the
    // click too, which never fired (#100).
    { name: '@click.enter', expected: '<p>1</p><button>+</button>', template: '<p>{{ n }}</p><button @click.enter="n++">+</button>', script: 'let n = $signal(0);', act: click('button') },
    // The body, once the promise has settled. (The body reads the promise itself, not its value, on
    // both paths: binding the value is #145.)
    { name: '@await', expected: '<p>ready</p>', template: '@await (data) { <p>ready</p> } @loading { <p>…</p> }', script: "let data = $signal(Promise.resolve('done'));" },
    {
        name: '@defer loads a component used only inside it', expected: '<pdx-deferred-probe></pdx-deferred-probe>', expectedRead: true,
        template: '@defer (immediate) { <pdx-deferred-probe></pdx-deferred-probe> }',
        read: (h) => lazyLoads.some((u) => u.endsWith(`?for=${mountName(h)}`)),
    },
    {
        // A row replaced by a new object whose field kept its value — another field's save landing.
        // The binding writes when ITS value changes, so what the component holds since (a field being
        // typed in) stays. Inline wrote again on every re-run: the showcase's category labels took
        // back the saved name over the one being typed (#44).
        name: ':prop is not written again with the value it already wrote', expected: '<x-probe></x-probe><button>save</button>', expectedRead: 'typed',
        template: '@for (rows as r; track r.id) { <x-probe :value="r.v"></x-probe> }<button @click="rows = [{ id: 1, v: \'saved\', other: 2 }]">save</button>',
        script: "let rows = $signal([{ id: 1, v: 'saved', other: 1 }]);",
        act: (h) => {
            (h.querySelector('x-probe') as unknown as { value: unknown }).value = 'typed';
            click('button')(h);
        },
        read: (h) => (h.querySelector('x-probe') as unknown as { value: unknown }).value,
    },
    { name: '@try / @catch', expected: '<p>caught</p>', template: '@try { <p>{{ boom() }}</p> } @catch (e) { <p>caught</p> }', script: "function boom() { throw new Error('x'); }" },
    // Both paths pass the transition options to when()/each() since #85: the enter classes match.
    { name: '@if with @transition', expected: '<p class="pdx-enter-active pdx-fade">x</p>', template: "@if (on) @transition('fade') { <p>x</p> }", script: 'let on = $signal(true);' },
    { name: '@for with @transition', expected: '<ul><li class="pdx-enter-active pdx-fade">a</li></ul>', template: "<ul>@for (items as it; track it) @transition('fade') { <li>{{ it }}</li> }</ul>", script: "let items = $signal(['a']);" },
    // The inline path read the @let name as a signal and threw at mount (#162).
    { name: '@let', expected: '<p>3</p>', template: '@let total = a + b; <p>{{ total }}</p>', script: 'let a = $signal(1); let b = $signal(2);' },
    { name: 'an interpolated Node', expected: '<div><em>n</em></div>', template: '<div>{{ node }}</div>', script: "const node = document.createElement('em'); node.textContent = 'n';" },
    { name: 'an interpolated Node in a signal', expected: '<div><em>n</em></div>', template: '<div>{{ node }}</div>', script: "const el = document.createElement('em'); el.textContent = 'n'; let node = $signal(el);" },
    // The inline path wrote the array as its string, "a,b" (#100).
    { name: 'an interpolated array', expected: '<div>ab</div>', template: '<div>{{ list }}</div>', script: "const list = ['a', 'b'];" },
    { name: 'content inside a component tag', expected: '<x-probe><span>child</span></x-probe>', template: '<x-probe><span>child</span></x-probe>' },
    // The inline path emitted `batchHandler(() => )` for @keepAlive: a module that does not parse (#200).
    // The instance switched away is frozen in a fragment, not hidden in the page (#269).
    {
        name: '<component :is> with @keepAlive', expected: '<x-field></x-field><button>swap</button>',
        template: '<component :is="tag" @keepAlive></component><button @click="tag = tag === \'x-probe\' ? \'x-field\' : \'x-probe\'">swap</button>',
        script: "let tag = $signal('x-probe');",
        act: click('button'),
    },
    // A template literal's `${…}` read a bare name the render does not have: `ReferenceError` at mount (#371).
    {
        name: 'a template literal with a signal in ${…}, after a change', expected: '<p lang="it">x-it</p><button>it</button>',
        template: '<p :lang="`${label}`">{{ `x-${label}` }}</p><button @click="label = `i${\'t\'}`">it</button>',
        script: "let label = $signal('en');", act: click('button'),
    },
    // What `<component :is>` encloses is not rendered, and what follows its closing tag is (#358): the
    // template path put the content beside the component, the inline path dropped it. Recorded as decided.
    {
        name: 'content inside <component :is>', expected: '<x-probe></x-probe><p>after</p>',
        template: '<component :is="tag"><b>inside</b></component><p>after</p>', script: "let tag = $signal('x-probe');",
    },
    // The inline path emitted `const __b = ;` for a binding with no value (#200).
    { name: ':name shorthand', expected: '<input></input>', expectedRead: 'a', template: '<input :value>', script: "let value = $signal('a');", read: (h) => h.querySelector('input')!.value },
    // The inline path wrote a literal <slot> element, with a `row` property, around its default (#200).
    { name: 'a scoped slot outlet with its default', expected: '<em>none</em>', template: '<slot name="cell" :row="r"><em>none</em></slot>', script: 'let r = $signal(1);' },
    // Neither path wired the gesture: on the template path the handler ran once at render and the count
    // read NaN, on the inline path `.left` was a key filter (#99). Swiped left, both count 1.
    {
        name: '@swipe.left', expected: '<div>s</div><p>1</p>',
        template: '<div @swipe.left="n++">s</div><p>{{ n }}</p>',
        script: 'let n = $signal(0);',
        act: (h) => {
            const pad = h.querySelector('div')!;
            pad.dispatchEvent(new PointerEvent('pointerdown', { clientX: 200, clientY: 10, bubbles: true }));
            pad.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 10, bubbles: true }));
        },
    },
    // A scoped slot outlet's fallback with an interpolation or a block was emitted BESIDE the outlet,
    // on the template path with an orphan </slot> (#276): both paths now render it inside, once.
    { name: 'a scoped slot outlet whose fallback interpolates', expected: '<div>none Ada</div>', template: '<div><slot name="row" :item="who">none {{ who }}</slot></div>', script: "let who = $signal('Ada');" },
    { name: 'a scoped slot outlet whose fallback is a block', expected: '<div><b>x Ada</b></div>', template: '<div><slot name="row" :item="who">@if (who) { <b>x {{ who }}</b> }</slot></div>', script: "let who = $signal('Ada');" },
    // @show false left a root text node on the page on both paths (#265); both now take it out, and
    // put it back current: hidden, renamed, shown.
    {
        name: '@show false over a root text node', expected: 'Details: Bob<b>x</b><button class="t">t</button><button class="r">r</button>',
        template: "@show (open) { Details: {{ who }} <b>x</b> }<button class=\"t\" @click=\"open = !open\">t</button><button class=\"r\" @click=\"who = 'Bob'\">r</button>",
        script: "let open = $signal(true); let who = $signal('Ann');",
        act: async (h) => {
            click('.t')(h);
            await new Promise((r) => setTimeout(r, 0));
            click('.r')(h);
            await new Promise((r) => setTimeout(r, 0));
            click('.t')(h);
        },
    },
    // Both paths kept the removed element in the ref (#262); both now reset it to null.
    {
        name: ':ref after its @if turns false', expected: '<p>none</p><button>x</button>',
        template: "@if (on) { <input class=\"f\" :ref=\"field\"> }<p>{{ field ? field.className : 'none' }}</p><button @click=\"on = false\">x</button>",
        script: 'let on = $signal(true); let field = $signal(null);',
        act: click('button'),
    },
    // An @name the parser does not know is text on both paths. The divergence #100 names needs a
    // directive a plugin registers; this row keeps the plain case honest.
    { name: 'an unknown @name is text', expected: '<p>a</p>@frobnicate { <p>b</p> }', template: '<p>a</p>@frobnicate { <p>b</p> }' },
];

describe('a .pdx puts in the page what the template path did (#92, #237)', () => {
    for (const row of ROWS) {
        it(row.owner ? `${row.name} — differs, owned by #${row.owner}` : row.name, async () => {
            const actual = await render(row);
            const same = actual.html === row.expected && JSON.stringify(actual.read) === JSON.stringify(row.expectedRead);
            const detail = `\n  expected: ${row.expected}${row.read ? `  read=${JSON.stringify(row.expectedRead)}` : ''}`
                + `\n  rendered: ${actual.html}${row.read ? `  read=${JSON.stringify(actual.read)}` : ''}`;
            if (row.owner) {
                expect(same, `the row now matches its expectation: remove owner #${row.owner}${detail}`).toBe(false);
            } else {
                expect(row.expected, 'an empty expectation: the row measures nothing').not.toBe('');
                expect(same, `the row differs from its expectation and no issue owns it${detail}`).toBe(true);
            }
        });
    }
});
