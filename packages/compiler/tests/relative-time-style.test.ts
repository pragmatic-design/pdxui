// `pdx migrate` rewrites `<pdx-relative-time style="short">` to `format-style="short"` (#545): the prop
// was renamed because `style` replaced the element's own CSSStyleDeclaration.

import { describe, it, expect } from 'vitest';
import { relativeTimeStyle } from '../src/language/relative-time-style';
import { languageChanges } from '../src/language/changes';

const fix = relativeTimeStyle.fix as (text: string) => string;

describe('relative-time-style', () => {
    it('finds and rewrites a wording length written as style, in either quote', () => {
        const source = '<template>\n  <pdx-relative-time :datetime="d" style="short"></pdx-relative-time>\n  <pdx-relative-time style=\'narrow\'></pdx-relative-time>\n</template>';
        expect(relativeTimeStyle.detect(source).map((f) => f.line)).toEqual([2, 3]);
        expect(fix(source)).toBe('<template>\n  <pdx-relative-time :datetime="d" format-style="short"></pdx-relative-time>\n  <pdx-relative-time format-style=\'narrow\'></pdx-relative-time>\n</template>');
    });

    it('leaves an inline style, another element, and a file already rewritten', () => {
        const source = '<pdx-relative-time style="color: red"></pdx-relative-time>\n<p style="short"></p>\n<pdx-relative-time format-style="long"></pdx-relative-time>';
        expect(relativeTimeStyle.detect(source)).toEqual([]);
        expect(fix(source)).toBe(source);
    });

    it('is registered, so pdx migrate applies it', () => {
        expect(languageChanges()).toContain(relativeTimeStyle);
    });
});
