// Manifest Index — loads the Custom Elements Manifests of the project's component packages
// (@pdxui/ui, @pdxui/router, any dependency that declares `customElements`) to expose, for every
// tag, its attributes/events/slots with
// their type, default and description. It feeds completion, hover and go-to-definition
// for the library's components, which are .ts and not .pdx, and so invisible to the
// .pdx scanner and to the analyzer.

import { readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { componentPackages } from '@pdxui/compiler';

export interface ManifestMember {
    name: string;
    /** The type's text ("'sm' | 'md' | 'lg'", for one). */
    type: string;
    default?: string;
    description: string;
}

export interface ManifestSlot { name: string; description: string; }

export interface ManifestComponent {
    tag: string;
    description: string;
    /** Absolute path of the component's source (.ts). */
    filePath: string;
    attributes: ManifestMember[];
    events: ManifestMember[];
    slots: ManifestSlot[];
}

interface RawMember { name?: string; type?: { text?: string }; default?: string; description?: string; }

function mapMember(m: RawMember): ManifestMember {
    return { name: m.name ?? '', type: m.type?.text ?? '', default: m.default, description: m.description ?? '' };
}

/**
 * Builds tag → ManifestComponent from the manifests of the project's component packages — every
 * dependency of the project at `rootDir` that declares `customElements`, as the compiler finds them
 * — not a fixed path under the editor's folder: a folder that is not the repository root, or an
 * app below it, would find no manifest at all.
 */
export function loadManifest(rootDir: string): Map<string, ManifestComponent> {
    const index = new Map<string, ManifestComponent>();
    for (const pkg of componentPackages(rootDir || undefined)) {
        for (const [tag, comp] of readManifest(pkg.manifest)) {
            if (!index.has(tag)) index.set(tag, comp);
        }
    }
    return index;
}

/** One Custom Elements Manifest → tag → ManifestComponent. */
function readManifest(manifestPath: string): Map<string, ManifestComponent> {
    const index = new Map<string, ManifestComponent>();
    if (!existsSync(manifestPath)) return index;

    let json: { modules?: Array<{ path?: string; declarations?: Array<Record<string, unknown>> }> };
    try { json = JSON.parse(readFileSync(manifestPath, 'utf-8')); } catch { return index; }

    const baseDir = dirname(manifestPath);
    for (const mod of json.modules ?? []) {
        for (const d of mod.declarations ?? []) {
            const decl = d as {
                customElement?: boolean; tagName?: string; description?: string;
                attributes?: RawMember[]; events?: RawMember[]; slots?: Array<{ name?: string; description?: string }>;
            };
            if (!decl.customElement || !decl.tagName) continue;
            index.set(decl.tagName, {
                tag: decl.tagName,
                description: decl.description ?? '',
                filePath: mod.path ? resolve(baseDir, mod.path) : manifestPath,
                attributes: (decl.attributes ?? []).map(mapMember),
                events: (decl.events ?? []).map(mapMember),
                slots: (decl.slots ?? []).map(s => ({ name: s.name ?? '', description: s.description ?? '' })),
            });
        }
    }
    return index;
}

/** Extracts the values of a string-literal union type ("'a' | 'b'") → ['a','b']. */
export function enumValues(typeText: string): string[] {
    const m = typeText.match(/'[^']*'/g);
    if (!m) return [];
    return m.map(s => s.slice(1, -1));
}
