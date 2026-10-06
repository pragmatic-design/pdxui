// LSP — formatter base (normalizzazione whitespace, non distruttivo).

import { describe, it, expect } from 'vitest';
import { normalizePdx, formatDocument } from '../src/capabilities/format';

describe('pdx formatter', () => {
    it('trims trailing whitespace and collapses blank runs', () => {
        const src = '<template>  \n\n\n\n<div></div>   \n</template>';
        const out = normalizePdx(src);
        expect(out).toBe('<template>\n\n<div></div>\n</template>\n');
    });

    it('converts leading tabs to two spaces', () => {
        expect(normalizePdx('\t<div>\n\t\t<span/>\n')).toBe('  <div>\n    <span/>\n');
    });

    it('ensures a single trailing newline', () => {
        expect(normalizePdx('x')).toBe('x\n');
        expect(normalizePdx('x\n\n\n')).toBe('x\n');
    });

    it('returns no edits when already formatted', () => {
        expect(formatDocument('<div></div>\n')).toHaveLength(0);
    });

    it('returns a full-document edit when changes are needed', () => {
        const edits = formatDocument('<div></div>   \n');
        expect(edits).toHaveLength(1);
        expect(edits[0].newText).toBe('<div></div>\n');
    });
});
