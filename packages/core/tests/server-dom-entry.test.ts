// @vitest-environment node
// The server DOM through the package's own doors (#160): `@pdxui/core/server-dom` installs it, and
// only then is `@pdxui/core/server` imported. The order is the whole point. `PdxElement` extends the
// `HTMLElement` it finds when its module is evaluated, and in Node there is none until the shim
// installs one; a shim reached through an entry that also evaluates `PdxElement` comes too late,
// and every component is then built on a class with no attributes.
//
// The entries are read from package.json, so the test follows what a consumer imports.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as {
    exports: Record<string, { development?: string }>;
};
/** The source file a sub-path of the package resolves to in development. */
const entry = (subpath: string): string => {
    const file = pkg.exports[subpath]?.development;
    if (!file) throw new Error(`package.json exports no ${subpath}`);
    return join(here, '..', file);
};

type ServerApi = typeof import('../src/server/index');
let server: ServerApi;
// What the component is written with, from the modules the barrel re-exports: the whole barrel,
// transformed cold inside this hook, took more than its 10 s under the pre-push gate's load.
let core: {
    html: typeof import('../src/renderer/template').html;
    component: typeof import('../src/component/component').component;
    prop: typeof import('../src/component/component-descriptor').prop;
};

beforeAll(async () => {
    expect(typeof HTMLElement, 'this suite runs with no DOM').toBe('undefined');
    const dom = (await import(/* @vite-ignore */ entry('./server-dom'))) as { installServerDom(): void };
    dom.installServerDom();
    server = (await import(/* @vite-ignore */ entry('./server'))) as ServerApi;
    const [template, comp, descriptor] = await Promise.all([
        import('../src/renderer/template'), import('../src/component/component'), import('../src/component/component-descriptor'),
    ]);
    core = { html: template.html, component: comp.component, prop: descriptor.prop };
});

describe('the server DOM, installed through its entry', () => {
    it('is an entry that brings nothing of core with it', () => {
        const source = readFileSync(entry('./server-dom'), 'utf8');
        expect(source.match(/^\s*(import|export)\b[^;]*\bfrom\s+['"]/gm) ?? [], 'the shim imports a module').toEqual([]);
    });

    it('is not offered by @pdxui/core/server, where it would come too late', () => {
        expect('installServerDom' in server).toBe(false);
    });

    it('lets a component render to a string in Node', () => {
        const { html, component, prop } = core;
        component('entry-card', { props: { label: prop('') }, render: (ctx) => html`<p>${ctx.label}</p>` });
        const { html: markup, skipped } = server.renderToStringWithReport(() => html`<entry-card label="hi"></entry-card>`);
        expect(skipped).toEqual([]);
        expect(markup).toMatch(/^<entry-card label="hi"[^>]* data-pdx-ssr="\d+"><p><!--pdx-->hi<!--\/pdx--><\/p><\/entry-card>$/);
    });
});
