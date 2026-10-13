// `@host { … }` → the descriptor's `host` (#133). Each value is compiled the way the template
// compiles the same attribute on an element — `:x` read with the template's rewrite, `@x` with the
// template's handler builder — so a host binding means what an element binding means. Core's
// `bindHost` applies them, with the render's context.

import type { CompileContext } from './compile-context';
import type { HostAttr } from './script-analyzer-types';
import { prefixCtx, callSignals } from './codegen-prefix';
import { buildEventHandler } from './codegen-template-rewrite';
import { decodeEntities } from './codegen-template-inline';
import { invalidHostAttribute } from './host-block';
import { jsQuote, jsString } from './js-literal';

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
            entries.push(`${jsQuote(name)}: (ctx) => ${callSignals(prefixCtx(expr, ctx), ctx)}`);
        } else if (name.startsWith('@')) {
            if (value === undefined) continue;
            const event = name.slice(1).split('.')[0];
            imports.add('batchHandler');
            imports.add('safeHandler');
            const handler = `safeHandler(${buildEventHandler(value, ctx)}, ctx.el?.tagName?.toLowerCase(), ${jsQuote(event)})`;
            entries.push(`${jsQuote(name)}: (ctx, e) => (${handler})(e)`);
        } else {
            entries.push(`${jsQuote(name)}: ${jsString(decodeEntities(value ?? ''))}`);
        }
    }
    return entries.length > 0 ? `{ ${entries.join(', ')} }` : '';
}
