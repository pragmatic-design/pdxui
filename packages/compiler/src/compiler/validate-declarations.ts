// PDX_DUP_DECLARATION — one name declared twice by the component's declarations.
//
// `const icon = $derived(…)` followed by `let icon = $signal(null)` would compile with no diagnostic,
// and the output declares `__icon` once: one of the two is dropped, and which one decides what the
// component does. The output cannot honour both, so it is an error, and it names both lines.
//
// The declarations are the component's own names: everything the top of the script declares — a
// rune (`$signal`, `$derived`, `$store`), a plain `const`/`let`/`var`, a function, a class — and
// `@prop`. A local of the same name inside a function is another scope, and not one.

import ts from 'typescript';
import type { SFCDescriptor } from '../parser/sfc';
import type { ValidationWarning } from './validate';
import { parseableScript } from './validate-design';

const RUNES = new Set(['$signal', '$derived', '$store']);

interface Declaration { name: string; kind: string; line: number }

/**
 * The 1-based line of an absolute offset into `source`. The line starts are found once: splitting
 * the text up to each offset made a component's declarations O(n²) to locate.
 */
function lineIndex(source: string): (offset: number) => number {
    const lineStarts = [0];
    for (let i = 0; i < source.length; i++) if (source[i] === '\n') lineStarts.push(i + 1);
    return (offset) => {
        let lo = 0, hi = lineStarts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (lineStarts[mid] <= offset) lo = mid; else hi = mid - 1;
        }
        return lo + 1;
    };
}

/** The names the script declares at its top level, in source order, with the line of each. */
function declarations(descriptor: SFCDescriptor, source: string): Declaration[] {
    const script = descriptor.script;
    if (!script || !script.content.trim()) return [];
    const lineAt = lineIndex(source);
    const found: Declaration[] = [];
    // Match: a `@prop name` line. Groups: [1]=the name
    for (const m of script.content.matchAll(/^[ \t]*@prop\s+([A-Za-z_$][\w$]*)/gm)) {
        found.push({ name: m[1], kind: '@prop', line: lineAt(script.start + m.index!) });
    }
    const sf = parseableScript(script.content);
    const at = (node: ts.Node) => lineAt(script.start + node.getStart(sf));
    for (const st of sf.statements) {
        // A function, a class: plain declarations of the setup's scope. Next to a rune of the same
        // name the clash vanishes from the module (the signal is `__name`), and the auto-return's
        // duplicate key decides which one the template sees.
        if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) {
            found.push({ name: st.name.text, kind: ts.isFunctionDeclaration(st) ? 'function' : 'class', line: at(st.name) });
            continue;
        }
        if (!ts.isVariableStatement(st)) continue;
        const keyword = st.declarationList.flags & ts.NodeFlags.Const ? 'const' : st.declarationList.flags & ts.NodeFlags.Let ? 'let' : 'var';
        for (const d of st.declarationList.declarations) {
            const init = d.initializer;
            const rune = init && ts.isCallExpression(init) && ts.isIdentifier(init.expression) && RUNES.has(init.expression.text)
                ? init.expression.text : null;
            if (ts.isIdentifier(d.name)) {
                found.push({ name: d.name.text, kind: rune ?? keyword, line: at(d.name) });
                continue;
            }
            // A destructuring declares every name in its pattern.
            const visit = (n: ts.BindingName) => {
                if (ts.isIdentifier(n)) found.push({ name: n.text, kind: keyword, line: at(n) });
                else for (const el of n.elements) if (!ts.isOmittedExpression(el)) visit(el.name);
            };
            visit(d.name);
        }
    }
    return found.sort((a, b) => a.line - b.line);
}

/** An error for every name a component declares more than once, reported on the later line. */
export function validateDeclarations(descriptor: SFCDescriptor, source: string): ValidationWarning[] {
    const first = new Map<string, Declaration>();
    const warnings: ValidationWarning[] = [];
    for (const d of declarations(descriptor, source)) {
        const earlier = first.get(d.name);
        if (!earlier) { first.set(d.name, d); continue; }
        warnings.push({
            code: 'PDX_DUP_DECLARATION',
            severity: 'error',
            message: `'${d.name}' is declared twice: ${earlier.kind} on line ${earlier.line} and ${d.kind} on line ${d.line}. `
                + `The compiled component keeps one of them, and nothing says which.`,
            hint: `Rename one of them, or remove the one you do not mean.`,
            line: d.line,
        });
    }
    return warnings;
}
