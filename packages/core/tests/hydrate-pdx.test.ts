// A .pdx compiled to hydrate takes over the markup its server module wrote (#160, part 4b).
//
// Each row is compiled three times: for the server (ssr), for the client as it always is, and for the
// client with `hydrate`. The server's string is parsed in a document where the hydrating module's
// component is defined, under the same tag, so its host adopts the markup as it connects. The page must
// end as a mount of the client's module would, with no marker left, every element the server wrote
// still the same object, and a change of state afterwards reaching the adopted nodes.

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';
import { renderToString } from '../src/server/render-string';
import { installHydration } from '../src/hydrate/host';
import { children } from './string-parity';

interface Row {
    name: string;
    template: string;
    script?: string;
    /** Done after hydrating, and the text the page must then hold. */
    change?: { act: (host: HTMLElement) => void; shows: string };
}

let seq = 0;

/** A module compiled as a production build compiles it, run, its component defined under `tag`. */
function define(row: Row, name: string, options: { ssr?: boolean; hydrate?: boolean }): string {
    const src = `<template>${row.template}</template>\n<script>\n${row.script ?? ''}\n</script>\n`;
    const { code } = compile(src, `${name}.pdx`, [], undefined, { production: true, ...options });
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(core);
    return `app-${name}`;
}

const boxes: HTMLElement[] = [];
afterEach(() => { for (const b of boxes.splice(0)) b.remove(); vi.restoreAllMocks(); });

/** The markup parsed in a detached box, then put in the document: the host connects with its subtree. */
function page(markup: string): HTMLElement {
    const box = document.createElement('div');
    box.innerHTML = markup;
    document.body.appendChild(box);
    boxes.push(box);
    return box;
}

async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
}

beforeAll(() => {
    installHydration();
    if (!customElements.get('hy-pdx-card')) {
        core.component('hy-pdx-card', {
            props: { heading: core.prop('none') },
            render: (ctx) => core.html`<div class="card"><h3>${ctx.heading}</h3><slot></slot></div>`,
        });
    }
});

const rows: Row[] = [
    { name: 'static markup and text', template: '<section class="a"><h2>Title</h2><p>a &amp; b</p></section>' },
    { name: 'a signal and a prop in text', template: '<p>{{ n }} items, {{ label }}</p><button @click="n++">+</button>', script: "@prop label: string = 'Hi';\nlet n = $signal(3);", change: { act: (h) => h.querySelector('button')!.click(), shows: '4 items' } },
    { name: 'bound attributes, a class and a style', template: "<a :href=\"url\" :title=\"t\" class=\"base\" :class.on=\"on\" :style.color=\"c\">x</a><button @click=\"t = 'U'\">t</button>", script: "let url = $signal('/a'); let t = $signal('T'); let on = $signal(true); let c = $signal('red');", change: { act: (h) => h.querySelector('button')!.click(), shows: 'x' } },
    { name: '@if and @else', template: '<div>@if (open) { <p>open {{ n }}</p> } @else { <p>closed</p> }</div><button @click="open = !open">t</button>', script: 'let open = $signal(true); let n = $signal(1);', change: { act: (h) => h.querySelector('button')!.click(), shows: 'closed' } },
    { name: '@if / @else if / @else', template: '<div>@if (n === 1) { <b>one</b> } @else if (n === 2) { <b>two</b> } @else { <b>other</b> }</div><button @click="n = 1">1</button>', script: 'let n = $signal(2);', change: { act: (h) => h.querySelector('button')!.click(), shows: 'one' } },
    { name: '@for with track', template: '<ul>@for (rows as r; track r.id) { <li>{{ r.name }}</li> }</ul><button @click="rows = [rows[1]]">x</button>', script: "let rows = $signal([{ id: 1, name: 'a' }, { id: 2, name: 'b' }]);", change: { act: (h) => h.querySelector('button')!.click(), shows: 'b' } },
    { name: '@switch', template: "<div>@switch (s) { @case ('on') { <b>On</b> } @default { <b>Off</b> } }</div><button @click=\"s = 'on'\">x</button>", script: "let s = $signal('off');", change: { act: (h) => h.querySelector('button')!.click(), shows: 'On' } },
    { name: '@show around one element', template: '@show (on) { <p>shown</p> }<button @click="on = !on">x</button>', script: 'let on = $signal(true);' },
    { name: 'a component with a prop and a slot, a binding in its slot', template: '<hy-pdx-card :heading="h"><p>body {{ n }}</p></hy-pdx-card><button @click="n++">+</button>', script: "let h = $signal('Card'); let n = $signal(1);", change: { act: (h) => h.querySelector('button')!.click(), shows: 'body 2' } },
    { name: 'SVG', template: '<svg viewBox="0 0 10 10"><path :d="d"></path></svg>', script: "let d = $signal('M0 0L10 10');" },
];

describe('a .pdx compiled to hydrate takes over its server markup', () => {
    for (const row of rows) {
        it(row.name, async () => {
            const n = ++seq;
            // The mount it must equal: the client's module as it always is.
            const mounted = page('');
            mounted.appendChild(document.createElement(define(row, `hm${n}`, {})));
            await settle();

            const serverTag = define(row, `hs${n}`, { ssr: true });
            const clientTag = define(row, `hc${n}`, { hydrate: true });
            const markup = renderToString(() => new Function('html', `return html\`<${serverTag}></${serverTag}>\``)(core.html))
                .split(serverTag).join(clientTag);
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            // Parsed detached: the elements the server wrote, before the host takes them over.
            const box = document.createElement('div');
            box.innerHTML = markup;
            const written = Array.from(box.querySelectorAll(`${clientTag} *`));
            document.body.appendChild(box);
            boxes.push(box);
            await settle();
            expect(warn, 'the host adopted its markup instead of rendering afresh').not.toHaveBeenCalled();

            const host = box.firstElementChild as HTMLElement;
            const mountedHost = mounted.firstElementChild as HTMLElement;
            expect(children(host), `markup: ${markup}`).toBe(children(mountedHost));
            expect(host.innerHTML, 'no hydration marker is left').not.toMatch(/<!--\/?pdx(-slot)?[-:\w]*-->/);
            for (const el of written) expect(host.contains(el), `<${el.localName}> was replaced`).toBe(true);

            if (row.change) {
                row.change.act(host);
                await settle();
                expect(host.textContent).toContain(row.change.shows);
            }
        });
    }
});

describe('the module compiled to hydrate', () => {
    const src = '<template><p :title="t">{{ n }}</p>@if (n > 0) { <b>x</b> }</template>\n<script>\nlet n = $signal(1); let t = $signal(\'T\');\n</script>\n';

    it('walks the server\'s markup when it is handed it, and clones its own otherwise', () => {
        const { code } = compile(src, 'hy-shape.pdx', [], undefined, { production: true, hydrate: true });
        expect(code).toContain('hydrationRange()');
        expect(code).toContain('__hwalk');
        expect(code).toContain('staticBlock');
        expect(code).toContain('placePart(');
    });

    it('without the option, the module is as it was', () => {
        const { code } = compile(src, 'hy-shape.pdx', [], undefined, { production: true });
        expect(code).not.toContain('hydrationRange');
        expect(code).not.toContain('__hwalk');
        expect(code).not.toContain('placePart');
    });
});
