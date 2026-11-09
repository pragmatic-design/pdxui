// A page's `@loader` in a module of its own (#119).
//
// The route table reached a loader through its page: the bridge imported the page module, then
// called the loader it registered, so a navigation downloaded the page's chunk before its data could
// start — one round trip for the code, then one for the data. A loader is already hoisted to module
// level and cannot read the component's setup (`hoistLoader`), so it can live apart: this module
// holds its declaration, the script imports it reads, and a default export. The table imports it
// beside the page chunk, and the router starts both at once.
//
// What the hoisted loader can reach in its page is what this module has to hold: the page module's own
// scope, which is the script's imports and the other function `hoistLoader` lifts there, `@page`'s
// `label`. Everything else the script declares — a constant, a helper, a rune — lives in the
// component's setup, out of the hoisted loader's reach in the page as much as here (#974). So the one
// name that keeps a loader with its page is the label function: read, it is in the page and not here,
// and this module exports null for the bridge to import the page as before. The check is by name on
// the loader's code with its types erased, and errs towards declining: the label's name in a string
// or a comment keeps the loader with its page, which is the old behaviour, never a broken module.

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

/** Whether `code` mentions `name` as a whole identifier, not as a property after a dot. */
function mentions(code: string, name: string): boolean {
    return new RegExp(`(?<![\\w$.])${escapeForRegExp(name)}(?![\\w$])`).test(code);
}

/**
 * The module of the loader `name` declared in the `.pdx` `source`: its imports, its declaration and
 * `export default name`, with the script's TypeScript erased; or a module exporting null when the
 * loader cannot stand alone, or the script declares no such function.
 */
export function generateLoaderModule(source: string, filename: string, name: string): string {
    const none = `// @loader ${name} stays with its page: it is not declared, or it reads @page's label function.\nexport default null;\n`;
    const script = parseSFC(source).script;
    if (!script) return none;
    const hoisted = hoistLoader(script.content, name);
    if (!hoisted) return none;
    const declaration = hoisted.declaration;
    // What the loader READS is its code without its types: a name in an annotation is not a read (#974).
    const runtime = script.lang === 'js' ? declaration : eraseTypes(declaration, filename);
    const reads = (local: string) => mentions(runtime, local);

    const analysis = analyzeScript(script.content, filename);
    const label = analysis.route.labelFn;
    if (label && label !== name && reads(label)) return none;
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
