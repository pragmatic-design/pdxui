// The project's string context keys, mapped to tokens for `pdx migrate` (#497).
//
// The alpha's `@provide user = …` / `@inject user;` keyed a context by a string. The beta reads it by a
// token the script imports. Every key the migrated .pdx files use gets one: the library's own for the
// library's keys (`errorContext` → `ErrorContext`), the token a `contexts.ts` already declares for that
// key, or a new one, `export const User = context<unknown>('user');`, added to that module. The
// registry's entries then rewrite both sides from the map (packages/compiler/src/language/context-keys.ts).

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { LIBRARY_CONTEXT_TOKENS, contextTokenName, stringContextKeys, type ContextTokenRef } from '@pdxui/compiler';

/** The keys mapped to their tokens, and the module to write: its path and the text it has after the run. */
export interface ContextTokenPlan {
    tokens: Map<string, ContextTokenRef>;
    /** `contexts.ts` when it gains a token, with its new text and how many tokens it gained; else null. */
    module: { path: string; text: string; added: number } | null;
}

// Match: `export const Name = context<…>('key')` in a contexts module. Groups: [1]=name [3]=key
const TOKEN_DECLARATION = /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*context\s*(?:<[^;]*?>)?\s*\(\s*(['"])(.*?)\2/g;
// Match: any exported name of a module, so a new token does not take one. Groups: [1]=the name
const EXPORTED_NAME = /export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
// Match: a value import of `context` from @pdxui/core. Groups: none.
const CONTEXT_IMPORT = /import\s*\{[^}]*\bcontext\b[^}]*\}\s*from\s*['"]@pdxui\/core['"]/;

/** Where the project's tokens go: `src/contexts.ts`, or `contexts.ts` at the root when there is no `src/`. */
function contextsPath(cwd: string): string {
    const src = join(cwd, 'src');
    return join(statSync(src, { throwIfNoEntry: false })?.isDirectory() ? src : cwd, 'contexts.ts');
}

/**
 * Map every string key the .pdx `files` use to a token, and compute the `contexts.ts` that declares
 * the new ones. Keys are taken in file order, then line order: of two keys with one name (`user`,
 * `User`), the second takes a numeric suffix.
 */
export function planContextTokens(files: string[], cwd: string): ContextTokenPlan {
    const keys: string[] = [];
    for (const f of files.filter((p) => p.endsWith('.pdx'))) {
        for (const key of stringContextKeys(readFileSync(f, 'utf-8'))) if (!keys.includes(key)) keys.push(key);
    }
    const tokens = new Map<string, ContextTokenRef>();
    if (keys.length === 0) return { tokens, module: null };

    const path = contextsPath(cwd);
    const moduleId = path.replace(/\\/g, '/').replace(/\.ts$/, '');
    const existing = existsSync(path) ? readFileSync(path, 'utf-8') : null;
    const declared = new Map<string, string>();
    const taken = new Set<string>();
    if (existing) {
        for (const m of existing.matchAll(TOKEN_DECLARATION)) if (!declared.has(m[3])) declared.set(m[3], m[1]);
        for (const m of existing.matchAll(EXPORTED_NAME)) taken.add(m[1]);
    }

    const added: string[] = [];
    for (const key of keys) {
        const library = LIBRARY_CONTEXT_TOKENS.get(key);
        if (library) { tokens.set(key, library); continue; }
        const known = declared.get(key);
        if (known) { tokens.set(key, { name: known, module: moduleId }); continue; }
        const base = contextTokenName(key);
        let name = base;
        for (let n = 2; taken.has(name); n++) name = `${base}${n}`;
        taken.add(name);
        tokens.set(key, { name, module: moduleId });
        added.push(`export const ${name} = context<unknown>(${JSON.stringify(key).replace(/^"|"$/g, "'")});`);
    }
    if (added.length === 0) return { tokens, module: null };

    const block = `// Give each token its value's type: context<User>('user').\n${added.join('\n')}\n`;
    let text: string;
    if (existing === null) {
        text = `import { context } from '@pdxui/core';\n\n${block}`;
    } else {
        const head = CONTEXT_IMPORT.test(existing) ? existing : `import { context } from '@pdxui/core';\n${existing}`;
        text = `${head.endsWith('\n') ? head : `${head}\n`}\n${block}`;
    }
    return { tokens, module: { path, text, added: added.length } };
}

/** Write the plan's module; the path it wrote, relative to `cwd` with `/`, or null. */
export function writeContextModule(plan: ContextTokenPlan, cwd: string): string | null {
    if (!plan.module) return null;
    writeFileSync(plan.module.path, plan.module.text, 'utf-8');
    return relative(cwd, plan.module.path).replace(/\\/g, '/');
}
