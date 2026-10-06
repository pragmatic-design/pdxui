// The names a script imports from @pdxui/core that exist at runtime.
//
// The compiler writes the module's one `import { … } from '@pdxui/core'` itself, and merges the
// script's own core imports into it. A type has no runtime export: merged in, `DataSource` would become a
// value import that the browser refuses. Types are left to the type eraser.

/**
 * The runtime names of a one-line core import: none for `import type { … }`, and every name but the
 * `type X` ones for `import { a, type X }`.
 */
export function coreRuntimeNames(flatImport: string): string[] {
    // Match: `import type {` — the whole statement imports types only.
    if (/^import\s+type\s*\{/.test(flatImport.trim())) return [];
    const match = flatImport.match(/\{([^}]+)\}/);
    if (!match) return [];
    return match[1].split(',').map(n => n.trim()).filter(n => n && !/^type\s/.test(n));
}
