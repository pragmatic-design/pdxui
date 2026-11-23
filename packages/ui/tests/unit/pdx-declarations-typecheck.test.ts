// The declaration of every component the library writes in .pdx type-checks (#1335).
//
// gen-pdx-dts writes dist/<path>.d.ts from the script's declarations, whose types name what the script
// imports (`NavbarItem` from './navbar-types') and its `@generic`s (`T`). A declaration that names them
// and declares neither ships `Cannot find name` to every consumer that checks the library, and `any`
// to the editor. Each declaration is served here at its source path, `src/<dir>/pdx-x.d.ts`, so its
// relative imports resolve to the real modules beside it, as they resolve beside it in dist/.

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { join } from 'node:path';
// @ts-expect-error — plain .mjs build script, no type declarations by design
import { pdxDeclarations } from '../../scripts/gen-pdx-dts.mjs';

const ROOT = join(__dirname, '..', '..');

describe('the declaration of a component written in .pdx', () => {
    it('type-checks, for every one the library writes', () => {
        const decls = pdxDeclarations(ROOT) as { rel: string; file: string; dts: string }[];
        expect(decls.length, 'no .pdx component found').toBeGreaterThan(20);
        const virtual = new Map(decls.map((d) => [d.file.replace(/\.pdx$/, '.d.ts').replace(/\\/g, '/'), d.dts]));
        const options: ts.CompilerOptions = {
            target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
            // Not skipLibCheck: the files checked are declarations. Only theirs are read below.
            lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'], strict: true, noEmit: true, skipLibCheck: false,
            types: [],
        };
        const host = ts.createCompilerHost(options);
        const norm = (f: string) => f.replace(/\\/g, '/');
        const readFile = host.readFile.bind(host);
        const fileExists = host.fileExists.bind(host);
        const getSourceFile = host.getSourceFile.bind(host);
        host.readFile = (f) => virtual.get(norm(f)) ?? readFile(f);
        host.fileExists = (f) => virtual.has(norm(f)) || fileExists(f);
        host.getSourceFile = (f, v, onError, create) => {
            const text = virtual.get(norm(f));
            return text !== undefined ? ts.createSourceFile(f, text, v) : getSourceFile(f, v, onError, create);
        };
        const program = ts.createProgram([...virtual.keys()], options, host);
        const describe = (d: ts.Diagnostic): string =>
            `${d.file?.fileName.split('/src/')[1]}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`;
        const errors = [...virtual.keys()].flatMap((f): string[] => {
            const sf = program.getSourceFile(f);
            if (!sf) return [`${f}: not in the program`];
            return [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)].map(describe);
        });
        expect(errors).toEqual([]);
    }, 120_000);
});
