// Static rows (#1233): a `@for` row whose content follows only from its item is built once, from the
// item, with nothing reactive in it — core's `eachStatic`. A `@for` row is otherwise a small reactive
// unit: an item signal and an effect per binding, where a hand-written `items.map(k => html`…`)` built
// each row once. Measured: pdx-kbd's keys mounted 1.14–1.20× its TypeScript version.
//
// The compiler proves it from the row's template, before generating it. A row is static when every
// value it binds is made of literals, literal script constants, and the loop's item itself — the item
// as a whole, not a member of it. A member is left out: an item may be a `$store` proxy, mutated in
// place, whose member reads subscribe; written once, the row would not see the write. The item as a
// whole has no such reads: a row whose key keeps a different item is built again (core's reconcile).
//
// Kept reactive, as today: a row that reads the index, a prop, a signal, a call (it may read a signal),
// a member of the item; a row with a block inside (`@if`, a nested `@for`…), a two-way binding, an
// attachment, a pipe. Event handlers do not make a row reactive: they run when the event fires.

import type { ForNode, TemplateNode } from '../parser/template';
import type { CompileContext } from './compile-context';
import { isRowBinding } from './codegen-prefix';
import { isLiteralExpression } from './codegen-constant-bindings';
import { openingTagTexts } from '../text-scan';

// Match: a bound attribute in an opening tag — `:x="…"`, `:class.on="…"`, `::x="…"`, `attach:x="…"`.
// Groups: [1]=the name with its sigil [2]/[3]=the value
const BOUND = /(?<=\s)((?:::|:|attach:)[\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** Is every value bound in `nodes` constant, with `item` constant? Null-safe: anything unknown says no. */
function allConstant(nodes: TemplateNode[], constants: string[]): boolean {
    for (const node of nodes) {
        if (node.type === 'interpolation') {
            if (node.pipes.length > 0 || !isLiteralExpression(node.expr, constants)) return false;
            continue;
        }
        if (node.type !== 'html' || node.raw) return false;
        for (const tag of openingTagTexts(node.content)) {
            for (const m of tag.matchAll(BOUND)) {
                const name = m[1];
                if (name.startsWith('::') || name.startsWith('attach:') || name === ':ref' || name === ':show') return false;
                if (!isLiteralExpression(m[2] ?? m[3] ?? '', constants)) return false;
            }
        }
    }
    return true;
}

/** Does a tag in `nodes` — html and interpolations, no block — carry a two-way binding (`::x`)? */
function hasTwoWay(nodes: readonly TemplateNode[]): boolean {
    for (const node of nodes) {
        if (node.type !== 'html') continue;
        for (const tag of openingTagTexts(node.content)) {
            for (const m of tag.matchAll(BOUND)) if (m[1].startsWith('::')) return true;
        }
    }
    return false;
}

/**
 * May `nodes` — html and interpolations, no block — read `name`? Its interpolations, every opening tag
 * (bindings and handlers alike), and the text of an html node with a `${…}` in it. A word match that
 * is not a member (`x.name`): one in a string or a static attribute says yes too, which only keeps the
 * row reactive.
 */
function mayRead(nodes: readonly TemplateNode[], name: string): boolean {
    // Match: `name` as a whole identifier, not after a `.` — groups: none
    const word = new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`);
    for (const node of nodes) {
        if (node.type === 'interpolation') {
            if (word.test(node.expr)) return true;
        } else if (node.type === 'html') {
            if (node.content.includes('${') ? word.test(node.content) : openingTagTexts(node.content).some((tag) => word.test(tag))) return true;
        }
    }
    return false;
}

/**
 * Is the row of this `@for` a value row (#1237): its item a value, not a signal? Every binding keeps
 * its effect, so a `$store` proxy's member reads still subscribe, and a new item for the row's key runs
 * them again on it in place (core's list-static.ts) — what setting a reactive row's item signal does,
 * without the signal and its subscriptions on every row.
 *
 * Not one: a row that reads its index (it moves; its reads must follow), one with a two-way binding
 * (it writes through the item), a `@virtual` list, a `@transition`, and a row with a block inside
 * (`@if`, an inner `@for`…): a block's own bindings sit below its effect, where running the row's
 * effects again cannot reach them, and such a row would be built again for each new item.
 */
export function isValueRow(node: ForNode): boolean {
    if (node.virtual || node.transition || !isRowBinding(node)) return false;
    if (!node.body.every((n) => n.type === 'html' || n.type === 'interpolation')) return false;
    if (hasTwoWay(node.body)) return false;
    return !node.index || !mayRead(node.body, node.index);
}

/** Is the row of this `@for` static (see the header)? */
export function isStaticRow(node: ForNode, ctx: CompileContext): boolean {
    if (node.virtual || node.transition || !isRowBinding(node)) return false;
    // A handler is not a binding, but one that reads the index must see where the row is now: a static
    // row's index is its position when built, which a move does not update.
    if (node.index && mayRead(node.body, node.index)) return false;
    const item = node.item.trim();
    const consts = [...ctx.literalConsts].filter((n) => !ctx.scopeVars.has(n) && n !== item && n !== node.index);
    // The track expression is constant for the row too (#110), whitespace removed as the keys are.
    const track = node.track.replace(/\s+/g, '');
    return allConstant(node.body, [item, ...(track ? [track] : []), ...consts]);
}
