// PDX_AGENT_ACTION_UNBOUND (#502, decision 31): an agent has no capability a person does not.
//
// An `@action … with { agent: '…' }` is a write an agent may call. A person must be able to call it
// too, from a control of the template: a `:action="name"` binding (`<pdx-button :action="save">`), or
// an event handler that calls `name.execute(…)` or `name(…)`. An action with `agent` that no control
// runs is an error on its `@action` line. An action without `agent` is not checked.

import type { TemplateNode } from '../parser/template';
import type { ScriptAnalysis } from './script-analyzer-types';
import type { ValidationWarning } from './validate';
import { escapeForRegExp } from './regexp-escape';

/** The markup of the template: the text of every `html` node and of every scoped slot's tag, at any depth. */
function markupOf(nodes: readonly TemplateNode[]): string[] {
    const out: string[] = [];
    const visit = (value: unknown): void => {
        if (Array.isArray(value)) { for (const v of value) visit(v); return; }
        if (!value || typeof value !== 'object') return;
        const node = value as { type?: string; content?: unknown; tag?: unknown };
        if (node.type === 'html' && typeof node.content === 'string') out.push(node.content);
        if (node.type === 'scoped-slot' && typeof node.tag === 'string') out.push(node.tag);
        for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child);
    };
    visit(nodes);
    return out;
}

// Match: an event handler attribute, `@click="…"` or `@submit.prevent='…'`, whose value may hold the
// other quote. Groups: [1]=a double-quoted value [2]=a single-quoted value
const HANDLER = /(?:^|\s)@[\w:.-]+\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** Whether some control of `markup` runs the action `name`. */
function runsAction(markup: readonly string[], name: string): boolean {
    const n = escapeForRegExp(name);
    // Match: `:action="name"` / `:action='name'` — the action bound to a control. Groups: none
    const bound = new RegExp(`(?:^|\\s):action\\s*=\\s*(["'])\\s*${n}\\s*\\1`);
    // Match: `name.execute(` or `name(`, not a member or a longer name. Groups: none
    const called = new RegExp(`(?<![\\w$.])${n}\\s*(?:\\.execute\\s*)?\\(`);
    for (const text of markup) {
        if (bound.test(text)) return true;
        for (const m of text.matchAll(HANDLER)) if (called.test(m[1] ?? m[2])) return true;
    }
    return false;
}

/** Every action with `agent` that no control of the template runs, as PDX_AGENT_ACTION_UNBOUND. */
export function validateAgentActions(analysis: ScriptAnalysis, ast: readonly TemplateNode[]): ValidationWarning[] {
    const agentActions = (analysis.actions ?? []).filter((a) => a.agent !== undefined);
    if (agentActions.length === 0) return [];
    const markup = markupOf(ast);
    return agentActions.filter((a) => !runsAction(markup, a.name)).map((a) => ({
        code: 'PDX_AGENT_ACTION_UNBOUND',
        severity: 'error' as const,
        message: `\`@action ${a.name}\` is offered to agents (\`agent\`), and no control of the template runs it: an agent would have a capability a person does not.`,
        hint: `Give a person the same control: <pdx-button :action="${a.name}">…</pdx-button>, or a handler that calls ${a.name}.execute(…) — or remove \`agent\`.`,
    }));
}
