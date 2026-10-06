// The repository publishes in English. This is what keeps it going that way.
//
// The working agreement is explicit: code, comments, commit messages and docs are English; Italian
// belongs only to what the repository does not publish.
//
// Each check is a ZERO, and it asserts on the LIST rather than on its length, so a failure names
// the file instead of reporting a number that went up.
//
// The detector is deliberately crude: a short list of function words that exist in Italian and not
// in English, counted per FILE rather than per occurrence. It cannot mistake prose for a language
// it is not, and a file with one leftover sentence counts the same as a file written entirely in
// Italian — which is the right granularity for "has this file been translated yet".
//
// Two controls guard the zero itself:
// an empty glob would satisfy `toEqual([])` silently, and so would a regex that matches nothing.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..', '..');

/**
 * Words that appear in Italian prose and not in English. `come`, `non`, `note` and friends are
 * deliberately absent: they are English words too, and a detector with false positives is one
 * nobody trusts enough to keep green.
 */
const ITALIAN = /(?<![A-Za-z])(perch[eé]|cos[ìi] che|gi[àa] |senza |questo |questa |quello |quella |sono |della |dello |degli |nella |nello |viene |vengono |hanno |essere |anche |ogni |tutti i|tutte le)/i;

/**
 * Markdown the repository publishes, which is every tracked page: agent instructions and
 * `.internals/` are not tracked (public-tree.test.ts keeps it so).
 */
function publishedMarkdown(): string[] {
    return execFileSync('git', ['ls-files', '*.md'], { cwd: REPO, encoding: 'utf-8' })
        .split('\n').map(s => s.trim()).filter(Boolean);
}

const files = publishedMarkdown();
const italian = files.filter(f => ITALIAN.test(readFileSync(join(REPO, f), 'utf-8')));

describe('the repository publishes in English', () => {
    it('found the published markdown — the list is not empty', () => {
        // Without this the zero below is satisfied by a glob that matches nothing.
        expect(files.length, 'no published markdown was found at all').toBeGreaterThan(50);
    });

    it('THEMING.md is English', () => {
        // The designer-facing entry point to the theme system, and referenced from three English
        // documents. Strictly subsumed by the zero below; kept because it fails by name for the
        // file most likely to be read first.
        expect(italian, 'THEMING.md has Italian prose in it again')
            .not.toContain('packages/design/THEMING.md');
    });

    it('NO published file carries Italian prose', () => {
        // A NEW page written in Italian fails here, by name.
        //
        // Two rules hold when a page is translated: a measurement keeps the conditions it was taken
        // under, and a finding keeps its severity — the prose changes, the record does not. A page
        // that is GENERATED is fixed where it is generated: the skill catalogue at `gen-catalog.mjs`
        // and the site's api.md at the JSDoc in `packages/core/src/data/field-definition.ts`.
        expect(italian, 'these published files carry Italian prose').toEqual([]);
    });

    it('the detector can fail — it finds Italian when there is some', () => {
        // A regex that matched nothing would satisfy every assertion above.
        expect(ITALIAN.test('Questo documento è scritto in italiano, e sono parole comuni.'))
            .toBe(true);
        expect(ITALIAN.test('This document is written in English, and these are ordinary words.'))
            .toBe(false);
    });
});

/**
 * The showcase pages are the site's galleries (`port-demos.mjs` publishes comp-* and design-*), and
 * their script comments ship in the Source blocks. The detector adds the articles and prepositions a
 * short demo sentence is made of — "Apri il filtro della colonna", "i valori distinti dai dati" —
 * which the markdown detector can do without. A line declaring the `it` locale of an i18n demo
 * (`it: { … }`) is data, not prose.
 */
const ITALIAN_PAGE = new RegExp(ITALIAN.source.replace(/\)$/, '|il |dei |dai |mentre |è )'), 'i');
const SHOWCASE = join(REPO, 'packages', 'compiler', 'demo', 'showcase-new', 'pages');
const showcasePages = execFileSync('git', ['ls-files', '*.pdx'], { cwd: SHOWCASE, encoding: 'utf-8' })
    .split('\n').map(s => s.trim()).filter(Boolean);

function italianLines(file: string): string[] {
    return readFileSync(join(SHOWCASE, file), 'utf-8').split('\n')
        .filter(l => !/\bit:\s*\{/.test(l) && ITALIAN_PAGE.test(l))
        .map(l => `${file}: ${l.trim().slice(0, 100)}`);
}

describe('the showcase pages publish in English', () => {
    it('found the pages — the list is not empty', () => {
        expect(showcasePages.length, 'no showcase page was found').toBeGreaterThan(100);
    });

    it('NO showcase page carries Italian prose, in its markup or its script', () => {
        expect(showcasePages.flatMap(italianLines), 'these lines are Italian').toEqual([]);
    });

    it('the page detector can fail, and passes the it locale of an i18n demo', () => {
        expect(ITALIAN_PAGE.test('Apri il filtro della colonna Category.')).toBe(true);
        expect(ITALIAN_PAGE.test('Open the Category column filter.')).toBe(false);
        const locale = "it: { 'validation.required': '{field} è obbligatorio' },";
        expect(ITALIAN_PAGE.test(locale) && !/\bit:\s*\{/.test(locale)).toBe(false);
    });
});

/**
 * Tracked source under packages/: comments and test names.
 * Out of scope: snapshots, generated files, and this file, whose detector controls are Italian.
 *
 * `--others --exclude-standard` as well as the index, so a file that is written but not yet
 * committed is measured too. `git ls-files` alone reads the INDEX, so a new source file would be
 * invisible here until the commit that adds it had already been made — and would turn this red on
 * the NEXT change's gate, where it reads as someone else's mess. A guard that only sees what is
 * already committed reports a defect after it is too late to be the author's.
 */
const SOURCE_EXT = /\.(ts|pdx|mjs|css)$/;
const sourceFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'packages'], { cwd: REPO, encoding: 'utf-8' })
    .split('\n').map(s => s.trim())
    .filter(f => SOURCE_EXT.test(f) && !f.includes('/__snapshots__/') && !f.includes('/generated/')
        && f !== 'packages/core/tests/docs-language.test.ts');

/** Lines with Italian prose, per file: the page detector, `it: { … }` locale lines excepted. */
function italianSourceLines(): Map<string, number> {
    const out = new Map<string, number>();
    for (const f of sourceFiles) {
        const n = readFileSync(join(REPO, f), 'utf-8').split('\n')
            .filter(l => !/\bit:\s*\{/.test(l) && ITALIAN_PAGE.test(l)).length;
        if (n) out.set(f, n);
    }
    return out;
}

/**
 * What a translation separates: prose from DATA.
 *
 * Translated, because the language is incidental: a validation message a test only needs to
 * survive typing and blur, and a word used as an arbitrary input. Kept, because the language is the
 * point: `'Càffè Größe'` in `auth-store.test.ts`, which is there to catch a claim decoded as
 * latin1 instead of UTF-8, and would test nothing as `'Caffe Grosse'`; and
 * `'Origine'`/`'Destinazione'`/`'Sposta a destra'` in `i18n-before-import.test.ts`, which proves a
 * locale installed BEFORE the imports survives them — an English fixture could not tell a
 * surviving translation from the defaults the import registers.
 *
 * A message the product prints, or a file a script GENERATES, is translated at its source, and the
 * generated copies are regenerated rather than edited. A line of CODE the detector matches cannot
 * be translated: `il ` is on its list, so a variable named `il` is renamed instead.
 *
 * The detector is a floor, not a definition of done: a file it flags usually holds more Italian
 * than the lines it counts, and those go too.
 */

describe('the tracked source carries no COMMON Italian', () => {
    const hits = italianSourceLines();

    it('found the source — the list is not empty', () => {
        expect(sourceFiles.length, 'no tracked source was found').toBeGreaterThan(1000);
    });

    it('NO tracked source file trips the short word list', () => {
        // A ZERO, and it asserts on the LIST: a new Italian comment fails here by FILE NAME,
        // instead of moving a number nobody can place. The same shape as the markdown check.
        //
        // What this cannot see is its own word list — `dal`, `deve`, `cursore` are not on it. So a
        // failure here is proof of Italian; silence is not proof of English — which is why the
        // block below exists, and why this one does not claim the source is English. It claims
        // what it measures.
        const named = [...hits].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${n} ${f}`);
        expect(named, 'these tracked source files carry Italian').toEqual([]);
    });

    it('the source detector finds an Italian comment', () => {
        expect(ITALIAN_PAGE.test('// gBCR a ogni evento di scroll senza throttle')).toBe(true);
        expect(ITALIAN_PAGE.test('// getBoundingClientRect on every scroll event, without a throttle')).toBe(false);
    });
});

/**
 * The second detector: a stricter word list, in `tools/lang/italian-scan.mjs` so anyone can run it
 * (`node tools/lang/italian-scan.mjs`) instead of rebuilding it in a scratchpad.
 *
 * It exists because a zero on the short list above means less than it looks: Italian it cannot
 * see — `dal`, `nella`, `quindi`, `invece`, `altrimenti`, `deve`, `dentro` — passes it untouched.
 *
 * Both lists are kept, and they are not redundant. The short one can stay in a test because it
 * cannot cry wolf; the strict one has to be measured before it can: a strict list produces false
 * positives on words like `ai ` ("AI suggestions"), `col ` ("pdx-col — Responsive grid column"),
 * `file di` ("FILE DISCOVERY"), `serve` (an English word) and `significa` (a prefix of
 * "significant"), each removed or given a trailing boundary until every hit is real Italian. That
 * is the price of a strict list, and the reason the short one stays short.
 */
import { scan as strictScan, trackedSource, proseOf, ITALIAN_STRICT as STRICT } from '../../../tools/lang/italian-scan.mjs';

describe('and no uncommon Italian either', () => {
    it('the stricter scan finds the source it is meant to read', () => {
        // The same control as everywhere above: a scan over nothing satisfies the zero below.
        expect(trackedSource().length, 'the strict scan reads no files at all').toBeGreaterThan(1000);
    });

    it('NO published line carries Italian the short list cannot see', () => {
        // It reads every text file the repository publishes — source comments, the end-of-line
        // comment and the multi-line block comment, the pre-push hook, the Dockerfile, web.config,
        // CI, the architecture pages — with the strict words and the two-function-word rule. A
        // quotation is a marked translation: the published repository carries no Italian.
        const named = strictScan().map(([file, line, text]) => `${file}:${line}  ${text.slice(0, 80)}`);
        expect(named, 'these lines are Italian').toEqual([]);
    });

    it('the strict detector can fail', () => {
        expect(STRICT.test('// il valore viene riscritto dal compiler')).toBe(true);
        expect(STRICT.test('// the value is rewritten by the compiler')).toBe(false);
        // And the words that would be false positives stay clear.
        expect(STRICT.test('// AI suggestions, error markers.')).toBe(false);
        expect(STRICT.test('// pdx-col — Responsive grid column with animated span transitions.')).toBe(false);
        expect(STRICT.test('// The manifest is generated from FILE DISCOVERY, not from that file.')).toBe(false);
        expect(STRICT.test('// a stale preview would serve a stale dist')).toBe(false);
        expect(STRICT.test('// production mode is not significantly slower than dev')).toBe(false);
    });

    it('reads the prose of every kind of file, and only the prose of code', () => {
        // The comment at the end of a line of code: Italian can hide there.
        expect(proseOf('a.ts', "tick(); // rivaluta alla scadenza")).toBe('rivaluta alla scadenza');
        // A string in code is data.
        expect(proseOf('a.ts', "const OVERRIDE = 'Dal registro';")).toBeNull();
        // Outside code, the whole line is prose: a shell hook, a Dockerfile, an HTML page.
        expect(proseOf('.githooks/pre-push', '# Le suite: pnpm test')).toBe('# Le suite: pnpm test');
        // Inside a markdown fence, code again: an `it` dictionary in an example is data.
        expect(proseOf('docs/i18n.md', "  router: { notFound: 'Pagina non trovata' },", true)).toBeNull();
        expect(proseOf('docs/i18n.md', '// il valore viene riscritto', true)).toBe('// il valore viene riscritto');
    });
});
