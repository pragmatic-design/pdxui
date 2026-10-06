// Component packages — the dependencies that ship custom elements.
//
// A package is a component source when its package.json has a `customElements` field naming its
// Custom Elements Manifest, which is the field the community manifest tooling reads. The resolver,
// the language server, the skills catalogue and the site all take the list from here, so a package
// that declares the field is known to every one of them with nothing else to wire.
//
// The implementation is `discover-component-packages.mjs`, plain JavaScript so the generators that
// run under Node can import it too. This module gives it the compiler's types and the
// directory to look from: the compiler's own, in either shipped build.

import { discoverComponentPackages } from './discover-component-packages.mjs';
import { moduleDir } from './module-dir';

/** A dependency that declares `customElements`. */
export interface ComponentPackage {
    /** Its package name, which is also the base of its import paths (`@pdxui/ui`). */
    name: string;
    /** Its directory. */
    dir: string;
    /** Its package.json, read. */
    pkg: PackageJson;
    /** The absolute path of its Custom Elements Manifest. */
    manifest: string;
}

/** The fields of a package.json this module reads. */
export interface PackageJson {
    name?: string;
    customElements?: unknown;
    exports?: Record<string, unknown> | string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}

/**
 * The component packages a project depends on, in the order its package.json lists them.
 *
 * Read from `<root>/package.json`: the project itself when it declares `customElements`, its
 * dependencies and devDependencies, and — one level down — the
 * dependencies of those that are not component packages themselves, so a meta-package
 * (`@pdxui/framework`, which brings `@pdxui/ui` and `@pdxui/router`) counts for what it brings.
 *
 * When that finds nothing — no root, a root with no package.json, or one that declares no component
 * package — the packages beside the compiler in this monorepo are used instead: that is how a
 * package of this repository that is not an app (its tests, a demo folder) sees the library.
 */
export function componentPackages(root?: string): ComponentPackage[] {
    // Typed here, not cast: if the plain-JS shape drifts from this interface, this line stops compiling.
    const found: ComponentPackage[] = discoverComponentPackages(root, moduleDir());
    return found;
}
