// Typed snippets (#489, part 1 of #131): a child declares a template its parent provides,
// `@slot row: (item, i);`, and renders it with `@render row(it, i)`; the parent defines it inside
// the child's tag, `@snippet row(u, i) { … }`. A snippet is a function the child calls, not a
// projection, so one inside an `@if` that turns true later renders — the case scoped slots fail.
// Each component here is compiled as a build compiles it and defined on this core.
import { describe, it, expect } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';

const settle = async () => {
    for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
};

/** Compile a .pdx as a production build does and define its component on this core. */
function define(name: string, template: string, script = ''): string {
    const src = `<template>${template}</template>\n<script>\n${script}\n</script>\n`;
    const { code, warnings } = compile(src, `${name}.pdx`, [], undefined, { production: true });
    const errors = warnings.filter((w) => w.severity === 'error');
    if (errors.length > 0) throw new Error(errors.map((w) => `${w.code}: ${w.message}`).join('\n'));
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(core);
    return code;
}

async function mount(tag: string): Promise<HTMLElement> {
    const el = document.createElement(tag);
    document.body.appendChild(el);
    await settle();
    return el;
}

const texts = (root: Element, selector: string) => [...root.querySelectorAll(selector)].map((n) => n.textContent?.trim());

describe('@slot with a signature, @render, and @snippet in the tag', () => {
    define('app-snip-list',
        '<ul>@for (items as it, i; track it.name) { <li>@render row(it, i)</li> }</ul>',
        '@prop items: { name: string }[] = [];\n@slot row: (item: { name: string }, index: number);');
    define('app-snip-page',
        '<app-snip-list :items="users">@snippet row(u, i) { <span>{{ i + 1 }}. {{ u.name }}</span> }</app-snip-list>'
        + '<button @click="users = [...users, { name: \'Cy\' }]">add</button>',
        "let users = $signal([{ name: 'Ann' }, { name: 'Bo' }]);");

    it("the child's @for renders the parent's snippet once per item, with its arguments", async () => {
        const el = await mount('app-snip-page');
        expect(texts(el, 'li span')).toEqual(['1. Ann', '2. Bo']);
    });

    it('follows the data: a new item renders the snippet for it', async () => {
        const el = await mount('app-snip-page');
        (el.querySelector('button') as HTMLButtonElement).click();
        await settle();
        expect(texts(el, 'li span')).toEqual(['1. Ann', '2. Bo', '3. Cy']);
    });
});

describe('a snippet rendered in an @if that turns true later', () => {
    define('app-snip-late',
        '@if (open) { <div class="in">@render panel()</div> }<button @click="open = !open">toggle</button>',
        'let open = $signal(false);\n@slot panel: ();');
    define('app-snip-late-page', '<app-snip-late>@snippet panel() { <b>late</b> }</app-snip-late>');

    it('renders when the block appears — no projection at mount to miss it', async () => {
        const el = await mount('app-snip-late-page');
        expect(el.querySelector('.in')).toBeNull();
        (el.querySelector('button') as HTMLButtonElement).click();
        await settle();
        expect(el.querySelector('.in b')?.textContent).toBe('late');
    });
});

describe('@render row?.(…) @else { … }', () => {
    define('app-snip-opt',
        "<p>@render row?.('x') @else { <i>fallback</i> }</p>",
        '@slot row?: (item: string);');
    define('app-snip-opt-empty', '<app-snip-opt></app-snip-opt>');
    define('app-snip-opt-filled', '<app-snip-opt>@snippet row(v) { <u>{{ v }}</u> }</app-snip-opt>');

    it('renders the fallback when the parent gives nothing', async () => {
        const el = await mount('app-snip-opt-empty');
        expect(el.querySelector('p i')?.textContent).toBe('fallback');
        expect(el.querySelector('p u')).toBeNull();
    });

    it("renders the parent's snippet, and not the fallback, when it gives one", async () => {
        const el = await mount('app-snip-opt-filled');
        expect(el.querySelector('p u')?.textContent).toBe('x');
        expect(el.querySelector('p i')).toBeNull();
    });
});

describe('@snippet in the script', () => {
    const code = define('app-snip-script',
        '<p>@render greet(who)</p><button @click="who = \'Bo\'">rename</button>',
        "let who = $signal('Ann');\n@snippet greet(name) {\n  <em>hi {{ name }}</em>\n}");

    it('has a template body, compiled like any other: no html`` in the module', () => {
        expect(code, 'the snippet is still an html`` template').not.toMatch(/\bhtml`/);
    });

    it('renders with its argument, and again when the argument changes', async () => {
        const el = await mount('app-snip-script');
        expect(el.querySelector('p em')?.textContent).toBe('hi Ann');
        (el.querySelector('button') as HTMLButtonElement).click();
        await settle();
        expect(el.querySelector('p em')?.textContent).toBe('hi Bo');
    });
});

describe('a snippet assigned from JavaScript', () => {
    it('is a property of the element: a consumer that is not PDX assigns a function', async () => {
        const el = document.createElement('app-snip-list') as HTMLElement & { items: unknown; row: unknown };
        el.items = [{ name: 'Zed' }];
        el.row = (item: { name: string }, i: number) => {
            const s = document.createElement('s');
            s.textContent = `${i}:${item.name}`;
            return s;
        };
        document.body.appendChild(el);
        await settle();
        expect(texts(el, 'li s')).toEqual(['0:Zed']);

        el.row = (item: { name: string }) => {
            const q = document.createElement('q');
            q.textContent = item.name;
            return q;
        };
        await settle();
        expect(texts(el, 'li q'), 'a function assigned after mount did not render').toEqual(['Zed']);
        expect(el.querySelector('li s')).toBeNull();
    });
});

describe('a snippet replaced by another', () => {
    it("disposes the old one's effects: a change it read no longer runs them", async () => {
        const tick = core.signal(0);
        let oldRuns = 0;
        const el = document.createElement('app-snip-list') as HTMLElement & { items: unknown; row: unknown };
        el.items = [{ name: 'Ann' }];
        el.row = () => {
            core.effect(() => { tick(); oldRuns++; });
            return document.createElement('s');
        };
        document.body.appendChild(el);
        await settle();
        // The control: while it is rendered, a change of what it read runs its effect.
        tick.set(1);
        await settle();
        expect(oldRuns, 'the effect did not run while the snippet was rendered').toBe(2);

        el.row = () => document.createElement('q');
        await settle();
        expect(el.querySelector('li q')).not.toBeNull();
        tick.set(2);
        await settle();
        expect(oldRuns, "the replaced snippet's effect ran").toBe(2);
    });
});

describe('lifecycle: a snippet belongs to the block that renders it', () => {
    define('app-snip-gate',
        '@if (open) { <div class="gate">@render row(user)</div> }',
        "@prop open: boolean = false;\n@slot row: (u: { name: string });\nlet user = $signal({ name: 'Ann' });");
    define('app-snip-gate-page',
        '<app-snip-gate :open="open">@snippet row(u) { <span>{{ u.name }} {{ seen(count) }}</span> }</app-snip-gate>'
        + '<button class="inc" @click="count++">inc</button>'
        + '<button class="close" @click="open = false">close</button>'
        + '<button class="open" @click="open = true">open</button>',
        'let count = $signal(0);\nlet open = $signal(true);\n'
        + 'function seen(v) { window.__snipRuns = (window.__snipRuns || 0) + 1; return v; }');

    const runs = () => (window as unknown as { __snipRuns?: number }).__snipRuns ?? 0;
    const click = (el: Element, selector: string) => (el.querySelector(selector) as HTMLButtonElement).click();

    it("closing the child's block disposes the snippet's bindings while the parent stays mounted", async () => {
        const el = await mount('app-snip-gate-page');
        expect(el.querySelector('.gate span')?.textContent).toBe('Ann 0');

        // The control: while the block is there, a change of `count` runs the snippet's binding.
        const before = runs();
        click(el, '.inc');
        await settle();
        expect(el.querySelector('.gate span')?.textContent).toBe('Ann 1');
        expect(runs(), 'the binding did not run while the block was there').toBeGreaterThan(before);

        click(el, '.close');
        await settle();
        expect(el.querySelector('.gate')).toBeNull();
        const closed = runs();
        click(el, '.inc');
        await settle();
        expect(runs(), "a disposed snippet's binding ran when `count` changed").toBe(closed);

        click(el, '.open');
        await settle();
        expect(el.querySelector('.gate span')?.textContent, 'the snippet did not render anew').toBe('Ann 2');
    });
});
