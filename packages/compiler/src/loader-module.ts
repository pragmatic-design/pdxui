// A page's `@loader` in a module of its own (#119).
//
// The route table reached a loader through its page: the bridge imported the page module, then
// called the loader it registered, so a navigation downloaded the page's chunk before its data could
// start — one round trip for the code, then one for the data. A loader is already hoisted to module
// level and cannot read the component's setup (`hoistLoader`), so it can live apart: this module
// holds its declaration, the script imports it reads, and a default export. The table imports it
// beside the page chunk, and the router starts both at once.
//
// A loader that reads a name its script declares beside it — a constant, a helper, a rune — cannot
// be moved without that name. Its module exports null, and the bridge imports the page as before.
// The check is by name and errs towards declining: a name that only appears in a string or a comment
// keeps the loader with its page, which is the old behaviour, never a broken module.

import { dirname, posix } from 'path';
import { parseSFC } from './parser/sfc';
import { analyzeScript } from './compiler/script-analyzer';
import { hoistLoader } from './compiler/codegen-shared';
import { importedLocalNames } from './compiler/import-names';
import { eraseTypes } from './compiler/erase-types';
import { escapeForRegExp } from './compiler/regexp-escape';

/** The module id prefix; the rest of the id is the page's tag. */
export const LOADER_MODULE_PREFIX = 'virtual:pdx-loader/';

/** The id of the loader module of the page registered as `tag`. */
export function loaderModuleId(tag: string): string {
    return LOADER_MODULE_PREFIX + tag;
}

// Match: `function name(` / `const name =` / `class Name` / `@prop name:` and the other runes that
// declare a name. Groups: [1]=the declared name
const DECLARED = /(?:\bfunction\s*\*?\s*|\b(?:const|let|var|class|interface|type|enum)\s+|@(?:prop|fetch|form|store|event|state|part|provide|inject)\s+)([A-Za-z_$][\w$]*)/g;
// Match: `const { a, b: c } =` / `let [x, y] =` — a destructuring declaration. Groups: [1]=its pattern
const DESTRUCTURED = /\b(?:const|let|var)\s*([{[][^=]*[}\]])\s*=/g;

/** Whether `code` mentions `name` as a whole identifier, not as a property after a dot. */
function mentions(code: string, name: string): boolean {
    return new RegExp(`(?<![\\w$.])${escapeForRegExp(name)}(?![\\w$])`).test(code);
}

/** The names the rest of the script declares: what the loader would lose if it moved alone. */
function declaredBeside(rest: string): Set<string> {
    const names = new Set<string>();
    for (const m of rest.matchAll(DECLARED)) names.add(m[1]);
    for (const m of rest.matchAll(DESTRUCTURED)) {
        for (const id of m[1].matchAll(/[A-Za-z_$][\w$]*/g)) names.add(id[0]);
    }
    return names;
}

/**
 * The module of the loader `name` declared in the `.pdx` `source`: its imports, its declaration and
 * `export default name`, with the script's TypeScript erased; or a module exporting null when the
 * loader cannot stand alone, or the script declares no such function.
 */
export function generateLoaderModule(source: string, filename: string, name: string): string {
    const none = `// @loader ${name} stays with its page: it is not declared, or it reads a name declared beside it.\nexport default null;\n`;
    const script = parseSFC(source).script;
    if (!script) return none;
    const hoisted = hoistLoader(script.content, name);
    if (!hoisted) return none;
    const declaration = hoisted.declaration;
    for (const other of declaredBeside(hoisted.body)) {
        if (mentions(declaration, other)) return none;
    }

    const analysis = analyzeScript(script.content, filename);
    const reads = (local: string) => mentions(declaration, local);
    const imports = analysis.userImports.filter(stmt => importedLocalNames(stmt).some(reads));
    const core = analysis.coreImportNames.filter(reads);

    // A relative specifier is the page's: from a virtual module it would resolve against the id, which
    // has no folder. It is written as the file it names.
    const dir = dirname(filename).replace(/\\/g, '/');
    const anchored = (stmt: string) => stmt.replace(/(\bfrom\s+|^import\s+)(['"])(\.\.?\/[^'"]*)\2/,
        (_m, lead: string, q: string, spec: string) => `${lead}${q}${posix.join(dir, spec)}${q}`);

    let code = '';
    if (core.length > 0) code += `import { ${[...new Set(core)].join(', ')} } from '@pdxui/core';\n`;
    for (const stmt of imports) code += anchored(stmt) + '\n';
    code += declaration + '\n';
    code += `export default ${name};\n`;
    return script.lang === 'js' ? code : eraseTypes(code, filename);
}
