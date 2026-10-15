// The template generator's html`` for a template, called directly.
//
// A .pdx in the new mode no longer reaches it: a scoped slot's body was the last part it wrote, until
// #364. The legacy mode still renders through it; the tests that measure what it writes call it here,
// with the names a script would have declared.
import { generateNodes } from '../src/compiler/codegen-template';
import { createCompileContext } from '../src/compiler/compile-context';
import { parseTemplate } from '../src/parser/template';

export function templateGenerator(template: string, declared: string[] = [], opts: { production?: boolean } = {}): string {
    const ctx = createCompileContext(opts);
    ctx.declaredNames = new Set(declared);
    return generateNodes(parseTemplate(template), new Set(), ctx);
}
