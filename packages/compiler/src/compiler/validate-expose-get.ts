// PDX_EXPOSE_GET_NOT_FUNCTION (#1423): `@expose get name` exposes a getter that calls the function
// `name`. A name that is declared but is not a function — a $signal, a $derived, a constant — would
// compile to a getter that calls a value. An undeclared name is PDX_EXPOSE_UNDECLARED's.

import ts from 'typescript';
import type { ScriptAnalysis } from './script-analyzer';
import type { ValidationWarning } from './validate';
import { declaredFunction } from './dts-generator';

/** PDX_EXPOSE_GET_NOT_FUNCTION for each `@expose get` name that is declared and is not a function. */
export function checkExposeGetters(analysis: ScriptAnalysis, declared: ReadonlySet<string>): ValidationWarning[] {
    const getters = analysis.exposeGetters ?? [];
    if (getters.length === 0) return [];
    const body = ts.createSourceFile('script.ts', analysis.body, ts.ScriptTarget.Latest, true);
    const out: ValidationWarning[] = [];
    for (const name of getters) {
        if (!declared.has(name) || declaredFunction(name, body)) continue;
        out.push({
            code: 'PDX_EXPOSE_GET_NOT_FUNCTION',
            severity: 'error',
            message: `@expose get '${name}' is not a function: a getter calls the function it names when it is read.`,
            hint: `Declare it as a function (function ${name}() { return …; }), or expose it without get: @expose ${name};`,
        });
    }
    return out;
}
