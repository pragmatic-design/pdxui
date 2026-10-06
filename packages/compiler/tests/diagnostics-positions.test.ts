// Every diagnostic one file produces says where it is: a 1-based line and column.
//
// That includes everything the script analyser raises and every check on a declaration, with
// columns that are always 1-based, and PDX_SCRIPT_SYNTAX_ERROR's line counted from the file, not
// from the assembled setup body. Each row below is one code: a file that produces it, and the text
// of the line the finding must point at.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { validate } from '../src/compiler/validate';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { parseSFC } from '../src/parser/sfc';
import { parseTemplate } from '../src/parser/template';
import { positionWarnings } from '../src/compiler/position-warnings';
import { DIAGNOSTICS } from '../src/diagnostics/catalog';
import type { ValidationWarning } from '../src/compiler/validate';

const pdx = (template: string, script: string, style = ''): string =>
    `<template>\n  ${template}\n</template>\n<script setup>\n${script}\n</script>\n${style ? `<style scoped>\n${style}\n</style>\n` : ''}`;

interface Row {
    src: string;
    /** Text that appears only on the line the finding must point at. */
    at: string;
    /** How the code is produced: compile() (default), or validate() with a resolver that knows no tag. */
    via?: 'compile' | 'validate-unknown-tags';
}

const BUTTON_PROPS = new Set(['variant', 'size', 'disabled', 'maxItems']);

const ROWS: Record<string, Row> = {
    PDX_RAW_INTERPOLATION: { src: pdx('<p title="${n}">x</p>', 'let n = $signal(1);'), at: 'title="${n}"' },
    PDX_NON_REACTIVE: { src: pdx('<p>{{ count }}</p>', 'let count = 0;\nfunction bump() { count = count + 1; }'), at: 'let count = 0;' },
    PDX_SCRIPT_SYNTAX_ERROR: { src: pdx('<p>x</p>', 'let a = $signal(1);\nlet b = ;'), at: 'let b = ;' },
    PDX_UNKNOWN_DECLARATION: { src: pdx('<p>x</p>', 'let a = $signal(1);\n@expose;'), at: '@expose;' },
    PDX_DUP_DECLARATION: { src: pdx('<p>{{ a }}</p>', "@prop a: string = 'x';\nlet a = $signal(1);"), at: 'let a = $signal(1);' },
    PDX_PROP_NO_TYPE: { src: pdx('<p>x</p>', 'let a = $signal(1);\n@prop label;'), at: '@prop label;' },
    PDX_PROP_INVALID_TYPE: { src: pdx('<p>{{ items }}</p>', '@prop items: Array<string = [];'), at: '@prop items' },
    PDX_PROP_TYPE_MISMATCH: { src: pdx('<p>{{ n }}</p>', "let a = $signal(1);\n@prop n: number = 'x';"), at: '@prop n: number' },
    PDX_DUP_PROP: { src: pdx('<p>{{ a }}</p>', "@prop a: string = 'x';\n@prop a: string = 'y';"), at: "@prop a: string = 'y';" },
    PDX_MALFORMED_EVENT: { src: pdx('<p>x</p>', 'let a = $signal(1);\n@event (saved): number;'), at: '@event (saved)' },
    PDX_DUP_EVENT: { src: pdx('<p>x</p>', 'let a = $signal(1);\n@event changed: number;\n@event changed: string;'), at: '@event changed: string;' },
    PDX_EVENT_NAME_CASE: { src: pdx('<p>x</p>', 'let a = $signal(1);\n@event savedItem: number;'), at: '@event savedItem' },
    PDX_EXPOSE_UNDECLARED: { src: pdx('<p>x</p>', 'let a = $signal(1);\n@expose close;'), at: '@expose close;' },
    PDX_CIRCULAR_DERIVED: { src: pdx('<p>{{ a }}</p>', 'const a = $derived(b + 1);\nconst b = $derived(a + 1);'), at: 'const a = $derived' },
    PDX_UNUSED_REACTIVE: { src: pdx('<p>{{ shown }}</p>', 'let shown = $signal(1);\nlet unused = $signal(0);'), at: 'let unused' },
    PDX_EMPTY_FOR: { src: pdx('@for (items as item; track item) {}', 'let items = $signal([1]);'), at: '@for (items' },
    PDX_AWAIT_NO_LOADING: { src: pdx('@await (ready) { <p>ok</p> }', 'let ready = $signal(Promise.resolve());'), at: '@await (ready)' },
    PDX_FETCH_INVALID: { src: pdx('<p>x</p>', "let a = $signal(1);\n@fetch users: 'nomethod';"), at: '@fetch users' },
    PDX_FETCH_NO_ERROR_UI: { src: pdx('<p>{{ users.value() }}</p>', "@fetch users: 'GET /api/users' as string[];"), at: '@fetch users' },
    PDX_FORM_NO_SUBMIT: { src: pdx('<p>{{ login }}</p>', 'let a = $signal(1);\n@form login: { email: string { required } };'), at: '@form login' },
    PDX_FORM_ARRAY_RULES_IGNORED: { src: pdx('<p>{{ order }}</p>', 'let a = $signal(1);\n@form order: { lines: [{ name: string { required } }] };'), at: '@form order' },
    PDX_FORM_FIELD_UNPARSED: { src: pdx('<p>{{ x }}</p>', 'let a = $signal(1);\n@form x: {\n  a: string,\n  weird: <<nonsense>>\n};'), at: 'weird' },
    PDX_REWRITE_FALLBACK: { src: pdx('<div>{{ count }}</div>', 'let count = $signal(0);\nfunction bump() { count = ( }'), at: 'function bump()' },
    PDX_LEGACY_IN_SETUP: { src: pdx('<p>{{ a }}</p>', 'let a = $signal(1);\nconst props = defineProps({});'), at: 'defineProps' },
    PDX_PAGE_INVALID_PATH: { src: pdx('<p>x</p>', "@page 'users';"), at: "@page 'users'" },
    PDX_PAGE_INVALID_CONSTRAINT: { src: pdx('<p>x</p>', "@page '/u/:id(foo)';"), at: "@page '/u/:id(foo)'" },
    PDX_PAGE_EMPTY_CONSTRAINT: { src: pdx('<p>x</p>', "@page '/u/:id()';"), at: "@page '/u/:id()'" },
    PDX_LOADER_NOT_FOUND: { src: pdx('<p>x</p>', "@page '/u';\n@loader loadMissing;"), at: '@loader loadMissing' },
    PDX_LABEL_NOT_FOUND: { src: pdx('<p>x</p>', "@page '/u/:id' { label: missingLabel };"), at: 'missingLabel' },
    PDX_GLOBAL_SELECTOR: { src: pdx('<p class="y">x</p>', 'let a = $signal(1);', ':global(.x) .y { margin: 0; }'), at: ':global(.x)' },
    PDX_DOCUMENT_QUERY: { src: pdx('<p>{{ a }}</p>', "let a = $signal(1);\nconst el = document.querySelector('.x');"), at: 'document.querySelector' },
    PDX_PROP_WRITE: { src: pdx('<p @click="f">{{ a }}</p>', "@prop a: string = '';\nfunction f() { a = 'x'; }"), at: "a = 'x'" },
    PDX_LISTENER_LEAK: { src: pdx('<p>{{ a }}</p>', "let a = $signal(1);\nwindow.addEventListener('resize', () => {});"), at: 'window.addEventListener' },
    PDX_DERIVED_WRITE: { src: pdx('<p @click="f">{{ d.x }}</p>', 'let s = $signal(1);\nconst d = $derived({ x: s });\nfunction f() { d.x = 2; }'), at: 'd.x = 2' },
    PDX_UNKNOWN_PROP: { src: pdx('<pdx-button :variantt="v">b</pdx-button>', "let v = $signal('a');"), at: ':variantt' },
    PDX_PROP_NAME_CASE: { src: pdx('<pdx-button :maxitems="v">b</pdx-button>', 'let v = $signal(1);'), at: ':maxitems' },
    PDX_IGNORE_WITHOUT_REASON: { src: pdx('<p>x</p>\n  <!-- pdx-ignore PDX_RAW_INTERPOLATION -->', 'let a = $signal(1);'), at: 'pdx-ignore PDX_RAW' },
    PDX_UNDECLARED_REF: { src: pdx('<p>missing as text</p>\n  <p>{{ missing }}</p>', 'let a = $signal(1);'), at: '{{ missing }}' },
    PDX_INVALID_ENUM_VALUE: { src: pdx('<pdx-button size="huge">b</pdx-button>', 'let a = $signal(1);'), at: 'size="huge"' },
    PDX_UNRESOLVED_COMPONENT: { src: pdx('<pdx-nope></pdx-nope>', 'let a = $signal(1);'), at: '<pdx-nope>', via: 'validate-unknown-tags' },
    PDX_STORE_EXPORT: { src: pdx('<div></div>', "@store menu;\nlet s = $signal('a');\nexport const label = () => s;"), at: 'export const label' },
};

/**
 * Codes this table does not produce from one file through compile()/validate(), each with where its
 * position is measured instead. A code in neither list fails the guard below.
 */
const ELSEWHERE: Record<string, string> = {
    PDX_RAW_INTERPOLATION_IN_BINDING: 'stops the compile; the position is in the error — raw-interpolation-in-binding.test.ts',
    PDX_TS_UNSUPPORTED: 'stops the compile; the construct is quoted in the message — erase-types.test.ts',
    PDX_DUPLICATE_SCRIPT: 'a parse error: stops the compile, its line is in the message — duplicate-blocks.test.ts',
    PDX_DUPLICATE_TEMPLATE: 'a parse error: stops the compile, its line is in the message — duplicate-blocks.test.ts',
    PDX_INLINE_NODE_UNSUPPORTED: 'unreachable today (catalog)',
    PDX_LIBRARY_INTERNALS: 'carries its line from the style scan — design-checks.test.ts',
    PDX_EFFECT_STATE: 'carries its line from the data-flow scan — design-checks-data-flow.test.ts',
    PDX_SEVERAL_PIECES: 'pdx check heuristic, carries its line — design-heuristics.test.ts',
    PDX_VERSION_COUNTER: 'pdx check heuristic, carries its line — design-heuristics.test.ts',
    PDX_ROUTE_RENDERS: 'pdx check heuristic, carries its line — design-heuristics.test.ts',
    PDX_SHARED_STYLES: 'pdx check heuristic, carries its line — design-heuristics.test.ts',
    PDX_COLOUR_LITERAL: 'pdx check heuristic, carries its line — design-heuristics.test.ts',
    PDX_REPEATED_LOGIC: 'cross-file, carries the line of each copy — cli check-command.test.ts',
    PDX_SHARED_LOADING: 'cross-file, carries the line of each route — cli check-command.test.ts',
    PDX_IGNORE_UNUSED: 'reported by pdx check only, which runs every check, at the comment — cli check-ignore.test.ts',
    PDX_TAG_COLLISION_RESOLVER: 'about two files, not a line in one',
    PDX_TAG_COLLISION: 'about two files, not a line in one',
    PDX_EMPTY_SOURCE: 'an empty file has no line',
    PDX_I18N_MISSING_KEY: 'a key in a JSON locale file, not a .pdx',
    PDX_TS: 'TypeScript\'s position, mapped by the language server — packages/cli/tests/check-types.test.ts asserts the line',
};

function produce(code: string, row: Row): ValidationWarning | undefined {
    if (row.via === 'validate-unknown-tags') {
        const d = parseSFC(row.src);
        const analysis = analyzeScript(d.script!.content, 'x.pdx', { setup: d.script!.setup });
        const ws = validate(analysis, parseTemplate(d.template!.content), 'x.pdx', { isKnownTag: () => false });
        return positionWarnings(row.src, ws).find((w) => w.code === code);
    }
    const r = compile(row.src, 'x.pdx', [], undefined, {
        propsOf: (tag) => (tag === 'pdx-button' ? BUTTON_PROPS : null),
        enumValues: (tag, prop) => (tag === 'pdx-button' && prop === 'size' ? ['sm', 'md', 'lg'] : null),
    });
    return r.warnings.find((w) => w.code === code);
}

describe('every diagnostic from one file points at its line', () => {
    for (const [code, row] of Object.entries(ROWS)) {
        it(code, () => {
            const w = produce(code, row);
            expect(w, `${code} was not produced by its row`).toBeTruthy();
            const lines = row.src.split('\n');
            const want = lines.findIndex((l) => l.includes(row.at)) + 1;
            expect(want, `the row's marker '${row.at}' is not in its source`).toBeGreaterThan(0);
            expect(w!.line, `${code} points at ${w!.line}, its line is ${want}: ${lines[want - 1]}`).toBe(want);
            expect(w!.column, `${code} has no column`).toBeGreaterThanOrEqual(1);
            expect(w!.column!, `${code}'s column is past its line`).toBeLessThanOrEqual(lines[want - 1].length + 1);
        });
    }
});

// A script-only file — a `.pdx.ts`, or a `.pdx` with no `<template>` — goes through compileScriptOnly,
// which must position the analyser's findings too, or every code comes back with no line. The whole
// file is its script.
const SCRIPT_ROWS: Record<string, { file: string; src: string; at: string }> = {
    PDX_STORE_EXPORT: { file: 'menu.pdx.ts', src: "@store menu;\nlet s = $signal('a');\nexport const label = () => s;\n", at: 'export const label' },
    PDX_FETCH_INVALID: { file: 'api.pdx.ts', src: "let a = $signal(1);\n@fetch users: 'nomethod';\n", at: '@fetch users' },
    PDX_PROP_NO_TYPE: { file: 'tagless.pdx', src: '<script setup>\nlet a = $signal(1);\n@prop label;\n</script>\n', at: '@prop label;' },
};

describe('every diagnostic from a script-only file points at its line', () => {
    for (const [code, row] of Object.entries(SCRIPT_ROWS)) {
        it(`${code} in ${row.file}`, () => {
            const w = compile(row.src, row.file).warnings.find((x) => x.code === code);
            expect(w, `${code} was not produced by its row`).toBeTruthy();
            const lines = row.src.split('\n');
            const want = lines.findIndex((l) => l.includes(row.at)) + 1;
            expect(w!.line, `${code} points at ${w!.line}, its line is ${want}`).toBe(want);
            expect(w!.column, `${code} has no column`).toBeGreaterThanOrEqual(1);
        });
    }
});

describe('the table covers the catalog', () => {
    it('every code is either produced by a row or measured elsewhere, with the reason', () => {
        const uncovered = Object.keys(DIAGNOSTICS).filter((c) => !(c in ROWS) && !(c in ELSEWHERE));
        expect(uncovered, 'add a row (or a reason in ELSEWHERE) for these codes').toEqual([]);
    });
});
