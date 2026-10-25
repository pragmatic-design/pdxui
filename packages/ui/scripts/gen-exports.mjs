// Regenerate package.json "exports" so the package is consumable BOTH in the workspace
// (development → .ts source, HMR) and from a registry/npm install (import → compiled dist).
//
// For every entry whose target is ./src/<path>.ts we emit a conditional export:
//   "./button": {
//     "development": "./src/button/pdx-button.ts",   // workspace dev (Vite adds this condition in serve)
//     "types":       "./dist/button/pdx-button.d.ts",
//     "import":      "./dist/button/pdx-button.js"    // external consumers + workspace prod build
//   }
// "." and "./all" point at the barrel (dist/index.js) which side-effect registers every <pdx-*>.
// "./manifest" and other already-dist entries are left untouched.
//
// It must emit dist/*.js, never src/*.ts, for consumers.
// Run as part of `build` (after gen-manifest, before tsc/vite) so exports always match the dist tree.
//
// It also ADDS what is missing, not only rewrites entries that are already there. With two
// generators keeping two component lists and nothing comparing them, a component in the manifest
// and in no export is skipped by the compiler's auto-resolver, and its tag registers nothing,
// silently. The manifest is the component list; this file is its consumer, and derives the missing
// subpaths from it instead of waiting for someone to notice.

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { pathToFileURL } from 'url';

const PKG = new URL('../package.json', import.meta.url);
const MANIFEST = new URL('../custom-elements.json', import.meta.url);

/** ./src/a/b.ts → { development, types, import } pointing at the mirrored dist file. */
function distConditions(srcPath) {
    const rel = srcPath.replace(/^\.\/src\//, '').replace(/\.ts$/, ''); // a/b
    return {
        development: srcPath,
        types: `./dist/${rel}.d.ts`,
        import: `./dist/${rel}.js`,
    };
}

/** The subpath of the icon modules, and the source pattern it maps to. */
export const ICONS_SUBPATH = './icons/*';
const ICONS_SOURCE = './src/icon/pragmatic/*.ts';

const BARREL = {
    development: './src/index.ts',
    types: './dist/index.d.ts',
    import: './dist/index.js',
};

/** Every string leaf of an exports entry, whether bare string or condition object. */
function exportTargets(def) {
    if (typeof def === 'string') return [def];
    if (def && typeof def === 'object') return Object.values(def).flatMap(exportTargets);
    return [];
}

/**
 * The compiler's own normalisation (component-resolver.ts): drop ./, a leading src|dist, and the
 * extension, so an export target and a manifest module path compare equal.
 */
function normalizeModulePath(p) {
    return p
        .replace(/^\.?\//, '')
        .replace(/^(src|dist)\//, '')
        .replace(/\.(d\.ts|ts|js|mjs|cjs)$/, '');
}

/**
 * Rewrite every src entry to its dist mirror, drop one whose source file is gone (a removed
 * component), then add an entry for any manifest component that no export points at. Pure so it can
 * be tested without writing package.json: `exists` is asked about a `./src/…` path, relative to the
 * package.
 *
 * @returns {{ exports: object, rewritten: number, added: string[], removed: string[], collisions: string[] }}
 */
export function computeExports(currentExports, manifestModules, exists = () => true) {
    let rewritten = 0;
    const out = {};
    const removed = [];
    for (const [key, value] of Object.entries(currentExports)) {
        if (key === './package.json') continue; // re-added last, so it stays at the end
        if (key === '.' || key === './all') { out[key] = BARREL; rewritten++; continue; }
        // Find a ./src/*.ts target in the current entry (string or any condition value).
        const targets = typeof value === 'string' ? [value] : Object.values(value);
        const src = targets.find((t) => typeof t === 'string' && /^\.\/src\/.*\.ts$/.test(t));
        // A source that is gone was removed with its component: the export would resolve to nothing.
        // The icon pattern is a pattern, not a file, and is re-added below.
        if (src && !src.includes('*') && !exists(src)) { removed.push(`${key} ← ${src}`); continue; }
        if (src) { out[key] = distConditions(src); rewritten++; }
        else out[key] = value; // ./manifest and any already-dist entry pass through
    }

    // What the manifest says exists, measured against what the exports map can reach.
    const covered = new Set();
    for (const [key, def] of Object.entries(out)) {
        if (key === '.' || key === './manifest') continue;
        for (const t of exportTargets(def)) covered.add(normalizeModulePath(t));
    }

    const added = [];
    const collisions = [];
    for (const mod of manifestModules) {
        const tag = mod?.declarations?.[0]?.tagName;
        if (!tag || !mod.path) continue;
        if (covered.has(normalizeModulePath(mod.path))) continue;
        // "pdx-page-header" → "./page-header": the subpath is the tag the developer writes, which is
        // also what every existing entry uses (./switch ← pdx-switch, ./sparkline ← pdx-sparkline).
        const key = `./${tag.replace(/^pdx-/, '')}`;
        if (out[key]) {
            collisions.push(`${tag} (${mod.path}) wants "${key}", already taken by ${JSON.stringify(out[key])}`);
            continue;
        }
        out[key] = distConditions(`./${mod.path.replace(/^\.?\//, '')}`);
        covered.add(normalizeModulePath(mod.path));
        added.push(`${key} ← ${mod.path}`);
    }

    // One module per icon of the «pragmatic» set (scripts/gen-icons.mjs), as one pattern: the compiler
    // imports `@pdxui/ui/icons/<name>` for an icon a template names (#47).
    if (!out[ICONS_SUBPATH]) out[ICONS_SUBPATH] = distConditions(ICONS_SOURCE);

    // Expose the manifest so tooling (e.g. the pdx compiler's component auto-resolver) can
    // `require.resolve('@pdxui/ui/package.json')` from a consuming app to read these exports.
    out['./package.json'] = './package.json';

    return { exports: out, rewritten, added, removed, collisions };
}

function main() {
    const pkg = JSON.parse(readFileSync(PKG, 'utf-8'));
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf-8'));
    const exists = (src) => existsSync(new URL(`../${src.replace(/^\.\//, '')}`, import.meta.url));
    const { exports, rewritten, added, removed, collisions } = computeExports(pkg.exports, manifest.modules ?? [], exists);

    if (collisions.length) {
        // Two components cannot share a subpath, and picking one silently would leave the other
        // unresolvable — exactly the failure this script now exists to prevent.
        console.error('[gen-exports] cannot derive a subpath for:' + '\n  ' + collisions.join('\n  '));
        process.exit(1);
    }

    pkg.exports = exports;
    writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`[gen-exports] rewrote ${rewritten}/${Object.keys(exports).length} export entries → dist (development → src).`);
    if (added.length) console.log(`[gen-exports] added ${added.length} missing entry/entries from the manifest:` + '\n  ' + added.join('\n  '));
    if (removed.length) console.log(`[gen-exports] removed ${removed.length} entry/entries whose source is gone:` + '\n  ' + removed.join('\n  '));
}

// Only when run as a script: importing this file (the unit test does) must not rewrite package.json.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
