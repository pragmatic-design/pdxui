// What a `@render name(args)` calls (#489, typed snippets).
//
// A name is one of three things, and the expression that reads it differs:
//   - a typed snippet the script declares with `@slot name: (…)`: a property of the element, which
//     the parent's `@snippet` or a script assigns; core keeps it in a signal, `ctx.name`, so a
//     function assigned after the render renders too;
//   - a template `@snippet` of the script: a function declared in the render, read as it is;
//   - anything else — the alpha `@snippet` whose body is an html`` template — a function the setup
//     returned, `ctx.name`.

import type { CompileContext } from './compile-context';

/** The expression that reads the function `@render name(…)` calls. */
export function snippetSourceOf(name: string, ctx: CompileContext): string {
    if (ctx.slotNames.has(name)) return `ctx.${name}()`;
    if (ctx.scriptSnippets.has(name)) return name;
    return `ctx.${name}`;
}

/**
 * `renderSnippet(() => source, () => [args], fallback)`: core reads the snippet and its arguments in
 * an effect, so a new function or a changed argument renders it again.
 */
export function renderSnippetCall(source: string, args: readonly string[], fallback: string | null): string {
    return `renderSnippet(()=>${source},()=>[${args.join(',')}]${fallback ? `,${fallback}` : ''})`;
}
