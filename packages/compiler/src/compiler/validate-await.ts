// PDX_AWAIT_TIMING (#145): `@await`'s `maxMs` not greater than its `minMs`.
//
// `minMs` delays `@loading`; `maxMs` is a timeout to `@error`. A timeout that is not later than the
// delay gives up before the spinner could show.

import type { TemplateNode } from '../parser/template';
import type { ValidationWarning } from './validate';

/** Every node array a template node holds: bodies, branches, the cases of a `@switch`. */
function childLists(node: TemplateNode): TemplateNode[][] {
    const out: TemplateNode[][] = [];
    for (const value of Object.values(node)) {
        if (!Array.isArray(value) || value.length === 0) continue;
        const first: unknown = value[0];
        if (typeof first !== 'object' || first === null) continue;
        // A list of nodes (`body`, `loading`, …), or a `@switch`'s cases, each holding a `body`.
        if ('type' in first) out.push(value as TemplateNode[]);
        else for (const c of value as { body?: TemplateNode[] }[]) if (Array.isArray(c.body)) out.push(c.body);
    }
    return out;
}

/** PDX_AWAIT_TIMING for every `@await` whose `maxMs` is not greater than its `minMs`. */
export function checkAwaitTiming(ast: TemplateNode[], warnings: ValidationWarning[]): void {
    for (const node of ast) {
        if (node.type === 'await' && node.minMs !== undefined && node.maxMs !== undefined && node.maxMs <= node.minMs) {
            warnings.push({
                code: 'PDX_AWAIT_TIMING',
                severity: 'error',
                message: `@await's maxMs (${node.maxMs}) is not greater than its minMs (${node.minMs}): the timeout would give up before @loading could show.`,
                hint: 'minMs delays @loading; maxMs is a timeout to @error. Make maxMs greater than minMs, or drop one of them.',
                ...(node.loc ? { line: node.loc.line, column: node.loc.column + 1 } : {}),
            });
        }
        for (const list of childLists(node)) checkAwaitTiming(list, warnings);
    }
}
