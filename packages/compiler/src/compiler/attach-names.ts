// The attachments a template writes (#143): `attach:name`, and core's built-in ones.
//
// An attachment's name is read like any template identifier — the script's, or an import — and
// core's three built-ins are imported by the compiler when the script declares no name of its own
// for them, as `navigation` is (#149). Any other name is PDX_ATTACH_UNKNOWN.

/** Core's built-in attachments, `@pdxui/core` exports. */
export const ATTACH_BUILTINS: ReadonlySet<string> = new Set(['autofocus', 'trapFocus', 'clickOutside']);

// Match: `attach:name` — an attachment attribute, as written in a tag. Groups: [1]=the name
const ATTACH_ATTRIBUTE = /(?<=[\s"'])attach:([A-Za-z_$][\w$]*)/g;

/** Every attachment the template text writes, each with its offset in `template`. */
export function attachmentsOf(template: string): { name: string; index: number }[] {
    return [...template.matchAll(ATTACH_ATTRIBUTE)].map((m) => ({ name: m[1], index: m.index }));
}

/** The built-ins `template` uses and the script does not declare or import: what the compiler imports. */
export function builtinAttachmentsToImport(template: string, inScope: (name: string) => boolean): string[] {
    const names = new Set<string>();
    for (const { name } of attachmentsOf(template)) if (ATTACH_BUILTINS.has(name) && !inScope(name)) names.add(name);
    return [...names];
}
