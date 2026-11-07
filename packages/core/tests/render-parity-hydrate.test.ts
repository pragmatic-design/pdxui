// The render-parity table hydrated, row by row (#160, part 4c).
//
// Each row's .pdx is compiled for the server and for the client with `hydrate`. The server's markup is
// parsed where the hydrating component is defined, under its tag, and the host takes it over as it
// connects; then the row's act is done, as on a mount. The page must hold the row's expectation — what
// a mount of it holds — with nothing rendered afresh and every element the server wrote still in place.
// A row whose hydration ends elsewhere says why (`hydrateDiffers`); one that comes to match fails, as an
// `owner` row does.

import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';
import { renderToString } from '../src/server/render-string';
import { installHydration } from '../src/hydrate/host';
import { ROWS, DEFERRED_MODULE, lazyImport, settle, content, definePlainElements, type Row } from './render-parity-rows';

beforeAll(() => {
    definePlainElements();
    installHydration();
});

const boxes: HTMLElement[] = [];
afterEach(() => { for (const b of boxes.splice(0)) b.remove(); vi.restoreAllMocks(); });

let seq = 0;

function define(row: Row, name: string, options: { ssr?: boolean; hydrate?: boolean }): string {
    const src = `<template>${row.template}</template>\n<script>\n${row.script ?? ''}\n</script>\n`;
    const importPathOf = (tag: string) => (tag === 'pdx-deferred-probe' ? `${DEFERRED_MODULE}?for=${name}` : null);
    const { code } = compile(src, `${name}.pdx`, [], undefined, { production: true, importPathOf, ...options });
    const body = code
        .replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;')
        .replace(/\bimport\(/g, '__import(');
    new Function('__core', '__import', body)(core, lazyImport);
    return `app-${name}`;
}

/**
 * The rows a hydration can take over: every one but those a known difference owns and those whose
 * elements the server cannot render — `x-probe`, `x-field`, `x-snip` are plain custom elements made for
 * the client's test, and the deferred probe a component loaded by the client only.
 */
const HYDRATE_ROWS = ROWS.filter((row) => !row.owner
    && !/<(x-probe|x-field|x-snip|pdx-deferred-probe)\b|'x-(probe|field)'/.test(row.template + (row.script ?? '')));

describe('the render-parity table, hydrated (#160)', () => {
    it('takes most of the table', () => {
        expect(HYDRATE_ROWS.length).toBeGreaterThanOrEqual(40);
    });

    for (const row of HYDRATE_ROWS) {
        it(row.hydrateDiffers ? `${row.name} — differs: ${row.hydrateDiffers}` : row.name, async () => {
            const n = ++seq;
            const serverTag = define(row, `rhs${n}`, { ssr: true });
            const clientTag = define(row, `rhc${n}`, { hydrate: true });
            const markup = renderToString(() => new Function('html', `return html\`<${serverTag}></${serverTag}>\``)(core.html))
                .split(serverTag).join(clientTag);
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const box = document.createElement('div');
            box.innerHTML = markup;
            const written = Array.from(box.querySelectorAll(`${clientTag} *`));
            document.body.appendChild(box);
            boxes.push(box);
            await settle();
            const host = box.firstElementChild as HTMLElement;
            const afresh = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('renders afresh'));
            const replaced = written.filter((el) => !host.contains(el)).map((el) => el.localName);
            if (row.act) { await row.act(host); await settle(); }
            const html = content(host);
            const same = html === row.expected && afresh.length === 0 && replaced.length === 0;
            const detail = `\n  expected: ${row.expected}\n  hydrated: ${html}\n  afresh: ${afresh.join(' | ') || 'none'}`
                + `\n  replaced: ${replaced.join(', ') || 'none'}`;
            if (row.hydrateDiffers) expect(same, `the row now hydrates to its expectation: remove hydrateDiffers${detail}`).toBe(false);
            else expect(same, `the row hydrates elsewhere${detail}`).toBe(true);
        });
    }
});
