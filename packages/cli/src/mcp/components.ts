// The components an agent can ask about: every component package the project depends on, read from
// its Custom Elements Manifest, and the project's own .pdx components, from `analyze`.
//
// The same sources the compiler resolves tags from — `componentPackages` and `ComponentResolver` —
// so the import path an agent is told is the one the build will write.

import { readFileSync } from 'fs';
import { ComponentResolver, componentPackages } from '@pdxui/compiler';
import type { ComponentManifest } from '../manifest/schema';

/** A library component, as its package's manifest declares it. */
export interface PackageComponent {
    tag: string;
    /** The package it ships in: `@pdxui/ui`. */
    package: string;
    /** What the compiler imports for it: `@pdxui/ui/button`. */
    importPath: string | null;
    description: string;
    category?: string;
    attributes: unknown[];
    events: unknown[];
    slots: unknown[];
    /** Methods and fields a ref reaches. */
    members: unknown[];
    cssParts?: unknown[];
    cssProperties?: unknown[];
}

interface RawDeclaration {
    customElement?: boolean;
    tagName?: string;
    description?: string;
    summary?: string;
    category?: string;
    attributes?: unknown[];
    events?: unknown[];
    slots?: unknown[];
    members?: unknown[];
    cssParts?: unknown[];
    cssProperties?: unknown[];
}

/** Every component of every component package the project at `cwd` depends on, by tag. */
export function packageComponents(cwd: string): Map<string, PackageComponent> {
    const resolver = new ComponentResolver();
    resolver.registerComponentPackages(cwd);
    const out = new Map<string, PackageComponent>();
    for (const pkg of componentPackages(cwd)) {
        let manifest: { modules?: { declarations?: RawDeclaration[] }[] };
        try { manifest = JSON.parse(readFileSync(pkg.manifest, 'utf-8')); } catch { continue; } // unreadable → this package adds nothing
        for (const d of (manifest.modules ?? []).flatMap(m => m.declarations ?? [])) {
            if (!d.customElement || !d.tagName || out.has(d.tagName)) continue;
            out.set(d.tagName, {
                tag: d.tagName,
                package: pkg.name,
                importPath: resolver.resolve(d.tagName)?.importPath ?? null,
                description: d.description || d.summary || '',
                ...(d.category ? { category: d.category } : {}),
                attributes: d.attributes ?? [],
                events: d.events ?? [],
                slots: d.slots ?? [],
                members: d.members ?? [],
                ...(d.cssParts?.length ? { cssParts: d.cssParts } : {}),
                ...(d.cssProperties?.length ? { cssProperties: d.cssProperties } : {}),
            });
        }
    }
    return out;
}

/** One line: a description wraps in its JSDoc, and a list entry should not. */
export function oneLine(text: string): string {
    return text.replace(/\s*\n\s*/g, ' ').trim();
}

/** Tags with one-line descriptions — the library's and the project's — that match every word of `query`. */
export function listComponents(packages: Map<string, PackageComponent>, project: ComponentManifest[], query?: string) {
    const all = [
        ...[...packages.values()].map(c => ({ tag: c.tag, description: oneLine(c.description), source: c.package })),
        ...project.map(c => ({ tag: c.tag, description: oneLine(c.metadata?.description ?? ''), source: c.file.replace(/\\/g, '/') })),
    ];
    const words = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    return words.length === 0
        ? all
        : all.filter(c => words.every(w => `${c.tag} ${c.description}`.toLowerCase().includes(w)));
}
