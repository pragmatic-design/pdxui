// A .pdx compiled for the server renders to the string of what the client mounts (#160, part 3).
//
// Vite loads a module for the server with `ssr`, and the compiler writes its render as html``, which
// core renders to a string; the client's module builds DOM. Each row here is compiled both ways: the
// client's module is mounted in the document, the server's is rendered with renderToString, and the
// host's content is compared canonically (string-parity.ts) — so the markup hydration will adopt is
// the client's, node for node.

import { describe, it, expect, beforeAll } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';
import type { CompilerPlugin } from '../../compiler/src/plugin-system';
import { renderToStringWithReport } from '../src/server/render-string';
import { children } from './string-parity';

interface Row {
    name: string;
    template: string;
    script?: string;
    /** Text the rendered content must hold, so that two empty renders do not agree. */
    shows: string;
    /**
     * Compare the client's DOM as it is when it has just mounted, with no settling: a block that
     * changes by itself afterwards — a promise, a trigger — is written as it starts.
     */
    sync?: boolean;
    /** Compiler plugins: a custom template directive. */
    plugins?: CompilerPlugin[];
}

let seq = 0;

/** The module compiled as a production build compiles it — for the server when `ssr` — and run. */
function define(row: Row, prefix: string, ssr: boolean): string {
    const name = `${prefix}${++seq}`;
    const src = `<template>${row.template}</template>\n<script>\n${row.script ?? ''}\n</script>\n`;
    const { code } = compile(src, `${name}.pdx`, row.plugins ?? [], undefined, { production: true, ssr });
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(core);
    return `app-${name}`;
}

/** Microtasks, then frames: what a binding, an effect and a sliced list need. */
async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
}

/** The client's mount and the server's string, the host's content of each, canonically. */
async function both(row: Row): Promise<{ client: string; server: string; markup: string; skipped: unknown[] }> {
    const clientTag = define(row, 'c', false);
    const host = document.createElement(clientTag);
    document.body.appendChild(host);
    if (!row.sync) await settle();
    const a = document.createElement('div');
    a.innerHTML = host.innerHTML;
    host.remove();

    const serverTag = define(row, 's', true);
    const { html: markup, skipped } = renderToStringWithReport(() => new Function('html', `return html\`<${serverTag}></${serverTag}>\``)(core.html));
    const b = document.createElement('div');
    b.innerHTML = markup;
    const rendered = b.firstElementChild;
    // A component inside the host is marked pre-rendered too, which the client's mount is not.
    for (const nested of Array.from(rendered?.querySelectorAll('[data-pdx-ssr]') ?? [])) nested.removeAttribute('data-pdx-ssr');
    expect(rendered?.localName, `markup: ${markup}`).toBe(serverTag);
    expect(rendered?.hasAttribute('data-pdx-ssr'), 'the host is marked pre-rendered').toBe(true);
    return { client: children(a), server: children(rendered!), markup, skipped };
}

beforeAll(() => {
    // A TypeScript component a .pdx renders, with a prop and a default and a named slot.
    if (!customElements.get('x-ssr-card')) {
        // A component that renders the snippet it is given, as `@render row('a', 0)` would (#489).
        core.component('x-ssr-snip', {
            props: { row: core.prop<((v: string, i: number) => unknown) | null>(null) },
            render: (ctx) => core.html`<div class="snip">${() => ctx.row()?.('a', 0)}</div>`,
        });
        core.component('x-ssr-card', {
            props: { heading: core.prop('none') },
            render: (ctx) => core.html`<div class="card"><h3>${ctx.heading}</h3><slot name="head"></slot><slot></slot></div>`,
        });
    }
});

/** A plugin with one template directive, generating the expression `generate` returns. */
function directive(name: string, generate: (expr: string, body: string) => string): CompilerPlugin {
    return { name: `directive-${name}`, templateDirectives: { [name]: { generate: (expr, body) => generate(expr, body) } } };
}

const rows: Row[] = [
    { name: 'static markup and whitespace', shows: 'Title', template: '\n  <section class="a">\n    <h2 id="t">Title</h2>\n    <p>text <b>bold</b> end</p>\n  </section>\n' },
    { name: '{{ }} text, a signal and a prop', shows: '3 items', template: '<p>{{ n }} items, {{ label }}</p>', script: "@prop label: string = 'Hi';\nlet n = $signal(3);" },
    { name: 'escaping in text and attributes', shows: 'a < b', template: '<p :title="t">{{ s }}</p>', script: "let s = $signal('a < b & c'); let t = $signal('say \"hi\"');" },
    { name: ':attr, a URL, a boolean', shows: 'x', template: '<a :href="url" :title="t" :hidden="h">x</a><a :href="bad">y</a>', script: "let url = $signal('/a'); let t = $signal('T'); let h = $signal(false); let bad = $signal('javascript:alert(1)');" },
    { name: ':class string and object beside a static class', shows: 'x', template: "<p class=\"base\" :class=\"on ? 'yes' : 'no'\">x</p><p class=\"base\" :class=\"{ active: on, off: !on }\">y</p>", script: 'let on = $signal(true);' },
    { name: ':style, :class.x and :show', shows: 'shown', template: "<p :style=\"{ color: 'red' }\" :class.big=\"on\">a</p><p :show=\"!on\">hidden</p><p :show=\"on\">shown</p>", script: 'let on = $signal(true);' },
    { name: 'events, refs and attachments write nothing', shows: 'b', template: '<button @click="n++" :ref="btn">b</button>', script: 'let n = $signal(0); let btn = $signal(null);' },
    { name: '@if and @else', shows: 'open', template: '<div>@if (open) { <p>open</p> } @else { <p>closed</p> }</div>', script: 'let open = $signal(true);' },
    { name: '@if / @else if / @else chain', shows: 'two', template: "<div>@if (n === 1) { <p>one</p> } @else if (n === 2) { <p>two</p> } @else { <p>other</p> }</div>", script: 'let n = $signal(2);' },
    { name: '@for with track and an index', shows: '1:b', template: '<ul>@for (rows as r, i; track r.id) { <li :data-id="r.id">{{ i }}:{{ r.name }}</li> }</ul>', script: "let rows = $signal([{ id: 1, name: 'a' }, { id: 2, name: 'b' }]);" },
    { name: '@for destructured', shows: 'b', template: '<ul>@for (rows as { id, name }; track id) { <li>{{ name }}</li> }</ul>', script: "let rows = $signal([{ id: 1, name: 'a' }, { id: 2, name: 'b' }]);" },
    { name: '@for over an empty list', shows: 'end', template: '<ul>@for (rows as r; track r) { <li>{{ r }}</li> }</ul><p>end</p>', script: 'let rows = $signal([]);' },
    { name: '@switch with a default', shows: 'Off', template: "<div>@switch (s) { @case ('on') { <b>On</b> } @case ('off') { <b>Off</b> } @default { <b>?</b> } }</div>", script: "let s = $signal('off');" },
    { name: '@show around one element and around several', shows: 'kept', template: '@show (on) { <p>one</p> }@show (!on) { <p>a</p><p>b</p> }<p>kept</p>', script: 'let on = $signal(false);' },
    { name: '@let', shows: '6', template: '@let total = n * 2;\n<p>{{ total }}</p>', script: 'let n = $signal(3);' },
    { name: 'a component with a prop, a named and a default slot', shows: 'Card', template: '<x-ssr-card :heading="h"><span slot="head">top</span><p>body {{ n }}</p></x-ssr-card>', script: "let h = $signal('Card'); let n = $signal(1);" },
    { name: 'SVG', shows: 'svg', template: '<svg viewBox="0 0 10 10"><path :d="d"></path></svg><p>svg</p>', script: "let d = $signal('M0 0L10 10');" },
    { name: '@defer (viewport) shows its placeholder after the sentinel', shows: 'wait', sync: true, template: '@defer (viewport) { <p>in</p> } @placeholder { <p>wait</p> }' },
    { name: '@defer (immediate) with no code to load renders the body', shows: 'in', template: '@defer (immediate) { <p>in</p> } @placeholder { <p>wait</p> }' },
    { name: '@defer (when (…)) already true renders the body', shows: 'in', template: '@defer (when (on)) { <p>in</p> } @placeholder { <p>wait</p> }', script: 'let on = $signal(true);' },
    { name: '@await over a value there is', shows: 'ready done', template: '@await (data as d) { <p>ready {{ d }}</p> } @loading { <p>…</p> }', script: "let data = $signal('done');" },
    { name: '@await over a promise shows @loading', shows: '…', sync: true, template: '@await (data) { <p>ready</p> } @loading { <p>…</p> }<p>end</p>', script: "let data = $signal(Promise.resolve('done'));" },
    { name: '@try / @catch, the body throwing while it renders', shows: 'caught', template: '@try { <p>{{ boom() }}</p> } @catch (e) { <p>caught</p> }', script: "function boom() { throw new Error('x'); }" },
    { name: '@try / @catch, the body rendering', shows: 'fine', template: '@try { <p>fine</p> } @catch (e) { <p>caught</p> }' },
    { name: '@portal leaves its marker in place', shows: 'here', template: "<div>@portal ('body') { <p>away</p> }<p>here</p></div>" },
    { name: '<component :is> renders the component it names', shows: 'none', template: '<component :is="tag"></component><p>after</p>', script: "let tag = $signal('x-ssr-card');" },
    { name: '@render of a script @snippet', shows: 'hi x', template: "<p>@render greet('x')</p>", script: '@snippet greet(name) {\n  <em>hi {{ name }}</em>\n}' },
    { name: '@snippet in a component tag, rendered by the component', shows: 'a0', template: '<x-ssr-snip>@snippet row(v, i) { <b>{{ v }}{{ i }}</b> }</x-ssr-snip>' },
    { name: 'a custom directive whose expression is the body', shows: 'boxed', template: '<div>@boxed (1) { <p>boxed</p> }</div>', plugins: [directive('boxed', (_expr, body) => body)] },
    { name: 'a custom directive whose expression is no node renders nothing', shows: 'after', template: "<div>@noted (1) { <p>never</p> }<p>after</p></div>", plugins: [directive('noted', () => "'a note'")] },
    { name: '@raw text', shows: 'as written', template: '<pre>@raw { {{ as written }} }</pre>' },
];

describe('a .pdx compiled for the server renders what the client mounts', () => {
    for (const row of rows) {
        it(row.name, async () => {
            const { client, server, markup, skipped } = await both(row);
            expect(skipped, 'nothing rendered as an empty host').toEqual([]);
            expect(server, `markup: ${markup}`).toBe(client);
            expect(client).toContain(row.shows);
        });
    }
});

describe('a field\'s value', () => {
    it('::value is written in the markup, where the client holds it as a property', async () => {
        const row: Row = { name: '::value', shows: '', template: '<input ::value="name"><textarea ::value="note"></textarea><input type="checkbox" ::checked="on">', script: "let name = $signal('Ada'); let note = $signal('n'); let on = $signal(true);" };
        const clientTag = define(row, 'c', false);
        const host = document.createElement(clientTag);
        document.body.appendChild(host);
        await settle();
        const [input, box] = Array.from(host.querySelectorAll('input'));
        const fields = { value: input.value, text: host.querySelector('textarea')!.value, checked: box.checked };
        host.remove();
        expect(fields).toEqual({ value: 'Ada', text: 'n', checked: true });

        const serverTag = define(row, 's', true);
        const markup = renderToStringWithReport(() => new Function('html', `return html\`<${serverTag}></${serverTag}>\``)(core.html)).html;
        const b = document.createElement('div');
        b.innerHTML = markup;
        const [sInput, sBox] = Array.from(b.querySelectorAll('input'));
        expect({ value: sInput.value, text: b.querySelector('textarea')!.value, checked: sBox.checked }, `markup: ${markup}`).toEqual(fields);
    });

    it('::value with a { get, set } accessor writes what get returns', () => {
        const row: Row = { name: '::value accessor', shows: '', template: '<input ::value="{ get: () => name.toUpperCase(), set: (v) => name = v }">', script: "let name = $signal('ada');" };
        const serverTag = define(row, 's', true);
        const markup = renderToStringWithReport(() => new Function('html', `return html\`<${serverTag}></${serverTag}>\``)(core.html)).html;
        expect(markup).toContain('value="ADA"');
    });
});

describe('the module compiled for the server', () => {
    const src = '<template><p :title="t" @click="n++">{{ n }}</p>@if (n > 0) { <b>x</b> }</template>\n<script>\nlet n = $signal(1); let t = $signal(\'T\');\n</script>\n';

    it('returns html`` from its render, with no builder, walk or listener', () => {
        const { code } = compile(src, 'ssr-shape.pdx', [], undefined, { production: true, ssr: true });
        expect(code).toContain('html`');
        expect(code).not.toContain('staticBlock');
        expect(code).not.toContain('addEventListener');
        expect(code).not.toContain('delegate(');
        expect(code).not.toContain('bindInterpolation');
    });

    it('the client\'s module is unchanged by it', () => {
        const { code } = compile(src, 'ssr-shape.pdx', [], undefined, { production: true });
        expect(code).toContain('staticBlock');
        expect(code).not.toMatch(/\bhtml`/);
    });

    it('imports its styles instead of injecting them', () => {
        const styled = `${src}<style>p { color: red; }</style>\n`;
        const dev = compile(styled, 'ssr-style.pdx', [], undefined, { production: false, ssr: true }).code;
        expect(dev).toContain("import 'virtual:pdx-style/");
        expect(dev).not.toContain('document.createElement(\'style\')');
    });
});
