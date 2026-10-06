// TS Language Service — IntelliSense (completion/hover) inside <script setup>.
// The .pdx script is projected into a VIRTUAL TS file next to the .pdx (so that
// relative paths resolve), with the $… runes declared ambient and the @… runes blanked
// out PRESERVING the offsets → the .pdx ↔ TS position mapping is 1:1 (offset-scriptStart).

import ts from 'typescript';
import { DECORATOR_RUNES } from '@pdxui/compiler';
import { existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const GLOBALS_FILE = '__pdx_globals__.d.ts';
const GLOBALS_DTS = `
export {};
declare global {
  // In .pdx source, signals are USED as values (the compiler rewrites reads and writes):
  // so, for IntelliSense and diagnostics, the type is the VALUE, not a callable.
  function $signal<T>(v: T): T;
  // The VALUE form, the one the compiler takes: \`$derived(a > b)\` is a boolean.
  function $derived<T>(value: T): T;
  function $store<T extends object>(v: T): T;
  function $effect(fn: () => unknown): void;
  function $watch<T>(src: T | (() => T), cb: (v: T, prev: T) => void, opts?: { immediate?: boolean }): void;
  function $t(key: string, params?: Record<string, unknown>): string;
  function $n(v: number, opts?: Intl.NumberFormatOptions): string;
  function $d(v: Date | number | string, opts?: Intl.DateTimeFormatOptions): string;
  function $r(v: number, unit: Intl.RelativeTimeFormatUnit): string;
  // A handler's event: \`any\`, so \`$event.target.value\` reads as it runs. The template projection
  // narrows it where the event's payload type is known.
  const $event: any;
  const $el: HTMLElement;
  const $refs: Record<string, HTMLElement>;
  // The @pdxui/core helpers the compiler auto-imports (used with no import in the .pdx).
  const html: (strings: TemplateStringsArray, ...values: any[]) => unknown;
  function signal<T>(v: T): { (): T; set(v: T | ((p: T) => T)): void };
  function computed<T>(fn: () => T): () => T;
  // effect() and watch() hand back the function that stops them, as core's do.
  function effect(fn: () => unknown): () => void;
  function batch(fn: () => void): void;
  function untrack<T>(fn: () => T): T;
  function watch(src: unknown, cb: (v: any, p: any) => void, opts?: { immediate?: boolean }): () => void;
  // An async callback too, as core's own signature allows.
  function onMount(fn: () => void | (() => void) | Promise<unknown>): void;
  function onDestroy(fn: () => void): void;
  function onUpdated(fn: () => void): void;
  function onError(fn: (e: unknown) => void): void;
  function onShow(fn: () => void): void;
  function onHide(fn: () => void): void;
  function onPropsChange(fn: (...a: any[]) => void): void;
  function onBeforeLeave(fn: (...a: any[]) => unknown): void;
  function onRouteChange(fn: (...a: any[]) => void): void;
  function onVisible(fn: (...a: any[]) => void): void;
  function onResize(fn: (...a: any[]) => void): void;
}
`;

// Statement-leading runes. We recognise them ONLY at the start of a line (indent aside):
// an `@form`/`@store` inside a comment ("(via @form rune)", for one) is not a rune.
// Every declaration the compiler knows, from its one rune list: a rune missing here would stay
// in the projected code as text, and `@inject employeeDocuments;` would become a name TypeScript
// cannot find.
const RUNE_KW = new RegExp(`@(${[...DECORATOR_RUNES.keys()].join('|')})\\b`, 'g');
const NAME_INTRO = new Set(['fetch', 'form', 'store']);

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
 *  - `@prop name: T = d` → `let  name…` (a TYPED prop; `@prop`=5 → `let  `=5).
 *  - the other @… runes → blanked out (from the keyword to a `;` at depth 0, or to the
 *    balanced `{…}`), preserving the newlines. The names of @fetch/@form/@store are
 *    declared at the end (their lines are blanked) → the references resolve.
 *  - the `$…` runes stay (they are declared ambient). */
export function projectScript(scriptContent: string): string {
    const s = scriptContent;
    const out = s.split('');
    const names = new Set<string>();
    // `@event name: T` → the script's `name(detail)`, declared typed by its payload.
    const emitters: string[] = [];
    RUNE_KW.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RUNE_KW.exec(s))) {
        if (!atLineStart(s, m.index)) continue;
        const kw = m[1];
        if (kw === 'prop') {
            // `var`, not `let`: the compiler declares props before anything reads them.
            'var  '.split('').forEach((ch, o) => { out[m!.index + o] = ch; });
            continue;
        }
        if (NAME_INTRO.has(kw)) {
            const after = /^\s+([A-Za-z_$][\w$]*)/.exec(s.slice(m.index + 1 + kw.length));
            if (after) names.add(after[1]);
        }
        if (kw === 'inject' || kw === 'mixin') {
            // Match: @inject key;  @inject key as alias;  @mixin useThing as thing;   Groups: [1]=key [2]=alias
            const inj = /^\s+([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?/.exec(s.slice(m.index + 1 + kw.length));
            if (inj) names.add(inj[2] ?? inj[1]);
        }
        if (kw === 'event') {
            // Match: @event name: PayloadType;   Groups: [1]=name [2]=payload type (optional)
            const ev = /^\s+([A-Za-z_$][\w$]*)\s*(?::\s*([^;\n]+?))?\s*;?\s*(?:\n|$)/.exec(s.slice(m.index + 1 + kw.length));
            if (ev) emitters.push(ev[2] ? `var ${ev[1]}: (detail: ${ev[2]}) => void;` : `var ${ev[1]}: (detail?: unknown) => void;`);
        }
        let depth = 0, j = m.index, ended = false;
        for (; j < s.length; j++) {
            const c = s[j];
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
        for (let k = m.index; k < j; k++) if (out[k] !== '\n') out[k] = ' ';
        RUNE_KW.lastIndex = j;
    }
    let res = out.join('');
    res = res.replace(RUNE_DECL, (_all, indent: string, kw: string, rest: string) => `${indent}${kw === 'let' ? 'var' : 'var  '}${rest}`);
    // `var`: declared after the code that reads them, as the compiler makes them available before it.
    const decls = [...[...names].map(n => `var ${n}: any;`), ...emitters].join(' ');
    return decls ? `${res}\n;${decls}` : res;
}

const libDirs = new Map<string, string | null>(); // root → typescript's lib folder, null = not found

const hasLib = (dir: string): boolean => existsSync(join(dir, 'lib.es2022.d.ts'));

/**
 * Finds typescript's lib folder for the lib.*.d.ts files: the one the client points at (VS Code's
 * own TypeScript), then the project's — looked for in every node_modules from `rootDir` UP, pnpm's
 * store included — then the one next to this module when it is not bundled.
 *
 * Not only `<root>/node_modules`: the server ships no lib files, so a folder whose TypeScript sits
 * higher up (an app in a monorepo) or nowhere would get no lib at all — `String`, `JSON` and
 * `document` unknown, and hundreds of false errors.
 */
function findTsLibDir(rootDir: string, hint?: string): string | null {
    const key = `${rootDir}|${hint ?? ''}`;
    if (libDirs.has(key)) return libDirs.get(key)!;
    let found: string | null = hint && hasLib(hint) ? hint : null;
    for (let dir = rootDir; !found && dir; ) {
        const direct = join(dir, 'node_modules', 'typescript', 'lib');
        if (hasLib(direct)) { found = direct; break; }
        const pnpm = join(dir, 'node_modules', '.pnpm');
        if (existsSync(pnpm)) {
            // Several versions can coexist (typescript@5.8.x, 5.9.x): pick the one
            // whose lib is actually there.
            for (const d of readdirSync(pnpm)) {
                const cand = join(pnpm, d, 'node_modules', 'typescript', 'lib');
                if (d.startsWith('typescript@') && hasLib(cand)) { found = cand; break; }
            }
        }
        const parent = dirname(dir);
        dir = parent === dir ? '' : parent;
    }
    if (!found) {
        const own = dirname(ts.getDefaultLibFilePath({}));
        if (hasLib(own)) found = own;
    }
    libDirs.set(key, found);
    return found;
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
                const c = ts.sys.readFile(f);
                return c !== undefined ? ts.ScriptSnapshot.fromString(c) : undefined;
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
     * The semantic diagnostics of every file in `entries`, from ONE program that holds them all —
     * `pdx check --types`. The editor builds a program per request for the file in
     * hand; a check of a whole project builds it once. The service syncs back on its next request.
     */
    diagnoseAll(entries: { fileName: string; content: string }[]): Map<string, readonly ts.Diagnostic[]> {
        this.files.clear();
        for (const e of entries) this.files.set(e.fileName, { version: 1, content: e.content });
        this.projectVersion++;
        const out = new Map<string, readonly ts.Diagnostic[]>();
        try {
            for (const e of entries) out.set(e.fileName, this.service.getSemanticDiagnostics(e.fileName));
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

    /** The virtual file's semantic diagnostics (type errors); the offsets are relative
     *  to the projected script (= the script content), to be mapped onto the .pdx after. */
    getSemanticDiagnostics(uri: string, content: string): ts.Diagnostic[] {
        const name = this.sync(uri, content);
        try { return this.service.getSemanticDiagnostics(name); } catch { return []; }
    }

    /** Available only when the TS lib was found (full completion for the JS builtins). */
    get hasFullLib(): boolean { return !!findTsLibDir(this.rootDir, this.tsLibHint); }
}
