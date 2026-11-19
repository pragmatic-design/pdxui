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

/** Is the row of this `@for` static (see the header)? */
export function isStaticRow(node: ForNode, ctx: CompileContext): boolean {
    if (node.virtual || node.transition || !isRowBinding(node)) return false;
    const item = node.item.trim();
    const consts = [...ctx.literalConsts].filter((n) => !ctx.scopeVars.has(n) && n !== item && n !== node.index);
    // The track expression is constant for the row too (#110), whitespace removed as the keys are.
    const track = node.track.replace(/\s+/g, '');
    return allConstant(node.body, [item, ...(track ? [track] : []), ...consts]);
}
