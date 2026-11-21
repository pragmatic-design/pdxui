// `@host { … }` → the descriptor's `host` (#133). Each value is compiled the way the template
// compiles the same attribute on an element — `:x` read with the template's rewrite, `@x` with the
// template's handler builder — so a host binding means what an element binding means. Core's
// `bindHost` applies them, with the render's context.

import type { CompileContext } from './compile-context';
import type { HostAttr } from './script-analyzer-types';
import { prefixCtx, callSignals } from './codegen-prefix';
import { templateEventHandler } from './codegen-template-rewrite';
import { decodeEntities } from './codegen-template-inline';
import { invalidHostAttribute } from './host-block';
import { arrowBody, jsQuote, jsString } from './js-literal';

/**
 * The `host: { … }` entries for these attributes, or '' when there are none. The forms a host has no
 * meaning for are left out: validation reports them (`PDX_HOST_INVALID_ATTRIBUTE`).
 */
export function hostDescriptor(attrs: readonly HostAttr[], ctx: CompileContext, imports: Set<string>): string {
    const entries: string[] = [];
    for (const { name, value } of attrs) {
        if (invalidHostAttribute(name)) continue;
        if (name.startsWith(':')) {
            // `:hidden` with no value reads the identifier of the same name, as in the template.
            const expr = value ?? name.slice(1);
            // An object literal (`:class="{ a: x }"`) is returned, not read as a block (#1242).
            const read = `(ctx) => ${arrowBody(callSignals(prefixCtx(expr, ctx), ctx))}`;
            // `:class` and `:style` are the template's, not attributes (#1242): core's binders, imported
            // only by a host that writes them, so a host that does not carries none of their code.
            const binder = name === ':class' ? 'hostClass' : name === ':style' ? 'hostStyle' : null;
            if (binder) imports.add(binder);
            entries.push(`${jsQuote(name)}: ${binder ? `${binder}(${read})` : read}`);
        } else if (name.startsWith('@')) {
            if (value === undefined) continue;
            const event = name.slice(1).split('.')[0];
            imports.add('eventHandler');
            const handler = templateEventHandler(value, ctx, event);
            entries.push(`${jsQuote(name)}: (ctx, e) => (${handler})(e)`);
        } else {
            entries.push(`${jsQuote(name)}: ${jsString(decodeEntities(value ?? ''))}`);
        }
    }
    return entries.length > 0 ? `{ ${entries.join(', ')} }` : '';
}
