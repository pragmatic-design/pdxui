// `@host { role="combobox" :aria-expanded="open" @keydown="onKey" }` (#133): the attributes of the
// component's own element, written with the attribute grammar of an element in the template.

import type { HostAttr } from './script-analyzer-types';

// Match: one attribute — a name (`role`, `:aria-expanded`, `@keydown.enter`, `::value`, `data-part`,
// `T`) and an optional quoted value. Names take `-`, `:` and `.`, as in the template's tags.
// Groups: [1]=name  [2]/[3]=the value, double- or single-quoted
const ATTRIBUTE = /(::[\w.:-]+|:[\w.:-]+|@[\w.:-]+|[\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;

/**
 * The attributes of a `@host` block, in order. `block` is the declaration as written, from `@host`
 * to its closing brace; what lies between the braces is read as the inside of an opening tag.
 */
export function parseHostBlock(block: string): HostAttr[] {
    const open = block.indexOf('{');
    const close = block.lastIndexOf('}');
    if (open === -1 || close <= open) return [];
    const inner = block.slice(open + 1, close);
    const attrs: HostAttr[] = [];
    for (const m of inner.matchAll(ATTRIBUTE)) {
        const value = m[2] ?? m[3];
        attrs.push(value === undefined ? { name: m[1] } : { name: m[1], value });
    }
    return attrs;
}

/**
 * Why a host attribute has no meaning on a host, or null when it has one — decision 21 of the beta
 * specification: a two-way binding, a part marker, a generic argument.
 */
export function invalidHostAttribute(name: string): string | null {
    if (name.startsWith('::')) {
        return `'${name}' on @host: a host has no two-way binding — declare @model ${name.slice(2).split('.')[0]} for the parent's ${name}.`;
    }
    if (name === 'data-part') return `'data-part' on @host: the host is not a part of itself.`;
    // A generic argument is `T="User"`: a type parameter's name, which an HTML attribute never is.
    if (/^[A-Z]\w*$/.test(name)) return `'${name}' on @host: a generic argument — generics are declared with @generic.`;
    return null;
}
