// `@internal` components (#1102): a component only the components of its own folder render — a view of a
// larger component, split out of its file. Its folder is its scope, checked from both sides:
// - the script that imports it (`import './scheduler-month.pdx';`): from another folder, an error;
// - the template that names its tag, when the resolver knows the tag as an internal component of the
//   project: from another folder, an error. A library's internal component is in no export, so another
//   package's template cannot reach it at all.
// The component that renders one imports it: the resolver never auto-imports an internal tag.

import { dirname, resolve } from 'path';
import type { TemplateNode } from './parser/template';
import type { ValidationWarning } from './compiler/validate';
import { usesOf } from './compiler/validate-required-slots';
import { deriveTag } from './compiler/codegen-shared';
import { parseSFC } from './parser/sfc';
import { parseTemplate } from './parser/template';
import { dataPartCounts } from './compiler/validate-parts';

/** The internal component a tag registers: the file that declares it. */
export interface InternalComponent { tag: string; file: string }

/** Reads a component file, or null when it cannot be read. */
export type ReadComponent = (file: string) => string | null;

// Match: a script line `@internal;` (with or without its `;`), not one inside a comment's text.
const INTERNAL_RUNE = /^[ \t]*@internal\s*;?[ \t]*$/m;
// Match: `@tag 'x-y'`. Groups: [1]=the tag
const TAG_RUNE = /^[ \t]*@tag\s+['"]([^'"]+)['"]/m;
// Match: `import` followed by whitespace or `{`/`*`, at the start of a line. The rest of the statement is
// read by relativePdxImports with indexOf, not by a pattern: a pattern over the clause backtracks.
const IMPORT_START = /^[ \t]*import(?=[\s{*])/gm;
// Match: a relative `.pdx` specifier.
const RELATIVE_PDX = /^\.{1,2}\/[^'"]+\.pdx$/;

/**
 * The relative `.pdx` specifiers a script imports statically: `import './x.pdx'`, or with bindings,
 * `import X from './x.pdx'`, `import {X}from './x.pdx'`, across lines. A dynamic `import()` is not one.
 * Linear in the script's length: each statement is read up to its first quote.
 */
function relativePdxImports(script: string): string[] {
    return relativeImports(script).filter((spec) => RELATIVE_PDX.test(spec));
}

/**
 * Every relative specifier a script imports statically, `.pdx` or not: `import './x'`,
 * `import { a } from '../y.ts'`, across lines. A dynamic `import()` is not one. Linear, as above.
 */
export function relativeImports(script: string): string[] {
    const out: string[] = [];
    // The next quote of each kind at or after a position. The statements come in order, so a quote found
    // past one is reused for the next: no search starts again from each line (many quote-less lines).
    let single = -2, double = -2;
    const next = (ch: string, from: number, known: number) => (known >= from || known === -1) ? known : script.indexOf(ch, from);
    for (const m of script.matchAll(IMPORT_START)) {
        const at = m.index + m[0].length;
        single = next("'", at, single);
        double = next('"', at, double);
        const quote = single < 0 ? double : double < 0 ? single : Math.min(single, double);
        if (quote < 0) continue;
        const clause = script.slice(at, quote).trim();
        // Bare, or a binding clause that ends with `from` (`{X}from`, `* as X from`, `X from`).
        const isFrom = clause.endsWith('from') && !/[\w$]/.test(clause.charAt(clause.length - 5));
        if (clause !== '' && (!isFrom || clause.includes(';'))) continue;
        const close = script.indexOf(script[quote], quote + 1);
        if (close < 0) continue;
        const spec = script.slice(quote + 1, close);
        if (/^\.{1,2}\//.test(spec)) out.push(spec);
    }
    return out;
}

/** The script of a `.pdx` source, as the compiler's own SFC parser reads it, or ''. */
function scriptOf(source: string): string {
    return parseSFC(source).script?.content ?? '';
}

/** Whether a `.pdx` source declares `@internal`. */
export function declaresInternal(source: string): boolean {
    return INTERNAL_RUNE.test(scriptOf(source));
}

/** The tag a `.pdx` source registers: its `@tag`, or the one its file name derives. */
export function tagOfSource(source: string, file: string, prefix: string): string {
    return TAG_RUNE.exec(scriptOf(source))?.[1] ?? deriveTag(file.replace(/\\/g, '/'), prefix);
}

// Windows paths compare without case; the others with it.
const folderOf = (file: string) => {
    const dir = dirname(resolve(file)).replace(/\\/g, '/');
    return process.platform === 'win32' ? dir.toLowerCase() : dir;
};

/** Whether two files are in one folder: the scope of an internal component. */
export function sameFolder(a: string, b: string): boolean {
    return folderOf(a) === folderOf(b);
}

/**
 * The internal components a script imports, and PDX_INTERNAL_COMPONENT for each one imported from
 * another folder. A file that cannot be read is left to the bundler, which reports it.
 */
export function importedInternals(script: string, filename: string, read: ReadComponent, prefix: string): { internals: InternalComponent[]; warnings: ValidationWarning[] } {
    const internals: InternalComponent[] = [];
    const warnings: ValidationWarning[] = [];
    for (const spec of relativePdxImports(script)) {
        const file = resolve(dirname(filename), spec);
        const source = read(file);
        if (source === null || !declaresInternal(source)) continue;
        const tag = tagOfSource(source, file, prefix);
        internals.push({ tag, file });
        if (!sameFolder(file, filename)) warnings.push(outside(tag, file, filename, `imports ${spec}`));
    }
    return { internals, warnings };
}

/** An `@internal` view a component draws through, with its template and script. */
export interface InternalView { file: string; template: string; script: string }

/**
 * The `@internal` views a script imports, and the views those import in turn, each once, in the order
 * they are first imported: what they draw is the owner's (#1110). A file that cannot be read is skipped.
 */
export function internalViews(script: string, filename: string, read: ReadComponent, seen = new Set<string>()): InternalView[] {
    const out: InternalView[] = [];
    for (const spec of relativePdxImports(script)) {
        const file = resolve(dirname(filename), spec);
        if (seen.has(file)) continue;
        seen.add(file);
        const source = read(file);
        if (source === null || !declaresInternal(source)) continue;
        const sfc = parseSFC(source);
        const view = { file, template: sfc.template?.content ?? '', script: sfc.script?.content ?? '' };
        out.push(view, ...internalViews(view.script, file, read, seen));
    }
    return out;
}

/**
 * The parts the `@internal` views a script imports draw (#1110), each with the view that draws it —
 * the first one, when two do — and the views those import in turn: all of them are the owner's parts.
 */
export function viewParts(script: string, filename: string, read: ReadComponent): Map<string, string> {
    const out = new Map<string, string>();
    for (const view of internalViews(script, filename, read)) {
        const name = view.file.replace(/\\/g, '/').split('/').pop()!;
        for (const part of dataPartCounts(parseTemplate(view.template)).keys()) if (!out.has(part)) out.set(part, name);
    }
    return out;
}

/**
 * PDX_INTERNAL_COMPONENT for each tag the template renders that is an internal component of another
 * folder. `internalFileOf` answers the file that declares an internal tag, or null.
 */
export function checkInternalUses(ast: TemplateNode[], filename: string, internalFileOf: (tag: string) => string | null): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    const seen = new Set<string>();
    for (const { tag } of usesOf(ast)) {
        if (seen.has(tag)) continue;
        seen.add(tag);
        const file = internalFileOf(tag);
        if (file && !sameFolder(file, filename)) warnings.push(outside(tag, file, filename, `renders <${tag}>`));
    }
    return warnings;
}

function outside(tag: string, file: string, from: string, what: string): ValidationWarning {
    const short = (p: string) => p.replace(/\\/g, '/').split('/').slice(-2).join('/');
    return {
        code: 'PDX_INTERNAL_COMPONENT',
        severity: 'error',
        message: `${short(from)} ${what}, an @internal component of ${short(file)}'s folder: only the components of that folder render <${tag}>.`,
        hint: 'Render the public component that owns it, or move this file into its folder; if it is meant for every component, drop @internal and give it a public name.',
    };
}
