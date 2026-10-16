// TypeScript erased from a compiled module, types only, positions kept.
//
// A `.pdx` script's `lang` is `ts` by default and the editor checks it as TypeScript. Copied into the
// module as written, an `import type`, an annotation, `as`, `!` or a generic call would reach the
// browser and the module would not parse. Erasing with `ts.transpileModule` would reprint
// the whole module; this replaces each piece of type syntax with spaces instead, so every line and
// column stays where it was — the origin marks, the source map and the findings' positions with it.
//
// It runs on the GENERATED module, after the runes are lowered: a rune's own syntax (`@fetch users:
// '…' as User[]`) is never TypeScript to erase. TypeScript that has a runtime of its own — an enum, a
// namespace, a parameter property, `import x = require()` — cannot be erased, and stops the compile.

import ts from 'typescript';

type Range = [number, number];

/** Nodes with no children and no type syntax: a name, a literal, a keyword value, a punctuation token. */
const LEAF_KINDS = new Set<ts.SyntaxKind>([
    ts.SyntaxKind.Identifier, ts.SyntaxKind.PrivateIdentifier,
    ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NumericLiteral, ts.SyntaxKind.BigIntLiteral,
    ts.SyntaxKind.NoSubstitutionTemplateLiteral, ts.SyntaxKind.RegularExpressionLiteral,
    ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail,
    ts.SyntaxKind.ThisKeyword, ts.SyntaxKind.SuperKeyword, ts.SyntaxKind.TrueKeyword,
    ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword, ts.SyntaxKind.EndOfFileToken,
    ts.SyntaxKind.DotToken, ts.SyntaxKind.QuestionDotToken, ts.SyntaxKind.DotDotDotToken,
    ts.SyntaxKind.EqualsGreaterThanToken, ts.SyntaxKind.EqualsToken, ts.SyntaxKind.CommaToken,
    ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken,
    ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken,
    ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.LessThanToken, ts.SyntaxKind.GreaterThanToken,
]);

/**
 * Nodes that are no type syntax themselves, take no modifiers and are not function- or class-like:
 * only their children can hold types. A call is not one (its type arguments), nor a declaration.
 */
const WALK_ONLY_KINDS = new Set<ts.SyntaxKind>([
    ts.SyntaxKind.Block, ts.SyntaxKind.ExpressionStatement, ts.SyntaxKind.ReturnStatement,
    ts.SyntaxKind.IfStatement, ts.SyntaxKind.VariableDeclarationList,
    ts.SyntaxKind.PropertyAccessExpression, ts.SyntaxKind.ElementAccessExpression,
    ts.SyntaxKind.BinaryExpression, ts.SyntaxKind.ConditionalExpression, ts.SyntaxKind.ParenthesizedExpression,
    ts.SyntaxKind.PrefixUnaryExpression, ts.SyntaxKind.PostfixUnaryExpression,
    ts.SyntaxKind.ObjectLiteralExpression, ts.SyntaxKind.PropertyAssignment,
    ts.SyntaxKind.ShorthandPropertyAssignment, ts.SyntaxKind.ArrayLiteralExpression, ts.SyntaxKind.SpreadElement,
    ts.SyntaxKind.TemplateExpression, ts.SyntaxKind.TemplateSpan,
]);

/** The type syntax of `code`, as ranges to blank, and the constructs that cannot be erased. */
function collect(code: string, sf: ts.SourceFile): { ranges: Range[]; unsupported: ts.Node[] } {
    const ranges: Range[] = [];
    const unsupported: ts.Node[] = [];
    const blank = (from: number, to: number) => { if (to > from) ranges.push([from, to]); };
    const whole = (n: ts.Node) => blank(n.getStart(sf), n.end);
    /** `<…>` around a type argument or parameter list. */
    const angled = (list: ts.NodeArray<ts.Node> | undefined) => {
        if (!list) return;
        const open = code.lastIndexOf('<', list.pos);
        const close = code.indexOf('>', list.end);
        if (open >= 0 && close >= 0) blank(open, close + 1);
    };
    /** `: T` — from the colon before the type to the type's end. */
    const annotation = (type: ts.TypeNode | undefined) => {
        if (!type) return;
        const colon = code.lastIndexOf(':', type.getStart(sf));
        if (colon >= 0) blank(colon, type.end);
    };
    const TYPE_ONLY_MODIFIERS = new Set([
        ts.SyntaxKind.PublicKeyword, ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword,
        ts.SyntaxKind.ReadonlyKeyword, ts.SyntaxKind.OverrideKeyword, ts.SyntaxKind.AbstractKeyword,
    ]);

    const visit = (n: ts.Node): void => {
        // A leaf has no type syntax and nothing to walk into. Most of a compiled render is leaves: since
        // the inline path (#363) it is statements, not one template literal, and the checks below, run
        // on every node, cost more than its parse did (#454).
        if (LEAF_KINDS.has(n.kind)) return;
        if (WALK_ONLY_KINDS.has(n.kind)) { ts.forEachChild(n, visit); return; }
        // Read once, as the parser stored them: `ts.getModifiers` allocates for every node. The
        // decorators in the list are never one of the kinds looked for.
        const modifiers = ts.canHaveModifiers(n) ? n.modifiers : undefined;
        const hasModifier = (kind: ts.SyntaxKind) => !!modifiers && modifiers.some(m => m.kind === kind);

        // Whole statements that are types only.
        if (ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n) || hasModifier(ts.SyntaxKind.DeclareKeyword)) { whole(n); return; }
        if (ts.isImportDeclaration(n) && n.importClause?.isTypeOnly) { whole(n); return; }
        if (ts.isExportDeclaration(n) && n.isTypeOnly) { whole(n); return; }
        if (ts.isImportEqualsDeclaration(n)) { if (n.isTypeOnly) whole(n); else unsupported.push(n); return; }
        if (ts.isEnumDeclaration(n) || ts.isModuleDeclaration(n)) { unsupported.push(n); return; }
        // An overload signature, an abstract member, an index signature: a body-less declaration.
        if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && !n.body) { whole(n); return; }
        if (ts.isIndexSignatureDeclaration(n) || (ts.isPropertyDeclaration(n) && hasModifier(ts.SyntaxKind.AbstractKeyword))) { whole(n); return; }

        // `import { a, type B }` / `export { a, type B }`: the type-only specifiers, with their comma.
        if (ts.isNamedImports(n) || ts.isNamedExports(n)) {
            const els = n.elements as ts.NodeArray<ts.ImportSpecifier | ts.ExportSpecifier>;
            els.forEach((el, i) => {
                if (!el.isTypeOnly) return;
                const next = els[i + 1];
                blank(el.getStart(sf), next ? next.getStart(sf) : el.end);
                if (!next && i > 0) blank(code.lastIndexOf(',', el.getStart(sf)), code.lastIndexOf(',', el.getStart(sf)) + 1);
            });
        }

        if (ts.isParameter(n)) {
            if (modifiers?.some(m => TYPE_ONLY_MODIFIERS.has(m.kind))) { unsupported.push(n); return; }
            if (n.questionToken) blank(n.questionToken.getStart(sf), n.questionToken.end);
        }
        if ((ts.isVariableDeclaration(n) || ts.isPropertyDeclaration(n)) && n.exclamationToken) blank(n.exclamationToken.getStart(sf), n.exclamationToken.end);
        if (ts.isPropertyDeclaration(n) && n.questionToken) blank(n.questionToken.getStart(sf), n.questionToken.end);

        // Modifiers that exist only for the checker.
        if (modifiers && !ts.isParameter(n)) {
            for (const m of modifiers) if (TYPE_ONLY_MODIFIERS.has(m.kind)) blank(m.getStart(sf), m.end);
        }
        if (ts.isHeritageClause(n) && n.token === ts.SyntaxKind.ImplementsKeyword) { whole(n); return; }

        // Annotations: a variable's, a parameter's, a property's, a function's return type.
        if (ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isPropertyDeclaration(n)) annotation(n.type);
        if (ts.isFunctionLike(n)) { annotation((n as ts.SignatureDeclaration).type); angled((n as ts.SignatureDeclaration).typeParameters); }
        if (ts.isClassLike(n)) angled(n.typeParameters);

        // Expressions: `x as T`, `x satisfies T`, `<T>x`, `x!`, a generic call.
        if (ts.isAsExpression(n) || ts.isSatisfiesExpression(n)) { blank(n.expression.end, n.end); visit(n.expression); return; }
        if (ts.isTypeAssertionExpression(n)) { blank(n.getStart(sf), n.expression.getStart(sf)); visit(n.expression); return; }
        if (ts.isNonNullExpression(n)) blank(n.end - 1, n.end);
        if (ts.isCallExpression(n) || ts.isNewExpression(n) || ts.isTaggedTemplateExpression(n) || ts.isExpressionWithTypeArguments(n)) angled(n.typeArguments);

        // A type node is never walked into: everything in it went with its range.
        if (ts.isTypeNode(n) && !ts.isExpressionWithTypeArguments(n)) return;
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return { ranges, unsupported };
}

function parseDiagnostics(sf: ts.SourceFile): readonly ts.Diagnostic[] {
    return (sf as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
}

/** `code` with the ranges turned into spaces, newlines kept. */
function blankOut(code: string, ranges: Range[]): string {
    const chars = code.split('');
    for (const [from, to] of ranges) for (let i = from; i < to; i++) if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
    return chars.join('');
}

/**
 * `code` without its TypeScript, every position kept. A module that does not parse is returned as it
 * is: its syntax error is reported elsewhere (PDX_SCRIPT_SYNTAX_ERROR), not hidden behind this one.
 * Throws `PDX_TS_UNSUPPORTED` for TypeScript that has a runtime, or when the erasure leaves code that
 * does not parse (a return type that broke a line before `=>`).
 */
export function eraseTypes(code: string, filename: string): string {
    // No parent links: every position is read with the source file passed, and setting them was a
    // third of the parse (#454).
    const sf = ts.createSourceFile('__pdx_module.ts', code, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
    if (parseDiagnostics(sf).length > 0) return code;
    const { ranges, unsupported } = collect(code, sf);
    if (unsupported.length > 0) {
        const what = unsupported.map(n => `\`${n.getText(sf).split('\n')[0].trim()}\``).join(', ');
        throw new Error(`[PDX_TS_UNSUPPORTED] ${filename} — ${what}: TypeScript with a runtime of its own (an enum, a namespace, a parameter property, import = require) cannot be erased from a .pdx script.\n  Hint: write it as JavaScript — a frozen object for an enum, a module for a namespace, an assignment in the constructor for a parameter property.`);
    }
    if (ranges.length === 0) return code;
    const out = blankOut(code, ranges);
    const check = ts.createSourceFile('__pdx_module.ts', out, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
    const left = collect(out, check).ranges.length;
    if (parseDiagnostics(check).length > 0 || left > 0) {
        throw new Error(`[PDX_TS_UNSUPPORTED] ${filename} — erasing the TypeScript of this script left code that does not parse${left ? ' or types that remain' : ''}. A return type written on its own line before \`=>\` is the usual cause.\n  Hint: keep an arrow function's return type on the line of its parameters.`);
    }
    return out;
}
