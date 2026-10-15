// What a compiled module's blocks build as static markup, in either form the compiler writes it
// (#369): one DOM call per node, or HTML that core's `staticMarkup` parses. For the tests that read
// the generated code for a construct, a text or an attribute, and are not about which form it takes.
// That the two forms build the same tree is measured in Chromium: responsive's
// static-markup-parse.spec.ts.

/** The HTML a module's blocks are written as, one string per `staticMarkup('…')`. */
export const markup = (code: string): string[] =>
    [...code.matchAll(/staticMarkup\(('(?:[^'\\]|\\.)*')\)/g)].map((m) => new Function(`return ${m[1]};`)() as string);

/** Whether a block's static markup builds a `tag` element — any element, without one. */
export function builds(code: string, tag?: string): boolean {
    if (!tag) return code.includes('__d.createElement') || markup(code).some((h) => /<[a-z]/.test(h));
    return code.includes(`__d.createElement('${tag}')`) || markup(code).some((h) => new RegExp(`<${tag}[\\s>/]`).test(h));
}

/** How many elements the blocks' static markup builds. */
export const elementsBuilt = (code: string): number =>
    (code.match(/__d\.createElement/g) ?? []).length + markup(code).reduce((n, h) => n + (h.match(/<[a-z][\w-]*/g) ?? []).length, 0);
