// custom-elements.json must still be what the sources say.
//
// The manifest is COMMITTED, not built on demand: the compiler's auto-import, the LSP's index, the
// site's llms.txt and the behaviour helpers all read the file in the repo. So a manifest that lags
// behind the sources is what every one of those consumes: a stale prop default, a missing event,
// events in the wrong order.
//
// The other tests cannot catch it: auto-import.test.ts, server.test.ts and component-resolver.test.ts
// all READ the manifest and check its shape, so they agree with whatever is committed. Without this
// test the manifest is its own oracle.
//
// This is cheap enough to live in the default run: regenerating in memory is the same work the
// generator does, about a second, and needs no build step — `buildManifest()` has no side effects
// and the script's file I/O is behind a main().

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error — plain .mjs build script, no type declarations by design
import { buildManifest, MANIFEST_PATH } from '../../scripts/gen-manifest.mjs';

const fresh = buildManifest().manifest;
const committed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));

/** tagName → module, for a difference report that names components instead of array indices. */
function byTag(manifest: { modules: { declarations: { tagName: string }[] }[] }) {
    return new Map(manifest.modules.map((m) => [m.declarations[0].tagName, m]));
}

describe('the committed manifest is what the sources produce', () => {
    it('regenerated something to compare against', () => {
        // The control. `toEqual` between two empty manifests passes, and a generator that silently
        // found no components would satisfy every assertion below by producing nothing.
        expect(fresh.modules.length).toBeGreaterThan(100);
        expect(committed.modules.length).toBeGreaterThan(100);
    });

    it('covers the same components', () => {
        // Split from the deep comparison so an added or deleted component reads as that, rather
        // than as a wall of diff.
        const a = [...byTag(fresh).keys()].sort();
        const b = [...byTag(committed).keys()].sort();
        expect(b, 'run `node scripts/gen-manifest.mjs` and commit the result').toEqual(a);
    });

    it('agrees component by component', () => {
        const freshByTag = byTag(fresh);
        const committedByTag = byTag(committed);
        const drifted = [...freshByTag.keys()].filter(
            (tag) => JSON.stringify(freshByTag.get(tag)) !== JSON.stringify(committedByTag.get(tag)),
        );

        expect(
            drifted,
            'these components no longer match their sources — run `node scripts/gen-manifest.mjs` '
            + 'and commit the result. The manifest is read by the compiler auto-import, the LSP, '
            + 'the site llms.txt and the behaviour helpers, so a stale entry is what they all see.',
        ).toEqual([]);
    });

    it('agrees on the envelope too', () => {
        // schemaVersion and readme sit outside `modules`, so the per-component check above cannot
        // see them change.
        expect({ schemaVersion: committed.schemaVersion, readme: committed.readme })
            .toEqual({ schemaVersion: fresh.schemaVersion, readme: fresh.readme });
    });
});
