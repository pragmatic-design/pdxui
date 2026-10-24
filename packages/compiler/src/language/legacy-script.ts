// The legacy script mode, removed (#158), and `@mixin` with it (decision 6).
//
// The script has one grammar: props are `@prop`, events are `@event`, and every top-level name reaches
// the template. So `defineProps`, `defineEmits` and a top-level `return { … }` are forms the beta
// removed (PDX_REMOVED_FORM), and `pdx migrate` converts what it can read:
//   defineProps({ label: { type: String, default: 'a' }, items: Array })
//       → @prop label: string = 'a';  @prop items: unknown[] | undefined = undefined;
//   const emit = defineEmits<{ saved: number }>();  emit('saved', 1)
//       → @event saved: number;  saved(1)          (ctx.emit, which `emit` called, does not bubble)
//   return { a, b }  → removed: a top-level name is the template's already.
// What it cannot read — a typed `defineProps<…>()`, a prop option other than type/default/required, a
// default that is a factory, a renamed or computed return, an event name that is not an identifier —
// is left as written, and stays a finding `pdx migrate` lists for a person.

import { parseSFC } from '../parser/sfc';
import { findClosing, maskNonCode, splitAtDepthZero } from '../compiler/tokenizer';
import type { LanguageChange, LanguageChangeFinding } from './changes';

/** The inline script of a .pdx: its content and where the content starts in the file. */
function scriptOf(text: string): { content: string; start: number } | null {
    const script = parseSFC(text).script;
    return script && !script.src ? { content: script.content, start: script.start } : null;
}

/** The line (1-based) of `index` in `text`. */
function lineAt(text: string, index: number): number {
    return text.slice(0, index).split('\n').length;
}

/** The brace depth at the start of each line of `masked`, code whose strings and comments are blank. */
function depthAtLines(masked: string): number[] {
    const out: number[] = [];
    let d = 0;
    for (const l of masked.split('\n')) {
        out.push(d);
        for (const ch of l) {
            if (ch === '{') d++;
            else if (ch === '}') d--;
        }
    }
    return out;
}

// Match: a legacy call. Groups: [1]=the call's name
const LEGACY_CALL = /\b(defineProps|defineEmits)\s*[<(]/g;
// Match: a `return {` that opens its line.
const RETURN_OPEN = /^\s*return\s*\{/;

/**
 * Every legacy marker of a script: its offset in the script and the text found. Read on the code with
 * its strings and comments blanked (positions kept), once: a marker inside a comment is not one.
 */
function markers(code: string): { at: number; found: string }[] {
    const masked = maskNonCode(code);
    const out: { at: number; found: string }[] = [];
    for (const m of masked.matchAll(LEGACY_CALL)) out.push({ at: m.index, found: m[1] });
    const depth = depthAtLines(masked);
    let offset = 0;
    masked.split('\n').forEach((line, i) => {
        if (depth[i] === 0 && RETURN_OPEN.test(line)) out.push({ at: offset + line.search(/\S/), found: 'return { … }' });
        offset += line.length + 1;
    });
    return out.sort((a, b) => a.at - b.at);
}

// ─── defineProps ─────────────────────────────────────────────────────────────────────────────

const PROP_TYPES: Record<string, string> = {
    String: 'string', Number: 'number', Boolean: 'boolean', Array: 'unknown[]',
    Object: 'Record<string, unknown>', Function: '(...args: unknown[]) => unknown',
};

/** One prop of a `defineProps({ … })` object as an `@prop` line, or null when it cannot be read. */
function propLine(entry: string): string | null {
    const colon = entry.indexOf(':');
    if (colon < 0) return null;
    const name = entry.slice(0, colon).trim().replace(/^['"]|['"]$/g, '');
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) return null;
    const value = entry.slice(colon + 1).trim();
    let type: string | undefined;
    let fallback: string | undefined;
    let required = false;
    if (/^\w+$/.test(value)) {
        type = PROP_TYPES[value];
    } else if (value.startsWith('{') && value.endsWith('}')) {
        for (const field of splitAtDepthZero(value.slice(1, -1), ',').map((f) => f.trim()).filter(Boolean)) {
            const at = field.indexOf(':');
            if (at < 0) return null;
            const key = field.slice(0, at).trim();
            const v = field.slice(at + 1).trim();
            if (key === 'type') type = PROP_TYPES[v];
            else if (key === 'default') fallback = v;
            else if (key === 'required') required = v === 'true';
            else return null;
        }
    }
    if (!type) return null;
    // A factory default (`() => []`) was called by the alpha's props for an Array or an Object: a
    // person decides what it becomes.
    if (fallback !== undefined && value !== 'Function' && type !== PROP_TYPES.Function && /^(?:\(|function\b|\w+\s*=>)/.test(fallback)) return null;
    if (fallback !== undefined) return `@prop ${name}: ${type} = ${fallback};`;
    return required ? `@prop ${name}: ${type};` : `@prop ${name}: ${type} | undefined = undefined;`;
}

/** The statement `[const x =] defineProps({ … });` at `at`: its extent and its `@prop` lines. */
function convertProps(code: string, at: number): { from: number; to: number; text: string } | null {
    const open = code.indexOf('(', at);
    const brace = code.slice(open + 1).search(/\S/) + open + 1;
    if (code[at + 'defineProps'.length] !== '(' && !/^\s*\(/.test(code.slice(at + 'defineProps'.length))) return null;
    if (code[brace] !== '{') return null;
    const close = findClosing(code, brace);
    if (close < 0) return null;
    const paren = code.slice(close + 1).search(/\S/) + close + 1;
    if (code[paren] !== ')') return null;
    const lines: string[] = [];
    for (const entry of splitAtDepthZero(code.slice(brace + 1, close), ',').map((e) => e.trim()).filter(Boolean)) {
        const line = propLine(entry);
        if (!line) return null;
        lines.push(line);
    }
    return { ...statementExtent(code, at, paren + 1), text: lines.join('\n') };
}

// ─── defineEmits ─────────────────────────────────────────────────────────────────────────────

/** The statement `[const emit =] defineEmits[<{ … }>]();` at `at`, with its `@event` lines and calls rewritten. */
function convertEmits(code: string, at: number): string | null {
    let i = at + 'defineEmits'.length;
    while (/\s/.test(code[i] ?? '')) i++;
    let typed: string | null = null;
    if (code[i] === '<') {
        const brace = code.indexOf('{', i);
        if (brace < 0 || code.slice(i + 1, brace).trim()) return null;
        const close = findClosing(code, brace);
        if (close < 0) return null;
        typed = code.slice(brace + 1, close);
        i = code.indexOf('>', close) + 1;
        if (i <= 0 || code.slice(close + 1, i - 1).trim()) return null;
        while (/\s/.test(code[i] ?? '')) i++;
    }
    if (code[i] !== '(') return null;
    const end = code.indexOf(')', i);
    if (end < 0 || code.slice(i + 1, end).trim()) return null;

    const extent = statementExtent(code, at, end + 1);
    const binding = /const\s+([A-Za-z_$][\w$]*)\s*=\s*$/.exec(code.slice(extent.from, at))?.[1] ?? 'emit';
    // The declarations take the statement's place, and its newline when it had one.
    const tail = code[extent.to - 1] === '\n' ? '\n' : '';
    const rest = code.slice(0, extent.from) + '\u0000' + code.slice(extent.to);

    const events = new Map<string, string>();
    if (typed !== null) {
        for (const member of typed.split(/[;,\n]/).map((m) => m.trim()).filter(Boolean)) {
            const m = /^([A-Za-z_$][\w$]*)\s*:\s*(.+)$/.exec(member);
            if (!m) return null;
            events.set(m[1], m[2].trim());
        }
    }
    // Match: a call of the emit binding with a quoted event name. Groups: [1]=the event name
    const CALL = new RegExp(`\\b${binding}\\(\\s*['"]([^'"]*)['"]\\s*(,\\s*)?`, 'g');
    let ok = true;
    const rewritten = rest.replace(CALL, (_m, name: string) => {
        if (!/^[A-Za-z_$][\w$]*$/.test(name)) { ok = false; return _m; }
        if (!events.has(name)) {
            if (typed !== null) { ok = false; return _m; }
            events.set(name, 'unknown');
        }
        return `${name}(`;
    });
    // The binding read any other way — passed on, called with a computed name — is a person's.
    if (!ok || new RegExp(`\\b${binding}\\b`).test(rewritten.replace('\u0000', ''))) return null;
    const decls = [...events].map(([name, type]) => `@event ${name}: ${type};`).join('\n');
    return rewritten.replace('\u0000', decls ? decls + tail : '');
}

// ─── return { … } ────────────────────────────────────────────────────────────────────────────

/** The top-level `return { a, b };` that opens at `at`, when every entry is a shorthand name. */
function returnExtent(code: string, at: number): { from: number; to: number } | null {
    const brace = code.indexOf('{', at);
    const close = findClosing(code, brace);
    if (close < 0) return null;
    const entries = splitAtDepthZero(code.slice(brace + 1, close), ',').map((e) => e.trim()).filter(Boolean);
    if (!entries.every((e) => /^[A-Za-z_$][\w$]*$/.test(e))) return null;
    return statementExtent(code, at, close + 1);
}

/**
 * A statement from `at` to `end`, widened to its whole lines: back to the start of its line (and its
 * `const x =` before `at`), forward over a `;` and the end of the line.
 */
function statementExtent(code: string, at: number, end: number): { from: number; to: number } {
    let from = code.lastIndexOf('\n', at - 1) + 1;
    let to = end;
    if (code[to] === ';') to++;
    while (code[to] === ' ' || code[to] === '\t') to++;
    if (code[to] === '\n') to++;
    // The last line with no newline after it: take the newline before it instead.
    else if (to === code.length && from > 0) from--;
    return { from, to };
}

/**
 * The script with its markers converted where they can be. The first of each kind only: a legacy
 * script has one `defineProps`, one `defineEmits` and one top-level `return` — a second is not a
 * script the alpha compiled either — and each conversion scans the rest of the script once.
 */
function convertScript(code: string): string {
    let out = code;
    // The later one first, so the earlier one's offset stays valid.
    const firsts = (['return { … }', 'defineProps'] as const)
        .map((kind) => markers(out).find((m) => m.found === kind))
        .filter((m): m is { at: number; found: string } => m !== undefined)
        .sort((a, b) => b.at - a.at);
    for (const marker of firsts) {
        if (marker.found === 'defineProps') {
            const props = convertProps(out, marker.at);
            if (props) out = out.slice(0, props.from) + props.text + (out[props.to - 1] === '\n' ? '\n' : '') + out.slice(props.to);
        } else {
            const ret = returnExtent(out, marker.at);
            if (ret) out = out.slice(0, ret.from) + out.slice(ret.to);
        }
    }
    // The events last: their calls are anywhere in the script, before or after the declaration.
    const emits = markers(out).find((m) => m.found === 'defineEmits');
    if (emits) out = convertEmits(out, emits.at) ?? out;
    return out;
}

export const legacyScript: LanguageChange = {
    id: 'legacy-script',
    kind: 'removed',
    scope: 'pdx',
    issue: 158,
    message: 'the script has one grammar: declare a prop with `@prop name: T = value;` and an event with `@event name: T;`, '
        + 'and drop `return { … }` — every top-level name reaches the template.',
    // Match: what `markers` finds — a legacy call, or a `return {`.
    marker: /defineProps|defineEmits|return\s*\{/,
    detect(text): LanguageChangeFinding[] {
        const script = scriptOf(text);
        if (!script) return [];
        return markers(script.content).map((m) => ({ line: lineAt(text, script.start + m.at), found: m.found }));
    },
    fix(text) {
        const script = scriptOf(text);
        if (!script) return text;
        const next = convertScript(script.content);
        return text.slice(0, script.start) + next + text.slice(script.start + script.content.length);
    },
};

// ─── @mixin ──────────────────────────────────────────────────────────────────────────────────

// Match: an `@mixin './path' as name` declaration opening its line.
const MIXIN = /^[ \t]*(@mixin\s+'[^']+'\s+as\s+[A-Za-z_$][\w$]*)/gm;

export const mixinRemoved: LanguageChange = {
    id: 'mixin-removed',
    kind: 'removed',
    scope: 'pdx',
    issue: 158,
    message: '`@mixin` is removed: call an imported function that uses core\'s lifecycle functions — `const thing = useThing();` — '
        + 'and change the module\'s `setup(ctx)` into that function.',
    marker: '@mixin',
    detect(text): LanguageChangeFinding[] {
        const script = scriptOf(text);
        if (!script) return [];
        return [...script.content.matchAll(MIXIN)].map((m) => ({ line: lineAt(text, script.start + m.index), found: m[1] }));
    },
    fix: 'flag',
};
