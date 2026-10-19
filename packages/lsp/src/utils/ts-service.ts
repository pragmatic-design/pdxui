// TS Language Service — IntelliSense (completion/hover) inside <script>.
// The .pdx script is projected into a VIRTUAL TS file next to the .pdx (so that
// relative paths resolve), with the $… runes declared ambient and the @… runes blanked
// out PRESERVING the offsets → the .pdx ↔ TS position mapping is 1:1 (offset-scriptStart).

import ts from 'typescript';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { GLOBALS_FILE, GLOBALS_DTS } from './pdx-globals';
import { projectRuneModule } from './rune-module';
import { findTsLibDir } from './ts-lib-dir';
import { applyInsertions, runeTypeAnnotations } from './rune-annotations';

// The projection lives in ./project-script; re-exported for the callers that read it here.
export { projectScript } from './project-script';

/**
 * What a project's nearest tsconfig.json says about where things are and what exists — `paths`,
 * `baseUrl`, `lib`, `types`, `typeRoots` — or null when it has none.
 *
 * Not its strictness. A .pdx script is checked with the runes declared as their VALUES, and under
 * `strict` that is wrong in ways the code is not: `$signal(null)` is typed `null` and every later
 * assignment is an error, a handler's `(e) =>` is an implicit any. Measured on the showcase, whose
 * tsconfig is strict: reading it whole takes the sweep from 0 lib errors to 499 false ones. The
 * template projection, which holds none of that, is checked `strict` in a second program (#468).
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

/** A projected .pdx to check: its virtual file, and where its template projection starts (-1: none). */
export interface PdxEntry { fileName: string; content: string; templateBase?: number; }

/** A program's files: the projected .pdx it holds, and a version bumped when they change. */
interface Program { files: Map<string, VFile>; version: number; }

export class PdxTsService {
    /** The program that checks the scripts: the project's options, not `strict` (projectCompilerOptions). */
    private lenient: Program = { files: new Map(), version: 0 };
    private service: ts.LanguageService;
    private options: ts.CompilerOptions;
    /**
     * The second program, `strict`, that checks the template projections (#468). Its files are the
     * lenient program's, with each untyped rune declaration typed as the lenient program reads it
     * (./rune-annotations). Built on the first template it is asked about.
     */
    private strict: Program = { files: new Map(), version: 0 };
    private strictService: ts.LanguageService | null = null;
    private createService!: (program: Program, options: ts.CompilerOptions) => ts.LanguageService;

    /**
     * @param rootDir the project the service checks — its nearest tsconfig.json is read
     * @param tsLibHint a typescript lib folder the client knows of (VS Code's own TypeScript)
     * @param options.routeTypes false to leave the app's `.pdx/routes.d.ts` out of the program (#150)
     */
    constructor(private rootDir: string, private tsLibHint?: string, options: { routeTypes?: boolean } = {}) {
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
        // The app's routes as types (#150), which the compiler's plugin writes on build and in dev:
        // `navigate()` and `<pdx-link>` are checked against them once the file exists. Versioned by
        // its modification time, so a route added while the editor is open is seen.
        // A check of code that is not the app's — the documentation's examples — passes
        // `routeTypes: false`, so the app's routes do not judge it.
        const routeTypes = options.routeTypes === false ? '' : join(rootDir, '.pdx', 'routes.d.ts').replace(/\\/g, '/');
        const routeTypesVersion = (): string => {
            if (!routeTypes) return '0';
            const stat = ts.sys.getModifiedTime?.(routeTypes);
            return stat ? String(stat.getTime()) : '0';
        };

        // One registry for both programs: the libraries and the project's files are parsed once.
        const registry = ts.createDocumentRegistry();
        this.createService = (program, options) => ts.createLanguageService({
            // Bumped when the fileset or the content changes → the LS rebuilds the program
            // with the current file alone (nothing left over from earlier .pdx files).
            getProjectVersion: () => `${program.version}:${routeTypesVersion()}`,
            getScriptFileNames: () => [GLOBALS_FILE, ...(routeTypes && ts.sys.fileExists(routeTypes) ? [routeTypes] : []), ...program.files.keys()],
            getScriptVersion: f => f === GLOBALS_FILE ? '1' : f === routeTypes ? routeTypesVersion() : String(program.files.get(f)?.version ?? 0),
            getScriptSnapshot: f => {
                if (f === GLOBALS_FILE) return ts.ScriptSnapshot.fromString(GLOBALS_DTS);
                const v = program.files.get(f);
                if (v) return ts.ScriptSnapshot.fromString(v.content);
                const c = ts.sys.readFile(f); // a .pdx.ts is a rune module: read as compiled (./rune-module)
                return c !== undefined ? ts.ScriptSnapshot.fromString(f.endsWith('.pdx.ts') ? projectRuneModule(c, f) : c) : undefined;
            },
            getCurrentDirectory: () => rootDir || ts.sys.getCurrentDirectory(),
            getCompilationSettings: () => options,
            getDefaultLibFileName: () => defaultLib,
            fileExists: ts.sys.fileExists,
            readFile: ts.sys.readFile,
            readDirectory: ts.sys.readDirectory,
            directoryExists: ts.sys.directoryExists,
            getDirectories: ts.sys.getDirectories,
        }, registry);
        this.service = this.createService(this.lenient, this.options);
    }

    /**
     * Where TypeScript would rename the symbol at `offset` in `target`, across every file in
     * `entries` — the projected .pdx of the workspace and the real files open with unsaved text —
     * plus the real files they import. A function a .pdx.ts exports is renamed where a .pdx imports
     * it. The program holds all of them for this one question; the next request syncs
     * back to its own file.
     */
    renameLocations(entries: { fileName: string; content: string }[], target: string, offset: number): { fileName: string; start: number; length: number }[] {
        this.lenient.files.clear();
        for (const e of entries) this.lenient.files.set(e.fileName, { version: 1, content: e.content });
        this.lenient.version++;
        try {
            const locs = this.service.findRenameLocations(target, offset, false, false, { providePrefixAndSuffixTextForRename: false });
            return (locs ?? []).map(l => ({ fileName: l.fileName, start: l.textSpan.start, length: l.textSpan.length }));
        } finally {
            this.lenient.files.clear();
            this.lenient.version++;
        }
    }

    /**
     * The diagnostics, syntactic and semantic, of every file in `entries`, from ONE program that holds them all —
     * `pdx check --types`. The editor builds a program per request for the file in
     * hand; a check of a whole project builds it once. The service syncs back on its next request.
     */
    diagnoseAll(entries: PdxEntry[]): Map<string, readonly ts.Diagnostic[]> {
        this.lenient.files.clear();
        for (const e of entries) this.lenient.files.set(e.fileName, { version: 1, content: e.content });
        this.lenient.version++;
        try {
            return this.diagnoseEntries(entries);
        } finally {
            for (const program of [this.lenient, this.strict]) {
                program.files.clear();
                program.version++;
            }
        }
    }

    /** Whether TypeScript can rename what is at `offset` in the file `fileName` holding `content`. */
    canRename(fileName: string, content: string, offset: number): boolean {
        this.lenient.files.clear();
        this.lenient.files.set(fileName, { version: 1, content });
        this.lenient.version++;
        try {
            return this.service.getRenameInfo(fileName, offset).canRename;
        } finally {
            this.lenient.files.clear();
            this.lenient.version++;
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
        syncFiles(this.lenient, [{ fileName: name, content }]);
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
     *  to the projected script (= the script content), to be mapped onto the .pdx after. What lies
     *  after `templateBase`, the template projection, is checked under `strict` (#468). */
    getDiagnostics(uri: string, content: string, templateBase = -1): ts.Diagnostic[] {
        const name = this.sync(uri, content);
        try { return this.diagnoseEntries([{ fileName: name, content, templateBase }]).get(name) ?? []; } catch { return []; }
    }

    /**
     * Each entry's diagnostics, offsets in its own content: its script's from the lenient program,
     * its template's from the strict one (#468). The lenient program must already hold the entries.
     */
    private diagnoseEntries(entries: PdxEntry[]): Map<string, ts.Diagnostic[]> {
        const out = new Map<string, ts.Diagnostic[]>();
        for (const e of entries) {
            const base = e.templateBase ?? -1;
            out.set(e.fileName, diagnosticsOf(this.service, e.fileName).filter((d) => base < 0 || d.start == null || d.start < base));
        }
        const program = this.service.getProgram();
        const templated = entries.filter((e) => (e.templateBase ?? -1) >= 0);
        if (!program || templated.length === 0) return out;

        // Each file with its rune declarations typed as the lenient program reads them. They are all
        // in the script, before the template: the template's offsets move by `shift`, as one block.
        const annotated = templated.map((e) => {
            const base = e.templateBase ?? -1;
            const { content, shift } = applyInsertions(e.content, runeTypeAnnotations(program, e.fileName, base));
            return { fileName: e.fileName, content, from: base + shift, shift };
        });
        syncFiles(this.strict, annotated);
        this.strictService ??= this.createService(this.strict, { ...this.options, strict: true });
        for (const e of annotated) {
            for (const d of diagnosticsOf(this.strictService, e.fileName)) {
                if (d.start != null && d.start >= e.from) out.get(e.fileName)?.push({ ...d, start: d.start - e.shift });
            }
        }
        return out;
    }

    /** Available only when the TS lib was found (full completion for the JS builtins). */
    get hasFullLib(): boolean { return !!findTsLibDir(this.rootDir, this.tsLibHint); }
}

/**
 * A file's syntactic diagnostics, then its semantic ones. The semantic list alone leaves a syntax
 * error unreported — a script the user wrote wrong, or a projection that produced invalid
 * TypeScript, would both look clean (#487).
 */
function diagnosticsOf(service: ts.LanguageService, fileName: string): ts.Diagnostic[] {
    return [...service.getSyntacticDiagnostics(fileName), ...service.getSemanticDiagnostics(fileName)];
}

/** Makes `files` the program's whole fileset, bumping a version only where the content changed. */
function syncFiles(program: Program, files: { fileName: string; content: string }[]): void {
    const names = new Set(files.map((f) => f.fileName));
    let changed = false;
    for (const k of [...program.files.keys()]) if (!names.has(k)) { program.files.delete(k); changed = true; }
    for (const f of files) {
        const prev = program.files.get(f.fileName);
        if (!prev || prev.content !== f.content) {
            program.files.set(f.fileName, { version: (prev?.version ?? 0) + 1, content: f.content });
            changed = true;
        }
    }
    if (changed) program.version++;
}
