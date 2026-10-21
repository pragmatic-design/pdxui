// `<pdx-relative-time style="short">` is `format-style="short"` (#545).
//
// The prop was named `style`, which replaced the element's own CSSStyleDeclaration. The old spelling
// is still valid HTML with another meaning — an inline style the browser ignores — so the compiler says
// nothing, and `pdx migrate` rewrites the attribute when its value is one of the wording lengths. A
// `style` with any other value is an inline style, and is left.

import { openTags } from '../text-scan';
import type { LanguageChange, LanguageChangeFinding } from './changes';

// Match: ` style="short"` among a tag's attributes, the value one of the three wording lengths.
// Groups: [1]=what precedes `style` [2]=the quote [3]=the value
const STYLE_ATTR = /(^|\s)style\s*=\s*(["'])(long|short|narrow)\2/;

/** The line (1-based) of `index` in `text`. */
function lineAt(text: string, index: number): number {
    return text.slice(0, index).split('\n').length;
}

export const relativeTimeStyle: LanguageChange = {
    id: 'relative-time-style',
    kind: 'changed',
    scope: 'pdx',
    issue: 545,
    message: "`<pdx-relative-time>`'s wording length is `format-style`: `style` is the element's inline style.",
    detect(text): LanguageChangeFinding[] {
        const out: LanguageChangeFinding[] = [];
        for (const tag of openTags(text, 'pdx-relative-time')) {
            if (STYLE_ATTR.test(tag.attrs)) out.push({ line: lineAt(text, tag.start), found: tag.text });
        }
        return out;
    },
    fix(text) {
        let out = text;
        // From the last, so earlier offsets stay valid.
        for (const tag of [...openTags(text, 'pdx-relative-time')].reverse()) {
            const attrs = tag.attrs.replace(STYLE_ATTR, (_m, before: string, quote: string, value: string) => `${before}format-style=${quote}${value}${quote}`);
            if (attrs === tag.attrs) continue;
            const at = tag.start + tag.text.length - 1 - tag.attrs.length;
            out = out.slice(0, at) + attrs + out.slice(at + tag.attrs.length);
        }
        return out;
    },
};
