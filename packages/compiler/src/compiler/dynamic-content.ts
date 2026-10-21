// What is written between `<component :is>` and `</component>` (#358).
//
// `dynamic()` takes no children, so that content has nowhere to go. The render discards it on its
// own, in a sink of its static tree; validation reports it once, read off the template's text, as
// PDX_DYNAMIC_CONTENT.

import type { ValidationWarning } from './validate';
import { findTagEnd } from './codegen-template-rewrite';

// Match: an opening `<component` or a closing `</component>` tag. Groups: [1]=the slash of a close
const COMPONENT_TAG = /<(\/?)component(?=[\s/>])/gi;

/** Whether an opening `<component …>` tag is a dynamic component that encloses content. */
function opensDynamic(tag: string): boolean {
    return /\s:is=/.test(tag) && !/\/\s*>$/.test(tag);
}

/**
 * Scan `text` from `from` for the end of what a dynamic component opened earlier encloses: the
 * index past its `</component>`, counting the `<component>` tags nested inside, or -1 when the text
 * ends first. `depth` is how many closes are still owed, and is updated for a caller that scans on.
 */
function closeOf(text: string, from: number, state: { depth: number }): number {
    COMPONENT_TAG.lastIndex = from;
    let m: RegExpExecArray | null;
    while ((m = COMPONENT_TAG.exec(text)) !== null) {
        const end = findTagEnd(text, m.index);
        if (m[1]) {
            if (--state.depth === 0) return end + 1;
        } else if (!/\/\s*>$/.test(text.slice(m.index, end + 1))) {
            state.depth++;
        }
        COMPONENT_TAG.lastIndex = end + 1;
    }
    return -1;
}

/**
 * PDX_DYNAMIC_CONTENT — content between `<component :is>` and `</component>`, which no render path
 * renders. Read off the template's text, so content made of `{{ … }}` or a block directive counts;
 * whitespace alone does not. `start` is where the template begins in `source`, for the line.
 */
export function validateDynamicContent(template: string, start: number, source: string): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    COMPONENT_TAG.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = COMPONENT_TAG.exec(template)) !== null) {
        const tagEnd = findTagEnd(template, m.index);
        const tag = template.slice(m.index, tagEnd + 1);
        if (m[1] || !opensDynamic(tag)) { COMPONENT_TAG.lastIndex = tagEnd + 1; continue; }
        const state = { depth: 1 };
        const after = closeOf(template, tagEnd + 1, state);
        const close = after === -1 ? template.length : template.lastIndexOf('<', after - 1);
        if (template.slice(tagEnd + 1, close).trim() !== '') {
            const quoted = tag.replace(/\s+/g, ' ');
            const lines = source.slice(0, start + m.index).split('\n');
            warnings.push({
                code: 'PDX_DYNAMIC_CONTENT',
                severity: 'warn',
                message: `Content inside '${quoted}' is not rendered — the component it becomes takes no children.`,
                hint: 'Move the content beside the tag, or pass it to the component as a prop.',
                line: lines.length,
                column: lines[lines.length - 1].length + 1,
            });
        }
        COMPONENT_TAG.lastIndex = after === -1 ? template.length : after;
    }
    return warnings;
}
