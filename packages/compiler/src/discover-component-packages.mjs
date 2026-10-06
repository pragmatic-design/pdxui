// Component packages — the dependencies that ship custom elements.
//
// Plain JavaScript on purpose: the generators that are not part of a build — the skills catalogue
// (gen-catalog.mjs), llms.txt (gen-llms.mjs) — run under Node and cannot import the compiler's
// TypeScript sources, whose imports are extensionless. This is the one implementation; the
// compiler's `component-packages.ts` re-exports it with its types, and the scripts import it here.
//
// A package is a component source when its package.json has a `customElements` field naming its
// Custom Elements Manifest, which is the field the community manifest tooling reads.

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { createRequire } from 'module';

/**
 * The component packages a project depends on, in the order its package.json lists them.
 *
 * Read from `<root>/package.json`: the project itself when it declares `customElements`, its
 * dependencies and devDependencies, and — one level down — the dependencies of those that are not
 * component packages themselves, so a meta-package (`@pdxui/framework`, which brings `@pdxui/ui` and
 * `@pdxui/router`) counts for what it brings.
 *
 * When that finds nothing — no root, a root with no package.json, or one that declares no component
 * package — the `packages/*` of the monorepo found above `from` are used instead: that is how a
 * package of this repository that is not an app (its tests, a demo folder, a generator) sees the
 * library.
 */
export function discoverComponentPackages(root, from) {
    const declared = root ? fromProject(root) : [];
    return declared.length > 0 ? declared : monorepoPackages(from);
}

function fromProject(root) {
    const projectJson = join(root, 'package.json');
    const project = readJson(projectJson);
    if (!project) return [];
    const found = new Map();
    // A project that IS a component package (a library and its demo pages) knows its own tags.
    const self = asComponentPackage(projectJson);
    if (self) found.set(self.name, self);
    for (const name of dependencyNames(project, true)) {
        const at = resolvePackageJson(name, projectJson);
        if (!at) continue;
        const own = asComponentPackage(at);
        if (own) {
            if (!found.has(own.name)) found.set(own.name, own);
            continue;
        }
        const meta = readJson(at);
        if (!meta) continue;
        for (const inner of dependencyNames(meta, false)) {
            const innerAt = resolvePackageJson(inner, at);
            const brought = innerAt ? asComponentPackage(innerAt) : null;
            if (brought && !found.has(brought.name)) found.set(brought.name, brought);
        }
    }
    return [...found.values()];
}

/** The `packages/*` of the monorepo above `from` that declare `customElements`. */
function monorepoPackages(from) {
    let dir = from;
    for (let i = 0; i < 6 && dir; i++) {
        const packagesDir = join(dir, 'packages');
        if (existsSync(join(packagesDir, 'ui', 'package.json'))) {
            let entries;
            try { entries = readdirSync(packagesDir).sort(); } catch { return []; } // unreadable → no packages
            return entries
                .map(entry => asComponentPackage(join(packagesDir, entry, 'package.json')))
                .filter(p => p !== null);
        }
        dir = dirname(dir);
    }
    return [];
}

function dependencyNames(pkg, withDev) {
    return [
        ...Object.keys(pkg.dependencies ?? {}),
        ...(withDev ? Object.keys(pkg.devDependencies ?? {}) : []),
    ];
}

/**
 * Where `name`'s package.json is, as Node would find it from `from` (a package.json path).
 * Resolution first — it follows pnpm's symlinks; then the node_modules folders up the tree, for a
 * package whose `exports` does not export `./package.json`.
 */
function resolvePackageJson(name, from) {
    try {
        return createRequire(from).resolve(`${name}/package.json`);
    } catch { /* not exported, or not installed — look on disk */ }
    let dir = dirname(from);
    for (let i = 0; i < 8; i++) {
        const candidate = join(dir, 'node_modules', name, 'package.json');
        if (existsSync(candidate)) return candidate;
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return null;
}

/** The package at `packageJson` as a component package, or null when it declares no manifest. */
function asComponentPackage(packageJson) {
    const pkg = readJson(packageJson);
    if (!pkg || typeof pkg.customElements !== 'string' || !pkg.name) return null;
    const dir = dirname(packageJson);
    const manifest = resolve(dir, pkg.customElements);
    if (!existsSync(manifest)) return null;
    return { name: pkg.name, dir, pkg, manifest };
}

function readJson(path) {
    try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}
