// The names a page's `@params` and `@search` blocks declare, with the types the compiler gives them.
//
// Read with the compiler's own parsers, so the editor and the build cannot disagree about a field.

import { parseRouteParams, parseSearchParams } from '@pdxui/compiler';

/** The `{ … }` of a `@params` / `@search` declaration, or null when it has none. */
function objectOf(decl: string): string | null {
    const open = decl.indexOf('{');
    const close = decl.lastIndexOf('}');
    return open >= 0 && close > open ? decl.slice(open, close + 1) : null;
}

/**
 * Name → type for one declaration.
 * - `@params`: each param under its own name (#185) — `number`, `boolean`, or the string any other
 *   type is. A name alone takes its type from `pattern`, the page's path (#564).
 * - `@search`: `searchParams`, the object of the typed query (#204) — a number and a boolean field are
 *   always there, a string field without a default is null when absent.
 */
export function routeNameTypes(kw: 'params' | 'search', decl: string, pattern = ''): Map<string, string> {
    const names = new Map<string, string>();
    const block = objectOf(decl);
    if (!block) return names;
    if (kw === 'params') {
        for (const p of parseRouteParams(block, pattern)) {
            names.set(p.name, p.type === 'number' || p.type === 'boolean' ? p.type : 'string');
        }
        return names;
    }
    const fields = parseSearchParams(block).map((p) => {
        const type = p.type === 'number' || p.type === 'boolean' ? p.type
            : p.optional && p.default === undefined ? 'string | null' : 'string';
        return `${p.name}: ${type}`;
    });
    if (fields.length > 0) names.set('searchParams', `{ ${fields.join('; ')} }`);
    return names;
}
