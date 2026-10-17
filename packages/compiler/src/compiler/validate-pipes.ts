// PDX_PIPE_SINGLE (#129, decision 4): a template interpolation with exactly one pipe,
// `{{ price | money }}`, is clearer as the call it is, `{{ money(price) }}`. A chain of two or more
// reads better as a chain and raises nothing. The single pipe stays valid; the finding is an info,
// and its fix (fix-builders.ts) writes the call.

import type { TemplateNode } from '../parser/template';
import type { ValidationWarning } from './validate';

/** Every interpolation node of the template, at any depth (bodies, branches, cases). */
function interpolations(nodes: unknown, out: { expr: string; pipes: string[] }[] = []): { expr: string; pipes: string[] }[] {
    if (Array.isArray(nodes)) {
        for (const n of nodes) interpolations(n, out);
    } else if (nodes && typeof nodes === 'object') {
        const node = nodes as { type?: string; expr?: string; pipes?: string[] };
        if (node.type === 'interpolation' && node.expr !== undefined) out.push({ expr: node.expr, pipes: node.pipes ?? [] });
        for (const value of Object.values(nodes)) if (value && typeof value === 'object') interpolations(value, out);
    }
    return out;
}

/** `value` through one pipe, written as the call: `money('EUR')` → `money(value, 'EUR')`. */
export function pipeAsCall(value: string, pipe: string): string {
    // Match: a pipe name and its argument list, when it has one. Groups: [1]=name [2]=arguments
    const m = /^([A-Za-z_$][\w$]*)\s*(?:\(([\s\S]*)\))?$/.exec(pipe.trim());
    if (!m) return `${pipe.trim()}(${value})`;
    return m[2] === undefined || m[2].trim() === '' ? `${m[1]}(${value})` : `${m[1]}(${value}, ${m[2].trim()})`;
}

/** PDX_PIPE_SINGLE for each interpolation with exactly one pipe. */
export function checkSinglePipes(ast: TemplateNode[]): ValidationWarning[] {
    return interpolations(ast).filter(i => i.pipes.length === 1).map(i => ({
        code: 'PDX_PIPE_SINGLE',
        severity: 'info',
        message: `'{{ ${i.expr} | ${i.pipes[0]} }}' has one pipe: '{{ ${pipeAsCall(i.expr, i.pipes[0])} }}' says the same as a call.`,
        hint: 'A pipe reads well as a chain of two or more; one is a function call.',
    }));
}
