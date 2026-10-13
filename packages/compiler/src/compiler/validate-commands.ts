// Invoker commands in a template (#140): `<button commandfor="dlg" command="--show">`. The target is
// an element of the same template with `id="dlg"`, and the command is one it answers: a `--name` a
// library component exposes, or a built-in command its element type has.

import type { TemplateNode } from '../parser/template';
import type { ValidationWarning } from './validate';
import { openingTagTexts } from '../text-scan';
import { markupOf } from './validate-parts';

/** The methods a component exposes, from its manifest; null for a tag the manifest does not know. */
export type MethodsLookup = (tag: string) => ReadonlySet<string> | readonly string[] | null;

/** The built-in commands, by what their target has to be. */
const DIALOG_COMMANDS = new Set(['show-modal', 'close', 'request-close']);
const POPOVER_COMMANDS = new Set(['toggle-popover', 'show-popover', 'hide-popover']);

interface Tag { name: string; attrs: Map<string, string | true> }

// Match: a literal attribute in an opening tag — `id="x"`, `popover`, `command='--show'` (not
// `:id`, `@click`). Groups: [1]=name [2]/[3]=the value, absent for a bare attribute
const ATTRIBUTE = /(?<=\s)([a-z][\w-]*)(?:=(?:"([^"]*)"|'([^']*)'))?/g;

function readTag(text: string): Tag {
    const name = /^<([A-Za-z][\w-]*)/.exec(text)?.[1].toLowerCase() ?? '';
    const attrs = new Map<string, string | true>();
    for (const m of text.slice(name.length + 1).matchAll(ATTRIBUTE)) {
        attrs.set(m[1], m[2] ?? m[3] ?? true);
    }
    return { name, attrs };
}

/**
 * `PDX_COMMAND_TARGET_MISSING` for a `commandfor` naming no element of the template, and
 * `PDX_COMMAND_UNKNOWN` for a command its target does not answer. Only literal values are read: a
 * bound `:commandfor` or `:command` is the runtime's.
 */
export function checkCommands(ast: TemplateNode[], methodsOf?: MethodsLookup): ValidationWarning[] {
    const texts = markupOf(ast).flatMap(openingTagTexts);
    const tags = texts.map(readTag);
    // An `:id="…"` may be the target: with one in the template, a missing literal id proves nothing.
    const boundId = texts.some(t => /\s:id=/.test(t));
    const byId = new Map<string, Tag>();
    for (const t of tags) {
        const id = t.attrs.get('id');
        if (typeof id === 'string') byId.set(id, t);
    }
    const warnings: ValidationWarning[] = [];
    for (const t of tags) {
        const forId = t.attrs.get('commandfor');
        if (typeof forId !== 'string') continue;
        const target = byId.get(forId);
        if (!target) {
            if (boundId) continue;
            warnings.push({
                code: 'PDX_COMMAND_TARGET_MISSING', severity: 'error',
                message: `commandfor '${forId}' names no element of this template: no id="${forId}".`,
                hint: `Give the element it controls id="${forId}", or name its id in commandfor.`,
            });
            continue;
        }
        const command = t.attrs.get('command');
        if (typeof command !== 'string') continue;
        const why = unknownCommand(command, target, methodsOf);
        if (why) {
            warnings.push({ code: 'PDX_COMMAND_UNKNOWN', severity: 'error', message: why.message, hint: why.hint });
        }
    }
    return warnings;
}

/** Why `target` does not answer `command`, or null when it does — or when nothing says what it answers. */
function unknownCommand(command: string, target: Tag, methodsOf?: MethodsLookup): { message: string; hint: string } | null {
    if (command.startsWith('--')) {
        const exposed = target.name.includes('-') ? methodsOf?.(target.name) : null;
        if (!exposed) return null; // a project component or a plain element: its own business
        const names = [...exposed];
        if (names.includes(command.slice(2))) return null;
        return {
            message: `command '${command}' on <${target.name}>: it exposes no '${command.slice(2)}'${names.length ? ` (it exposes ${names.join(', ')})` : ''}.`,
            hint: names.length ? `Use one of ${names.map(n => `--${n}`).join(', ')}.` : `<${target.name}> exposes no method to call.`,
        };
    }
    if (DIALOG_COMMANDS.has(command)) {
        if (target.name === 'dialog') return null;
        return { message: `command '${command}' is a <dialog> command, and its target is <${target.name}>.`, hint: `Point commandfor at a <dialog>, or use the target's own command (--name on a component).` };
    }
    if (POPOVER_COMMANDS.has(command)) {
        if (target.attrs.has('popover')) return null;
        return { message: `command '${command}' needs a popover target, and <${target.name}> has no popover attribute.`, hint: 'Give the target the popover attribute.' };
    }
    return {
        message: `command '${command}' is not a built-in command, and a custom one starts with --.`,
        hint: `Write command="--${command}" for a method the target exposes, or use a built-in command (show-modal, close, toggle-popover, …).`,
    };
}
