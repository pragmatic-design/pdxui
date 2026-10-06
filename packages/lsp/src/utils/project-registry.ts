// Project Registry — what a document's PROJECT knows: its component packages' manifests, and its
// own .pdx components, through the compiler's resolver.
//
// Resolved per document, from the project the file belongs to, never from the editor's folder:
// a folder opened on one app of a monorepo, an app in `apps/web/` below the folder, two apps on
// different library versions — each document sees the components its own project resolves, which
// are the ones its build will import. Cached per project root; a rescan clears the cache.

import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { ComponentResolver } from '@pdxui/compiler';
import { loadManifest, type ManifestComponent } from './manifest-index';
import type { ComponentEntry } from './project-scanner';
import { describeProjectComponent } from './project-components';

export interface ProjectRegistry {
    /** The project root: the nearest folder with a package.json or a vite.config. */
    root: string;
    /** The compiler's resolver over the project: component packages, then src/ and pages/. */
    resolver: ComponentResolver;
    /** tag → its manifest entry, from every component package. */
    manifest: Map<string, ManifestComponent>;
    /** The project's own .pdx components — the resolver's, so the build and the editor agree. */
    components: ComponentEntry[];
    /**
     * A tag's props, events and slots: its manifest entry for a library component, its analysed
     * .pdx for a project one. Undefined for a tag the project does not know.
     */
    describe(tag: string): ManifestComponent | undefined;
}

/** What marks a project root: where its package.json is, or where Vite runs from. */
const ROOT_MARKERS = ['package.json', 'vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.mts'];

/**
 * The project a file belongs to: the nearest folder above it that holds a package.json or a
 * vite.config — the root the build resolves components from. `fallback` (the editor's folder) when
 * no folder above has either.
 */
export function projectRootOf(filePath: string, fallback: string): string {
    let dir = dirname(filePath);
    for (;;) {
        if (ROOT_MARKERS.some(m => existsSync(join(dir, m)))) return dir;
        const parent = dirname(dir);
        if (parent === dir) return fallback;
        dir = parent;
    }
}

/** Build the registry of the project at `root`. */
export function buildRegistry(root: string): ProjectRegistry {
    const resolver = new ComponentResolver();
    if (!resolver.registerUiManifest(root)) resolver.registerUiPackage(root);
    resolver.registerProjectComponents(root);
    const components: ComponentEntry[] = [];
    for (const tag of resolver.tags) {
        const entry = resolver.resolve(tag);
        if (entry?.source === 'project') components.push({ tag, filePath: entry.importPath });
    }
    const manifest = loadManifest(root);
    // Project components are analysed on first use, not at build: most are never hovered.
    const described = new Map<string, ManifestComponent | null>();
    const describe = (tag: string): ManifestComponent | undefined => {
        const fromManifest = manifest.get(tag);
        if (fromManifest) return fromManifest;
        if (!described.has(tag)) {
            const entry = components.find(c => c.tag === tag);
            described.set(tag, entry ? describeProjectComponent(tag, entry.filePath) : null);
        }
        return described.get(tag) ?? undefined;
    };
    return { root, resolver, manifest, components, describe };
}

/** Registries by project root, built on first use. */
export class ProjectRegistries {
    private byRoot = new Map<string, ProjectRegistry>();

    /** The registry of the project `filePath` belongs to. */
    forFile(filePath: string, fallback: string): ProjectRegistry {
        return this.forRoot(projectRootOf(filePath, fallback));
    }

    /** The registry of the project at `root`. */
    forRoot(root: string): ProjectRegistry {
        let reg = this.byRoot.get(root);
        if (!reg) {
            reg = buildRegistry(root);
            this.byRoot.set(root, reg);
        }
        return reg;
    }

    /** Forget every registry: the next request rebuilds from disk. */
    clear(): void {
        this.byRoot.clear();
    }
}
