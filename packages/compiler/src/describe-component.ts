// A .pdx component, described for a generator (#1003): its tag, what its script declares, its
// template, and its doc comments. The library's manifest reads a TypeScript component() from its
// descriptor and JSDoc; this is what it reads a .pdx from, so one component reads the same in both.

import { parseSFC } from './parser/sfc';
import { analyzeScript } from './compiler/script-analyzer';
import type { ScriptAnalysis } from './compiler/script-analyzer-types';
import { deriveTag } from './compiler/codegen-shared';
import { DEFAULT_TAG_PREFIX } from './compiler/tag-prefix';
import { scriptDocComments, type ScriptDocs } from './compiler/component-docs';

export interface ComponentDescription {
    /** The custom element the file registers: `@tag`, else the file name under the prefix. */
    tag: string;
    analysis: ScriptAnalysis;
    /** The template's markup, as written; '' when there is none. */
    template: string;
    /** The script's content, as written; '' when there is none. */
    script: string;
    docs: ScriptDocs;
}

/**
 * Describe the .pdx `source` at `filename`, as `pdx({ prefix })` would register it. `prefix` is the
 * tag prefix, `app` by default; the library's is `pdx`.
 */
export function describeComponent(source: string, filename: string, options: { prefix?: string } = {}): ComponentDescription {
    const descriptor = parseSFC(source);
    const script = descriptor.script?.content ?? '';
    const analysis = analyzeScript(script, filename);
    return {
        tag: analysis.customTag ?? deriveTag(filename, options.prefix ?? DEFAULT_TAG_PREFIX),
        analysis,
        template: descriptor.template?.content ?? '',
        script,
        docs: scriptDocComments(script),
    };
}
