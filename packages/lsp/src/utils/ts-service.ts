// TS Language Service — IntelliSense (completion/hover) inside <script setup>.
// The .pdx script is projected into a VIRTUAL TS file next to the .pdx (so that
// relative paths resolve), with the $… runes declared ambient and the @… runes blanked
// out PRESERVING the offsets → the .pdx ↔ TS position mapping is 1:1 (offset-scriptStart).

import ts from 'typescript';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { GLOBALS_FILE, GLOBALS_DTS } from './pdx-globals';
import { projectRuneModule } from './rune-module';
import { findTsLibDir } from './ts-lib-dir';

// The projection lives in ./project-script; re-exported for the callers that read it here.
export { projectScript } from './project-script';

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

        const host: ts.LanguageServiceHost = {
            // Bumped when the fileset or the content changes → the LS rebuilds the program
            // with the current file alone (nothing left over from earlier .pdx files).
            getProjectVersion: () => `${this.projectVersion}:${routeTypesVersion()}`,
            getScriptFileNames: () => [GLOBALS_FILE, ...(routeTypes && ts.sys.fileExists(routeTypes) ? [routeTypes] : []), ...this.files.keys()],
            getScriptVersion: f => f === GLOBALS_FILE ? '1' : f === routeTypes ? routeTypesVersion() : String(this.files.get(f)?.version ?? 0),
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
