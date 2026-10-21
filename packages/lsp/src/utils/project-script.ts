// The .pdx script projected into valid TypeScript, offsets unchanged: the @… runes blanked, the names
// they declare typed at the end, the $… runes left to their ambient declarations. Split from
// ts-service.ts, which hosts the language service that reads it.

import { DECORATOR_RUNES, parseActionDecl, parseFetchDecl, parseVariantsBlock, routeParamsType } from '@pdxui/compiler';
import { routeNameTypes } from './route-name-types';
import { formTypeOf } from './form-types';

// Statement-leading runes. We recognise them ONLY at the start of a line (indent aside):
// an `@form`/`@store` inside a comment ("(via @form rune)", for one) is not a rune.
// Every declaration the compiler knows, from its one rune list: a rune missing here would stay
// in the projected code as text, and `@inject employeeDocuments;` would become a name TypeScript
// cannot find.
const RUNE_KW = new RegExp(`@(${[...DECORATOR_RUNES.keys()].join('|')})\\b`, 'g');
// Not `store`: `@store cart;` names a store MODULE and makes no `cart` variable — the module exports
// `useCart()`. Declared, a script reading `cart` type-checked and threw a ReferenceError (#58).
const NAME_INTRO = new Set(['fetch', 'form']);

// Match: let x = $signal(   const y = $derived(   — a rune declaration.  Groups: [1]=let|const
// The compiler places these where every use can see them, so TypeScript must not report
// a use above the line as one before the declaration: the keyword is projected as `var`, padded to
// the same length.
const RUNE_DECL = /^([ \t]*)(let|const)(\s+[A-Za-z_$][\w$]*\s*(?::[^=\n]+)?=\s*\$(?:signal|derived|store)\b)/gm;

/** `a, B<c, d>, { e, f }` → its three entries: split on the commas outside brackets. */
function topLevelCommaSplit(text: string): string[] {
    const out: string[] = [];
    let depth = 0, start = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '{' || c === '(' || c === '[' || c === '<') depth++;
        else if (c === '}' || c === ')' || c === ']' || c === '>') depth--;
        else if (c === ',' && depth === 0) { out.push(text.slice(start, i)); start = i + 1; }
    }
    out.push(text.slice(start));
    return out.filter(e => e.trim());
}

/**
 * An `@action` (#501) projected: `inPlace`, the same length as `text`, with the head turned into
 * `;async(params)=>` before the body and everything after the body blanked — the body is checked
 * where it is written — and `decl`, appended after the script, which declares `name` as core's
 * Mutation typed by the first parameter and by what a copy of the body returns. Null when the text is
 * not a form of `@action` (the compiler reports it), or the head is too short to hold the arrow.
 */
function projectAction(text: string): { inPlace: string; decl: string } | null {
    const d = parseActionDecl(text);
    if (!d) return null;
    const arrow = `;async(${d.params})=>`;
    if (arrow.length > d.bodyStart) return null;
    const keep = (str: string) => str.replace(/[^\n]/g, ' ');
    const inPlace = arrow + keep(text.slice(arrow.length, d.bodyStart)) + text.slice(d.bodyStart, d.end) + keep(text.slice(d.end));
    // The copy types `{ signal }`, which the script's lenient check leaves `any` in place.
    const typedParams = d.params.replace(/\{\s*signal\s*\}\s*$/, '{ signal }: { signal: AbortSignal }');
    const fn = `__pdx_action_${d.name}`;
    const input = d.hasInput ? (d.inputType ?? 'any') : 'void';
    const decl = `var ${d.name}: import('@pdxui/core').Mutation<Awaited<ReturnType<typeof ${fn}>>, ${input}>; async function ${fn}(${typedParams}) {${d.body}}`;
    return { inPlace, decl };
}

/** Text the projection inserts, at an offset of the script; the virtual file maps around it. */
export interface ScriptInsertion {
    /** The offset in the script the text goes before. */
    at: number;
    length: number;
}

/** The index of the bracket that closes the one at `open`, strings stepped over; -1 if none. */
function closingBracket(s: string, open: number): number {
    const pairs: Record<string, string> = { '(': ')', '{': '}', '[': ']' };
    const stack: string[] = [];
    for (let i = open; i < s.length; i++) {
        const c = s[i];
        if (c === "'" || c === '"' || c === '`') {
            for (i++; i < s.length && s[i] !== c; i++) if (s[i] === '\\') i++;
            continue;
        }
        if (pairs[c]) stack.push(pairs[c]);
        else if (c === ')' || c === '}' || c === ']') {
            if (stack.pop() !== c) return -1;
            if (stack.length === 0) return i;
        }
    }
    return -1;
}

/**
 * Where the loader `fn`'s first parameter ends, to type it (#564): after the parameter as written,
 * before a default (`= {}`). Null when `fn` is not declared as a function or a const arrow here, takes
 * no parameter, or its first parameter is annotated already — the author's type stands.
 */
function loaderParamEnd(s: string, fn: string): number | null {
    // Match: `function loadUser(` or `const loadUser = async (` — the parameter list's `(`. Groups: none
    const decl = new RegExp(`(?:\\bfunction\\s+${fn}\\s*|\\b(?:const|let|var)\\s+${fn}\\s*=\\s*(?:async\\s*)?)\\(`).exec(s);
    if (!decl) return null;
    const open = decl.index + decl[0].length - 1;
    const close = closingBracket(s, open);
    if (close < 0) return null;
    // The first parameter: up to its top-level `,`, or the list's end.
    let end = open + 1;
    let colon = -1, equals = -1;
    for (; end < close; end++) {
        const c = s[end];
        if (c === '(' || c === '{' || c === '[') { const inner = closingBracket(s, end); if (inner < 0) return null; end = inner; continue; }
        if (c === ',') break;
        if (c === ':' && colon < 0) colon = end;
        if (c === '=' && s[end + 1] !== '>' && equals < 0) equals = end;
    }
    if (colon >= 0 && (equals < 0 || colon < equals)) return null;
    const stop = equals >= 0 ? equals : end;
    let at = stop;
    while (at > open + 1 && /\s/.test(s[at - 1])) at--;
    return at > open + 1 ? at : null;
}

/** Is the offset `idx` at the start of a line (only whitespace between the line start and idx)? */
function atLineStart(s: string, idx: number): boolean {
    let i = idx - 1;
    while (i >= 0 && (s[i] === ' ' || s[i] === '\t')) i--;
    return i < 0 || s[i] === '\n';
}

/** Projects the .pdx script into valid TS, with the length and the offsets unchanged.
 *  - `@prop name: T = d` → `var  name…` (a TYPED prop; `@prop`=5 → `var  `=5), `@model` the same (6 → 6);
 *    the `?` of an optional `@prop name?: T` is blanked.
 *  - the other @… runes → blanked out (from the keyword to a `;` at depth 0, or to the
 *    balanced `{…}`), preserving the newlines. The names of @fetch/@form are declared at
 *    the end, typed (their lines are blanked) → the references resolve.
 *  - the `$…` runes stay (they are declared ambient). */
export function projectScript(scriptContent: string): string {
    return projectScriptMapped(scriptContent, { typeLoader: false }).text;
}

/**
 * The projection of `projectScript`, and with `typeLoader` one insertion that moves offsets (#564): a
 * named loader's first parameter typed `: PdxLoaderContext<P>`, P the page pattern's params as the
 * router coerces them. No length-preserving form types an unannotated parameter — a function
 * declaration's parameters take no contextual type, and a `.ts` file reads no JSDoc type — so the
 * text is inserted, and the virtual file maps every offset around it (./virtual-file.ts).
 */
export function projectScriptMapped(scriptContent: string, { typeLoader = true } = {}): { text: string; insertions: ScriptInsertion[] } {
    const s = scriptContent;
    // The page's pattern (its first path) and the function its named loader calls, when there are both.
    let pattern: string | null = null;
    let loaderFn: string | null = null;
    // The `@params` declaration, typed once the pattern is known.
    let paramsDecl: string | null = null;
    const out = s.split('');
    // Each name a rune introduces → the type it is declared with at the end.
    const names = new Map<string, string>();
    // `@event name: T` → the script's `name(detail)`, declared typed by its payload.
    const emitters: string[] = [];
    RUNE_KW.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RUNE_KW.exec(s))) {
        if (!atLineStart(s, m.index)) continue;
        const kw = m[1];
        if (kw === 'prop' || kw === 'model') {
            // `var`, not `let`: the compiler declares props before anything reads them. A `@model`
            // (#124) is a prop the script writes, so it is the same typed name: `@model` → `var   `.
            `var${' '.repeat(kw.length - 2)}`.split('').forEach((ch, o) => { out[m!.index + o] = ch; });
            // `@prop hint?: T` (#130): a variable takes no `?`, so it is blanked — the name keeps its type.
            // Match: the name and the `?` after it. Groups: [1]=up to the `?`
            const optional = /^(\s+[A-Za-z_$][\w$]*\s*)\?/.exec(s.slice(m.index + 1 + kw.length));
            if (optional) out[m.index + 1 + kw.length + optional[1].length] = ' ';
            continue;
        }
        if (NAME_INTRO.has(kw)) {
            const after = /^\s+([A-Za-z_$][\w$]*)/.exec(s.slice(m.index + 1 + kw.length));
            if (after) names.set(after[1], 'any');
        }
        if (kw === 'inject') {
            // Match: @inject name from Token — typed by the token's value (#496), with a fallback or not.
            // Groups: [1]=the name [2]=the token
            const byToken = /^\s+([A-Za-z_$][\w$]*)\s+from\s+([A-Za-z_$][\w$]*)/.exec(s.slice(m.index + 1 + kw.length));
            if (byToken) {
                names.set(byToken[1], `import('@pdxui/core').ContextValue<typeof ${byToken[2]}>`);
            } else {
                // The alpha's string key, `@inject key;` / `@inject key as alias;` — an error the compiler
                // reports; the name stays `any` so it is not reported twice.
                // Groups: [1]=key (absent when it is quoted) [2]=alias
                const inj = /^\s+(?:'[^'\n]*'|"[^"\n]*"|([A-Za-z_$][\w$]*))(?:\s+as\s+([A-Za-z_$][\w$]*))?/.exec(s.slice(m.index + 1 + kw.length));
                const declared = inj && (inj[2] ?? inj[1]);
                if (declared) names.set(declared, 'any');
            }
        }
        if (kw === 'event') {
            // Match: @event name: PayloadType;  or  @event(bubbles) name: PayloadType; (#138)
            // Groups: [1]=name [2]=payload type (optional)
            const ev = /^(?:\(\s*bubbles\s*\))?\s+([A-Za-z_$][\w$]*)\s*(?::\s*([^;\n]+?))?\s*;?\s*(?:\n|$)/.exec(s.slice(m.index + 1 + kw.length));
            if (ev) emitters.push(ev[2] ? `var ${ev[1]}: (detail: ${ev[2]}) => void;` : `var ${ev[1]}: (detail?: unknown) => void;`);
        }
        if (kw === 'part') {
            // Match: @part trigger, popup; — each name is its element, null while not rendered (#134).
            // Typed by the tag it sits on would need the template; HTMLElement is what it always is.
            const list = /^\s+([\w\s,]+?)\s*;?\s*(?:\n|$)/.exec(s.slice(m.index + 1 + kw.length));
            for (const name of list ? list[1].split(',').map((n) => n.trim()).filter(Boolean) : []) {
                emitters.push(`var ${name}: HTMLElement | null;`);
            }
        }
        if (kw === 'snippet') {
            // Match: @snippet name(a, b) — the function the compiler declares (#206).
            // Groups: [1]=name [2]=parameters as written
            const sn = /^\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/.exec(s.slice(m.index + 1 + kw.length));
            if (sn) {
                const params = sn[2].split(',').map((p) => p.trim()).filter(Boolean);
                // Plain names keep their names; a default or a pattern is not read, so any arguments go.
                const signature = params.every((p) => /^[A-Za-z_$][\w$]*$/.test(p))
                    ? params.map((p) => `${p}?: any`).join(', ') : '...args: any[]';
                emitters.push(`var ${sn[1]}: (${signature}) => unknown;`);
            }
        }
        let depth = 0, j = m.index, ended = false;
        for (; j < s.length; j++) {
            const c = s[j];
            // A string is skipped whole: the `}` of `${id}` in `@fetch x: 'GET /a/${id}'` is not the
            // end of the rune (#487).
            if (c === "'" || c === '"' || c === '`') {
                for (j++; j < s.length && s[j] !== c && s[j] !== '\n'; j++) if (s[j] === '\\') j++;
                continue;
            }
            if (c === '{' || c === '(' || c === '[') depth++;
            else if (c === '}' || c === ')' || c === ']') {
                depth--;
                if (depth <= 0 && c === '}') {
                    // `@form name: { schema } { options };` goes on into its options block, and a
                    // `;` after the last block belongs to the rune. Ending at the first `}` would leave
                    // `{ save: onChange; … }` in the code.
                    let k = j + 1;
                    while (k < s.length && (s[k] === ' ' || s[k] === '\t' || s[k] === '\n' || s[k] === '\r')) k++;
                    if (s[k] === '{') { j = k - 1; depth = 0; continue; }
                    j = s[k] === ';' ? k + 1 : j + 1;
                    ended = true; break;
                }
            }
            else if (c === ';' && depth === 0) { j++; ended = true; break; }
        }
        if (!ended) { j = s.indexOf('\n', m.index); if (j < 0) j = s.length; }
        if (kw === 'action') {
            const projected = projectAction(s.slice(m.index, j));
            if (projected) {
                // The head becomes an arrow over the body, which stays where it is written and is checked
                // there; the typed copy at the end gives `name` its Mutation type (./project-script.ts).
                projected.inPlace.split('').forEach((ch, o) => { out[m!.index + o] = ch; });
                emitters.push(projected.decl);
                RUNE_KW.lastIndex = j;
                continue;
            }
        }
        if (kw === 'fetch') {
            // `as User` → `PdxResource<User>`, read by the compiler's own parser so the two cannot
            // disagree; `unknown` with no type. A line the compiler rejects stays `any`: it is
            // already an error, and a second one on every read of the name would bury it.
            const decl = parseFetchDecl(s.slice(m.index, j).replace(/\s+/g, ' ').trim());
            if (decl) names.set(decl.name, `PdxResource<${decl.type || 'unknown'}>`);
        }
        if (kw === 'loader') {
            // `@loader user: loadUser;` (#506): `user` reads what the function resolves to. The alpha's
            // anonymous `@loader fn;` declares nothing, and the compiler reports it.
            // Match: the name and the function. Groups: [1]=the name [2]=the function
            const named = /^@loader\s+([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)/.exec(s.slice(m.index, j));
            if (named) {
                names.set(named[1], `PdxLoaderSource<Awaited<ReturnType<typeof ${named[2]}>>>`);
                loaderFn = named[2];
            }
        }
        if (kw === 'page' && pattern === null) {
            // Match: the first quoted path of `@page '/users/:id(number)', …`. Groups: [1]=the quote [2]=the path
            const path = /^@page\s+(['"])([^'"\n]+)\1/.exec(s.slice(m.index, j));
            if (path) pattern = path[2];
        }
        if (kw === 'search') {
            // `searchParams`, under the type the compiler gives it (./route-name-types).
            for (const [name, type] of routeNameTypes(kw, s.slice(m.index, j))) names.set(name, type);
        }
        // Each param, read after the loop: a name alone takes its type from @page's pattern (#564).
        if (kw === 'params') paramsDecl = s.slice(m.index, j);
        if (kw === 'generic') {
            // `@generic T extends { id: string }, K;` (#490): inside the component a type parameter is
            // opaque, and reads as what its constraint promises — `unknown` without one.
            for (const entry of topLevelCommaSplit(s.slice(m.index + 1 + kw.length, j).replace(/;\s*$/, ''))) {
                // Match: `T` or `T extends X`, trimmed. Groups: [1]=the name [2]=the constraint
                const tp = /^([A-Za-z_$][\w$]*)(?:\s+extends\s([\s\S]+))?$/.exec(entry.trim());
                if (tp) emitters.push(`type ${tp[1]} = ${tp[2]?.trim() || 'unknown'};`);
            }
        }
        if (kw === 'variants') {
            // Each axis is a prop typed with its values (#153), read by the compiler's own parser.
            for (const axis of parseVariantsBlock(s.slice(m.index, j)).axes) {
                names.set(axis.name, axis.values.map((v) => `'${v}'`).join(' | '));
            }
        }
        if (kw === 'form') {
            // The form createForm builds from this declaration (./form-types); `any` only for one
            // the compiler does not understand, which it reports itself.
            const name = /^@form\s+([A-Za-z_$][\w$]*)/.exec(s.slice(m.index, j));
            const type = name && formTypeOf(s.slice(m.index, j));
            if (name && type) names.set(name[1], type);
        }
        for (let k = m.index; k < j; k++) if (out[k] !== '\n') out[k] = ' ';
        RUNE_KW.lastIndex = j;
    }
    if (paramsDecl !== null) {
        for (const [name, type] of routeNameTypes('params', paramsDecl, pattern ?? '')) names.set(name, type);
    }
    let res = out.join('');
    res = res.replace(RUNE_DECL, (_all, indent: string, kw: string, rest: string) => `${indent}${kw === 'let' ? 'var' : 'var  '}${rest}`);
    // `$derived(x)` is `computed(() => x)`: x is read later, so a const declared below it is no use
    // before its declaration (#467). Same length, so the offsets hold: `$drv(()=>x)`. Not for an
    // object literal, which an arrow would read as its body: `$derived({ … })` stays as written.
    res = res.replace(/\$derived\((?!\s*\{)/g, '$drv(()=>');
    // Every replacement above kept the length, so an offset of `s` is still one of `res`. The one
    // insertion comes last: the loader's first parameter, typed from the pattern the router matched.
    const insertions: ScriptInsertion[] = [];
    if (typeLoader && pattern !== null && loaderFn !== null) {
        const at = loaderParamEnd(s, loaderFn);
        if (at !== null) {
            const text = `: PdxLoaderContext<${routeParamsType(pattern)}>`;
            res = res.slice(0, at) + text + res.slice(at);
            insertions.push({ at, length: text.length });
        }
    }
    // `var`: declared after the code that reads them, as the compiler makes them available before it.
    const decls = [...[...names].map(([n, type]) => `var ${n}: ${type};`), ...emitters].join(' ');
    return { text: decls ? `${res}\n;${decls}` : res, insertions };
}
