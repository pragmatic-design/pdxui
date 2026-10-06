// The workspace the language server answers about: its projects, their TypeScript services, the
// projection of each open document, and the files a cross-file request reads. The handlers in
// `capabilities/` take it as a parameter; `server.ts` owns the one instance.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import { getAnalysis, setAnalyzeOptions } from './document-manager';
import { PdxTsService } from './utils/ts-service';
import { buildVirtualFile, type VirtualFile } from './utils/virtual-file';
import { scanWorkspace, scanTagHostFiles, type TranslationKeys } from './utils/project-scanner';
import { analyzeDocument } from './utils/compiler-bridge';
import { ProjectRegistries, type ProjectRegistry } from './utils/project-registry';
import { pathToUri } from './utils/uri';
import type { WorkspaceFile } from './capabilities/references';

// The prop types that are "safe" to type-check in literal bindings: primitives and unions
// of string literals. Complex types (objects, functions, generics) → null: they cannot be
// parsed as an annotation, and they are a source of false positives.
const SAFE_PROP_TYPE = /^(string|number|boolean|(?:'[^']*'(?:\s*\|\s*'[^']*')*))$/;

// A payload type that names nothing the virtual file would have to import: primitives, literals,
// object and array shapes of them. `{ id: number }` is one; `Ticket` is not — it would be an unknown
// name in the projected file, which is a false error.
const SELF_CONTAINED_TYPE = /^(?:[\s{}[\]:;,|?'"]|string|number|boolean|null|undefined|'[^']*'|"[^"]*"|\d+|[a-z_$][\w$]*(?=\??\s*:))*$/;

/**
 * The safe TS type of an attribute-prop of a component, or null. For `@name`, the type of that
 * event's `$event`: `CustomEvent<Payload>` when the component declares a self-contained payload,
 * null otherwise — the handler keeps `$event: any`.
 */
function resolvePropType(registry: ProjectRegistry, tag: string, attr: string): string | null {
    const comp = registry.describe(tag);
    if (!comp) return null;
    if (attr.startsWith('@')) {
        const ev = comp.events.find(e => e.name === attr.slice(1));
        const payload = ev?.type?.trim();
        if (!payload || payload === 'void' || payload === 'CustomEvent') return null;
        const inner = /^CustomEvent<([\s\S]*)>$/.exec(payload)?.[1] ?? payload;
        return SELF_CONTAINED_TYPE.test(inner) ? `CustomEvent<${inner}>` : null;
    }
    // Attributes in the template are kebab-case; in the manifest they may be
    // camelCase or kebab — compare both forms.
    const camel = attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const m = comp.attributes.find(a => a.name === attr || a.name === camel);
    const t = m?.type?.trim();
    return t && SAFE_PROP_TYPE.test(t) ? t : null;
}

/** What the workspace needs of the editor's document store: the open text of a URI, if any. */
export interface OpenDocuments {
    get(uri: string): TextDocument | undefined;
}

/** The workspace's state and the questions every handler asks of it. */
export class Workspace {
    root = '';
    translations: TranslationKeys[] = [];
    pdxFiles: string[] = [];
    // TS type diagnostics (the script). ON by default; turned off by the `pdx.typeCheck` setting, sent
    // as initializationOptions `{ typeCheck: false }` and on workspace/didChangeConfiguration.
    typeCheckEnabled = true;
    // A typescript lib folder the client knows of — VS Code's own TypeScript — for a project that has none.
    tsLibHint: string | undefined;
    // The components a document can use come from ITS project, not from the editor's folder.
    readonly registries = new ProjectRegistries();
    // One TypeScript service per project, so each reads its own tsconfig.json.
    private readonly tsServices = new Map<string, PdxTsService | null>();
    // A cache of the virtual TS file per (uri → version) — it avoids reprojecting on every request.
    private readonly vfCache = new Map<string, { version: number; vf: VirtualFile }>();

    constructor(private readonly documents: OpenDocuments) {}

    /** Forget every project's TypeScript service: the next request builds it with the current hint. */
    resetTsServices(): void {
        this.tsServices.clear();
    }

    /** Forget the projection of a document the editor closed. */
    forget(uri: string): void {
        this.vfCache.delete(uri);
    }

    /**
     * The registry of the project a document belongs to: the nearest folder above it with a
     * package.json or a vite.config, the editor's folder when there is none or the URI is not a file.
     */
    registryOf(uri: string): ProjectRegistry {
        let filePath: string | null = null;
        try { filePath = fileURLToPath(uri); } catch { /* not a file: URI (untitled:, …) — the workspace's */ }
        return filePath ? this.registries.forFile(filePath, this.root) : this.registries.forRoot(this.root);
    }

    /** The TypeScript service of the project `uri` belongs to, or null when it cannot be built. */
    tsServiceOf(uri: string): PdxTsService | null {
        if (!this.root) return null;
        const root = this.registryOf(uri).root;
        if (!this.tsServices.has(root)) {
            let svc: PdxTsService | null = null;
            try { svc = new PdxTsService(root, this.tsLibHint); } catch { /* no TypeScript to load: features without types */ }
            this.tsServices.set(root, svc);
        }
        return this.tsServices.get(root) ?? null;
    }

    /** The virtual file (projected script + template) for the document, or null. */
    getVirtual(document: TextDocument): VirtualFile | null {
        const cached = this.vfCache.get(document.uri);
        if (cached && cached.version === document.version) return cached.vf;
        const { descriptor, ast } = getAnalysis(document);
        if (!descriptor?.script) return null;
        const source = document.getText();
        const tmpl = descriptor.template?.content ?? null;
        const tmplStart = tmpl ? source.indexOf(tmpl) : -1;
        const registry = this.registryOf(document.uri);
        const vf = buildVirtualFile(descriptor.script.content, descriptor.script.start, ast ?? null, tmpl, tmplStart,
            (tag, attr) => resolvePropType(registry, tag, attr));
        this.vfCache.set(document.uri, { version: document.version, vf });
        return vf;
    }

    /** The projection of a .pdx from its text — not cached: a file read from disk has no version. */
    virtualOfText(uri: string, text: string): VirtualFile | null {
        const { descriptor, ast } = analyzeDocument(text, uri.split('/').pop() ?? 'x.pdx');
        if (!descriptor?.script) return null;
        const tmpl = descriptor.template?.content ?? null;
        const registry = this.registryOf(uri);
        return buildVirtualFile(descriptor.script.content, descriptor.script.start, ast ?? null, tmpl, tmpl ? text.indexOf(tmpl) : -1,
            (tag, attr) => resolvePropType(registry, tag, attr));
    }

    /**
     * The workspace files for cross-file references and rename: every .pdx, and the .ts/.js/.html that
     * may name a component tag — listed here, since the client does not watch .html.
     * Open-document text is preferred over disk.
     */
    buildWorkspaceFiles(): WorkspaceFile[] {
        const files: WorkspaceFile[] = [];
        for (const filePath of [...this.pdxFiles, ...(this.root ? scanTagHostFiles(this.root) : [])]) {
            const uri = pathToUri(filePath);
            const open = this.documents.get(uri);
            try {
                files.push({ uri, content: open ? open.getText() : readFileSync(filePath, 'utf-8') });
            } catch { /* unreadable file — skip */ }
        }
        return files;
    }

    /** Rebuild the disk-derived index (translations, .pdx files) and forget every project registry. */
    rescan(): void {
        if (!this.root) return;
        const idx = scanWorkspace(this.root);
        this.translations = idx.translations;
        this.pdxFiles = idx.pdxFiles;
        this.registries.clear();
        // The components' declared props, for the bound names compile() checks: PDX_UNKNOWN_PROP and
        // PDX_PROP_NAME_CASE reach the editor as they reach `vite dev`, and their enum
        // values, for PDX_INVALID_ENUM_VALUE. The compiler's own resolver, over the
        // document's project, so a prop means here what it means to that project's build.
        setAnalyzeOptions((uri) => {
            try {
                const { resolver } = this.registryOf(uri);
                return { propsOf: (tag) => resolver.propsOf(tag), enumValues: (tag, prop) => resolver.enumValues(tag, prop) };
            } catch {
                return {}; // a project whose packages cannot be read: the checks that need them stay off
            }
        });
    }

    /** The component package that defines `tag` in the document's project, or null for a project tag. */
    tagPackageOf(uri: string): (tag: string) => string | null {
        const { resolver, manifest } = this.registryOf(uri);
        return (tag) => {
            const entry = resolver.resolve(tag);
            if (entry?.source === 'ui') {
                const parts = entry.importPath.split('/');
                return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
            }
            return !entry && manifest.has(tag) ? 'a component package' : null;
        };
    }
}
