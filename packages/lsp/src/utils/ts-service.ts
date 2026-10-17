// TS Language Service — IntelliSense (completion/hover) inside <script setup>.
// The .pdx script is projected into a VIRTUAL TS file next to the .pdx (so that
// relative paths resolve), with the $… runes declared ambient and the @… runes blanked
// out PRESERVING the offsets → the .pdx ↔ TS position mapping is 1:1 (offset-scriptStart).

import ts from 'typescript';
import { DECORATOR_RUNES, parseFetchDecl } from '@pdxui/compiler';
import { routeNameTypes } from './route-name-types';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { GLOBALS_FILE, GLOBALS_DTS } from './pdx-globals';
import { formTypeOf } from './form-types';
import { projectRuneModule } from './rune-module';
import { findTsLibDir } from './ts-lib-dir';

// Statement-leading runes. We recognise them ONLY at the start of a line (indent aside):
// an `@form`/`@store` inside a comment ("(via @form rune)", for one) is not a rune.
// Every declaration the compiler knows, from its one rune list: a rune missing here would stay
// in the projected code as text, and `@inject employeeDocuments;` would become a name TypeScript
// cannot find.
const RUNE_KW = new RegExp(`@(${[...DECORATOR_RUNES.keys()].join('|')})\\b`, 'g');
// Not `store`: `@store cart;` names a store MODULE and makes no `cart` variable — the module exports
// `useCart()`. Declared, a script reading `cart` type-checked and threw a ReferenceError (#58).
const NAME_INTRO = new Set(['fetch', 'form']);

// Match: let x = $signal(   const y = $derived(   — a rune declaration.  Groups: [1]=let|const
// The compiler places these where every use can see them, so TypeScript must not report
// a use above the line as one before the declaration: the keyword is projected as `var`, padded to
// the same length.
const RUNE_DECL = /^([ \t]*)(let|const)(\s+[A-Za-z_$][\w$]*\s*(?::[^=\n]+)?=\s*\$(?:signal|derived|store)\b)/gm;

/** Is the offset `idx` at the start of a line (only whitespace between the line start and idx)? */
function atLineStart(s: string, idx: number): boolean {
    let i = idx - 1;
    while (i >= 0 && (s[i] === ' ' || s[i] === '\t')) i--;
    return i < 0 || s[i] === '\n';
}

/** Projects the .pdx script into valid TS, with the length and the offsets unchanged.
 *  - `@prop name: T = d` → `var  name…` (a TYPED prop; `@prop`=5 → `var  `=5), `@model` the same (6 → 6);
 *    the `?` of an optional `@prop name?: T` is blanked.
 *  - the other @… runes → blanked out (from the keyword to a `;` at depth 0, or to the
 *    balanced `{…}`), preserving the newlines. The names of @fetch/@form are declared at
 *    the end, typed (their lines are blanked) → the references resolve.
 *  - the `$…` runes stay (they are declared ambient). */
export function projectScript(scriptContent: string): string {
    const s = scriptContent;
    const out = s.split('');
    // Each name a rune introduces → the type it is declared with at the end.
    const names = new Map<string, string>();
    // `@event name: T` → the script's `name(detail)`, declared typed by its payload.
    const emitters: string[] = [];
    RUNE_KW.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RUNE_KW.exec(s))) {
        if (!atLineStart(s, m.index)) continue;
        const kw = m[1];
        if (kw === 'prop' || kw === 'model') {
            // `var`, not `let`: the compiler declares props before anything reads them. A `@model`
            // (#124) is a prop the script writes, so it is the same typed name: `@model` → `var   `.
            `var${' '.repeat(kw.length - 2)}`.split('').forEach((ch, o) => { out[m!.index + o] = ch; });
            // `@prop hint?: T` (#130): a variable takes no `?`, so it is blanked — the name keeps its type.
            // Match: the name and the `?` after it. Groups: [1]=up to the `?`
            const optional = /^(\s+[A-Za-z_$][\w$]*\s*)\?/.exec(s.slice(m.index + 1 + kw.length));
            if (optional) out[m.index + 1 + kw.length + optional[1].length] = ' ';
            continue;
        }
        if (NAME_INTRO.has(kw)) {
            const after = /^\s+([A-Za-z_$][\w$]*)/.exec(s.slice(m.index + 1 + kw.length));
            if (after) names.set(after[1], 'any');
        }
        if (kw === 'inject' || kw === 'mixin') {
            // Match: @inject key;  @inject key as alias;  @mixin './use-thing.ts' as thing;
            // Groups: [1]=key (absent for a quoted mixin path) [2]=alias
            const inj = /^\s+(?:'[^'\n]*'|"[^"\n]*"|([A-Za-z_$][\w$]*))(?:\s+as\s+([A-Za-z_$][\w$]*))?/.exec(s.slice(m.index + 1 + kw.length));
            const declared = inj && (inj[2] ?? inj[1]);
            if (declared) names.set(declared, 'any');
        }
        if (kw === 'event') {
            // Match: @event name: PayloadType;  or  @event(bubbles) name: PayloadType; (#138)
            // Groups: [1]=name [2]=payload type (optional)
            const ev = /^(?:\(\s*bubbles\s*\))?\s+([A-Za-z_$][\w$]*)\s*(?::\s*([^;\n]+?))?\s*;?\s*(?:\n|$)/.exec(s.slice(m.index + 1 + kw.length));
            if (ev) emitters.push(ev[2] ? `var ${ev[1]}: (detail: ${ev[2]}) => void;` : `var ${ev[1]}: (detail?: unknown) => void;`);
        }
        if (kw === 'part') {
            // Match: @part trigger, popup; — each name is its element, null while not rendered (#134).
            // Typed by the tag it sits on would need the template; HTMLElement is what it always is.
            const list = /^\s+([\w\s,]+?)\s*;?\s*(?:\n|$)/.exec(s.slice(m.index + 1 + kw.length));
            for (const name of list ? list[1].split(',').map((n) => n.trim()).filter(Boolean) : []) {
                emitters.push(`var ${name}: HTMLElement | null;`);
            }
        }
        if (kw === 'snippet') {
            // Match: @snippet name(a, b) — the function the compiler declares (#206).
            // Groups: [1]=name [2]=parameters as written
            const sn = /^\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/.exec(s.slice(m.index + 1 + kw.length));
            if (sn) {
                const params = sn[2].split(',').map((p) => p.trim()).filter(Boolean);
                // Plain names keep their names; a default or a pattern is not read, so any arguments go.
                const signature = params.every((p) => /^[A-Za-z_$][\w$]*$/.test(p))
                    ? params.map((p) => `${p}?: any`).join(', ') : '...args: any[]';
                emitters.push(`var ${sn[1]}: (${signature}) => unknown;`);
            }
        }
        let depth = 0, j = m.index, ended = false;
        for (; j < s.length; j++) {
            const c = s[j];
            // A string is skipped whole: the `}` of `${id}` in `@fetch x: 'GET /a/${id}'` is not the
            // end of the rune (#487).
            if (c === "'" || c === '"' || c === '`') {
                for (j++; j < s.length && s[j] !== c && s[j] !== '\n'; j++) if (s[j] === '\\') j++;
                continue;
            }
            if (c === '{' || c === '(' || c === '[') depth++;
            else if (c === '}' || c === ')' || c === ']') {
                depth--;
                if (depth <= 0 && c === '}') {
                    // `@form name: { schema } { options };` goes on into its options block, and a
                    // `;` after the last block belongs to the rune. Ending at the first `}` would leave
                    // `{ save: onChange; … }` in the code.
                    let k = j + 1;
                    while (k < s.length && (s[k] === ' ' || s[k] === '\t' || s[k] === '\n' || s[k] === '\r')) k++;
                    if (s[k] === '{') { j = k - 1; depth = 0; continue; }
                    j = s[k] === ';' ? k + 1 : j + 1;
                    ended = true; break;
                }
            }
            else if (c === ';' && depth === 0) { j++; ended = true; break; }
        }
        if (!ended) { j = s.indexOf('\n', m.index); if (j < 0) j = s.length; }
        if (kw === 'fetch') {
            // `as User` → `PdxResource<User>`, read by the compiler's own parser so the two cannot
            // disagree; `unknown` with no type. A line the compiler rejects stays `any`: it is
            // already an error, and a second one on every read of the name would bury it.
            const decl = parseFetchDecl(s.slice(m.index, j).replace(/\s+/g, ' ').trim());
            if (decl) names.set(decl.name, `PdxResource<${decl.type || 'unknown'}>`);
        }
        if (kw === 'params' || kw === 'search') {
            // Each param, and `searchParams`, under the type the compiler gives it (./route-name-types).
            for (const [name, type] of routeNameTypes(kw, s.slice(m.index, j))) names.set(name, type);
        }
        if (kw === 'form') {
            // The form createForm builds from this declaration (./form-types); `any` only for one
            // the compiler does not understand, which it reports itself.
            const name = /^@form\s+([A-Za-z_$][\w$]*)/.exec(s.slice(m.index, j));
            const type = name && formTypeOf(s.slice(m.index, j));
            if (name && type) names.set(name[1], type);
        }
        for (let k = m.index; k < j; k++) if (out[k] !== '\n') out[k] = ' ';
        RUNE_KW.lastIndex = j;
    }
    let res = out.join('');
    res = res.replace(RUNE_DECL, (_all, indent: string, kw: string, rest: string) => `${indent}${kw === 'let' ? 'var' : 'var  '}${rest}`);
    // `$derived(x)` is `computed(() => x)`: x is read later, so a const declared below it is no use
    // before its declaration (#467). Same length, so the offsets hold: `$drv(()=>x)`. Not for an
    // object literal, which an arrow would read as its body: `$derived({ … })` stays as written.
    res = res.replace(/\$derived\((?!\s*\{)/g, '$drv(()=>');
    // `var`: declared after the code that reads them, as the compiler makes them available before it.
    const decls = [...[...names].map(([n, type]) => `var ${n}: ${type};`), ...emitters].join(' ');
    return decls ? `${res}\n;${decls}` : res;
}

/**
 * What a project's nearest tsconfig.json says about where things are and what exists — `paths`,
 * `baseUrl`, `lib`, `types`, `typeRoots` — or null when it has none.
 *
 * Not its strictness. A .pdx script is checked with the runes declared as their VALUES, and under
 * `strict` that is wrong in ways the code is not: `$signal(null)` is typed `null` and every later
 * assignment is an error, a handler's `(e) =>` is an implicit any. Measured on the showcase, whose
 * tsconfig is strict: reading it whole takes the sweep from 0 lib errors to 499 false ones.
 */
function projectCompilerOptions(rootDir: string): ts.CompilerOptions | null {
    const configPath = ts.findConfigFile(rootDir, ts.sys.fileExists, 'tsconfig.json');
    if (!configPath) return null;
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    if (read.error) return null;
    const all = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(configPath)).options;
    const picked: ts.CompilerOptions = {};
    for (const key of ['paths', 'baseUrl', 'pathsBasePath', 'lib', 'types', 'typeRoots'] as const) {
        if (all[key] !== undefined) (picked as Record<string, unknown>)[key] = all[key];
    }
    return picked;
}

export interface TsDef {
    fileName: string;
    virtual: boolean;
    startOffset: number;
    endOffset: number;
    startLC: { line: number; character: number };
    endLC: { line: number; character: number };
}

interface VFile { version: number; content: string; }

export class PdxTsService {
    private files = new Map<string, VFile>();
    private service: ts.LanguageService;
    private options: ts.CompilerOptions;
    private projectVersion = 0;

    /**
     * @param rootDir the project the service checks — its nearest tsconfig.json is read
     * @param tsLibHint a typescript lib folder the client knows of (VS Code's own TypeScript)
     */
    constructor(private rootDir: string, private tsLibHint?: string) {
        const lib = findTsLibDir(rootDir, tsLibHint);
        // The project's tsconfig.json for what it decides — `paths`, `strict`, `lib`, `types`;
        // the defaults when it has none. What makes a projected .pdx a module that
        // resolves like the rest of the project stays forced: no emit, a bundler's resolution, the
        // virtual file's extension, and no checking of the libraries.
        const fallback: ts.CompilerOptions = {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            allowJs: true, checkJs: false, strict: false,
            esModuleInterop: true,
            lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
        };
        this.options = {
            ...fallback,
            ...(projectCompilerOptions(rootDir) ?? {}),
            noEmit: true, skipLibCheck: true, allowNonTsExtensions: true,
        };
        const defaultLib = lib ? join(lib, 'lib.es2022.full.d.ts') : ts.getDefaultLibFilePath(this.options);

        const host: ts.LanguageServiceHost = {
            // Bumped when the fileset or the content changes → the LS rebuilds the program
            // with the current file alone (nothing left over from earlier .pdx files).
            getProjectVersion: () => String(this.projectVersion),
            getScriptFileNames: () => [GLOBALS_FILE, ...this.files.keys()],
            getScriptVersion: f => f === GLOBALS_FILE ? '1' : String(this.files.get(f)?.version ?? 0),
            getScriptSnapshot: f => {
                if (f === GLOBALS_FILE) return ts.ScriptSnapshot.fromString(GLOBALS_DTS);
                const v = this.files.get(f);
                if (v) return ts.ScriptSnapshot.fromString(v.content);
                const c = ts.sys.readFile(f); // a .pdx.ts is a rune module: read as compiled (./rune-module)
                return c !== undefined ? ts.ScriptSnapshot.fromString(f.endsWith('.pdx.ts') ? projectRuneModule(c, f) : c) : undefined;
            },
            getCurrentDirectory: () => rootDir || ts.sys.getCurrentDirectory(),
            getCompilationSettings: () => this.options,
            getDefaultLibFileName: () => defaultLib,
            fileExists: ts.sys.fileExists,
            readFile: ts.sys.readFile,
            readDirectory: ts.sys.readDirectory,
            directoryExists: ts.sys.directoryExists,
            getDirectories: ts.sys.getDirectories,
        };
        this.service = ts.createLanguageService(host, ts.createDocumentRegistry());
    }

    /**
     * Where TypeScript would rename the symbol at `offset` in `target`, across every file in
     * `entries` — the projected .pdx of the workspace and the real files open with unsaved text —
     * plus the real files they import. A function a .pdx.ts exports is renamed where a .pdx imports
     * it. The program holds all of them for this one question; the next request syncs
     * back to its own file.
     */
    renameLocations(entries: { fileName: string; content: string }[], target: string, offset: number): { fileName: string; start: number; length: number }[] {
        this.files.clear();
        for (const e of entries) this.files.set(e.fileName, { version: 1, content: e.content });
        this.projectVersion++;
        try {
            const locs = this.service.findRenameLocations(target, offset, false, false, { providePrefixAndSuffixTextForRename: false });
            return (locs ?? []).map(l => ({ fileName: l.fileName, start: l.textSpan.start, length: l.textSpan.length }));
        } finally {
            this.files.clear();
            this.projectVersion++;
        }
    }

    /**
     * The diagnostics, syntactic and semantic, of every file in `entries`, from ONE program that holds them all —
     * `pdx check --types`. The editor builds a program per request for the file in
     * hand; a check of a whole project builds it once. The service syncs back on its next request.
     */
    diagnoseAll(entries: { fileName: string; content: string }[]): Map<string, readonly ts.Diagnostic[]> {
        this.files.clear();
        for (const e of entries) this.files.set(e.fileName, { version: 1, content: e.content });
        this.projectVersion++;
        const out = new Map<string, readonly ts.Diagnostic[]>();
        try {
            for (const e of entries) out.set(e.fileName, this.diagnosticsOf(e.fileName));
        } finally {
            this.files.clear();
            this.projectVersion++;
        }
        return out;
    }

    /** Whether TypeScript can rename what is at `offset` in the file `fileName` holding `content`. */
    canRename(fileName: string, content: string, offset: number): boolean {
        this.files.clear();
        this.files.set(fileName, { version: 1, content });
        this.projectVersion++;
        try {
            return this.service.getRenameInfo(fileName, offset).canRename;
        } finally {
            this.files.clear();
            this.projectVersion++;
        }
    }

    /** The name of the virtual TS file next to the .pdx (so relative imports resolve). */
    virtualName(uri: string): string { return this.vFileName(uri); }

    /** The name of the virtual TS file next to the .pdx (so relative imports resolve). */
    private vFileName(uri: string): string {
        let p: string;
        try { p = fileURLToPath(uri); } catch { p = uri.replace(/^file:\/\/\/?/, ''); }
        // TS normalises paths with forward slashes: use them so the name matches
        // the file in the program (otherwise "Could not find source file").
        return (p + '.__pdx_script__.ts').split('\\').join('/');
    }

    /** Sets the final CONTENT of the virtual file (assembled by buildVirtualFile).
     *  We keep in the program ONLY the current file (+ the globals + the real files the
     *  imports need): the virtual files of other .pdx are disconnected modules, and
     *  accumulating them polluted the global scope (spurious 2581/2304). Nothing
     *  accumulates → nothing leaks. */
    private sync(uri: string, content: string): string {
        const name = this.vFileName(uri);
        let changed = false;
        for (const k of [...this.files.keys()]) if (k !== name) { this.files.delete(k); changed = true; }
        const prev = this.files.get(name);
        if (!prev || prev.content !== content) {
            this.files.set(name, { version: (prev?.version ?? 0) + 1, content });
            changed = true;
        }
        if (changed) this.projectVersion++;
        return name;
    }

    getCompletions(uri: string, content: string, offset: number): ts.CompletionInfo | undefined {
        const name = this.sync(uri, content);
        return this.service.getCompletionsAtPosition(name, offset, {
            includeCompletionsForModuleExports: true,
        });
    }

    getQuickInfo(uri: string, content: string, offset: number): ts.QuickInfo | undefined {
        const name = this.sync(uri, content);
        return this.service.getQuickInfoAtPosition(name, offset);
    }

    /** TS go-to-definition: resolves members/imports/types. For the virtual file it returns
     *  the offsets (absolute within it); for real files, line/column + path. */
    getDefinition(uri: string, content: string, offset: number): TsDef[] {
        const name = this.sync(uri, content);
        const defs = this.service.getDefinitionAtPosition(name, offset);
        if (!defs) return [];
        const program = this.service.getProgram();
        return defs.map(d => {
            const virtual = d.fileName === name;
            const sf = program?.getSourceFile(d.fileName);
            const lc = (pos: number) => sf ? sf.getLineAndCharacterOfPosition(pos) : { line: 0, character: 0 };
            return {
                fileName: d.fileName,
                virtual,
                startOffset: d.textSpan.start,
                endOffset: d.textSpan.start + d.textSpan.length,
                startLC: lc(d.textSpan.start),
                endLC: lc(d.textSpan.start + d.textSpan.length),
            };
        });
    }

    /** The virtual file's diagnostics, syntax errors and type errors (#487); the offsets are relative
     *  to the projected script (= the script content), to be mapped onto the .pdx after. */
    getDiagnostics(uri: string, content: string): ts.Diagnostic[] {
        const name = this.sync(uri, content);
        try { return this.diagnosticsOf(name); } catch { return []; }
    }

    /**
     * A file's syntactic diagnostics, then its semantic ones. The semantic list alone leaves a syntax
     * error unreported — a script the user wrote wrong, or a projection that produced invalid
     * TypeScript, would both look clean (#487).
     */
    private diagnosticsOf(fileName: string): ts.Diagnostic[] {
        return [...this.service.getSyntacticDiagnostics(fileName), ...this.service.getSemanticDiagnostics(fileName)];
    }

    /** Available only when the TS lib was found (full completion for the JS builtins). */
    get hasFullLib(): boolean { return !!findTsLibDir(this.rootDir, this.tsLibHint); }
}
