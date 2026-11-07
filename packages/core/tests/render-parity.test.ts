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
import { renderToStringWithReport } from '../src/server/render-string';
import { ROWS, DEFERRED_MODULE, lazyImport, settle, content, definePlainElements, type Row } from './render-parity-rows';


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

beforeAll(() => definePlainElements());


/**
 * The row compiled for the server (#160) and rendered to a string: the host's content, normalised as
 * the client's mount is.
 */
function serverRender(row: Row): string {
    const name = `sparity${++seq}`;
    const src = `<template>${row.template}</template>\n<script>\n${row.script ?? ''}\n</script>\n`;
    const { code } = compile(src, `${name}.pdx`, [], undefined, { production: true, ssr: true });
    const body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;');
    new Function('__core', body)(core);
    const tag = `app-${name}`;
    const { html } = renderToStringWithReport(() => new Function('html', `return html\`<${tag}></${tag}>\``)(core.html));
    const box = document.createElement('div');
    box.innerHTML = html;
    const host = box.firstElementChild as HTMLElement | null;
    return host ? content(host) : `no host: ${html}`;
}

/**
 * The rows the server renders: those the client renders by mounting alone, with no act on it, no
 * property read back, and no element that is not a component — `x-probe`, `x-field`, `x-snip` and the
 * deferred probe are plain custom elements made for the client's test, which the server cannot render.
 */
const SERVER_ROWS = ROWS.filter((row) => !row.act && !row.read && !row.owner
    && !/<(x-probe|x-field|x-snip|pdx-deferred-probe)\b|'x-(probe|field)'/.test(row.template + (row.script ?? '')));

describe('a .pdx compiled for the server writes the same markup (#160)', () => {
    it('renders the rows the client renders by mounting alone', () => {
        // 29 of the 68 on 2026-11-07; the others act on the mount, read a property, or use a plain
        // custom element. Fewer means the filter lost rows it should keep.
        expect(SERVER_ROWS.length).toBeGreaterThanOrEqual(29);
    });
    for (const row of SERVER_ROWS) {
        it(row.serverDiffers ? `${row.name} — differs: ${row.serverDiffers}` : row.name, () => {
            const rendered = serverRender(row);
            if (row.serverDiffers) expect(rendered, 'the row now renders its expectation: remove serverDiffers').not.toBe(row.expected);
            else expect(rendered).toBe(row.expected);
        });
    }
});

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
