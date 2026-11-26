// The names a script imports from @pdxui/core that exist at runtime.
//
// The compiler writes the module's one `import { … } from '@pdxui/core'` itself, and merges the
// script's own core imports into it. A type has no runtime export: merged in, `DataSource` would become a
// value import that the browser refuses. Types are left to the type eraser.

/**
 * The specifiers of the module's core import, sorted and joined, once each name it binds is bound once
 * (#1254). The script's own core imports are merged into `imports` with the names the compiler binds;
 * one that aliases another export to such a name — `component as defineComponent` beside the
 * `defineComponent` the module calls — would declare that name twice, and the module would not parse.
 * That is a compile error naming the alias. A script import of the same export the compiler binds
 * (`signal` beside a `$signal`) is the same specifier, and stays merged. The compiler adds no aliased
 * specifier of its own, so an `x as y` in `imports` is the script's.
 */
export function coreImportSpecifiers(imports: ReadonlySet<string>, filename: string): string {
    for (const spec of imports) {
        // Match: `exported as local`. Groups: [1]=the export [2]=the local name it is bound to
        const aliased = /^([\w$]+)\s+as\s+([\w$]+)$/.exec(spec);
        if (!aliased || aliased[1] === aliased[2] || !imports.has(aliased[2])) continue;
        const code = 'PDX_IMPORT_NAME_TAKEN';
        throw new Error(`[${code}] ${filename} — \`import { ${spec} } from '@pdxui/core'\` binds \`${aliased[2]}\` to core's `
            + `\`${aliased[1]}\`, and the module the compiler writes binds \`${aliased[2]}\` to core's \`${aliased[2]}\`: `
            + 'the name would be declared twice, and the module would not parse.\n'
            + `  Hint: choose another alias, e.g. \`import { ${aliased[1]} as ${aliased[1]}Fn } from '@pdxui/core'\`.`);
    }
    return Array.from(imports).sort().join(', ');
}

/**
 * The runtime names of a one-line core import: none for `import type { … }`, and every name but the
 * `type X` ones for `import { a, type X }`.
 */
export function coreRuntimeNames(flatImport: string): string[] {
    // Match: `import type {` — the whole statement imports types only.
    if (/^import\s+type\s*\{/.test(flatImport.trim())) return [];
    // The first `{…}` with something inside, as `\{([^}]+)\}` found it — scanned, not matched: that
    // pattern took quadratic time on `{{|` repeated (#70).
    let names: string | null = null;
    for (let open = flatImport.indexOf('{'); open !== -1; open = flatImport.indexOf('{', open + 1)) {
        const close = flatImport.indexOf('}', open + 1);
        if (close === -1) break;
        if (close > open + 1) { names = flatImport.slice(open + 1, close); break; }
    }
    if (names === null) return [];
    return names.split(',').map(n => n.trim()).filter(n => n && !/^type\s/.test(n));
}
