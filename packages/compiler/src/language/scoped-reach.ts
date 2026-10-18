// A `<style scoped>` selector that reached inside a child component (#152), for `pdx migrate`.
//
// Under `target: 'baseline-2026'` a scoped block stops at nested components: a rule that styled the
// inside of a child — the `<button>` a `<pdx-button>` renders, a library component's internal class —
// no longer applies. It cannot be rewritten: the replacement is the child's public surface,
// `[data-part]`, `:state()` or its tokens. So it is flagged, by two readings of the template:
//   - a selector that names a component's tag and then descends into it: `pdx-card .title`,
//     `app-row > td`;
//   - a selector whose subject — its last compound — is a tag or classes the template never writes,
//     in a template that renders components: it could only have matched what a child renders. A
//     class the script puts on an element (`d.className = 'scroll-item'`) counts as written: an
//     element the component builds is its own. One it only names in a string does not — handed to a
//     component (`cellClass: () => 'warranty-ended'`), it lands on what that component renders.
// The second is a reading of the text, not a match against the DOM: a class a script assembles out of
// pieces is not seen, and such a selector is flagged although it is the component's own.

import { parseSFC } from '../parser/sfc';
import type { LanguageChange, LanguageChangeFinding } from './changes';

/** The line (1-based) of `index` in `text`. */
const lineAt = (text: string, index: number): number => text.slice(0, index).split('\n').length;

const STYLE_AT_RULES = new Set(['media', 'supports', 'layer', 'container', 'starting-style']);

/** Every style rule's selector list in `css`, recursing into the at-rules that hold style rules. */
function selectorLists(css: string): string[] {
    const out: string[] = [];
    let pos = 0;
    while (pos < css.length) {
        const open = css.indexOf('{', pos);
        if (open === -1) break;
        const prelude = css.slice(pos, open).trim();
        let depth = 0;
        let close = open;
        for (; close < css.length; close++) {
            if (css[close] === '{') depth++;
            else if (css[close] === '}' && --depth === 0) break;
        }
        const inner = css.slice(open + 1, close);
        // A statement at-rule before the rule (`@import …;`) ends at its `;`.
        const statementEnd = prelude.lastIndexOf(';');
        const head = statementEnd >= 0 ? prelude.slice(statementEnd + 1).trim() : prelude;
        if (head.startsWith('@')) {
            const name = (/^@([\w-]+)/.exec(head)?.[1] ?? '').toLowerCase();
            if (STYLE_AT_RULES.has(name)) out.push(...selectorLists(inner));
        } else if (head) {
            out.push(head);
        }
        pos = close + 1;
    }
    return out;
}

/** A selector list split at its top-level commas. */
function splitList(list: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        else if (c === ',' && depth === 0) { parts.push(list.slice(start, i)); start = i + 1; }
    }
    parts.push(list.slice(start));
    return parts.map((s) => s.trim()).filter(Boolean);
}

/** The compounds of a selector, split at its top-level combinators. */
function compounds(sel: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let cur = '';
    for (const c of sel) {
        if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        if (depth === 0 && /[\s>+~]/.test(c)) { if (cur) parts.push(cur); cur = ''; continue; }
        cur += c;
    }
    if (cur) parts.push(cur);
    return parts;
}

/**
 * Whether the script puts `cls` on an element itself: `el.className = 'scroll-item'`,
 * `el.classList.add('open')`, `el.setAttribute('class', 'x')`. A class merely named in a string —
 * returned to a component's `cellClass`, say — lands on what that component renders, past the scope.
 */
function scriptWrites(script: string, cls: string): boolean {
    // Match: a class assignment, then a string holding the class as a whole word. Groups: none
    return new RegExp(`(\\.className\\s*=|\\.classList\\.(?:add|toggle|replace)\\(|setAttribute\\(\\s*['"]class['"]\\s*,)\\s*['"\`]([^'"\`]*\\s)?${cls}(\\s[^'"\`]*)?['"\`]`).test(script);
}

/** Whether `sel` reaches inside a component the template renders, read off the template's and script's text. */
function reachesInside(sel: string, template: string, script: string, rendersComponents: boolean): boolean {
    if (/:scope(?![\w-])|:global\(/.test(sel)) return false;
    const parts = compounds(sel);
    // A component's tag, then a descendant of it.
    if (parts.slice(0, -1).some((p) => /^[a-z][\w]*-[\w-]*/.test(p))) return true;
    if (!rendersComponents) return false;
    const subject = parts[parts.length - 1] ?? '';
    const tag = /^[a-z][\w-]*/.exec(subject)?.[0];
    if (tag) return !tag.includes('-') && !new RegExp(`<${tag}[\\s/>]`, 'i').test(template);
    const classes = [...subject.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
    return classes.length > 0 && !classes.some((c) => template.includes(c) || scriptWrites(script, c));
}

/** The scoped selectors of the .pdx `text` that reach inside a child component. */
function findings(text: string): LanguageChangeFinding[] {
    const sfc = parseSFC(text);
    const template = sfc.template && !sfc.template.src ? sfc.template.content : '';
    const script = sfc.script && !sfc.script.src ? sfc.script.content : '';
    // Match: a custom element's opening tag. Groups: none
    const rendersComponents = /<[a-z][\w]*-[\w-]*[\s/>]/i.test(template);
    const out: LanguageChangeFinding[] = [];
    for (const block of sfc.styles ?? (sfc.style ? [sfc.style] : [])) {
        if (!block.scoped || block.src || sfc.template?.shadow) continue;
        const css = block.content.replace(/\/\*[\s\S]*?\*\//g, '');
        for (const list of selectorLists(css)) {
            for (const sel of splitList(list)) {
                if (!reachesInside(sel, template, script, rendersComponents)) continue;
                const at = text.indexOf(sel, block.start);
                out.push({ line: lineAt(text, at >= 0 ? at : block.start), found: sel });
            }
        }
    }
    return out;
}

/** `<style scoped>` that reached inside a child: under baseline-2026 it stops at the child. */
export const scopedReachesChild: LanguageChange = {
    id: 'scoped-reaches-child',
    kind: 'changed',
    scope: 'pdx',
    issue: 152,
    message: 'a scoped style stops at nested components (baseline-2026): this selector no longer reaches inside one. Style the child through its [data-part], :state() or its tokens.',
    detect: (text) => findings(text),
    fix: 'flag',
};
