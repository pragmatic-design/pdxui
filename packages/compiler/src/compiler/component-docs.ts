// The doc comments of a .pdx script (#1003): what a generator reads to describe a component as the
// library's manifest describes a TypeScript component(), whose JSDoc sits above the call.
//
// The component's own JSDoc is the first `/** … */` of the script, before any declaration or import
// (owner, 2026-11-10). A `/** … */` directly above a declaration describes that declaration; a line
// comment between the two does not detach it, as TypeScript's JSDoc does not. The comments are
// returned as written: the reader parses their tags, so a .pdx and a .ts are read the same way.

import { skipNonCode } from './tokenizer';

/** What a doc comment describes: a rune's declaration, or a script declaration (function, const, let). */
export type DocTarget = 'prop' | 'model' | 'event' | 'slot' | 'state' | 'variant' | 'declaration';

export interface DeclarationDoc {
    kind: DocTarget;
    name: string;
    /** The comment as written, `/**` to `*\/`. */
    doc: string;
}

export interface ScriptDocs {
    /** The component's JSDoc: the first `/** … *\/` before any code. Absent when there is none. */
    component?: string;
    /** Each declaration that has a doc comment directly above it, in the script's order. */
    declarations: DeclarationDoc[];
}

const NAME = '[A-Za-z_$][\\w$]*';

// What the line a doc comment sits above declares. Each pattern is matched at the line's first token.
const DECLARATIONS: [DocTarget, RegExp][] = [
    // Match: @prop label: …  /  @model value: …   Groups: [1]=the name
    ['prop', new RegExp(`^@prop\\s+(${NAME})`)],
    ['model', new RegExp(`^@model\\s+(${NAME})`)],
    // Match: @event picked: …  /  @event(bubbles) picked  /  @event(cancelable) 'before-move'  /
    // @event 'open-change': … — any options in parentheses (#1035). Groups: [1]=a bare name [2]=a quoted name
    ['event', new RegExp(`^@event(?:\\([^)]*\\))?\\s+(?:(${NAME})|['"]([^'"\\n]+)['"])`)],
    // Match: @slot row?: …   Groups: [1]=the name
    ['slot', new RegExp(`^@slot\\s+(${NAME})`)],
    // Match: @state busy = …   Groups: [1]=the name
    ['state', new RegExp(`^@state\\s+(${NAME})`)],
    // Match: @variants { size: …   Groups: [1]=the first axis on the line
    ['variant', new RegExp(`^@variants\\s*\\{\\s*(${NAME})\\s*:`)],
    // Match: function focus(  /  async function* load(  /  export function x(   Groups: [1]=the name
    ['declaration', new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s*\\*?\\s*(${NAME})`)],
    // Match: const item =  /  let n =  /  var x =   Groups: [1]=the name
    ['declaration', new RegExp(`^(?:export\\s+)?(?:const|let|var)\\s+(${NAME})`)],
];

/** What the code starting at `text` declares, or null when it is none of DECLARATIONS. */
function declaredAt(text: string): { kind: DocTarget; name: string } | null {
    for (const [kind, re] of DECLARATIONS) {
        const m = re.exec(text);
        if (m) return { kind, name: m[1] ?? m[2] };
    }
    return null;
}

/**
 * The doc comments of a .pdx script: the component's, and each declaration's. Strings, template
 * literals and other comments are stepped over (`skipNonCode`), so a `/**` inside a string is text.
 */
export function scriptDocComments(script: string): ScriptDocs {
    const out: ScriptDocs = { declarations: [] };
    let seenCode = false;
    let pending: string | null = null;
    let i = 0;
    while (i < script.length) {
        const end = skipNonCode(script, i);
        if (end !== null && end > i) {
            const span = script.slice(i, end);
            // A doc block; a line comment or a plain block keeps the one pending, as TypeScript does.
            if (span.startsWith('/**') && span !== '/**/') {
                if (!seenCode && out.component === undefined) out.component = span;
                else pending = span;
            } else if (!span.startsWith('//') && !span.startsWith('/*')) {
                // A string or a template literal is code.
                seenCode = true;
                pending = null;
            }
            i = end;
            continue;
        }
        if (/\s/.test(script[i])) { i++; continue; }
        // The first character of code: what it declares takes the pending doc.
        seenCode = true;
        if (pending !== null) {
            const lineEnd = script.indexOf('\n', i);
            const declared = declaredAt(script.slice(i, lineEnd === -1 ? undefined : lineEnd));
            if (declared) out.declarations.push({ ...declared, doc: pending });
            pending = null;
        }
        // Step to the next code boundary: the rest of the token run up to whitespace or a non-code span.
        i++;
        while (i < script.length && !/\s/.test(script[i]) && skipNonCode(script, i) === null) i++;
    }
    return out;
}
