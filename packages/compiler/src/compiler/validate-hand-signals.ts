// A signal() or computed() written by hand in <script setup> and read bare by the template (#362).
//
// The inline path compiles `{{ name }}` to `bindInterpolation(t, () => ctx.name)` and `:title="name"`
// to an assignment of `ctx.name`: for a name declared with `$signal` / `$derived` that is the value,
// for one created by hand it is the signal FUNCTION, and the page shows its source text. The language
// has one way to declare state the template reads; this says so where the other way is used.
//
// Reported only where it breaks: the name read bare (not called, `name()`, and not reached through,
// `name.set(…)`), in an interpolation or a bound attribute. A hand-written signal the script keeps for
// itself is its business.

import type { SFCDescriptor } from '../parser/sfc';
import type { ScriptAnalysis } from './script-analyzer-types';
import type { ValidationWarning } from './validate';

// Match: `const name = signal(` / `let label: T = computed<T>(` at the start of a statement.
// Groups: [1]=the name [2]=signal or computed
const HAND_WRITTEN = /(?:^|[;\n])[ \t]*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(signal|computed)\s*(?:<[^>\n]*>)?\s*\(/g;

/** What the template reads as values: each `{{ … }}` and each bound attribute's `:name="…"`. */
function valueExpressions(template: string): string[] {
    const out: string[] = [];
    for (const m of template.matchAll(/\{\{([\s\S]*?)\}\}/g)) out.push(m[1]);
    // Match: ` :title="…"` / ` :aria-label='…'` — a bound attribute and its value.
    // Groups: [1]=the double-quoted value [2]=the single-quoted value
    for (const m of template.matchAll(/\s:[\w.:-]+\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out.push(m[1] ?? m[2]);
    return out;
}

/** Whether `name` appears in `expr` as a value: not called, not a property of something, not followed by a property. */
function readsBare(expr: string, name: string): boolean {
    const escaped = name.replace(/\$/g, '\\$');
    return new RegExp(`(?<![\\w$.])${escaped}(?![\\w$])(?!\\s*[(.])`).test(expr);
}

/** The hand-written signals and computeds that the template reads bare, each placed at its declaration. */
export function validateHandWrittenSignals(
    descriptor: SFCDescriptor, analysis: ScriptAnalysis | null, source: string,
): ValidationWarning[] {
    const script = descriptor.script;
    const template = descriptor.template;
    if (!analysis || analysis.mode !== 'new' || !script || script.src || !template || template.src) return [];
    const expressions = valueExpressions(template.content);
    if (expressions.length === 0) return [];

    const warnings: ValidationWarning[] = [];
    for (const m of script.content.matchAll(HAND_WRITTEN)) {
        const [, name, kind] = m;
        if (!expressions.some((e) => readsBare(e, name))) continue;
        const rune = kind === 'signal' ? '$signal' : '$derived';
        const at = script.start + m.index + m[0].indexOf(name);
        warnings.push({
            code: 'PDX_HAND_WRITTEN_SIGNAL',
            severity: 'error',
            message: `'${name}' is created with ${kind}() and read by the template, which shows the signal function, not its value.`,
            hint: kind === 'signal'
                ? `Declare it with the rune the template reads: let ${name} = $signal(…);`
                : `Declare it with the rune the template reads: const ${name} = $derived(…); — the expression, not a function.`,
            suggestion: rune,
            line: source.slice(0, at).split('\n').length,
        });
    }
    return warnings;
}
