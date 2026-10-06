// Origins of template code: where in the .pdx a binding, a handler, an interpolation or
// a block was written, for the origin marks the source map is built from. Shared by the
// template path and the inline path, so the two cannot disagree about where a node is.

import type { CompileContext } from './compile-context';
import type { HtmlNode } from '../parser/template';
import { originMark } from './sourcemap';

/** The mark for an offset into the template content, or '' when this compile builds no map. */
export function templateMark(ctx: CompileContext, offset: number | undefined): string {
    return ctx.templateOrigin == null || offset == null ? '' : originMark(ctx.templateOrigin + offset);
}

/**
 * For an html node: the .pdx offset of the character at index `k` of its content, or null when the
 * node has no position (one the compiler made itself) or the compile builds no map. An `@@` escape
 * left one `@` for two characters of source, so past it the source is one character further on.
 */
export function htmlOriginOf(ctx: CompileContext, node: HtmlNode): ((k: number) => number | null) | null {
    const base = ctx.templateOrigin;
    const start = node.loc?.offset;
    if (base == null || start == null) return null;
    const shifts = node.shifts ?? [];
    return (k: number) => base + start + k + shifts.filter((s) => s <= k).length;
}

/**
 * The origin of each attribute of one tag, by its name as written (`@click`, `:value`, `::checked`,
 * `ref`): an attribute appears once in a tag. `at(i)` is the origin of index `i` of `tag`.
 */
export function attributeOrigins(tag: string, at: (i: number) => number | null): Map<string, number> {
    const origins = new Map<string, number>();
    // Match: an attribute name after a blank — bound (`:x`, `::x`, `@x`) or plain. Groups: [1]=name
    for (const m of tag.matchAll(/\s((?:::|:|@)?[\w.:-]+)(?=\s*=|[\s/>])/g)) {
        const origin = at((m.index ?? 0) + m[0].length - m[1].length);
        if (origin != null && !origins.has(m[1])) origins.set(m[1], origin);
    }
    return origins;
}
