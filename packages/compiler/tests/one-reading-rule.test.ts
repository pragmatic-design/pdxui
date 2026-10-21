// One reading rule for every declaration (#524; beta spec, script.md, «The script and its rewrite»;
// decisions.md point 11): a declaration may span lines when it opens a balanced `{ … }` or `( … )` on
// its first line, and it ends at its `;` or at the end of that block. Each rune used to read its
// declaration its own way — some one line, some to their balanced braces — and a wrapped declaration
// read as one line was misread in silence.
//
// The runes are `RUNES` itself, not a copy: a declaration added there without an example here fails.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { RUNES } from '../src/compiler/runes';
import { readDeclarationsOntoOneLine } from '../src/compiler/declaration-reading';

/**
 * Each declaration, in its one-line form, with the script around it that makes it compile. `null`:
 * the declaration has no block in any of its forms, so by the rule it is written on one line.
 */
const EXAMPLES: Record<string, { decl: string; script?: string; page?: boolean } | null> = {
    prop: { decl: '@prop size: { w: number; h: number } = { w: 1, h: 2 };' },
    model: { decl: '@model point: { x: number } = { x: 0 };' },
    event: { decl: '@event moved: { x: number; y: number };' },
    slot: { decl: '@slot row: (item: string, index: number);' },
    generic: { decl: '@generic T extends { id: string };' },
    expose: null,
    part: null,
    host: { decl: '@host { role="switch" :aria-checked="on" }', script: 'let on = $signal(false);' },
    variants: { decl: '@variants { variant: { primary, ghost } = primary; size: { sm, md } = md; }' },
    state: { decl: '@state busy = (count > 0 && count < 9);', script: 'let count = $signal(0);' },
    form: { decl: '@form login: { user: string { required }, pass: string };' },
    action: { decl: "@action save(dto: string, { signal }) with { invalidate: ['GET:/api/x'], concurrency: 'drop' } { await fetch('/api/x', { method: 'POST', body: dto, signal }); }" },
    fetch: { decl: "@fetch users: 'GET /api/users' as string[] { staleTime: 5000 };" },
    store: { decl: "@store prefs { persist: 'local' };", script: 'let state = $store({ theme: "dark" });' },
    page: { decl: "@page '/users' { prefetch: 'hover', meta: { auth: true } };", page: true },
    guard: null,
    loader: { decl: '@loader user: loadUser { staleTime: 30_000 };', script: 'async function loadUser() { return 1; }', page: true },
    layout: null,
    title: { decl: "@title $t('users.title', { count: 3 });" },
    meta: null,
    scroll: null,
    provide: { decl: '@provide Theme = { dark: true, accent: "blue" };', script: "import { Theme } from './theme';" },
    inject: null,
    tag: null,
    params: { decl: '@params { id: number, tab: string }', page: true },
    redirect: null,
    outlet: null,
    search: { decl: '@search { q?: string, page: number = 1 }', page: true },
    snippet: { decl: '@snippet item(x: string) { <li>{{ x }}</li> }' },
    i18n: { decl: "@i18n { locales: ['en', 'it'], default: 'en' }" },
    use: null,
    raw: { decl: '@raw { const untouched = 1; }' },
};

/** The declaration over three lines: the first block it opens is broken after its opener and before its closer. */
function threeLines(decl: string): string {
    // The first `{` or `(` after the rune's name, outside strings.
    let quote = '';
    let open = -1;
    for (let i = decl.indexOf(' '); i < decl.length; i++) {
        const c = decl[i];
        if (quote) { if (c === quote) quote = ''; continue; }
        if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
        if (c === '{' || c === '(') { open = i; break; }
    }
    const close = open === -1 ? -1 : matching(decl, open);
    if (close === -1) throw new Error(`no block to open in ${decl}`);
    return `${decl.slice(0, open + 1)}\n  ${decl.slice(open + 1, close).trim()}\n${decl.slice(close)}`;
}

/** The index of the bracket that closes the one at `open`, strings stepped over. */
function matching(text: string, open: number): number {
    const closer = text[open] === '{' ? '}' : ')';
    let depth = 0;
    let quote = '';
    for (let i = open; i < text.length; i++) {
        const c = text[i];
        if (quote) { if (c === quote) quote = ''; continue; }
        if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
        if (c === text[open]) depth++;
        else if (c === closer && --depth === 0) return i;
    }
    return -1;
}

function compiled(decl: string, ex: { script?: string; page?: boolean }) {
    const script = [ex.page && !decl.startsWith('@page') ? "@page '/users/:id';" : '', ex.script ?? '', decl].filter(Boolean).join('\n');
    const { code, warnings } = compile(`<template><p>x</p></template>\n<script>\n${script}\n</script>\n`, 'rule.pdx');
    // Blank lines and indentation are where the two forms may differ; nothing else is.
    const normal = code.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
    return { code: normal, warnings: warnings.map((w) => `${w.code}: ${w.message}`).sort() };
}

describe('one reading rule: any declaration may span lines when it opens a block on its first', () => {
    const declarations = RUNES.filter((r) => r.kind === 'decorator').map((r) => r.name);

    it('every declaration of runes.ts has an example here', () => {
        expect(declarations.filter((n) => !(n in EXAMPLES)), 'a declaration with no example: add one').toEqual([]);
        expect(Object.keys(EXAMPLES).filter((n) => !declarations.includes(n)), 'an example of no declaration').toEqual([]);
    });

    it('a declaration with no block in any of its forms is written on one line, and listed as such', () => {
        // The rule needs a block opened on the first line; these have none, so they never span lines.
        expect(Object.entries(EXAMPLES).filter(([, ex]) => ex === null).map(([n]) => n).sort())
            .toEqual(['expose', 'guard', 'inject', 'layout', 'meta', 'outlet', 'part', 'redirect', 'scroll', 'tag', 'use']);
    });

    for (const name of declarations) {
        const ex = EXAMPLES[name];
        if (!ex) continue;
        it(`@${name} over three lines compiles as its one-line form`, () => {
            const one = compiled(ex.decl, ex);
            const three = compiled(threeLines(ex.decl), ex);
            expect(one.warnings.filter((w) => w.startsWith('PDX_UNKNOWN_DECLARATION')), 'the one-line example is not a form').toEqual([]);
            expect(three.warnings).toEqual(one.warnings);
            expect(three.code).toEqual(one.code);
        });
    }
});

describe('the rule reads the options of @fetch and @action', () => {
    const FETCH = ["@fetch users: 'GET /api/users' as string[] {", '  staleTime: 5000,', "  tags: ['users'] };"];
    const ACTION = ["@action save(dto: string) with {", "  invalidate: ['GET:/api/x'],", "  concurrency: 'drop'", '} { await fetch(dto); }'];

    it('@fetch options over three lines are read onto the declaration\'s line', () => {
        const { lines, consumed } = readDeclarationsOntoOneLine(FETCH);
        expect(lines[0]).toBe("@fetch users: 'GET /api/users' as string[] { staleTime: 5000, tags: ['users'] };");
        expect([...consumed]).toEqual([1, 2]);
        expect(compiled(FETCH.join('\n'), {}).code).toEqual(compiled(lines[0], {}).code);
    });

    it('@action options after `with`, over three lines, are read onto the declaration\'s line; its body is not', () => {
        const { lines } = readDeclarationsOntoOneLine(ACTION);
        expect(lines[0]).toBe("@action save(dto: string) with { invalidate: ['GET:/api/x'], concurrency: 'drop' } { await fetch(dto); }");
        expect(compiled(ACTION.join('\n'), {}).code).toEqual(compiled(lines[0], {}).code);
    });
});

describe('what the rule leaves to a rune\'s own parser', () => {
    it('a body: @raw, @action and @snippet keep their body\'s lines', () => {
        const raw = ['@raw {', '  const a = 1; // kept', '}'];
        expect(readDeclarationsOntoOneLine(raw).lines).toEqual(raw);
        const action = ['@action save(dto: string) {', '  await fetch(dto); // a comment', '}'];
        expect(readDeclarationsOntoOneLine(action).lines).toEqual(action);
        const snippet = ['@snippet item(x: string) {', '  <pre>{{ x }}', '  </pre>', '}'];
        expect(readDeclarationsOntoOneLine(snippet).lines).toEqual(snippet);
    });

    it('a block opened after the first one closed: @form\'s options, separated by line breaks', () => {
        const form = ['@form signup: {', '  name: string { required }', '} {', '  validate: check', '  warnUnsaved', '};'];
        const { lines } = readDeclarationsOntoOneLine(form);
        expect(lines[0]).toBe('@form signup: { name: string { required } } {');
        expect(lines.slice(3)).toEqual(form.slice(3));
    });

    it('a `//` comment on a line read onto another is dropped, not carried into the rest of the line', () => {
        const { lines } = readDeclarationsOntoOneLine(['@prop size: { // the box', '  w: number', '} = { w: 1 };']);
        expect(lines[0]).toBe('@prop size: { w: number } = { w: 1 };');
    });

    it('control — a statement that is not a rune, or a rune in a comment, is not touched', () => {
        const other = ['const box = {', '  w: 1', '};', '// @prop x: {', '//  y', '// };'];
        expect(readDeclarationsOntoOneLine(other).lines).toEqual(other);
    });
});
