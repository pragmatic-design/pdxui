// Component auto-resolver — builds a tag→import map from:
// 1. Component packages: every dependency that declares `customElements` (pdx-button → @pdxui/ui/button,
//    pdx-router-outlet → @pdxui/router/outlet) — see component-packages.ts
// 2. Project .pdx files (pdx-user-card → ./components/user-card.pdx)
// 3. Watches filesystem for new .pdx files in dev mode

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative, resolve } from 'path';
import { createRequire } from 'module';
import { deriveTag } from './compiler/codegen';
import { moduleDir } from './module-dir';
import { scanNoImportTags } from './no-import-tags';
import { componentPackages, type ComponentPackage } from './component-packages';
import type { ValidationWarning } from './compiler/validate';

/** Resolved component: tag name → import path */
export interface ComponentEntry {
    tag: string;
    importPath: string;
    /** 'ui' = a component package (@pdxui/ui, @pdxui/router, any that declares customElements), 'project' = local .pdx file */
    source: 'ui' | 'project';
}

/**
 * Registry of all auto-importable components.
 * Built at plugin start, updated on new file detection.
 */
export class ComponentResolver {
    private map = new Map<string, ComponentEntry>();
    /**
     * Tags that are legitimate but have nothing to import — see `knownWithoutImport`.
     * Lazily scanned, because most compilations never ask.
     */
    private noImportTags: Set<string> | null = null;
    /** tag → (prop name → allowed enum values), populated from the manifest. */
    private enums = new Map<string, Map<string, string[]>>();
    /** tag → the props a binding can set (manifest fields that are not read-only). */
    private props = new Map<string, Set<string>>();
    private _collisions: ValidationWarning[] = [];
    /** The component packages that registered something, in order. */
    private _packages: string[] = [];
    /** The project folders the last scan covered, relative to its root. */
    private _projectDirs: string[] = [];

    /**
     * Tag collisions found while scanning the project, as structured diagnostics.
     *
     * PDX_TAG_COLLISION_RESOLVER is NOT the same diagnostic as the PDX_TAG_COLLISION that
     * `plugin.ts` throws during transform, and one does not cover the other. The thrown one sees
     * only the files the build COMPILES; this one scans the disk at plugin start, so it also sees
     * the losing file — which is unreachable by auto-import precisely BECAUSE it lost, and
     * therefore may never be compiled at all. A collision between a page nobody imports and a
     * component everybody does would otherwise leave no trace anywhere.
     */
    get collisions(): readonly ValidationWarning[] {
        return this._collisions;
    }

    /** Resolve a tag to its import path, or null if unknown */
    resolve(tag: string): ComponentEntry | null {
        return this.map.get(tag) ?? null;
    }

    /** All registered tags */
    get tags(): string[] {
        return Array.from(this.map.keys());
    }

    /** Number of registered components */
    /** True when the resolver knows the tag (a ui export or a project component). */
    has(tag: string): boolean {
        return this.map.has(tag.toLowerCase());
    }

    /**
     * True when the tag is legitimate even though nothing can be auto-imported for it.
     *
     * `has()` answers "can I write an import for this?", which is this class's job. The
     * PDX_UNRESOLVED_COMPONENT diagnostic asks something else — "will this element work?" — and
     * there are two ways for the answer to be yes with no import at all:
     *
     *   · the design system STYLES it. `@pdxui/design` declares pdx-stack, pdx-row, pdx-grid,
     *     pdx-center, pdx-cluster, pdx-split and pdx-container as element selectors with an
     *     attribute API. They are CSS, exactly like `.pdx-btn`, and importing anything for them
     *     would be wrong — there is no module;
     *   · another @pdxui package DEFINES it. `pdx-router-outlet` comes from @pdxui/router,
     *     which the app imports itself.
     *
     * Without it, most of the warnings a build emits are wrong, which leaves the real ones
     * indistinguishable from noise.
     *
     * Kept SEPARATE from `has()` on purpose. Folding these into the import map would make the
     * compiler emit an import for a tag that has no module behind it.
     */
    knownWithoutImport(tag: string): boolean {
        const t = tag.toLowerCase();
        if (this.map.has(t)) return true;
        if (this.noImportTags === null) this.noImportTags = scanNoImportTags(moduleDir());
        return this.noImportTags.has(t);
    }

    get size(): number {
        return this.map.size;
    }

    /** Allowed values for an enum prop on a known component, or null if not an enum / unknown. */
    enumValues(tag: string, prop: string): string[] | null {
        return this.enums.get(tag)?.get(prop) ?? null;
    }

    /** All enum-typed props for a tag (prop → values), or undefined if none. */
    enumsFor(tag: string): Map<string, string[]> | undefined {
        return this.enums.get(tag);
    }

    /**
     * The props a binding can set on a manifest component, by their declared (camelCase) name, or
     * null when the tag has no manifest entry. The compiler uses it to emit a bound name the way the
     * component declares it — `:withborder` on pdx-app-layout would otherwise land on an expando,
     * because the lowercase form has no hyphen for core to camelCase back.
     */
    propsOf(tag: string): ReadonlySet<string> | null {
        return this.props.get(tag) ?? null;
    }

    /**
     * The component packages the project depends on (see `componentPackages`): each one's manifest
     * → tag→import map, plus each component's settable props and prop enums. Returns how many
     * components it registered.
     */
    registerComponentPackages(root?: string): number {
        let count = 0;
        for (const pkg of componentPackages(root)) {
            const added = this._registerManifestPackage(pkg);
            if (added > 0 && !this._packages.includes(pkg.name)) this._packages.push(pkg.name);
            count += added;
        }
        return count;
    }

    /**
     * The component packages, then @pdxui/ui's exports when none has a manifest (an older ui build).
     * Returns true if a manifest registered at least one component. The name says "the library's
     * components", and the library is every component package.
     */
    registerUiManifest(root?: string): boolean {
        return this.registerComponentPackages(root) > 0;
    }

    /**
     * Where an unresolved tag was looked for: the component packages, then the project folders —
     * what PDX_UNRESOLVED_COMPONENT's hint names, so a package that was not found is visible.
     */
    get searched(): string[] {
        return [...this._packages, ...this._projectDirs.map(d => `${d}/`)];
    }

    /**
     * One component package's manifest → tag→import map PLUS each component's prop enums (so the
     * compiler can validate enum attributes and offer dropdowns/IntelliSense). The public subpath is
     * resolved from package.json `exports` by matching each module's source file, so it stays correct
     * for nested/renamed exports. The manifest's real `tagName` is authoritative — more accurate than
     * deriving `pdx-<exportName>`. A tag another package registered first keeps its first owner.
     */
    private _registerManifestPackage(pkg: ComponentPackage): number {
        let manifest: { modules?: ManifestModule[] };
        try {
            manifest = JSON.parse(readFileSync(pkg.manifest, 'utf-8'));
        } catch { return 0; } // unreadable manifest → this package contributes nothing

        // Index every export TARGET file → its subpath name (condition-independent: src|dist + ext
        // are normalised away), so a manifest module's `src/x/pdx-x.ts` path maps to "@pdxui/ui/x".
        const targetToName = new Map<string, string>();
        const exportsMap = typeof pkg.pkg.exports === 'object' && pkg.pkg.exports ? pkg.pkg.exports : {};
        for (const [subpath, def] of Object.entries(exportsMap)) {
            if (subpath === '.' || subpath === './package.json' || subpath === './manifest') continue;
            const name = subpath.replace(/^\.\//, '');
            for (const target of exportTargets(def)) {
                targetToName.set(normalizeModulePath(target), name);
            }
        }

        let count = 0;
        for (const mod of manifest.modules || []) {
            const decl = (mod.declarations || [])[0];
            if (!decl || !decl.tagName || !mod.path) continue;
            if (this.map.has(decl.tagName)) continue;
            const name = targetToName.get(normalizeModulePath(mod.path));
            if (!name) continue; // module has no public export → not auto-importable
            this.map.set(decl.tagName, {
                tag: decl.tagName,
                importPath: `${pkg.name}/${name}`,
                source: 'ui',
            });
            const propEnums = new Map<string, string[]>();
            const settable = new Set<string>();
            for (const member of decl.members || []) {
                if (member.kind !== 'field') continue;
                if (!member.readonly) settable.add(member.name);
                const vals = parseEnumUnion(member.type?.text);
                if (vals) propEnums.set(member.name, vals);
            }
            if (propEnums.size) this.enums.set(decl.tagName, propEnums);
            this.props.set(decl.tagName, settable);
            count++;
        }
        return count;
    }

    /**
     * Scan @pdxui/ui package.json exports to build tag→import map.
     * Convention: export "./button" → tag "pdx-button" → import "@pdxui/ui/button"
     */
    registerUiPackage(root?: string): void {
        const uiPkg = this._locateUiPackageJson(root);
        if (uiPkg) {
            try {
                const pkg = JSON.parse(readFileSync(uiPkg, 'utf-8'));
                if (pkg.exports && typeof pkg.exports === 'object') {
                    for (const subpath of Object.keys(pkg.exports)) {
                        if (subpath === '.') continue;
                        // "./button" → "button", "./input-group" → "input-group"
                        const name = subpath.replace(/^\.\//, '');

                        // Determine tag from export path
                        let tag: string;
                        if (name.includes('/')) {
                            // Nested export: "./icon/pdx-icon" → check if last segment is a pdx-* component
                            const lastSegment = name.split('/').pop()!;
                            if (!lastSegment.startsWith('pdx-')) continue; // skip non-component nested exports
                            tag = lastSegment;
                        } else {
                            tag = `pdx-${name}`;
                        }
                        this.map.set(tag, {
                            tag,
                            importPath: `@pdxui/ui/${name}`,
                            source: 'ui',
                        });
                    }
                }
            } catch { /* skip malformed package.json */ }
        }
    }

    /**
     * Find @pdxui/ui's package.json in BOTH layouts:
     *  • external consumer — installed in node_modules (resolved from the project root, pnpm-safe);
     *  • monorepo — the packages/ui sibling, found by walking up from the compiler.
     */
    private _locateUiPackageJson(root?: string): string | undefined {
        if (root) {
            // 1. Node resolution of the manifest (works once @pdxui/ui exports "./package.json").
            try {
                const require = createRequire(join(root, 'package.json'));
                return require.resolve('@pdxui/ui/package.json');
            } catch { /* older ui without the export — try the direct path next */ }
            // 2. Direct node_modules path. With pnpm this is a symlink into the store, so a plain
            //    existsSync on the manifest resolves it without needing it to be in "exports".
            const direct = join(root, 'node_modules', '@pdxui', 'ui', 'package.json');
            if (existsSync(direct)) return direct;
        }
        // 3. Monorepo: walk up from the compiler to find the packages/ui sibling.
        let dir = moduleDir();
        for (let i = 0; i < 6; i++) {
            const uiPkg = join(dir, 'packages', 'ui', 'package.json');
            if (existsSync(uiPkg)) return uiPkg;
            dir = dirname(dir);
        }
        return undefined;
    }

    /**
     * Scan project directories for .pdx files and register as components.
     * Convention: user-card.pdx → tag "pdx-user-card" → import relative path
     *
     * The one scan rule, for the build, `pdx check` and the editor alike: `src/` and `pages/`, PLUS
     * the directories passed in (`pdx({ components })`), relative to the root or absolute. One rule,
     * so a component cannot resolve in one and not the other.
     */
    registerProjectComponents(rootDir: string, scanDirs: string[] = []): void {
        const dirs = [...new Set([join(rootDir, 'src'), join(rootDir, 'pages'), ...scanDirs.map(d => resolve(rootDir, d))])];
        this._projectDirs = dirs.map(d => normalizePath(relative(rootDir, d)) || '.');

        // A rescan REPLACES this scan's findings. The dev server calls this again whenever a `.pdx`
        // appears, and without the reset every repeat would add another copy of the same
        // collision: two files claiming one tag would report it three times after two scans.
        this._collisions = [];

        for (const dir of dirs) {
            if (!existsSync(dir)) continue;
            this._scanDir(dir, rootDir);
        }
    }

    /**
     * Generate import statements for a list of tags used in a template.
     * Only returns imports for tags that are in the registry AND not already imported.
     */
    resolveImports(usedTags: string[], existingImports: string, currentFile: string): string[] {
        const imports: string[] = [];

        for (const tag of usedTags) {
            const entry = this.map.get(tag);
            if (!entry) continue;

            // Skip if already explicitly imported. Use an exact, quote-delimited match
            // so '@pdxui/ui/button-group' does NOT suppress '@pdxui/ui/button'.
            if (isAlreadyImported(existingImports, entry.importPath)) continue;

            // For project components: don't self-import
            if (entry.source === 'project') {
                const normalCurrent = normalizePath(currentFile);
                const normalEntry = normalizePath(entry.importPath);
                if (normalCurrent === normalEntry) continue;

                // Generate relative import from current file
                const fromDir = dirname(currentFile);
                let rel = relative(fromDir, entry.importPath).replace(/\\/g, '/');
                if (!rel.startsWith('.')) rel = './' + rel;
                imports.push(`import '${rel}';`);
            } else {
                imports.push(`import '${entry.importPath}';`);
            }
        }

        return imports;
    }

    /**
     * PDX_TAG_COLLISION_RESOLVER — two project files derive the same custom-element tag, so the
     * second one is unreachable by auto-import. Structured AND printed: the console line is what a
     * `pdx build` in a terminal shows, and the object is what a tool can read.
     */
    private _reportCollision(tag: string, winner: string, loser: string): void {
        const message = `PDX_TAG_COLLISION_RESOLVER: "${tag}" is taken by ${winner}, `
            + `so ${loser} is not auto-importable.`;
        console.warn(`[pdx] ${message}`);
        this._collisions.push({
            code: 'PDX_TAG_COLLISION_RESOLVER',
            severity: 'warn',
            message,
            hint: `Add @tag 'pdx-unique-name'; to one of the two files. Until then, <${tag}> `
                + `anywhere in the project resolves to ${winner}.`,
        });
    }

    /** Quick scan for @tag 'name' in a .pdx file without full parsing. */
    private _detectTag(filePath: string): string | null {
        try {
            const content = readFileSync(filePath, 'utf-8');
            const match = content.match(/@tag\s+['"]([^'"]+)['"]/);
            return match ? match[1] : null;
        } catch { return null; }
    }

    private _scanDir(dir: string, rootDir: string, depth = 0): void {
        if (depth > 5) return;
        try {
            const entries = readdirSync(dir);
            for (const entry of entries) {
                if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
                const fullPath = join(dir, entry);
                try {
                    const stat = statSync(fullPath);
                    if (stat.isDirectory()) {
                        this._scanDir(fullPath, rootDir, depth + 1);
                    } else if (entry.endsWith('.pdx') && !entry.endsWith('.pdx.ts')) {
                        const baseName = entry.replace(/\.pdx$/, '');
                        // Skip special files (_layout, _error)
                        if (baseName.startsWith('_')) continue;
                        // Check for @tag override in script
                        const tag = this._detectTag(fullPath) ?? deriveTag(normalizePath(fullPath));
                        // Don't overwrite @pdxui/ui entries — library takes precedence
                        if (this.map.has(tag)) {
                            const existing = this.map.get(tag)!;
                            if (existing.source === 'ui') continue;
                            // The SAME file, seen again: a rescan, not a collision. Without this the
                            // second scan would announce `"pdx-x" is taken by src/x.pdx, so src/x.pdx is
                            // not auto-importable` — nonsense, and one such line per component every
                            // time a new file appears.
                            if (existing.importPath === normalizePath(fullPath)) continue;
                            // Project collision: report but don't overwrite (first wins)
                            this._reportCollision(tag, existing.importPath, normalizePath(fullPath));
                            continue;
                        }
                        this.map.set(tag, {
                            tag,
                            importPath: normalizePath(fullPath),
                            source: 'project',
                        });
                    }
                } catch { /* skip unreadable */ }
            }
        } catch { /* skip unreadable dir */ }
    }
}

function normalizePath(p: string): string {
    return p.replace(/\\/g, '/');
}

/**
 * Whether `importPath` already appears as an exact quoted module specifier in the
 * existing import block. Exact (quote-delimited) so a longer path that merely
 * contains a shorter one (e.g. '@pdxui/ui/button-group' vs '.../button')
 * does NOT count as a match.
 */
function isAlreadyImported(existingImports: string, importPath: string): boolean {
    const esc = importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const quoted = new RegExp(`['"\`]${esc}['"\`]`);
    // A STATIC import DECLARATION only. A dynamic `import('@pdxui/ui/chart')` — which a
    // `@defer` block emits for what it renders — names the same path and is not the same
    // thing: counting it would suppress the static import a component rendered OUTSIDE the defer
    // still needs, and that component would never be registered.
    return existingImports.split('\n').some((line) => {
        const trimmed = line.trimStart();
        if (!trimmed.startsWith('import')) return false;
        // `import x`, `import '…'`, `import{…}` — but not `import(`.
        if (trimmed.startsWith('import(')) return false;
        return quoted.test(line);
    });
}

// ─── Manifest-driven resolution helpers ──────────────────────────────────────

interface ManifestMember { kind?: string; name: string; readonly?: boolean; type?: { text?: string } }
interface ManifestDeclaration { tagName?: string; members?: ManifestMember[] }
interface ManifestModule { path?: string; declarations?: ManifestDeclaration[] }

/** Collect every string leaf (file target) of a package.json `exports` entry. */
function exportTargets(def: unknown): string[] {
    if (typeof def === 'string') return [def];
    if (def && typeof def === 'object') {
        return Object.values(def as Record<string, unknown>).flatMap(exportTargets);
    }
    return [];
}

/** Normalise an export target / manifest module path → `dir/file` (drop ./, leading src|dist, ext). */
function normalizeModulePath(p: string): string {
    return p
        .replace(/^\.?\//, '')
        .replace(/^(src|dist)\//, '')
        .replace(/\.(d\.ts|ts|js|mjs|cjs)$/, '');
}

/**
 * Parse a string-literal union type (`'a' | 'b' | 'c'`) into its values, or null when the text is
 * not a closed union of string literals (e.g. `String`, `string | number`, `'a' | string`).
 */
function parseEnumUnion(typeText?: string): string[] | null {
    if (!typeText || !typeText.includes('|')) return null;
    const parts = typeText.split('|').map(s => s.trim());
    if (parts.length < 2) return null;
    const vals: string[] = [];
    for (const part of parts) {
        const m = part.match(/^['"]([^'"]*)['"]$/);
        if (!m) return null;
        vals.push(m[1]);
    }
    return vals;
}
