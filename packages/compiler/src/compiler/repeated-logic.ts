// CD-L1, the one cross-file component-design rule: the same function, in the same
// shape, written in two files of one app is a composable nobody extracted. It needs every file at
// once, so `pdx check` runs it after the per-file pass; the compiler, which sees one file, cannot.
//
// A function is compared by its name first — two pages that copied a block kept the names — and
// then by its body, normalised: whitespace, comments and braces around a single statement do not
// count, and the names local to the function (parameters, its own declarations) are numbered in
// order of appearance, so `answerRefused(message)` and `answerRefused(text)` are one function.

import ts from 'typescript';
import { parseSFC } from '../parser/sfc';
import { parseableScript } from './validate-design';
import type { ValidationWarning } from './validate';

/** Statements a body needs to count on its own: `clearRefusal` has two, a one-liner has one. */
const MIN_STATEMENTS = 2;
/** How alike two normalised bodies must be, 0–1, to be the same logic written twice. */
const MIN_SIMILARITY = 0.85;

type Fn = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

interface Candidate {
    file: string;
    name: string;
    line: number;
    tokens: string[];
    statements: number;
}

/** One function repeated across files, with every place it is written. */
export interface RepeatedLogic {
    name: string;
    locations: { file: string; line: number }[];
}

/** The top-level functions of a script: `function f() {}` and `const f = () => …`. */
function topLevelFunctions(sf: ts.SourceFile): [string, Fn][] {
    const out: [string, Fn][] = [];
    for (const st of sf.statements) {
        if (ts.isFunctionDeclaration(st) && st.name && st.body) out.push([st.name.text, st]);
        if (ts.isVariableStatement(st)) {
            for (const d of st.declarationList.declarations) {
                if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
                    out.push([d.name.text, d.initializer]);
                }
            }
        }
    }
    return out;
}

/** The names a function declares for itself: parameters, variables, inner functions, catch bindings. */
function localNames(fn: Fn): Set<string> {
    const names = new Set<string>();
    const bind = (b: ts.BindingName): void => {
        if (ts.isIdentifier(b)) { names.add(b.text); return; }
        for (const el of b.elements) if (!ts.isOmittedExpression(el)) bind(el.name);
    };
    for (const p of fn.parameters) bind(p.name);
    const visit = (n: ts.Node): void => {
        if (ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n)) bind(n.name);
        if (ts.isFunctionDeclaration(n) && n.name) names.add(n.name.text);
        ts.forEachChild(n, visit);
    };
    if (fn.body) visit(fn.body);
    return names;
}

/**
 * The body as a token list: trivia dropped, local names numbered, and the braces of a block that
 * holds one statement removed — `if (x) f();` and `if (x) { f(); }` are the same code.
 */
function normalise(fn: Fn, sf: ts.SourceFile): string[] {
    const locals = localNames(fn);
    const numbered = new Map<string, string>();
    const tokens: string[] = [];
    const visit = (n: ts.Node): void => {
        if (ts.isJSDoc(n)) return;
        if (ts.isBlock(n) && n.statements.length === 1 && n !== fn.body) { visit(n.statements[0]); return; }
        if (n.getChildCount(sf) === 0) {
            if (n.kind === ts.SyntaxKind.EndOfFileToken) return;
            let text = n.getText(sf);
            if (ts.isIdentifier(n) && locals.has(text)) {
                if (!numbered.has(text)) numbered.set(text, `$${numbered.size}`);
                text = numbered.get(text)!;
            }
            tokens.push(text);
            return;
        }
        for (const c of n.getChildren(sf)) visit(c);
    };
    for (const p of fn.parameters) visit(p);
    if (fn.body) visit(fn.body);
    return tokens;
}

/** How many statements a body has at its top: an expression body is one. */
function statementCount(fn: Fn): number {
    return fn.body && ts.isBlock(fn.body) ? fn.body.statements.length : 1;
}

/** 1 − edit distance over the longer length: 1 for the same tokens, 0 for nothing in common. */
function similarity(a: string[], b: string[]): number {
    if (a.length === 0 && b.length === 0) return 1;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return 1 - prev[b.length] / Math.max(a.length, b.length);
}

const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((t, i) => t === b[i]);

function candidatesOf(file: string, source: string): Candidate[] {
    const script = parseSFC(source).script;
    if (!script || !script.content.trim()) return [];
    const sf = parseableScript(script.content);
    return topLevelFunctions(sf).map(([name, fn]) => ({
        file,
        name,
        line: source.slice(0, script.start + fn.getStart(sf)).split('\n').length,
        tokens: normalise(fn, sf),
        statements: statementCount(fn),
    }));
}

/**
 * The functions written, alike, in two or more of `files` (CD-L1). A function of at least
 * MIN_STATEMENTS statements counts when its bodies are close; a shorter one only when its bodies
 * are identical AND the same two files also share a longer one — a copied block is evidence, a
 * shared one-liner alone is a coincidence.
 */
export function findRepeatedLogic(files: { file: string; source: string }[]): RepeatedLogic[] {
    const byName = new Map<string, Candidate[]>();
    for (const { file, source } of files) {
        for (const c of candidatesOf(file, source)) {
            const list = byName.get(c.name) ?? [];
            list.push(c);
            byName.set(c.name, list);
        }
    }

    const pairKey = (a: string, b: string): string => [a, b].sort().join('\n');
    const matches = (a: Candidate, b: Candidate, long: boolean): boolean => a.file !== b.file
        && (long ? similarity(a.tokens, b.tokens) >= MIN_SIMILARITY : same(a.tokens, b.tokens));

    const found: RepeatedLogic[] = [];
    const longPairs = new Set<string>();
    const collect = (long: boolean): void => {
        for (const [name, list] of byName) {
            const eligible = list.filter(c => (c.statements >= MIN_STATEMENTS) === long);
            const hit = new Set<Candidate>();
            for (let i = 0; i < eligible.length; i++) {
                for (let j = i + 1; j < eligible.length; j++) {
                    const [a, b] = [eligible[i], eligible[j]];
                    if (!matches(a, b, long)) continue;
                    if (!long && !longPairs.has(pairKey(a.file, b.file))) continue;
                    if (long) longPairs.add(pairKey(a.file, b.file));
                    hit.add(a).add(b);
                }
            }
            if (hit.size > 0) found.push({ name, locations: [...hit].map(c => ({ file: c.file, line: c.line })) });
        }
    };
    collect(true);
    collect(false);
    return found;
}

/** The PDX_REPEATED_LOGIC warning for one place a repeated function is written. */
export function repeatedLogicWarning(r: RepeatedLogic, at: { file: string; line: number }): ValidationWarning {
    const places = r.locations.map(l => `${l.file}:${l.line}`).join(', ');
    return {
        code: 'PDX_REPEATED_LOGIC',
        severity: 'warn',
        message: `'${r.name}' is written ${r.locations.length} times in the same shape (${places}) — extract a composable (CD-L1).`,
        hint: `Move it into one module the pages import (a .ts next to them, or src/data/), so a fix lands once.`,
        line: at.line,
    };
}
