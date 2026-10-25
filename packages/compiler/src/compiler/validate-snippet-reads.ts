// What a script's `@snippet` bodies read (#683).
//
// A script `@snippet name(params) { … }` is a template the component's own template renders with
// `@render name(…)`: the names its body reads are read. PDX_UNUSED_REACTIVE looked at the template,
// the body and the reactive surfaces, and reported a `$derived` only a snippet drew on the page.

import type { ScriptAnalysis } from './script-analyzer';
import { parseTemplate, type TemplateNode } from '../parser/template';

/** Names the script's snippets read, their own parameters left out. `collect` reads a template. */
export function snippetReads(
    analysis: ScriptAnalysis,
    collect: (ast: TemplateNode[]) => Set<string>,
): Set<string> {
    const reads = new Set<string>();
    for (const snippet of analysis.snippets) {
        for (const name of namesIn(snippet.body, collect)) {
            if (!snippet.params.includes(name)) reads.add(name);
        }
    }
    return reads;
}

/**
 * The names a snippet's body reads. A body that does not parse yet — the editor validates a file as it
 * is typed, and the compile reports the parse error itself — counts every identifier in its text: at
 * worst an `info` finding is not shown while the snippet is half written.
 */
function namesIn(body: string, collect: (ast: TemplateNode[]) => Set<string>): Set<string> {
    let ast: TemplateNode[];
    try {
        ast = parseTemplate(body);
    } catch {
        return new Set(body.match(/[A-Za-z_$][\w$]*/g) ?? []);
    }
    return collect(ast);
}
