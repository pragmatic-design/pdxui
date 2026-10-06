// A component that ships but cannot be auto-imported is a component the compiler cannot see.
//
// `<pdx-page-header>` in a .pdx file registered nothing, silently: the module was in
// custom-elements.json with a real `tagName`, and in no `exports` entry. The rule that decides is
// `packages/compiler/src/component-resolver.ts:69-113` — a manifest module whose file no export
// target points at is skipped with `if (!name) continue`.
//
// Two generators produced the two halves and neither looked at the other: `gen-manifest.mjs`
// discovers components by walking src/, `gen-exports.mjs` only REWROTE entries that were already
// there. Nothing compared their outputs, so a component could exist in one and not the other for
// as long as nobody typed its tag in a file the barrel did not already load.
//
// This is the cross-check, reimplementing the resolver's rule in one assertion so the two
// generators can no longer drift apart in silence.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const UI = join(__dirname, '..', '..');

interface ManifestModule {
    path?: string;
    declarations?: { tagName?: string }[];
}

/** The resolver's own normalisation: drop ./, a leading src|dist, and the extension. */
function normalizeModulePath(p: string): string {
    return p
        .replace(/^\.?\//, '')
        .replace(/^(src|dist)\//, '')
        .replace(/\.(d\.ts|ts|js|mjs|cjs)$/, '');
}

/** Every string leaf of an exports entry, whether it is a bare string or a condition object. */
function exportTargets(def: unknown): string[] {
    if (typeof def === 'string') return [def];
    if (def && typeof def === 'object') {
        return Object.values(def as Record<string, unknown>).flatMap(exportTargets);
    }
    return [];
}

const pkg = JSON.parse(readFileSync(join(UI, 'package.json'), 'utf-8')) as {
    exports: Record<string, unknown>;
};
const manifest = JSON.parse(readFileSync(join(UI, 'custom-elements.json'), 'utf-8')) as {
    modules?: ManifestModule[];
};

const covered = new Set<string>();
for (const [subpath, def] of Object.entries(pkg.exports)) {
    if (subpath === '.' || subpath === './package.json' || subpath === './manifest') continue;
    for (const target of exportTargets(def)) covered.add(normalizeModulePath(target));
}

const tagged = (manifest.modules ?? []).filter(m => m.path && m.declarations?.[0]?.tagName);

describe('every shipped component is auto-importable', () => {
    it('reads a manifest with components in it', () => {
        // Without this, an empty or unparsed manifest would make the assertion below pass by
        // checking nothing — the exclusion that is invisible in its own result.
        expect(tagged.length).toBeGreaterThan(100);
    });

    it('has an exports entry pointing at every module that declares a tagName', () => {
        const orphans = tagged
            .filter(m => !covered.has(normalizeModulePath(m.path!)))
            .map(m => `${m.declarations![0].tagName!}  (${m.path})`);
        expect(
            orphans,
            'these declare a custom element but no exports target points at their file, so the compiler cannot auto-import them',
        ).toEqual([]);
    });
});
