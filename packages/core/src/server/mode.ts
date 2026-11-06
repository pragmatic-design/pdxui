// Whether templates are being rendered to a string (#160). The one thing the client path reads of the
// server renderer: html`` checks it and, while it is set, returns a ServerTemplate instead of building
// DOM. Everything else of the renderer lives in render-string.ts, which the client bundle never
// imports.

/** A template rendered to a string: its strings and its values, nothing built. */
export interface ServerTemplate {
    readonly serverTemplate: true;
    readonly strings: TemplateStringsArray;
    readonly values: readonly unknown[];
}

let depth = 0;

/** True while `renderToString` is running. */
export function isServerRender(): boolean {
    return depth > 0;
}

/** Run `fn` with templates rendering to strings. Nested calls keep the mode until the outermost ends. */
export function withServerRender<T>(fn: () => T): T {
    depth++;
    try {
        return fn();
    } finally {
        depth--;
    }
}

/** The ServerTemplate html`` returns while the mode is set. */
export function serverTemplate(strings: TemplateStringsArray, values: readonly unknown[]): ServerTemplate {
    return { serverTemplate: true, strings, values };
}

/** Whether `value` is a ServerTemplate. */
export function isServerTemplate(value: unknown): value is ServerTemplate {
    return typeof value === 'object' && value !== null && (value as { serverTemplate?: unknown }).serverTemplate === true;
}
