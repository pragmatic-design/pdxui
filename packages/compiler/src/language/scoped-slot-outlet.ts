// A child's scoped slot outlet, rewritten to a typed snippet (#492, part 4 of #131):
// `<slot name="row" :item="it">fallback</slot>` is `@slot row?: (item: T);` in the script and
// `@render row?.(it) @else { fallback }` in the template; with no fallback, `@render row?.(it)`.
// Every alpha slot was optional — a parent may not fill it — so the declaration keeps the `?`.
//
// The parameters are named after the outlet's bindings (`:row-index` → `rowIndex`). Their types are
// the alpha object form's when the script declares one, `@slot row: { item: User; index: number }`
// (replaced, and its key order kept), and `unknown` otherwise: the outlet's expression has no type
// the text can give, and a person narrows it.

import type { LanguageChange, LanguageChangeFinding } from './changes';
import { parseSFC } from '../parser/sfc';
import { applyEdits, attributeOf, braced, lineAt, selfClosing, slotClose, splitTopLevel, tagEnd, type TextEdit } from './slot-markup';

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** `row-index` → `rowIndex`. */
const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** One outlet of the template. */
interface Outlet { start: number; end: number; name: string; args: { key: string; expr: string }[]; fallback: string | null; finding: LanguageChangeFinding; note?: string }

/** The outlets in the template region `[from, to)` of `text`. */
function outletsIn(text: string, from: number, to: number): Outlet[] {
    const out: Outlet[] = [];
    // Match: the start of a `<slot` tag.
    const re = /<slot(?=[\s/>])/g;
    re.lastIndex = from;
    for (let m = re.exec(text); m && m.index < to; m = re.exec(text)) {
        const end = tagEnd(text, m.index);
        if (end === -1) continue;
        const tag = text.slice(m.index, end + 1);
        // Match: a bound attribute ` :name="expr"`. Groups: [1]=the name [2]|[3]=the expression
        const bound = [...tag.matchAll(/(?<=\s):([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)];
        if (tag.includes('let:') || bound.length === 0) continue;
        const finding: LanguageChangeFinding = { line: lineAt(text, m.index), found: tag };
        const name = attributeOf(tag, 'name') ?? 'default';
        const close = selfClosing(text, end) ? -1 : slotClose(text, end + 1);
        const outletEnd = close === -1 ? end + 1 : close + '</slot>'.length;
        const fallback = close === -1 ? null : text.slice(end + 1, close);
        const args = bound.map((b) => ({ key: camel(b[1]), expr: (b[2] ?? b[3]).trim() }));
        // Match: an attribute other than `name` and a `:binding`.
        const other = /(?<=\s)(?!name\s*=|:)[\w-]+/.test(tag.slice('<slot'.length).replace(/(["'])[\s\S]*?\1/g, '""'));
        let note: string | undefined;
        if (!IDENTIFIER.test(name) || name === 'default') note = `\`${name}\` is not a snippet name: name the slot with an identifier, then rewrite it.`;
        else if (other) note = 'The outlet carries attributes besides `name` and its bindings: rewrite it by hand.';
        else if (!selfClosing(text, end) && close === -1) note = 'The slot has no `</slot>`.';
        out.push({ start: m.index, end: outletEnd, name, args, fallback, finding, note });
    }
    return out;
}

/** The alpha object form `@slot name: { a: A; b: B };` of the script: its keys and types, and where the line is. */
interface ObjectForm { keys: { key: string; type: string }[]; start: number; end: number; indent: string }

function objectForms(script: string, offset: number): Map<string, ObjectForm> {
    const out = new Map<string, ObjectForm>();
    // Match: `@slot name: { … };` on a line. Groups: [1]=the indentation [2]=the name [3]=the object type's body
    for (const m of script.matchAll(/^([ \t]*)@slot\s+([A-Za-z_$][\w$]*)\s*\??\s*:\s*\{([^\n]*)\}\s*;?[ \t]*$/gm)) {
        const keys = splitTopLevel(m[3], /[;,]/).map((p) => {
            const at = p.indexOf(':');
            return { key: p.slice(0, at).replace('?', '').trim(), type: p.slice(at + 1).trim() };
        });
        out.set(m[2], { keys, start: offset + m.index, end: offset + m.index + m[0].length, indent: m[1] });
    }
    return out;
}

/** What `plan` finds: each outlet's finding, the edits, and the signature each rewritten slot gets. */
interface Plan { findings: LanguageChangeFinding[]; edits: TextEdit[]; signatures: Map<string, string[]> }

/** Every outlet of `text` with its rewrite, or with why it has none. */
function plan(text: string): Plan {
    const sfc = parseSFC(text);
    const none: Plan = { findings: [], edits: [], signatures: new Map() };
    if (!sfc.template) return none;
    const outlets = outletsIn(text, sfc.template.start, sfc.template.start + sfc.template.content.length);
    if (outlets.length === 0) return none;
    const script = sfc.script && !sfc.script.src ? sfc.script : null;
    const objects = script ? objectForms(script.content, script.start) : new Map<string, ObjectForm>();
    // Match: a typed `@slot name?: (…)` — a slot that already has a signature. Groups: [1]=the name
    const typed = new Set(script ? [...script.content.matchAll(/^[ \t]*@slot\s+([A-Za-z_$][\w$]*)\s*\??\s*:\s*\(/gm)].map((m) => m[1]) : []);
    const findings: LanguageChangeFinding[] = [];
    const edits: TextEdit[] = [];
    const declared = new Map<string, string[]>();
    const rewritten = new Set<string>();
    const signatures = new Map<string, string[]>();
    for (const o of outlets) {
        let note = o.note;
        if (!note && typed.has(o.name)) note = `The script already declares a signature for \`${o.name}\`: render it with \`@render\` and drop the outlet by hand.`;
        const object = objects.get(o.name);
        const order = object ? object.keys.map((k: { key: string }) => k.key) : declared.get(o.name) ?? o.args.map((a) => a.key);
        if (!note && o.args.some((a) => !order.includes(a.key))) note = `The outlet passes a key the slot's \`${object ? 'declared type' : 'other outlets'}\` lacks: rewrite it by hand.`;
        if (note) { findings.push({ ...o.finding, note }); continue; }
        findings.push(o.finding);
        rewritten.add(o.name);
        signatures.set(o.name, order);
        if (!object && !declared.has(o.name)) declared.set(o.name, order);
        const call = `@render ${o.name}?.(${order.map((k: string) => o.args.find((a) => a.key === k)?.expr ?? 'undefined').join(', ')})`;
        const empty = o.fallback === null || o.fallback.trim() === '';
        edits.push({ start: o.start, end: o.end, text: empty ? call : `${call} @else ${braced(o.fallback!)}` });
    }
    // The declarations: an object form becomes the signature; a slot with none gets one.
    const signature = (name: string, params: { key: string; type: string }[]) => `@slot ${name}?: (${params.map((p) => `${p.key}: ${p.type}`).join(', ')});`;
    for (const [name, object] of objects) {
        if (rewritten.has(name)) edits.push({ start: object.start, end: object.end, text: object.indent + signature(name, object.keys) });
    }
    const added = [...declared].map(([name, keys]) => signature(name, keys.map((key) => ({ key, type: 'unknown' }))));
    if (added.length) {
        if (script) edits.push({ start: script.start, end: script.start, text: added.map((l) => `\n${l}`).join('') });
        else edits.push({ start: text.length, end: text.length, text: `${text.endsWith('\n') ? '' : '\n'}<script>\n${added.join('\n')}\n</script>\n` });
    }
    return { findings, edits, signatures };
}

/**
 * The snippet signatures a component's alpha outlets will get once rewritten, each with its
 * parameters' names in order (the object form's key order when the script has one, the first
 * outlet's binding order otherwise), or null when it has no outlet to rewrite. What a parent's
 * `let:` slot is rewritten against while the child is still unmigrated.
 */
export function outletSnippetParams(text: string): Map<string, string[]> | null {
    const { signatures } = plan(text);
    return signatures.size ? signatures : null;
}

export const scopedSlotOutlet: LanguageChange = {
    id: 'scoped-slot-outlet',
    kind: 'removed',
    scope: 'pdx',
    issue: 492,
    message: 'A component renders a template it is given with `@render`: `<slot name="row" :item="it">fallback</slot>` is `@slot row?: (item: T);` in the script and `@render row?.(it) @else { fallback }` in the template.',
    marker: '<slot',
    detect: (text) => plan(text).findings,
    fix: (text) => applyEdits(text, plan(text).edits),
};

// ─── the object form left without an outlet ──────────────────────────────────────────────────

/** Every `@slot name: T` of the `.pdx` script whose type is not a signature, with its rewrite when T is an object literal. */
function objectFormSlots(text: string): { finding: LanguageChangeFinding; edit?: TextEdit }[] {
    const script = parseSFC(text).script;
    if (!script || script.src) return [];
    const out: { finding: LanguageChangeFinding; edit?: TextEdit }[] = [];
    // Match: `@slot name: T` on a line, T not a `(…)` signature. Groups: [1]=the indentation [2]=the name [3]=the type
    for (const m of script.content.matchAll(/^([ \t]*)@slot\s+([A-Za-z_$][\w$]*)\s*\??\s*:\s*(?![\s(])([^\n]*?)\s*;?[ \t]*$/gm)) {
        const start = script.start + m.index;
        const finding: LanguageChangeFinding = { line: lineAt(text, start), found: m[0].trim() };
        const object = /^\{(.*)\}$/.exec(m[3]);
        if (!object) { out.push({ finding: { ...finding, note: `Write its signature, \`@slot ${m[2]}?: (…)\`, by hand.` } }); continue; }
        const keys = splitTopLevel(object[1], /[;,]/).map((p) => {
            const at = p.indexOf(':');
            return `${p.slice(0, at).replace('?', '').trim()}: ${p.slice(at + 1).trim()}`;
        });
        out.push({ finding, edit: { start, end: start + m[0].length, text: `${m[1]}@slot ${m[2]}?: (${keys.join(', ')});` } });
    }
    return out;
}

export const slotObjectForm: LanguageChange = {
    id: 'slot-object-form',
    kind: 'removed',
    scope: 'pdx',
    issue: 492,
    message: 'A slot that passes data declares a signature: `@slot row: { item: User; index: number }` is `@slot row?: (item: User, index: number);`, rendered with `@render`.',
    marker: '@slot',
    detect: (text) => objectFormSlots(text).map((s) => s.finding),
    fix: (text) => applyEdits(text, objectFormSlots(text).flatMap((s) => (s.edit ? [s.edit] : []))),
};
