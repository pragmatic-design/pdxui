// Vite plugin: `virtual:pdx-component-manifests` — the Custom Elements Manifest of every component
// package the site depends on, read at build time.
//
// Not just `@pdxui/ui/manifest`: `<pdx-router-outlet>` and `<pdx-link>`, which the compiler and the
// editor know, need a page too. The list comes from the compiler's discovery over the site's
// package.json, the same reading an app's dependencies get.

import type { Plugin } from 'vite';
import { readFileSync } from 'fs';
import { discoverComponentPackages } from '../../../compiler/src/discover-component-packages.mjs';

const ID = 'virtual:pdx-component-manifests';
const RESOLVED = '\0' + ID;

/** One component package: its name and its manifest, as read. */
export interface PackageManifest { package: string; manifest: unknown }

export function componentManifestsPlugin(): Plugin {
    let root = process.cwd();
    return {
        name: 'pdx-component-manifests',
        configResolved(config) { root = config.root; },
        resolveId(id) { return id === ID ? RESOLVED : null; },
        load(id) {
            if (id !== RESOLVED) return null;
            const list: PackageManifest[] = discoverComponentPackages(root, root).map(p => {
                // A manifest edited in dev reloads the pages that read it.
                this.addWatchFile(p.manifest);
                return { package: p.name, manifest: JSON.parse(readFileSync(p.manifest, 'utf-8')) };
            });
            return `export default ${JSON.stringify(list)};`;
        },
    };
}
