// Types of discover-component-packages.mjs — the plain-JS implementation the compiler and the
// generators share. `component-packages.ts` names them for the compiler's API.

/** The fields of a package.json the discovery reads. */
export interface PackageJson {
    name?: string;
    customElements?: unknown;
    exports?: Record<string, unknown> | string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}

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

/**
 * The component packages `root` depends on; when it declares none (or there is no root), the
 * monorepo's `packages/*` found above `from`.
 */
export function discoverComponentPackages(root: string | undefined, from: string): ComponentPackage[];
