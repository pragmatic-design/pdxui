// The registry of language changes: every form the beta removes or changes, in one place (#121).
//
// The beta replaces the alpha; there is no language level to keep an old form compiling
// (`docs/language/beta/file.md` → «One language, no levels»). So each change is registered once, with
// how to find it, what to say and, when one exists, the mechanical rewrite, and two consumers read it:
//
//   - the compiler, which reports a `removed` form as PDX_REMOVED_FORM (error), naming the beta form;
//   - `pdx migrate`, which applies every mechanical rewrite and reports the rest.
//
// The four kinds are `docs/language/beta/migration.md`'s:
//   removed — a language change: the old form is an error, and the message names the new one;
//   changed — a language change whose old spelling is still valid beta with another meaning: the
//             compiler says nothing, `pdx migrate` rewrites it to keep the old meaning, or flags it;
//   fix     — a behaviour that changes because the old one was a defect: nothing is an error, and
//             `pdx migrate` only reports where it happens;
//   target  — compiled output that depends on `pdx({ target })`, with nothing to rewrite.
//
// Each issue that removes or changes a form adds its entry in its own pull request.

import { DEFER_TRIGGERS, unknownDeferTriggers } from '../compiler/defer-triggers';
import { escapeForRegExp } from '../compiler/regexp-escape';
import { bindsModel, type ModelsLookup } from '../compiler/validate-two-way';

/** What a change is, by `migration.md`'s classes. */
export type LanguageChangeKind = 'removed' | 'changed' | 'fix' | 'target';

/**
 * Where a change is looked for: a `.pdx` file as a whole; a script — the `<script>` of a `.pdx`,
 * and a `.ts`/`.js` module; or a Vite config (`vite.config.*`), where the plugin's options are.
 */
export type LanguageChangeScope = 'pdx' | 'script' | 'config';

/** One place a change was found: its line (1-based) in the text it was looked for in, and the text. */
export interface LanguageChangeFinding {
    line: number;
    found: string;
}

/**
 * What a change that depends on other files is given to look with: the components' models, for a
 * two-way binding whose child is another file (#124). A consumer without it finds nothing there.
 */
export interface LanguageChangeContext {
    modelsOf?: ModelsLookup;
}

/** A registered change. */
export interface LanguageChange {
    /** Stable, unique: what `pdx migrate` prints beside each finding. */
    id: string;
    kind: LanguageChangeKind;
    scope: LanguageChangeScope;
    /** The issue that specifies it. */
    issue: number;
    /** What to write instead, or what changed — one sentence, named by PDX_REMOVED_FORM and `pdx migrate`. */
    message: string;
    /**
     * The diagnostic the compiler already reports the form under, when it has one of its own
     * (`PDX_DEFER_UNKNOWN_TRIGGER`): then it is not reported a second time as PDX_REMOVED_FORM.
     */
    reportedAs?: string;
    /** For a removed export of `@pdxui/*`: what leaves the package and what replaces it. */
    export?: { from: string; name: string; replacement: string };
    /** Every place the form is in `text` (a file in the entry's scope). */
    detect(text: string, context?: LanguageChangeContext): LanguageChangeFinding[];
    /** The mechanical rewrite of a whole text, or `'flag'` when a person must rewrite it. */
    fix: ((text: string) => string) | 'flag';
}

/** The line (1-based) of `index` in `text`. */
function lineAt(text: string, index: number): number {
    let line = 1;
    for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
    return line;
}

/** Every match of `re` (a global regex) in `text`, as findings. */
function findAll(text: string, re: RegExp): LanguageChangeFinding[] {
    return [...text.matchAll(re)].map((m) => ({ line: lineAt(text, m.index), found: m[0].trim() }));
}

/**
 * A removed export of a `@pdxui/*` package: an import of it in a script is PDX_REMOVED_FORM naming
 * the replacement, and `pdx migrate` flags it in `.pdx` and `.ts` files alike.
 */
export function removedExport(from: string, name: string, replacement: string, issue: number): LanguageChange {
    // Match: `import { a, name, b as c } from 'from'` — the named list holding `name`, on one line or
    // several. Groups: none.
    const re = new RegExp(`import\\s*(?:type\\s+)?\\{[^}]*\\b${escapeForRegExp(name)}\\b[^}]*\\}\\s*from\\s*['"]${escapeForRegExp(from)}['"]`, 'g');
    return {
        id: `export:${from}:${name}`,
        kind: 'removed',
        scope: 'script',
        issue,
        message: `\`${name}\` is no longer exported by ${from}: use ${replacement}.`,
        export: { from, name, replacement },
        detect: (text) => findAll(text, re),
        fix: 'flag',
    };
}

// ─── The #187 fixes (decision 15) ────────────────────────────────────────────────────────────

/** The `$signal`s a script declares, each with the type argument it was written with ('' for none). */
function declaredSignals(text: string): { name: string; type: string }[] {
    const out: { name: string; type: string }[] = [];
    // Match: `let name = $signal` / `const name: T = $signal` — the type argument is read after it.
    // Groups: [1]=the name
    for (const m of text.matchAll(/\b(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*\$signal\b/g)) {
        let i = m.index + m[0].length;
        while (text[i] === ' ' || text[i] === '\t') i++;
        let type = '';
        if (text[i] === '<') {
            // The type argument, balanced: `<() => void>` holds a `>` of its own.
            let depth = 0;
            const start = i + 1;
            for (; i < text.length; i++) {
                if (text[i] === '<') depth++;
                else if (text[i] === '>' && text[i - 1] !== '=') { depth--; if (depth === 0) break; }
            }
            type = text.slice(start, i);
        }
        out.push({ name: m[1], type });
    }
    return out;
}

/** Whether a type argument is a function type: an arrow type, or `Function`. */
function isFunctionType(type: string): boolean {
    return /=>/.test(type) || /\bFunction\b/.test(type);
}

/** An arrow function, or a function expression, starting the text that follows an assignment. */
const FUNCTION_START = String.raw`(?:async\s+)?(?:function\b|\([^()]*\)\s*(?::[^=]+)?=>|[A-Za-z_$][\w$]*\s*=>)`;

const signalArrowAssignment: LanguageChange = {
    id: 'signal-arrow-assignment',
    kind: 'fix',
    scope: 'pdx',
    issue: 187,
    message: 'A function assigned to a $signal is now stored, not called with the previous value. '
        + 'If it meant an update, write the new value (`x = x + 1`, `x++`); if it is a callback, type the signal: `$signal<() => void>(…)`.',
    detect(text) {
        const findings: LanguageChangeFinding[] = [];
        for (const { name, type } of declaredSignals(text)) {
            if (isFunctionType(type)) continue;
            // Match: `name = (a) => …` / `name = a => …` / `name = function …` — a plain assignment,
            // not `==`, not a property (`x.name =`), not a declaration of another binding.
            const re = new RegExp(`(?<![\\w$.])(?<!\\b(?:let|const|var)\\s+)${escapeForRegExp(name)}\\s*=(?![=>])\\s*${FUNCTION_START}`, 'g');
            findings.push(...findAll(text, re));
        }
        return findings.sort((a, b) => a.line - b.line);
    },
    fix: 'flag',
};

const signalLogicalAssignment: LanguageChange = {
    id: 'signal-logical-assignment',
    kind: 'fix',
    scope: 'pdx',
    issue: 187,
    message: '`x ??= fn` (and `||=`, `&&=`) on a $signal now stores `fn`; it used to call it as an updater. '
        + 'Keep it if storing the function is what you meant.',
    detect(text) {
        const findings: LanguageChangeFinding[] = [];
        for (const { name } of declaredSignals(text)) {
            // Match: `name ??= <function>` / `||=` / `&&=`.
            const re = new RegExp(`(?<![\\w$.])${escapeForRegExp(name)}\\s*(?:\\?\\?|\\|\\||&&)=\\s*${FUNCTION_START}`, 'g');
            findings.push(...findAll(text, re));
        }
        return findings.sort((a, b) => a.line - b.line);
    },
    fix: 'flag',
};

// ─── Changes that landed before the registry (step 7 of #121) ────────────────────────────────

const inlineBindingsOption: LanguageChange = {
    id: 'inline-bindings-option',
    kind: 'removed',
    scope: 'config',
    issue: 107,
    message: '`pdx({ inlineBindings })` is not an option any more: remove it — there is one render path.',
    reportedAs: 'PDX_INLINE_BINDINGS_IGNORED',
    // Match: `inlineBindings:` as a key of an object literal.
    detect: (text) => findAll(text, /\binlineBindings\s*:/g),
    fix: 'flag',
};

const deferUnknownTrigger: LanguageChange = {
    id: 'defer-unknown-trigger',
    kind: 'removed',
    scope: 'pdx',
    issue: 260,
    message: `An unknown \`@defer\` trigger loaded the block at once: write \`immediate\` — what it did — or the trigger you meant (${DEFER_TRIGGERS.join(', ')}).`,
    reportedAs: 'PDX_DEFER_UNKNOWN_TRIGGER',
    detect(text) {
        const findings: LanguageChangeFinding[] = [];
        // Match: `@defer (` — the trigger is read to its balanced `)`: `idle(500)` holds one of its own.
        for (const m of text.matchAll(/@defer\s*\(/g)) {
            let depth = 1;
            let i = m.index + m[0].length;
            const start = i;
            for (; i < text.length && depth > 0; i++) {
                if (text[i] === '(') depth++;
                else if (text[i] === ')') depth--;
            }
            const trigger = text.slice(start, i - 1);
            if (unknownDeferTriggers(trigger).length > 0) findings.push({ line: lineAt(text, m.index), found: `@defer (${trigger})` });
        }
        return findings;
    },
    fix: 'flag',
};

// ─── #124: two-way binding is a contract ─────────────────────────────────────────────────────

const twoWayNotModel: LanguageChange = {
    id: 'two-way-not-model',
    kind: 'removed',
    scope: 'pdx',
    issue: 124,
    message: '`::x` binds a component prop both ways only when the child declares it `@model x`: declare it in the child, or bind it one way with `:x`.',
    reportedAs: 'PDX_TWO_WAY_NOT_MODEL',
    detect(text, context) {
        const modelsOf = context?.modelsOf;
        if (!modelsOf) return [];
        const findings: LanguageChangeFinding[] = [];
        // Match: the opening tag of a custom element. Groups: [1]=the tag
        for (const tag of text.matchAll(/<([A-Za-z][\w]*-[\w-]*)\b[^>]*>/g)) {
            const models = modelsOf(tag[1].toLowerCase());
            if (!models) continue;
            // Match: a `::name` binding in that tag. Groups: [1]=the name
            for (const b of tag[0].matchAll(/(?<=\s)::([A-Za-z][\w-]*)/g)) {
                if (bindsModel(models, b[1])) continue;
                findings.push({ line: lineAt(text, tag.index + b.index), found: `::${b[1]}` });
            }
        }
        return findings;
    },
    fix: 'flag',
};

// ─── #126: the two-way modifiers ─────────────────────────────────────────────────────────────

const twoWayNumber: LanguageChange = {
    id: 'two-way-number',
    kind: 'changed',
    scope: 'pdx',
    issue: 126,
    message: '`::x.number` now writes null for an empty entry, and nothing for an invalid one (the element is marked invalid); it wrote 0 for both. '
        + 'Check that the value it binds accepts null.',
    // Match: a two-way binding with `.number` among its modifiers.
    detect: (text) => findAll(text, /(?<=\s)::[A-Za-z][\w-]*(?:\.[\w()]+)*\.number(?=[.=])(?:\.[\w()]+)*/g),
    fix: 'flag',
};

/** Every registered change, in the order `pdx migrate` reports them. */
export const LANGUAGE_CHANGES: readonly LanguageChange[] = [
    signalArrowAssignment,
    signalLogicalAssignment,
    inlineBindingsOption,
    deferUnknownTrigger,
    twoWayNotModel,
    twoWayNumber,
];

let active: readonly LanguageChange[] = LANGUAGE_CHANGES;

/** The changes the compiler and `pdx migrate` apply: the registry, unless a test has replaced it. */
export function languageChanges(): readonly LanguageChange[] {
    return active;
}

/**
 * Test seam: apply `changes` instead of the registry, or the registry again with `null`. A test of
 * the consumers needs a removed form to exist before any issue has removed one.
 */
export function setLanguageChangesForTests(changes: readonly LanguageChange[] | null): void {
    active = changes ?? LANGUAGE_CHANGES;
}
