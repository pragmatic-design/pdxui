// Typed refs (#140): `:ref="dlg"` on a component types `dlg` from what the component exposes, so
// `dlg.show()` is checked and `dlg.nope()` is an error in the editor.
//
// The script reaches TypeScript with its offsets 1:1 (projectScript), so the type cannot be written
// into `let dlg = $signal(null)`. The `null` is replaced instead by a name of the same length,
// `_r00`, declared after the script with the element's type: an element (the ref is one) with the
// component's exposed methods. `$signal<T>(v: T): T` then types `dlg` as that.

import type { TemplateNode } from '@pdxui/compiler';

/** The members a component tag exposes — its manifest methods, or a .pdx's `@expose` — or null. */
export type ResolveExposed = (tag: string) => readonly string[] | null;

/** Every html node's markup, `@raw` left out. */
function markupOf(nodes: unknown, out: string[] = []): string[] {
    if (Array.isArray(nodes)) for (const n of nodes) markupOf(n, out);
    else if (nodes && typeof nodes === 'object') {
        const node = nodes as { type?: string; content?: unknown; raw?: boolean };
        if (node.type === 'html') {
            if (!node.raw && typeof node.content === 'string') out.push(node.content);
            return out;
        }
        for (const value of Object.values(node)) if (value && typeof value === 'object') markupOf(value, out);
    }
    return out;
}

// Match: an opening tag of a custom element (its name has a `-`). Groups: [1]=tag [2]=its attributes
const CUSTOM_TAG = /<([a-z][\w]*-[\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
// Match: `:ref="name"` among them. Groups: [1]=the ref's name
const REF = /(?:^|\s):ref=["']([A-Za-z_$][\w$]*)["']/;

/** The refs the template binds on components that expose something: ref name → exposed members. */
export function refTargets(ast: TemplateNode[] | null, resolveExposed?: ResolveExposed): Map<string, readonly string[]> {
    const out = new Map<string, readonly string[]>();
    if (!ast || !resolveExposed) return out;
    for (const markup of markupOf(ast)) {
        for (const m of markup.matchAll(CUSTOM_TAG)) {
            const ref = REF.exec(m[2])?.[1];
            if (!ref) continue;
            const exposed = resolveExposed(m[1]);
            if (exposed) out.set(ref, exposed);
        }
    }
    return out;
}

/** `text` as a regular expression that matches it literally: every special character escaped. */
function escapeRegExp(text: string): string {
    return text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

/** The type a ref holds: the element, with the members its component exposes. */
function refType(exposed: readonly string[]): string {
    const members = exposed.filter(n => /^[A-Za-z_$][\w$]*$/.test(n)).map(n => `${n}: any;`).join(' ');
    return `HTMLElement & { ${members} }`;
}

/**
 * The projected script with each typed ref's `$signal(null)` pointing at a declared placeholder, and
 * the declarations to append after it. Same length as `projected`: the script stays 1:1.
 */
export function typeRefs(projected: string, refs: Map<string, readonly string[]>): { script: string; declarations: string } {
    let script = projected;
    const declarations: string[] = [];
    let n = 0;
    for (const [name, exposed] of refs) {
        if (n > 99) break; // `_r00`…`_r99`: four characters, as long as `null`
        // Match: `let dlg = $signal(null` / `var  dlg = $signal( null` (the projection may have padded
        // the keyword). Groups: [1]=everything up to the argument
        const decl = new RegExp(`(\\b(?:let|const|var)\\s+${escapeRegExp(name)}\\s*=\\s*\\$signal\\s*\\(\\s*)null\\b`);
        const m = decl.exec(script);
        if (!m) continue;
        const id = `_r${String(n++).padStart(2, '0')}`;
        const at = m.index + m[1].length;
        script = script.slice(0, at) + id + script.slice(at + 4);
        declarations.push(`declare var ${id}: ${refType(exposed)};`);
    }
    return { script, declarations: declarations.join('\n') };
}
