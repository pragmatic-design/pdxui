// Component-design checks — the rules of docs/PDX-COMPONENT-DESIGN.md a compiler can decide from one
// file. Separate from validate.ts, which checks script against template, and from
// validate-styles.ts, which checks what the browser will not read.
//
//   CD-A1  PDX_DOCUMENT_QUERY    a component reaches its own elements through a `:ref`
//   CD-A2  PDX_PROP_WRITE        a component does not write its own props
//   CD-D3  PDX_LISTENER_LEAK     a document/window listener is removed when the component goes
//   CD-C2  PDX_LIBRARY_INTERNALS an app's styles do not reach a library element's internal classes
//   CD-S2  PDX_DERIVED_WRITE     what a $derived returns is not written (validate-data-flow.ts)
//   CD-D2  PDX_EFFECT_STATE      an effect does not compute state, heuristic (validate-data-flow.ts)
//
// All are warnings: each has a legitimate exception somewhere (a portal, a deliberate override), and
// a check that is wrong once and loud is a check people learn to skip.

import ts from 'typescript';
import type { SFCDescriptor } from '../parser/sfc';
import type { ScriptAnalysis } from './script-analyzer-types';
import type { ValidationWarning } from './validate';
import { checkDataFlow } from './validate-data-flow';

const DOM_QUERIES = new Set(['querySelector', 'querySelectorAll', 'getElementById']);

/**
 * `pdx-*` classes the library puts on the APP's own elements to report a state: styling them is the
 * API, not a reach into internals (CD-C2). Each one names who sets it. A class belongs here only
 * when the element carrying it is the app's; one on an element the library renders is internal.
 */
const PUBLIC_STATE_CLASSES = new Map<string, string>([
    ['pdx-in-view', 'useScrollAnimation, on the element it watches (composables docs)'],
    ['pdx-out-view', 'useScrollAnimation, on the element it watches (composables docs)'],
    ['pdx-app-navbar-collapsed', 'pdx-app-layout, on the navbar the app slots in'],
]);
const GLOBAL_TARGETS = new Set(['document', 'window']);

/** 1-based line of an absolute offset into the file. */
function lineAt(source: string, offset: number): number {
    return source.slice(0, offset).split('\n').length;
}

/**
 * The script as TypeScript can parse it, same length and same lines. A line opening with a PDX
 * declaration (`@prop x: T = v;`, `@page '/x';`) is not TypeScript, so it is blanked; the parser
 * recovers from what follows a multi-line declaration, and nothing this file looks for lives there.
 */
export function parseableScript(content: string): ts.SourceFile {
    const blanked = content.replace(/^[ \t]*@[^\n]*/gm, (line) => ' '.repeat(line.length));
    return ts.createSourceFile('__pdx_design.ts', blanked, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

/** True when a parameter or a local declaration between `node` and the file scope names `name`. */
function isShadowed(node: ts.Node, name: string): boolean {
    for (let p: ts.Node | undefined = node.parent; p && !ts.isSourceFile(p); p = p.parent) {
        if (ts.isFunctionLike(p) && p.parameters.some(prm => ts.isIdentifier(prm.name) && prm.name.text === name)) return true;
        if (ts.isBlock(p)) {
            for (const st of p.statements) {
                if (ts.isVariableStatement(st) && st.declarationList.declarations.some(d => ts.isIdentifier(d.name) && d.name.text === name)) return true;
            }
        }
    }
    return false;
}

/** The identifier a prop write targets, or null: `x = …`, `x += …`, `x++`, `--x`. */
function writtenIdentifier(n: ts.Node): ts.Identifier | null {
    if (ts.isBinaryExpression(n)
        && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment
        && ts.isIdentifier(n.left)) return n.left;
    if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n))
        && (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)
        && ts.isIdentifier(n.operand)) return n.operand;
    return null;
}

/** `{ once: true }` or `{ signal }`: a listener that removes itself, or that an AbortController removes. */
function removesItself(options: ts.Expression | undefined): boolean {
    if (!options || !ts.isObjectLiteralExpression(options)) return false;
    return options.properties.some(p => {
        const key = p.name && ts.isIdentifier(p.name) ? p.name.text : '';
        if (key === 'signal') return true;
        return key === 'once' && ts.isPropertyAssignment(p) && p.initializer.kind === ts.SyntaxKind.TrueKeyword;
    });
}

/** CD-A1, CD-A2 and CD-D3: one walk over the script. */
function checkScript(descriptor: SFCDescriptor, analysis: ScriptAnalysis | null, source: string): ValidationWarning[] {
    const script = descriptor.script;
    if (!script || !script.content.trim()) return [];
    const sf = parseableScript(script.content);
    const at = (node: ts.Node): number => lineAt(source, script.start + node.getStart(sf));
    const props = new Set((analysis?.props ?? []).map(p => p.name));
    const warnings: ValidationWarning[] = [];
    const added: { key: string; event: string; target: string; line: number }[] = [];
    const removed = new Set<string>();

    const visit = (n: ts.Node): void => {
        if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression)) {
            const target = n.expression.expression.text;
            const method = n.expression.name.text;
            if (target === 'document' && DOM_QUERIES.has(method)) {
                warnings.push({
                    code: 'PDX_DOCUMENT_QUERY',
                    severity: 'warn',
                    message: `'document.${method}' reaches past this component (CD-A1): it finds whatever matches in the whole page, `
                        + `including another instance, and nothing when the element is elsewhere. Use a :ref.`,
                    hint: `Bind the element with ':ref' to a $signal and use that; for a child component's own elements, ask the child (@expose a command).`,
                    line: at(n),
                });
            }
            const event = n.arguments[0] && ts.isStringLiteralLike(n.arguments[0]) ? n.arguments[0].text : '';
            if (GLOBAL_TARGETS.has(target) && event && method === 'addEventListener' && !removesItself(n.arguments[2])) {
                added.push({ key: `${target}:${event}`, event, target, line: at(n) });
            }
            if (GLOBAL_TARGETS.has(target) && event && method === 'removeEventListener') removed.add(`${target}:${event}`);
        }
        const written = writtenIdentifier(n);
        if (written && props.has(written.text) && !isShadowed(written, written.text)) {
            warnings.push({
                code: 'PDX_PROP_WRITE',
                severity: 'warn',
                message: `'${written.text}' is a @prop, and this component writes it (CD-A2): the parent owns it, and its next value overwrites this one.`,
                hint: `Emit the new value with an @event and let the parent set it; for a starting value, copy it into a $signal (initial${written.text[0].toUpperCase()}${written.text.slice(1)}).`,
                line: at(written),
            });
        }
        ts.forEachChild(n, visit);
    };
    visit(sf);

    // CD-S2 and CD-D2, over the same tree.
    const signals = new Set((analysis?.signals ?? []).map(s => s.name));
    const deriveds = new Set((analysis?.deriveds ?? []).map(d => d.name));
    warnings.push(...checkDataFlow(sf, signals, deriveds, at, descriptor.template?.content ?? ''));

    for (const a of added) {
        if (removed.has(a.key)) continue;
        warnings.push({
            code: 'PDX_LISTENER_LEAK',
            severity: 'warn',
            message: `'${a.target}.addEventListener('${a.event}', …)' is never removed (CD-D3): it outlives the component and keeps acting on a screen that is gone.`,
            hint: `Register it in onMount and remove it in an onDestroy beside it: onDestroy(() => ${a.target}.removeEventListener('${a.event}', handler)).`,
            line: a.line,
        });
    }
    return warnings;
}

/**
 * The selector without its `:not(…)` arguments, balanced parentheses included: `nav:not(:where(.pdx-nav))`
 * EXCLUDES the library's element, it does not style it.
 */
function withoutNegations(selector: string): string {
    let out = '';
    for (let i = 0; i < selector.length; i++) {
        if (!selector.startsWith(':not(', i)) { out += selector[i]; continue; }
        let depth = 0;
        let j = i + 4;
        for (; j < selector.length; j++) {
            if (selector[j] === '(') depth++;
            else if (selector[j] === ')' && --depth === 0) break;
        }
        i = j;
    }
    return out;
}

/** CD-C2: a `.pdx-*` class in a selector that neither the template nor the script writes. */
function checkStyles(descriptor: SFCDescriptor, source: string): ValidationWarning[] {
    const own = new Set<string>();
    for (const text of [descriptor.template?.content ?? '', descriptor.script?.content ?? '']) {
        // Match: a pdx-* token anywhere the app writes it (class="…", :class, classList.add('…')).
        for (const m of text.matchAll(/\bpdx-[a-zA-Z0-9_-]+/g)) own.add(m[0]);
    }
    const warnings: ValidationWarning[] = [];
    for (const style of descriptor.styles ?? []) {
        // Comments blanked to the same length, so offsets still map onto the file.
        const css = style.content.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
        // Match: a rule's selector — the text after a `{`, `}` or the start, up to its `{`, not an at-rule.
        // Groups: [1]=the selector
        const rule = /(?:^|[{}])\s*([^{}@;][^{};]*?)\s*\{/g;
        let m: RegExpExecArray | null;
        while ((m = rule.exec(css)) !== null) {
            const selector = m[1];
            const shown = selector.trim().replace(/\s+/g, ' ');
            const reached = new Set([...withoutNegations(selector).matchAll(/\.(pdx-[a-zA-Z0-9_-]+)/g)].map(c => c[1]));
            for (const cls of reached) {
                if (own.has(cls) || PUBLIC_STATE_CLASSES.has(cls)) continue;
                warnings.push({
                    code: 'PDX_LIBRARY_INTERNALS',
                    severity: 'warn',
                    message: `'.${cls}' in '${shown}' is a library element's internal class (CD-C2): it is not an API, `
                        + `and a rename breaks this rule without a sound.`,
                    hint: `Use the element's props, variants or documented --pdx-* properties. If several pages need this override, the element needs a prop: report it.`,
                    line: lineAt(source, style.start + m.index + m[0].indexOf(selector)),
                });
            }
        }
    }
    return warnings;
}

/**
 * The component-design warnings for one `.pdx` file. `analysis` is the script
 * analyzer's result, for the declared props; `source` is the whole file, because block offsets
 * point into it and the lines reported are the file's.
 */
export function validateDesign(descriptor: SFCDescriptor, analysis: ScriptAnalysis | null, source: string): ValidationWarning[] {
    return [...checkScript(descriptor, analysis, source), ...checkStyles(descriptor, source)];
}
