// The heuristic component-design rules of docs/PDX-COMPONENT-DESIGN.md §8, one file at a time.
// Run by `pdx check`, never by compile(): each is a question for a review, and a line
// on every save in the dev server's console would teach people to skip it.
//
//   CD-B1  PDX_SEVERAL_PIECES   more than one connected group of signals in one script
//   CD-S3  PDX_VERSION_COUNTER  a $signal only bumped, and only read to be discarded
//   CD-B2, CD-C1, CD-C3         the markup and the styles: design-heuristics-markup.ts
//
// All are warnings, and each message says it is a heuristic.

import ts from 'typescript';
import { parseSFC } from '../parser/sfc';
import { analyzeScript } from './script-analyzer';
import { parseableScript } from './validate-design';
import { checkMarkup } from './design-heuristics-markup';
import type { ValidationWarning } from './validate';

/** One piece of state: its $signals, and every name (function, derived) joined to them. */
export interface SignalGroup {
    signals: string[];
    names: Set<string>;
}

/** A read of `id` as a name, not as a property: `x.id` and `{ id: … }` do not count. */
function isReference(id: ts.Identifier): boolean {
    const p = id.parent;
    if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
    if ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p)) && p.name === id) return false;
    return true;
}

function referencedNames(node: ts.Node, known: Set<string>): Set<string> {
    const out = new Set<string>();
    const visit = (n: ts.Node): void => {
        if (ts.isIdentifier(n) && known.has(n.text) && isReference(n)) out.add(n.text);
        ts.forEachChild(n, visit);
    };
    visit(node);
    return out;
}

/**
 * CD-B1's graph: "function/derived → the signals it reads or writes", joined through the calls
 * between them. Each top-level declaration is a node named for what it declares; every other
 * top-level statement (a `$watch`, an `onMount`) joins everything it touches. Props are inputs, not
 * state, and do not join anything; links made only in the template are outside it (doc, CD-B1).
 */
export function signalGroups(sf: ts.SourceFile, signals: Set<string>, deriveds: Set<string>): SignalGroup[] {
    const fns = new Set<string>();
    for (const st of sf.statements) {
        if (ts.isFunctionDeclaration(st) && st.name) fns.add(st.name.text);
        if (ts.isVariableStatement(st)) {
            for (const d of st.declarationList.declarations) {
                if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) fns.add(d.name.text);
            }
        }
    }
    const known = new Set([...signals, ...deriveds, ...fns]);
    const parent = new Map<string, string>([...known].map(n => [n, n]));
    const find = (n: string): string => { while (parent.get(n) !== n) n = parent.get(n)!; return n; };
    const join = (names: Iterable<string>): void => {
        const [first, ...rest] = [...names];
        if (first === undefined) return;
        for (const n of rest) parent.set(find(n), find(first));
    };

    for (const st of sf.statements) {
        if (ts.isFunctionDeclaration(st) && st.name) { join([st.name.text, ...referencedNames(st, known)]); continue; }
        if (ts.isVariableStatement(st)) {
            for (const d of st.declarationList.declarations) {
                const own = ts.isIdentifier(d.name) && known.has(d.name.text) ? [d.name.text] : [];
                join([...own, ...(d.initializer ? referencedNames(d.initializer, known) : [])]);
            }
            continue;
        }
        join(referencedNames(st, known));
    }

    const byRoot = new Map<string, SignalGroup>();
    for (const n of known) {
        const root = find(n);
        const group = byRoot.get(root) ?? { signals: [], names: new Set<string>() };
        group.names.add(n);
        if (signals.has(n)) group.signals.push(n);
        byRoot.set(root, group);
    }
    return [...byRoot.values()].filter(g => g.signals.length >= 2);
}

/** Where a `let x = $signal(…)` is declared, for the report. */
function declarationOf(sf: ts.SourceFile, name: string): ts.Node | undefined {
    for (const st of sf.statements) {
        if (!ts.isVariableStatement(st)) continue;
        const d = st.declarationList.declarations.find(v => ts.isIdentifier(v.name) && v.name.text === name);
        if (d) return d;
    }
    return undefined;
}

/** `x++`, `++x`, `x += 1`, `x = x + 1`: a bump, and nothing else. */
function isBump(n: ts.Node, name: string): boolean {
    if ((ts.isPostfixUnaryExpression(n) || ts.isPrefixUnaryExpression(n)) && n.operator === ts.SyntaxKind.PlusPlusToken) return true;
    if (!ts.isBinaryExpression(n)) return false;
    const one = (e: ts.Expression) => ts.isNumericLiteral(e) && e.text === '1';
    if (n.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken) return one(n.right);
    return n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isBinaryExpression(n.right)
        && n.right.operatorToken.kind === ts.SyntaxKind.PlusToken && ts.isIdentifier(n.right.left) && n.right.left.text === name && one(n.right.right);
}

/** True when every use of parameter `index` of `fn` is `void p`: it is taken only to be dropped. */
function discardsParameter(fn: ts.FunctionLikeDeclaration, index: number): boolean {
    const p = fn.parameters[index];
    if (!p || !ts.isIdentifier(p.name) || !fn.body) return false;
    const name = p.name.text;
    let uses = 0;
    let discarded = 0;
    const visit = (n: ts.Node): void => {
        if (ts.isIdentifier(n) && n.text === name && isReference(n)) {
            uses++;
            if (ts.isVoidExpression(n.parent)) discarded++;
        }
        ts.forEachChild(n, visit);
    };
    visit(fn.body);
    return uses > 0 && uses === discarded;
}

/** CD-S3: a $signal whose writes are all bumps and whose reads are all thrown away. */
function checkVersionCounters(sf: ts.SourceFile, signals: Set<string>, at: (n: ts.Node) => number): ValidationWarning[] {
    const fns = new Map<string, ts.FunctionLikeDeclaration>();
    for (const st of sf.statements) if (ts.isFunctionDeclaration(st) && st.name) fns.set(st.name.text, st);
    const warnings: ValidationWarning[] = [];
    for (const name of signals) {
        const decl = declarationOf(sf, name);
        let bumps = 0;
        let discardedReads = 0;
        let other = 0;
        const visit = (n: ts.Node): void => {
            if (ts.isIdentifier(n) && n.text === name && isReference(n) && n.parent !== decl) {
                const p = n.parent;
                const bump = [p, p.parent].find(x => x && isBump(x, name));
                if (bump) bumps++;
                else if (ts.isVoidExpression(p)) discardedReads++;
                else if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && fns.has(p.expression.text)
                    && discardsParameter(fns.get(p.expression.text)!, p.arguments.indexOf(n))) discardedReads++;
                else other++;
            }
            ts.forEachChild(n, visit);
        };
        visit(sf);
        // `x = x + 1` reads x on its right: that read belongs to the bump, not to a reader.
        if (!decl || bumps === 0 || discardedReads === 0 || other > 0) continue;
        warnings.push({
            code: 'PDX_VERSION_COUNTER',
            severity: 'warn',
            message: `'${name}' is only bumped and only read to be discarded (CD-S3, a heuristic): a counter that forces a re-read `
                + `means the source it stands for should be a signal.`,
            hint: `Give the state one reactive owner — a small module holding a signal and writing through to storage — and read that.`,
            line: at(decl),
        });
    }
    return warnings;
}

/** CD-B1 as a warning: the groups, named by their signals. */
function severalPieces(groups: SignalGroup[], line: number): ValidationWarning {
    const listed = groups.map(g => `(${g.signals.join(', ')})`).join(' · ');
    return {
        code: 'PDX_SEVERAL_PIECES',
        severity: 'warn',
        message: `This script holds ${groups.length} groups of state that share nothing (CD-B1, a heuristic): ${listed}. `
            + `Each is a piece with its own state — a component of its own.`,
        hint: `Move each group, with its markup, into a .pdx beside this one; what joins them stays here. Links made only in the template are not seen.`,
        line,
    };
}

/**
 * The heuristic component-design warnings for one `.pdx` source: CD-B1, CD-S3 here,
 * CD-B2, CD-C1 and CD-C3 in design-heuristics-markup.ts.
 */
export function designHeuristics(source: string, file = 'component.pdx'): ValidationWarning[] {
    const descriptor = parseSFC(source);
    const script = descriptor.script;
    const warnings: ValidationWarning[] = [];
    let groups: SignalGroup[] = [];
    if (script && script.content.trim()) {
        const analysis = analyzeScript(script.content, file, { setup: script.setup });
        const signals = new Set(analysis.signals.map(s => s.name));
        const deriveds = new Set(analysis.deriveds.map(d => d.name));
        const sf = parseableScript(script.content);
        const at = (n: ts.Node): number => source.slice(0, script.start + n.getStart(sf)).split('\n').length;
        groups = signalGroups(sf, signals, deriveds);
        if (groups.length > 1) {
            const first = declarationOf(sf, groups[0].signals[0]);
            warnings.push(severalPieces(groups, first ? at(first) : source.slice(0, script.start).split('\n').length));
        }
        warnings.push(...checkVersionCounters(sf, signals, at));
    }
    const isRoute = !!script && /^[ \t]*@page\b/m.test(script.content);
    warnings.push(...checkMarkup(descriptor, source, isRoute, groups));
    return warnings;
}
