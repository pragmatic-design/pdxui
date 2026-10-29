// A popup's open state is announced as an overlay's: `open-change` `{ value }`, `true` on open and
// `false` on close, in place of `pdx-open` and `pdx-close` (#287, #288; decision 50).
//
// `pdx migrate` rewrites the listeners mechanically, as `docs/language/beta/migration.md` says. The
// handler becomes a statement list that starts with a guard, because the template's handler rewriter
// rewrites signal writes statement by statement, not inside an expression. With `S'` a handler's
// statements, and a bare reference `fn` written `fn($event)` (the runtime calls a bare reference with
// the event):
//
//   @pdx-open="S"  → @open-change="if (!$event.detail.value) return; S'"
//   @pdx-close="S" → @open-change="if ($event.detail.value) return; S'"
//   both           → one @open-change: `if ($event.detail.value) return O; C'` when the open handler is
//                    a single call or reference O, or the mirror when the close handler is; flagged when
//                    neither is.
//
// An arrow function, two listeners on the same event, or two different modifier lists is flagged. The
// tags are those that trade the pair for `open-change`: each component adds itself in the pull request
// that brings it over, the overlays of #288 too.
//
// The same components drive the popup with the overlay verbs: `pdx-select`'s `openSelect()`,
// `closeSelect()` and `toggleSelect()` are `show()`, `close()` and `toggle()` (#287). The three names
// are pdx-select's alone — a DataSource's `toggleSelect(id)` takes an argument, a call with none is the
// select's — so the rewrite is mechanical wherever the call is written. `pdx-cascader`'s undeclared
// `openCascader()` and `closeCascader()`, and `pdx-tree-select`'s `openTreeSelect()` and
// `closeTreeSelect()`, are `show()` and `close()` the same way, and so are `pdx-date-picker`'s
// `openPopover()` and `closePopover()` — no other component set those names on its element.
// `pdx-autocomplete`'s and `pdx-color-picker`'s `open()` are tied to the tag by a `:ref` (below).

import type { LanguageChange, LanguageChangeFinding, LanguageChangeScope } from './changes';
import { parseSFC } from '../parser/sfc';
import { escapeForRegExp } from '../compiler/regexp-escape';

/** The tags that announce their popup with `open-change`, and no longer with `pdx-open`/`pdx-close`. */
export const OPEN_CHANGE_TAGS: ReadonlySet<string> = new Set(['pdx-select', 'pdx-cascader', 'pdx-tree-select', 'pdx-date-picker']);

/** The line (1-based) of `index` in `text`. */
const lineAt = (text: string, index: number): number => text.slice(0, index).split('\n').length;

// Match: the opening tag of a custom element, quoted values read whole (a handler holds `=>`).
// Groups: [1]=the tag [2]=its attributes
const CUSTOM_TAG = /<([A-Za-z][\w]*-[\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
// Match: a `pdx-open` or `pdx-close` listener, with the whitespace before it.
// Groups: [1]=the whitespace [2]=open|close [3]=its modifiers [4]=the quote [5]=the handler
const LISTENER = /(\s+)@pdx-(open|close)((?:\.[\w-]+)*)\s*=\s*(["'])([\s\S]*?)\4/g;

interface Listener { at: number; length: number; space: string; which: 'open' | 'close'; modifiers: string; quote: string; handler: string }
interface Tag { at: number; listeners: Listener[] }

/** Every tag in `OPEN_CHANGE_TAGS` with a `pdx-open` or `pdx-close` listener. */
function tagsWithListeners(text: string): Tag[] {
    const out: Tag[] = [];
    for (const tag of text.matchAll(CUSTOM_TAG)) {
        if (!OPEN_CHANGE_TAGS.has(tag[1].toLowerCase())) continue;
        const attrsAt = tag.index + 1 + tag[1].length;
        const listeners = [...tag[2].matchAll(LISTENER)].map((l): Listener => ({
            at: attrsAt + l.index, length: l[0].length, space: l[1], which: l[2] as 'open' | 'close',
            modifiers: l[3], quote: l[4], handler: l[5].trim().replace(/;\s*$/, '').trim(),
        }));
        if (listeners.length) out.push({ at: tag.index, listeners });
    }
    return out;
}

/** A handler that is a reference: `load`, `form.reset`. */
const REFERENCE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
// Match: a callee, a reference followed by its opening parenthesis. Groups: none
const CALLEE = /^[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*\s*\(/;

/** Whether `handler` is one call, `load(x)`: its first parenthesis closes at its end. */
function isSingleCall(handler: string): boolean {
    const callee = CALLEE.exec(handler);
    if (!callee) return false;
    let depth = 0;
    let quote = '';
    for (let i = callee[0].length - 1; i < handler.length; i++) {
        const c = handler[i];
        if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
        if (c === '"' || c === "'" || c === '`') quote = c;
        else if (c === '(') depth++;
        else if (c === ')' && --depth === 0) return i === handler.length - 1;
    }
    return false;
}

/** The handler as statements: a reference is called with the event. */
const statements = (handler: string): string => REFERENCE.test(handler) ? `${handler}($event)` : handler;

/** Whether the handler is one call or a reference, which a guard can `return`. */
const isSingle = (handler: string): boolean => REFERENCE.test(handler) || isSingleCall(handler);

/** Why the tag's listeners are not rewritten, or null when they are. */
function whyNot(tag: Tag): string | null {
    const [a, b] = tag.listeners;
    if (tag.listeners.length > 2 || (b && a.which === b.which)) return 'two listeners on the same event.';
    if (tag.listeners.some((l) => /=>/.test(l.handler) || l.handler === '')) return 'the handler is an arrow function or empty; write it as statements.';
    if (b && a.modifiers !== b.modifiers) return 'the two listeners have different modifiers.';
    if (b && !isSingle(a.handler) && !isSingle(b.handler)) return 'neither handler is a single call; join them under one `@open-change` by hand.';
    return null;
}

/** The `@open-change` attribute that replaces the tag's listeners. */
function rewrite(tag: Tag): string {
    const open = tag.listeners.find((l) => l.which === 'open');
    const close = tag.listeners.find((l) => l.which === 'close');
    const first = tag.listeners[0];
    let value: string;
    if (open && close) {
        value = isSingle(open.handler)
            ? `if ($event.detail.value) return ${statements(open.handler)}; ${statements(close.handler)}`
            : `if (!$event.detail.value) return ${statements(close.handler)}; ${statements(open.handler)}`;
    } else if (open) {
        value = `if (!$event.detail.value) return; ${statements(open.handler)}`;
    } else {
        value = `if ($event.detail.value) return; ${statements(close!.handler)}`;
    }
    // The handler is written as it was, inside its quote; a `$event` adds none. The first listener's
    // whitespace stays, so the attribute keeps its line.
    return `${first.space}@open-change${first.modifiers}=${first.quote}${value}${first.quote}`;
}

export const openChangeEvent: LanguageChange = {
    id: 'open-change-event',
    kind: 'removed',
    scope: 'pdx',
    issue: 287,
    message: 'the popup announces its open state with `open-change` `{ value }`, `true` on open and `false` on close: `pdx-open` and `pdx-close` are gone.',
    // Match: a `pdx-open` or `pdx-close` listener attribute. Groups: none
    marker: /@pdx-(?:open|close)\b/,
    detect(text): LanguageChangeFinding[] {
        return tagsWithListeners(text).map((tag) => {
            const why = whyNot(tag);
            return {
                line: lineAt(text, tag.listeners[0].at),
                found: tag.listeners.map((l) => `@pdx-${l.which}${l.modifiers}`).join(' '),
                note: why ? `Not rewritten: ${why}` : 'Here, write `@open-change`.',
            };
        });
    },
    fix(text) {
        let out = text;
        // From the last, so earlier offsets stay valid.
        for (const tag of tagsWithListeners(text).reverse()) {
            if (whyNot(tag)) continue;
            const [first, second] = tag.listeners;
            if (second) out = out.slice(0, second.at) + out.slice(second.at + second.length);
            out = out.slice(0, first.at) + rewrite(tag) + out.slice(first.at + first.length);
        }
        return out;
    },
};

/** A component's alpha popup methods, each a name no other component has, and the verb each is. */
interface AliasVerbs { id: string; message: string; verbs: Record<string, string> }

/** Every call of one of `verbs`, with no argument, in `text`; the template's alone in the `pdx` scope. */
function aliasCalls(text: string, verbs: Record<string, string>, scope: LanguageChangeScope): RegExpMatchArray[] {
    let from = 0;
    let to = text.length;
    if (scope === 'pdx') {
        const template = parseSFC(text).template;
        if (!template || template.src) return [];
        from = template.start;
        to = template.start + template.content.length;
    }
    // Match: a call of one of the names, with no argument — a DataSource's `toggleSelect(id)` has one.
    // Groups: [1]=the method
    const call = new RegExp(`\\.\\s*(${Object.keys(verbs).map(escapeForRegExp).join('|')})\\s*\\(\\s*\\)`, 'g');
    return [...text.matchAll(call)].filter((m) => m.index! >= from && m.index! < to);
}

/** The entry that rewrites `alias`'s calls to the overlay verbs, in a scope. */
function aliasVerbs(alias: AliasVerbs, scope: LanguageChangeScope): LanguageChange {
    return {
        id: scope === 'pdx' ? alias.id : `${alias.id}-script`,
        kind: 'removed',
        scope,
        issue: 287,
        message: alias.message,
        marker: new RegExp(`(?:${Object.keys(alias.verbs).map(escapeForRegExp).join('|')})\\s*\\(`),
        detect: (text) => aliasCalls(text, alias.verbs, scope).map((m) => ({
            line: lineAt(text, m.index!), found: m[0], note: `Here, write \`.${alias.verbs[m[1]]}()\`.`,
        })),
        fix: (text) => {
            let out = text;
            for (const m of aliasCalls(text, alias.verbs, scope).reverse()) {
                out = out.slice(0, m.index!) + `.${alias.verbs[m[1]]}()` + out.slice(m.index! + m[0].length);
            }
            return out;
        },
    };
}

const SELECT_VERBS: AliasVerbs = {
    id: 'select-overlay-verbs',
    message: '`pdx-select` drives its popup with the overlay verbs: `openSelect()` is `show()`, `closeSelect()` is `close()`, `toggleSelect()` is `toggle()`.',
    verbs: { openSelect: 'show', closeSelect: 'close', toggleSelect: 'toggle' },
};
const CASCADER_VERBS: AliasVerbs = {
    id: 'cascader-overlay-verbs',
    message: '`pdx-cascader` drives its popup with the overlay verbs: `openCascader()` is `show()`, `closeCascader()` is `close()`.',
    verbs: { openCascader: 'show', closeCascader: 'close' },
};

export const selectOverlayVerbs = aliasVerbs(SELECT_VERBS, 'pdx');
export const selectOverlayVerbsScript = aliasVerbs(SELECT_VERBS, 'script');
const TREE_SELECT_VERBS: AliasVerbs = {
    id: 'tree-select-overlay-verbs',
    message: '`pdx-tree-select` drives its popup with the overlay verbs: `openTreeSelect()` is `show()`, `closeTreeSelect()` is `close()`.',
    verbs: { openTreeSelect: 'show', closeTreeSelect: 'close' },
};

const DATE_PICKER_VERBS: AliasVerbs = {
    id: 'date-picker-overlay-verbs',
    message: '`pdx-date-picker` drives its popup with the overlay verbs: `openPopover()` is `show()`, `closePopover()` is `close()`.',
    verbs: { openPopover: 'show', closePopover: 'close' },
};

export const cascaderOverlayVerbs = aliasVerbs(CASCADER_VERBS, 'pdx');
export const cascaderOverlayVerbsScript = aliasVerbs(CASCADER_VERBS, 'script');
export const treeSelectOverlayVerbs = aliasVerbs(TREE_SELECT_VERBS, 'pdx');
export const treeSelectOverlayVerbsScript = aliasVerbs(TREE_SELECT_VERBS, 'script');
export const datePickerOverlayVerbs = aliasVerbs(DATE_PICKER_VERBS, 'pdx');
export const datePickerOverlayVerbsScript = aliasVerbs(DATE_PICKER_VERBS, 'script');

// `pdx-autocomplete`'s and `pdx-color-picker`'s `open()` is `show()`; their `close()` stays (#287).
// `open()` is a common name — a dialog has one — so the call is rewritten only where its receiver is
// tied to the tag by the text: the name a `:ref` binds on that tag in the same file, called in its
// template or its script. A call on a lookup of the tag (`querySelector('pdx-autocomplete')`) is
// flagged; anything else cannot be told from any other `open()`, and is left.

/** Every `name.open()` / `name?.open()` of a name a `:ref` binds on `tag`. Groups: [1]=the name [2]=the access */
function refOpenCalls(text: string, tag: string): RegExpMatchArray[] {
    // Match: a `:ref` on the tag's opening tag, quoted values read whole. Groups: [1]=the bound name
    const ref = new RegExp(`<${escapeForRegExp(tag)}\\b(?:[^>"']|"[^"]*"|'[^']*')*?\\s:ref\\s*=\\s*["']\\s*([A-Za-z_$][\\w$]*)\\s*["']`, 'gi');
    const names = [...new Set([...text.matchAll(ref)].map((m) => m[1]))];
    if (names.length === 0) return [];
    // Match: the name standing alone, its member access and `open()`. Groups: [1]=the name [2]=`.` or `?.`
    const call = new RegExp(`(?<![\\w$.])(${names.map(escapeForRegExp).join('|')})\\s*(\\??\\.)\\s*open\\s*\\(\\s*\\)`, 'g');
    return [...text.matchAll(call)];
}

/** The pair of entries for a tag whose undeclared `open()` is `show()`: the ref'd calls, and the lookups. */
function openShow(tag: string, id: string): { ref: LanguageChange; unbound: LanguageChange } {
    // Match: `.open()` on a lookup of the tag, `querySelector('<tag>')` or `('#f <tag>')`, with an
    // optional `!` or index. Groups: [1]=the quote
    const lookup = (): RegExp => new RegExp(
        `querySelector(?:All)?\\s*\\(\\s*(['"\`])[^'"\`]*${escapeForRegExp(tag)}[^'"\`]*\\1\\s*\\)\\s*(?:\\[\\s*\\d+\\s*\\])?\\s*!?\\s*\\??\\.\\s*open\\s*\\(\\s*\\)`, 'g');
    return {
        ref: {
            id: `${id}-open-show`,
            kind: 'removed',
            scope: 'pdx',
            issue: 287,
            message: `\`${tag}\` opens its popup with the overlay verb: \`open()\` is \`show()\`; \`close()\` is unchanged.`,
            marker: tag,
            detect: (text) => refOpenCalls(text, tag).map((m) => ({ line: lineAt(text, m.index!), found: m[0], note: `Here, write \`${m[1]}${m[2]}show()\`.` })),
            fix: (text) => {
                let out = text;
                for (const m of refOpenCalls(text, tag).reverse()) {
                    out = out.slice(0, m.index!) + `${m[1]}${m[2]}show()` + out.slice(m.index! + m[0].length);
                }
                return out;
            },
        },
        unbound: {
            id: `${id}-open-unbound`,
            kind: 'removed',
            scope: 'script',
            issue: 287,
            message: `\`${tag}\`'s \`open()\` is \`show()\`.`,
            marker: tag,
            detect: (text) => [...text.matchAll(lookup())].map((m) => ({
                line: lineAt(text, m.index!), found: m[0],
                note: `Not rewritten: the call is on a lookup, not a \`:ref\` of this file; write \`show()\` if it is a ${tag}.`,
            })),
            fix: 'flag',
        },
    };
}

const AUTOCOMPLETE_OPEN = openShow('pdx-autocomplete', 'autocomplete');
const COLOR_PICKER_OPEN = openShow('pdx-color-picker', 'color-picker');

export const autocompleteOpenShow = AUTOCOMPLETE_OPEN.ref;
export const autocompleteOpenUnbound = AUTOCOMPLETE_OPEN.unbound;
export const colorPickerOpenShow = COLOR_PICKER_OPEN.ref;
export const colorPickerOpenUnbound = COLOR_PICKER_OPEN.unbound;
