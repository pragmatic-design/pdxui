// The script's rune declarations, typed as the lenient program reads them (#468).
//
// The template is checked in a strict program, the script in the lenient one. The strict program
// still holds the script, and left to itself it would infer the runes again, under `strict`:
// `$signal(null)` typed `null`, `$signal([])` typed `never[]`, and every later write an error the
// code does not have. So each rune declaration the author left untyped, each name declared with no
// value (`@prop label;`) and each declared with an empty one (`const rows = [];`) reaches the strict
// program with the type the lenient one gave it, written out. A rune with a type argument, `$signal<T>(…)`,
// is left as written: its type is the author's, and under `strict` it keeps the `null` the lenient
// program drops.

import ts from 'typescript';

/** The runes a script declares a name with, as the projection writes them (./project-script). */
const RUNE_CALLS = new Set(['$signal', '$derived', '$drv', '$store']);

export interface Insertion { at: number; text: string; }

/**
 * Where to write `: T` in `fileName`, for each untyped rune declaration at its top level before
 * `before` — the start of the template projection.
 */
export function runeTypeAnnotations(program: ts.Program, fileName: string, before: number): Insertion[] {
    const sf = program.getSourceFile(fileName);
    if (!sf) return [];
    const checker = program.getTypeChecker();
    const out: Insertion[] = [];
    for (const stmt of sf.statements) {
        if (stmt.end > before) break;
        if (!ts.isVariableStatement(stmt)) continue;
        for (const decl of stmt.declarationList.declarations) {
            if (decl.type || !ts.isIdentifier(decl.name)) continue;
            // A name with no value, `@prop label;`, is `any` to the script, and stays `any`: under
            // `strict` every read of it in the template would be an implicit any.
            if (decl.initializer && !isUntypedRune(decl.initializer) && !isEmptyLiteral(decl.initializer)) continue;
            out.push({ at: decl.name.end, text: `: ${widenedType(checker, checker.getTypeAtLocation(decl.name), decl)}` });
        }
    }
    return out;
}

/** `$signal(…)`, `$derived(…)`, `$store(…)` with no type argument. */
function isUntypedRune(init: ts.Expression): boolean {
    return ts.isCallExpression(init) && !init.typeArguments
        && ts.isIdentifier(init.expression) && RUNE_CALLS.has(init.expression.text);
}

/** `[]`, `{}`, `null`, `undefined`: a value that says nothing of the ones written later. */
function isEmptyLiteral(init: ts.Expression): boolean {
    return (ts.isArrayLiteralExpression(init) && init.elements.length === 0)
        || (ts.isObjectLiteralExpression(init) && init.properties.length === 0)
        || init.kind === ts.SyntaxKind.NullKeyword
        || (ts.isIdentifier(init) && init.text === 'undefined');
}

const EMPTY = ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Never;

/**
 * The type, written out. What an empty value gives says nothing about the values the script writes
 * later, so it is `any`, as the lenient program reads it: `null`, `never[]`, and `{}` — which the
 * lenient program indexes with any string, and `strict` with none.
 */
function widenedType(checker: ts.TypeChecker, type: ts.Type, at: ts.Node): string {
    if (type.flags & EMPTY) return 'any';
    if (isEmptyObject(checker, type)) return 'any';
    if (checker.isArrayType(type)) {
        const [element] = checker.getTypeArguments(type as ts.TypeReference);
        if (element && element.flags & EMPTY) return 'any[]';
    }
    return checker.typeToString(type, at, ts.TypeFormatFlags.NoTruncation);
}

/** `{}`: an object type with no member and no signature. */
function isEmptyObject(checker: ts.TypeChecker, type: ts.Type): boolean {
    return !!(type.flags & ts.TypeFlags.Object) && checker.getPropertiesOfType(type).length === 0
        && type.getCallSignatures().length === 0 && type.getConstructSignatures().length === 0
        && checker.getIndexInfosOfType(type).length === 0;
}

/** `content` with the insertions written in, and how far an offset after the last of them moved. */
export function applyInsertions(content: string, insertions: Insertion[]): { content: string; shift: number } {
    let out = '', last = 0, shift = 0;
    for (const ins of [...insertions].sort((a, b) => a.at - b.at)) {
        out += content.slice(last, ins.at) + ins.text;
        last = ins.at;
        shift += ins.text.length;
    }
    return { content: out + content.slice(last), shift };
}
