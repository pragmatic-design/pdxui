// Every showcase page compiles without a warning.
//
// A page that binds with raw `${…}` in attributes and text uses the form the compiler warns against
// (PDX_RAW_INTERPOLATION, rule 7 of CONTRIBUTING.md), and every start of the showcase's dev server
// prints it. The site would not see it if its port script rewrote those forms on every build: the
// source a reader opens would teach the warned form and the build translate it back.
//
// The two channels the plugin reports through, per page: compile()'s warnings, with the UI
// manifest's props and enum values — PDX_INVALID_ENUM_VALUE is compile()'s.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import ts from 'typescript';
import { compile } from '../src/plugin';
import { ComponentResolver } from '../src/component-resolver';
import { designHeuristics } from '../src/compiler/design-heuristics';
import { applyIgnores } from '../src/compiler/ignores';
import { parseSFC } from '../src/parser/sfc';
import { styleCssFor, hash } from '../src/compiler/codegen-styles';
import { donutPrelude } from '../src/compiler/scope-donut';

const APP = resolve(__dirname, '../demo/showcase-new');
const PAGES = join(APP, 'pages');
// The app shell too: a `:attr="${…}"` in it makes the whole showcase unbuildable while every page
// passes.
// And the section components the pages compose: `sections/<page>/*.pdx`.
const SECTIONS = join(PAGES, 'sections');
const sectionFiles = existsSync(SECTIONS)
    ? readdirSync(SECTIONS).flatMap((page) => readdirSync(join(SECTIONS, page)).filter((f) => f.endsWith('.pdx')).map((f) => `sections/${page}/${f}`))
    : [];
const files = ['../app.pdx', ...readdirSync(PAGES).filter((f) => f.endsWith('.pdx')).sort(), ...sectionFiles.sort()];

const resolver = new ComponentResolver();
resolver.registerUiManifest();
const propsOf = (tag: string) => resolver.propsOf(tag);
// The enum check is compile()'s, as the plugin calls it.
const enumValues = (tag: string, prop: string) => resolver.enumValues(tag, prop);

/** A warning list is not a build: the module must also parse. */
function parseErrors(code: string): string[] {
    const sf = ts.createSourceFile('out.js', code, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
    return ((sf as unknown as { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics ?? [])
        .map((d) => `PARSE: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
}

function warningsOf(file: string): string[] {
    const source = readFileSync(join(PAGES, file), 'utf8');
    const rel = `showcase-new/pages/${file}`;
    const result = compile(source, rel, [], undefined, { propsOf, enumValues });
    // The production path too, with inline bindings, its default: that is where `:label="${x}"`
    // becomes unparseable — the dev module is byte-identical either way.
    const built = compile(source, rel, [], undefined, { propsOf, enumValues, production: true });
    return [
        ...result.warnings.map((w) => `${w.code}: ${w.message}`),
        ...parseErrors(result.code),
        ...parseErrors(built.code).map((e) => `production: ${e}`),
        ...colourLiterals(source),
    ];
}

/**
 * The colour rule (CD-C3): a colour written as a value is right in one
 * theme and wrong in twelve. A literal that IS the demo's content carries `pdx-ignore` with the reason.
 */
function colourLiterals(source: string): string[] {
    const found = designHeuristics(source).filter((w) => w.code === 'PDX_COLOUR_LITERAL');
    // Unused is judged only for this rule's exemptions: this pass runs one check, and an exemption for
    // another — a cross-file PDX_REPEATED_LOGIC — is not unused because this pass did not look.
    return applyIgnores(source, found, { reportUnused: true }).warnings
        .filter((w) => w.code !== 'PDX_IGNORE_UNUSED' || w.message.includes(' PDX_COLOUR_LITERAL '))
        .map((w) => `${w.code}:${w.line}: ${w.message}`);
}

// ─── The pages compose their sections ───────────────────────────────
//
// A demo page that carries its sections inline trips PDX_ROUTE_RENDERS: the reference app would
// break the composition rule the framework teaches. A section
// of `comp-switch.pdx` is a component of its own, `pages/sections/comp-switch/demo-comp-switch-<slug>.pdx`
// (tag `pdx-demo-comp-switch-<slug>`), and the page composes them. Every page does. The whole design pass, the
// cross-file rule included, is `packages/cli/tests/design-pass-trees.test.ts`.

describe('the pages compose their sections as components', () => {
    const pages = readdirSync(PAGES).filter((f) => f.endsWith('.pdx')).sort();
    for (const file of pages) {
        const page = file.replace(/\.pdx$/, '');
        it(page, () => {
            const renders = designHeuristics(readFileSync(join(PAGES, file), 'utf8'), file)
                .some((w) => w.code === 'PDX_ROUTE_RENDERS');
            expect(renders, `${page} renders its sections inline: compose them from pages/sections/${page}/`).toBe(false);
        });
    }

    // A section's tag is its file name, and two folders can derive the same one: `comp-toggle`'s
    // `group-single` and `comp-toggle-group`'s `single` are both `pdx-demo-comp-toggle-group-single`.
    // Only one definition registers, so one page silently shows the other page's section — the
    // toggle-group page would render comp-toggle's "Toggle Group — Single" in place of its own.
    it('every section has a tag of its own', () => {
        const byTag = new Map<string, string[]>();
        for (const f of sectionFiles) {
            const tag = 'pdx-' + f.split('/').pop()!.replace(/\.pdx$/, '');
            byTag.set(tag, [...(byTag.get(tag) ?? []), f]);
        }
        const shared = [...byTag].filter(([, fs]) => fs.length > 1).map(([tag, fs]) => `${tag}: ${fs.join(', ')}`);
        expect(shared, 'two section files derive one tag: rename a slug').toEqual([]);
    });

    // A page's scoped sheet and a section's are two sheets, and which one the document puts later is
    // not the page's to decide: a page rule and a section rule on ONE element of the section, split
    // across the two, fought (a nested splitter rendered 280px tall instead of 400, a settings drawer
    // drew both borders). Under the default target a scoped sheet stops at nested components (#152),
    // and a section is one: the page's rules no longer reach its elements, so there is nothing to
    // fight over. What holds that is the page's sheet being a donut scope under the options the
    // showcase builds with (vite.config.ts: `pdx()`, the default target). On baseline-2024 it is the
    // ancestor form again, and the fight with it.
    it('no page rule reaches the elements of its sections', () => {
        const open: string[] = [];
        for (const page of readdirSync(SECTIONS)) {
            const pageFile = join(PAGES, `${page}.pdx`);
            if (!existsSync(pageFile)) continue;
            const rel = `showcase-new/pages/${page}.pdx`;
            const sfc = parseSFC(readFileSync(pageFile, 'utf8'));
            sfc.styles.forEach((block, i) => {
                if (!block.scoped) return;
                const css = styleCssFor(sfc, rel, i, false);
                if (css.includes('{') && !css.includes(donutPrelude(`data-pdx-${hash(rel)}`))) open.push(`${page}.pdx, style block ${i}`);
            });
        }
        expect(open, 'a page\'s scoped sheet reaches into its sections: it is not a donut scope').toEqual([]);
    });
});

describe('the showcase compiles without a warning', () => {
    it('there are showcase pages to check', () => {
        expect(files.length, 'no .pdx pages found: this file would check nothing').toBeGreaterThan(100);
    });

    for (const file of files) {
        it(file, () => {
            expect(warningsOf(file)).toEqual([]);
        });
    }
});
