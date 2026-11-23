// Where an `@part(external)` is written (#1338): by the component's script, or by a module the script
// imports by a relative path, at any depth. A component that builds its DOM in modules of its own —
// pdx-data-grid's grid-body.ts writes `row`, grid-cell.ts `cell` — writes its parts there, and the
// script alone does not show them.
//
// The modules are read with the reader the `@internal` views are read with (#1110), each once, their
// comments masked as the script's are. `.pdx` imports are the views' concern, and are not followed.

import { dirname, resolve } from 'path';
import { maskComments } from './compiler/tokenizer';
import { writesPart } from './compiler/validate-parts';
import { relativeImports, type ReadComponent } from './internal-components';

/** The files a relative specifier with no extension may name, tried in this order. */
const CANDIDATES = ['', '.ts', '.js', '.mjs', '.tsx', '/index.ts', '/index.js'];
// Match: a specifier the compiler does not read as a module of code — a view, a stylesheet.
const NOT_CODE = /\.(pdx|css)$/;

/** The code, comments masked, of every module a script imports by a relative path, and those they import. */
function importedModules(script: string, filename: string, read: ReadComponent): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const visit = (code: string, from: string): void => {
        for (const spec of relativeImports(code)) {
            if (NOT_CODE.test(spec)) continue;
            const base = resolve(dirname(from), spec);
            for (const ext of CANDIDATES) {
                const file = base + ext;
                if (seen.has(file)) break;
                const source = read(file);
                if (source === null) continue;
                seen.add(file);
                const masked = maskComments(source);
                out.push(masked);
                visit(masked, file);
                break;
            }
        }
    };
    visit(script, filename);
    return out;
}

/**
 * Whether a module the script imports writes a part, given a reader; the modules are read the first
 * time it is asked. With no reader nothing can be seen of them: a script that imports a relative module
 * of code is not judged (`true`), one that imports none has nothing elsewhere (`undefined`).
 */
export function importedPartWrites(script: string, filename: string, read?: ReadComponent): ((name: string) => boolean) | undefined {
    if (!read) return relativeImports(script).some((spec) => !NOT_CODE.test(spec)) ? () => true : undefined;
    let modules: string[] | null = null;
    return (name) => (modules ??= importedModules(script, filename, read)).some((code) => writesPart(code, name));
}
