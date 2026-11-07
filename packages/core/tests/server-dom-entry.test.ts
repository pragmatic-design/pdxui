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
type CoreApi = typeof import('../src/index');
let server: ServerApi;
let core: CoreApi;

beforeAll(async () => {
    expect(typeof HTMLElement, 'this suite runs with no DOM').toBe('undefined');
    const dom = (await import(/* @vite-ignore */ entry('./server-dom'))) as { installServerDom(): void };
    dom.installServerDom();
    server = (await import(/* @vite-ignore */ entry('./server'))) as ServerApi;
    core = (await import(/* @vite-ignore */ entry('.'))) as CoreApi;
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
