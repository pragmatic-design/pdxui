// Every `@`-word the template parser reads (#296). No imports, so a generator outside the compiler —
// the editor grammar's — can load it as it loads `runes.ts`. A word the parser learns is added here.
//
// Not `TEMPLATE_DIRECTIVES` (`compiler/codegen-prop-names.ts`): that one lists the runtime's binding
// directives, `:class`, `:style`, `:ref`, `:show`.

/** The block directives and their clauses, which the parser reads where a node may start. */
export const BLOCK_DIRECTIVES = ['if', 'for', 'switch', 'require', 'show', 'portal', 'defer', 'try', 'await',
    'let', 'slot', 'render', 'snippet', 'raw', 'else', 'catch', 'case', 'default', 'placeholder', 'loading', 'error', 'empty'] as const;

/**
 * Every template `@`-word: the block directives, `@transition` and `@mode` after a block, `@stagger`,
 * `@move` and `@virtual` (#283) in a `@for` header, `@keepAlive(n)` on `<component :is>` (#270). A
 * `@word (` or `@word {` that is none of these and no plugin's is text — and `PDX_UNKNOWN_DIRECTIVE`
 * where the compiler knows the plugins.
 */
export const TEMPLATE_AT_DIRECTIVES = [...BLOCK_DIRECTIVES, 'transition', 'mode', 'stagger', 'move', 'virtual', 'keepAlive'] as const;
