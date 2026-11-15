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

/** The internal component a tag registers: the file that declares it. */
export interface InternalComponent { tag: string; file: string }

/** Reads a component file, or null when it cannot be read. */
export type ReadComponent = (file: string) => string | null;

// Match: a script line `@internal;` (with or without its `;`), not one inside a comment's text.
const INTERNAL_RUNE = /^[ \t]*@internal\s*;?[ \t]*$/m;
// Match: `@tag 'x-y'`. Groups: [1]=the tag
const TAG_RUNE = /^[ \t]*@tag\s+['"]([^'"]+)['"]/m;
// Match: a static import of a relative `.pdx` file, bare or with bindings. Groups: [1]=the specifier
const PDX_IMPORT = /^[ \t]*import\s+(?:[^'"]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+\.pdx)['"]/gm;

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
    for (const m of script.matchAll(PDX_IMPORT)) {
        const file = resolve(dirname(filename), m[1]);
        const source = read(file);
        if (source === null || !declaresInternal(source)) continue;
        const tag = tagOfSource(source, file, prefix);
        internals.push({ tag, file });
        if (!sameFolder(file, filename)) warnings.push(outside(tag, file, filename, `imports ${m[1]}`));
    }
    return { internals, warnings };
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
