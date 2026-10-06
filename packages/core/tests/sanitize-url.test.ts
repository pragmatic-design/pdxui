// Shared URL sanitiser — the single allow-list policy for href/src/to.
import { describe, it, expect } from 'vitest';
import { sanitizeUrl } from '../src/security/sanitize-url';

describe('sanitizeUrl', () => {
    it('passes relative / fragment / query / safe-scheme URLs unchanged', () => {
        for (const u of ['/users/1', './x', '../y', '#a', '?q=1', 'https://x.com', 'http://x', 'mailto:a@b.com', 'tel:+1', 'ftp://h/f']) {
            expect(sanitizeUrl(u)).toBe(u);
        }
    });

    it('rejects dangerous or unknown schemes → null', () => {
        expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
        expect(sanitizeUrl('JaVaScRiPt:alert(1)')).toBeNull();
        expect(sanitizeUrl('data:text/html,<script>1</script>')).toBeNull();
        expect(sanitizeUrl('vbscript:msgbox(1)')).toBeNull();
        expect(sanitizeUrl('blob:https://x/abc')).toBeNull();
    });

    it('rejects control-char scheme smuggling → null', () => {
        expect(sanitizeUrl('java\tscript:alert(1)')).toBeNull();
        expect(sanitizeUrl('java\nscript:alert(1)')).toBeNull();
    });

    it('rejects empty / whitespace / nullish → null', () => {
        expect(sanitizeUrl('')).toBeNull();
        expect(sanitizeUrl('   ')).toBeNull();
        expect(sanitizeUrl(null)).toBeNull();
        expect(sanitizeUrl(undefined)).toBeNull();
    });
});
