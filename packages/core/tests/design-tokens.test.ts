// A phantom CSS token is a rule that silently does not apply.
//
// `var(--x)` with no declaration anywhere resolves to `unset`. The browser reports nothing, the
// build reports nothing, and the property is simply dropped — `background: var(--pdx-cp-preset)`
// paints no background at all.
//
// Without a lint, "0 phantom tokens" is a measurement rather than a property, and one comes back.
// This test holds the zero: the scanner also runs standalone from `pnpm lint`
// (packages/design/scripts/lint-tokens.mjs), and lives here as a test because `packages/design`
// has no vitest — its `test` script is Playwright — and core already hosts the cross-package
// contract checks (side-effects, pack-contents, docs-imports) for the same reason.

import { describe, it, expect, beforeAll } from 'vitest';
import { lintTokens, scanCss, unreadTokens, tokensNamedIn } from '../../design/scripts/lint-tokens.mjs';
import { generate, renderReference, replaceRegion } from '../../design/scripts/gen-theming-reference.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Explicit root: the script resolves its own default from import.meta.url, which is not a file: URL
// once vite has transformed it.
const DESIGN_SRC = join(__dirname, '..', '..', 'design', 'src');
const REPO = join(__dirname, '..', '..', '..');

/** Every token the reference LISTS — the rows of its tables, not every mention of a name. */
function listedTokens(body: string): string[] {
    return body.split('\n')
        .map(l => l.match(/^\| `(--pdx-[A-Za-z0-9_*-]+)` \|/))
        .filter((m): m is RegExpMatchArray => m !== null)
        .map(m => m[1]);
}
const { files, declared, phantoms } = lintTokens(DESIGN_SRC);

describe('design tokens: nothing is used without a fallback and declared nowhere', () => {
    it('scanned the whole design system', () => {
        // Without this the assertion below would pass on an empty scan — an exclusion is invisible
        // in its own result.
        expect(files).toBeGreaterThan(80);
        expect(declared).toBeGreaterThan(200);
    });

    it('has no phantom token', () => {
        expect(
            phantoms.map((p: { token: string; file: string; line: number }) => `${p.token}  ${p.file}:${p.line}`),
            'each of these makes its whole declaration resolve to unset',
        ).toEqual([]);
    });
});

describe('the scanner itself', () => {
    it('flags a use with no fallback and no declaration', () => {
        const { usedNoFallback } = scanCss('.a { color: var(--pdx-ghost); }');
        expect([...usedNoFallback.keys()]).toEqual(['--pdx-ghost']);
    });

    it('does not flag a use that has a fallback', () => {
        // `var(--pdx-density-factor, 1)` is set by JS at runtime; the fallback is what makes that
        // safe, and it is the idiom the fix for --pdx-cp-preset follows.
        const { usedNoFallback } = scanCss('.a { height: calc(2rem * var(--pdx-density-factor, 1)); }');
        expect([...usedNoFallback.keys()]).toEqual([]);
    });

    it('counts a custom property as declared only at a declaration position', () => {
        const { declared } = scanCss(':root { --pdx-real: 1px; } .a { border: var(--pdx-other, --pdx-not-declared); }');
        expect([...declared]).toEqual(['--pdx-real']);
    });

    it('ignores commented-out CSS but keeps line numbers honest', () => {
        const css = ['/* .a { color: var(--pdx-dead); }', '   still comment */', '.b { color: var(--pdx-live); }'].join('\n');
        const { usedNoFallback } = scanCss(css);
        expect([...usedNoFallback.keys()]).toEqual(['--pdx-live']);
        expect(usedNoFallback.get('--pdx-live')).toBe(3);
    });
});

// The reverse direction: declared and read by nothing.
//
// A token nobody reads costs nothing at runtime and breaks no test, which is why unread tokens
// accumulate unnoticed when only the other direction is checked. It is a ratchet and not a hard
// zero on purpose: a design system legitimately ships tokens for its consumers to read, so the
// honest statement is "this may not grow", not "this must be empty".
// None of the unread tokens is "delete": every one is either part of a coherent set whose remaining
// members ARE read, or emitted by the theme engine as part of its output, so removing it would be a
// public-surface change rather than a tidy-up. Adopting one changes rendering and belongs to its
// own change with the visual gate.
//
//   ADOPTED — a component reads it instead of hardcoding the value:
//     --pdx-focus-width (3px) / --pdx-focus-offset   in the component rules and the reset; every
//                                                    focus ring in the system is 3px, deliberately.
//                                                    fluent and metro keep their own literals:
//                                                    their focus treatment is part of the theme.
//     --pdx-check-size / --pdx-check-radius          the switch knob and its travel are derived
//     --pdx-toggle-width / --pdx-toggle-height       from the height and width instead of measured
//                                                    a second time.
//     --pdx-float-radius / -shadow                   popover, menu, select and autocomplete share
//                                                    one value (radius-md, shadow-lg) instead of
//                                                    each carrying its own.
//     --pdx-float-offset                             NOT adoptable from CSS: the gap between a
//                                                    trigger and its floating element is a JS
//                                                    number passed to computePosition, not a
//                                                    property any stylesheet reads.
//     --pdx-scroll-fade-top / -bottom                the flags drive a mask on the viewport of
//                                                    scroll-area.css, the file that declares them.
//     --pdx-text-3xl                                 as .pdx-txt-headline, the role the scale has a
//                                                    step for.
//     --pdx-weight-heading                           every role taking --pdx-font-heading takes
//                                                    this too, falling back to the default weight;
//                                                    editorial and metro declare it.
//     --pdx-motion-scale                             the three duration tokens are
//                                                    calc(n * scale). At the default of 1 the
//                                                    arithmetic resolves to the base durations.
//     --pdx-ease-accelerate                          on the popover's CLOSING transition,
//                                                    which is Material 3's rule: enter decelerates,
//                                                    leave accelerates.
//
//   RESERVED — the set is real, adopting it is a design decision, and deleting part of it would
//   leave the rest incoherent:
//     --pdx-opacity-hover / -focus / -pressed / -dragged   Material 3 state layers. engine/generate.ts
//         emits hover and pressed, so they are part of createTheme()'s output contract; adopting
//         means implementing state layers across every interactive component.
//     --pdx-surface-1 / -4 / -5                      -2 and -3 ARE read; 1/4/5 complete the M3 tonal
//                                                    elevation scale
//     --pdx-z-dropdown / --pdx-z-modal               the z-index scale, partially adopted
//     --pdx-label-behavior                           `static | floating`, a behavior token with no
//                                                    implementation behind it
//
// Each adoption lowers this number — the drop IS the proof, which is why the ceiling is asserted
// rather than the list. `--pdx-float-offset` has a reader outside any stylesheet, because the gap
// between a trigger and its floating element is not a CSS property of anything: usePopover reads
// the computed value off the floating element and uses it when the caller passes no offset of its
// own.
const RATCHET = 10;

describe('declared-and-unread tokens: a ceiling, not a zero', () => {
    const { declared, unread, skipped } = unreadTokens(REPO);

    it('read the whole tree, and says so if it did not', () => {
        // The scan walks packages/ and templates/ while, in a full run, six packages are writing
        // there. A directory it cannot read for an instant would disappear from the answer in
        // silence, taking every token read only from inside it with it, and turn this file red on a
        // clean tree once every few runs. The walk tolerates it and reports it, so a short scan is
        // distinguishable from a real result.
        expect(skipped, 'the token scan could not read part of the tree').toEqual([]);
    });

    it('measured the whole system, not a subset', () => {
        // Counting uses only inside packages/design/src gives a wrong answer: ui, site, builder
        // and core read tokens too.
        expect(declared).toBeGreaterThan(200);
    });

    it(`has at most ${RATCHET} tokens that nothing reads`, () => {
        expect(
            unread.length,
            `tokens read by nothing (${unread.length}): ${unread.join(', ')} — ` +
            'if this grew, a token was declared and never adopted. Adopt it, or do not declare it.',
        ).toBeLessThanOrEqual(RATCHET);
    });
});

// Documentation may only promise knobs that work.
//
// A page that lists a token nothing reads as a knob leaves a reader who sets it seeing nothing
// happen, with no way to find out except by trying — the worst kind of dead configuration, because
// the documentation is what makes it look alive.
// Both theming pages. The site page is for whoever is choosing a framework;
// packages/design/THEMING.md is the designer-facing guide — "what you can change" — and so the one
// most likely to be trusted row by row.
const THEMING_PAGES = [
    ['site', join(REPO, 'packages', 'site', 'content', 'docs', 'theming.md')],
    ['design', join(REPO, 'packages', 'design', 'THEMING.md')],
] as const;

describe('every token a theming page names is read by something', () => {
    const { unread, where } = unreadTokens(REPO);
    const unreadSet = new Set<string>(unread);
    const declaredSet: Map<string, string> = where;

    for (const [label, page] of THEMING_PAGES) {
        const named = tokensNamedIn(readFileSync(page, 'utf-8'));

        it(`[${label}] found the token tables`, () => {
            // Without this the two assertions below would pass on a page that names nothing — an
            // exclusion is invisible in its own result.
            expect(named.size).toBeGreaterThan(10);
        });

        it(`[${label}] names no token that nothing reads`, () => {
            const inert = [...named.entries()]
                .filter(([t]) => unreadSet.has(t))
                .map(([t, line]) => `${t}  ${label}:${line}`);
            expect(inert, 'the page promises these and setting them does nothing').toEqual([]);
        });

        it(`[${label}] names no token that is not declared anywhere`, () => {
            // A STRICTER failure than the one above, and one it cannot see: it compares against the
            // declared-but-unread list, so a documented token that is never declared at all falls
            // through both sides.
            const ghosts = [...named.entries()]
                .filter(([t]) => !declaredSet.has(t))
                .map(([t, line]) => `${t}  ${label}:${line}`);
            expect(ghosts, 'the page names these and no stylesheet declares them').toEqual([]);
        });
    }
});

// ─── THEMING.md §11 is generated, and the check is what makes that true ──────
//
// A hand-copied reference of a machine-readable source drifts by construction: a missing family —
// the table header, say — tells a reader it is not themeable. This is the assertion that stops the
// drift, and it is the reason the heading can say "generated" honestly.

describe('THEMING.md §11 agrees with tokens.css', () => {
    const THEMING = join(REPO, 'packages', 'design', 'THEMING.md');

    // Generated ONCE for the whole block. `generate()` scans the 95 CSS files of the design system to
    // work out which tokens nothing reads; three tests calling it separately would be three full
    // scans of the same unchanged tree, each inside the 5s default, and under a full parallel run
    // one of them times out. Doing the work once removes the cost instead of paying for it three
    // times.
    //
    // ⚠️ And the SCAN once too. `unreadTokens(REPO)` is a walk of packages/ and templates/; a test
    // calling it inside the 5s default, next to a `beforeAll` that already pays for the same walk
    // through `generate()`, times out under the full parallel run. One scan, in
    // the budgeted hook, handed to `generate()` and to both assertions: which is also the "one scan,
    // both sides" property those tests need.
    let reference: string;
    let unread: string[];
    beforeAll(() => {
        ({ unread } = unreadTokens(REPO));
        reference = generate(REPO, unread);
    }, 30_000);

    // 20s, not the 5s default, and the number is measured rather than picked. `generate()` scans
    // the whole design system — 95 CSS files — to decide which tokens nothing reads. Run alone the
    // file's tests take 3.4-4.3s; inside the full suite, competing for the machine, this one can
    // pass 5.5s and time out, while it passes every time in isolation.
    //
    // This raises a BUDGET, not a bar: the assertion still fails if the committed
    // reference and the generator disagree by one character. A timeout sized to an idle machine is
    // a test that reports red for load, and a suite that goes red for reasons unrelated to the code
    // is one people stop reading. (If it ever exceeds 20s, that is a real regression in the
    // generator and should be read as one.)
    it('regenerating the reference reproduces the committed file', () => {
        // Line endings normalised on both sides: the repository stores LF, git hands a Windows
        // checkout CRLF, and a `\r` is not a difference in the reference.
        const onDisk = readFileSync(THEMING, 'utf-8').replace(/\r\n/g, '\n');

        expect(replaceRegion(onDisk, reference),
            'run: node packages/design/scripts/gen-theming-reference.mjs').toBe(onDisk);
    });

    it('reads the same tokens out of a CRLF checkout as out of an LF one', () => {
        // The generator can be line-ending fragile, and silently: a declaration pattern ending in
        // `(?:/*.*)?$` fails on CRLF, because JS `.` does not match `\r`, and every declaration
        // with a trailing block comment vanishes — including all of "Decorative levers".
        // The output is still a plausible-looking table, and the only symptom is the check above
        // calling the correct committed file out of date.
        const lf = readFileSync(join(REPO, 'packages', 'design', 'src', 'tokens.css'), 'utf-8')
            .replace(/\r\n/g, '\n');
        const unread = new Set<string>();

        expect(renderReference(lf.replace(/\n/g, '\r\n'), unread),
            'the reference changes with the line endings of its source').toBe(renderReference(lf, unread));
    });

    it('the CRLF check above is not vacuous — it sees a token disappear', () => {
        // The control: without it, a renderReference that returned '' for everything would pass.
        const lf = readFileSync(join(REPO, 'packages', 'design', 'src', 'tokens.css'), 'utf-8')
            .replace(/\r\n/g, '\n');

        expect(renderReference(lf, new Set<string>())).toContain('--pdx-input-style');
        expect(renderReference(lf, new Set(['--pdx-input-style']))).not.toContain('--pdx-input-style');
    });

    it('the reference actually contains the tokens — not an empty region', () => {
        // Without this, a generator that emitted nothing would satisfy the comparison above: an
        // exclusion is invisible in its own result.
        const body = reference;

        expect(body.split('\n').filter(l => /^\| `--pdx-/.test(l)).length,
            'the generated reference lists almost nothing').toBeGreaterThan(100);
    });

    it('includes the families that were missing when it was hand-written', () => {
        const body = reference;

        for (const token of [
            '--pdx-table-header-bg', '--pdx-table-header-color', '--pdx-table-header-weight',
            '--pdx-card-radius', '--pdx-card-shadow', '--pdx-card-border-color',
            '--pdx-breadcrumb-separator', '--pdx-z-popover', '--pdx-z-tooltip',
        ]) {
            expect(body, `${token} is declared and read, and the reference omits it`)
                .toContain(`\`${token}\``);
        }
    });

    it('leaves out the tokens nothing reads', () => {
        // The generator must not list every declaration: a reference that promises a knob moving
        // nothing is the defect the theming-page checks guard against. The two assertions in
        // `every token a theming page names is read by something` above cover the committed file;
        // this one covers the generator, so a change to it cannot reintroduce them.
        //
        // ONE scan, handed to both sides — the block's `beforeAll`. `unreadTokens` walks packages/ and
        // templates/, so computing it twice inside a six-package parallel run compares two different
        // moments of the filesystem, and pays for the walk inside a 5s budget.
        const body = reference;

        // ⚠️ Against the ROWS, not against the whole body. `renderReference` also emits each
        // section's prose, and one of those sentences names a token in backticks — so a substring
        // search over the body reports a token as "listed" while its row is correctly absent: a red
        // on a clean tree, once every few full runs, whenever the filesystem walk happens to put
        // that token in `unread`. The test below pins it.
        const listed = new Set(listedTokens(body));
        const reintroduced = unread.filter(t => listed.has(t));
        expect(reintroduced, 'the generator lists tokens nothing reads').toEqual([]);
    });

    it('does not mistake a section note for a listed token', () => {
        // THE INTERMITTENT ABOVE, made deterministic.
        //
        // `renderReference` emits a section's prose as well as its rows: the "Cards" heading in
        // tokens.css reads "Cards — `--pdx-card-style` picks the STRUCTURE", and that sentence is
        // kept under the heading because it is the reason the tokens exist. A search for the token
        // ANYWHERE in the body cannot tell a table row from a sentence about it.
        //
        // So a test searching the body is correct only while `--pdx-card-style` stays out of `unread` —
        // and `unread` comes from a filesystem walk of packages/ and templates/ taken while six
        // packages are writing to those trees. It is read from exactly one place,
        // packages/design/src/themes/corporate.css; a walk that misses that one file once puts the
        // token in `unread`, the note keeps naming it, and the gate goes red on a clean tree.
        //
        // The property is about the TABLE, so this asserts on the rows.
        // `generate()` with an explicit list only reads tokens.css — the walk is the block's.
        const forced = [...unread, '--pdx-card-style'];
        const body = generate(REPO, forced);

        expect(body, 'the fixture stopped exercising the mechanism — the note no longer names it')
            .toContain('`--pdx-card-style`');
        expect(listedTokens(body), 'a token nothing reads is listed as a knob')
            .not.toContain('--pdx-card-style');
    });
});
