// `<script setup>` → `<script>` (#158): the script has one grammar, and `setup` no longer means
// anything. The file reads the same with or without it — one-script-grammar.test.ts — so the rewrite
// is mechanical: `pdx migrate` drops the attribute from the script's opening tag, and nothing else.

import { findOpenTag } from '../text-scan';
import type { LanguageChange, LanguageChangeFinding } from './changes';

// Match: the `setup` attribute in a tag's attributes, with the space before it. Groups: none
const SETUP_ATTR = /\s+setup\b(?!\s*=)/;

/** The script's opening tag in a .pdx, when it carries `setup`: where it is and what it says. */
function setupTag(text: string): { start: number; text: string } | null {
    const open = findOpenTag(text, 'script');
    if (!open || !SETUP_ATTR.test(open.attrs)) return null;
    return { start: open.start, text: open.text };
}

/** The line (1-based) of `index` in `text`. */
function lineAt(text: string, index: number): number {
    return text.slice(0, index).split('\n').length;
}

export const scriptSetup: LanguageChange = {
    id: 'script-setup',
    kind: 'changed',
    scope: 'pdx',
    issue: 158,
    message: 'the script has one grammar: `setup` has no meaning, write `<script>`.',
    detect(text): LanguageChangeFinding[] {
        const tag = setupTag(text);
        return tag ? [{ line: lineAt(text, tag.start), found: tag.text }] : [];
    },
    fix(text) {
        const tag = setupTag(text);
        if (!tag) return text;
        return text.slice(0, tag.start) + tag.text.replace(SETUP_ATTR, '') + text.slice(tag.start + tag.text.length);
    },
};
