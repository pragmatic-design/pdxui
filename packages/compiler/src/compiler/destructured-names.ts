// The names a destructuring declaration binds.
//
// `const { open, close: shut, ...rest } = list;` binds `open`, `shut` and `rest` — not `close`, which
// is a key. Asked of the TypeScript AST, not of a pattern: defaults (`size = 10`), nesting
// (`{ a: { b } }`), holes (`[a, , b]`) and a default that is itself an object literal are what a
// regex gets wrong.
import ts from 'typescript';

/**
 * The local names bound by the declaration statement `text` (`const {…} = …;` or `let […] = …;`).
 * Empty when the text does not parse as a destructuring declaration.
 */
export function destructuredNames(text: string): string[] {
    const file = ts.createSourceFile('__decl.ts', text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
    const names: string[] = [];
    const statement = file.statements[0];
    if (!statement || !ts.isVariableStatement(statement)) return names;
    for (const decl of statement.declarationList.declarations) collect(decl.name, names);
    return names;
}

function collect(name: ts.BindingName, into: string[]): void {
    if (ts.isIdentifier(name)) { into.push(name.text); return; }
    for (const element of name.elements) {
        if (ts.isOmittedExpression(element)) continue; // a hole: `[a, , b]`
        collect(element.name, into);
    }
}
