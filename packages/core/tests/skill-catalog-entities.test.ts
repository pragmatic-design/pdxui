// The component references the catalogue generates read as code, not as HTML entities (#1055).
//
// A demo's Source block is HTML, so it writes `@` as `&#64;` (the compiler would read a bare `@` as a
// rune) and `{` as `&#123;`. `gen-catalog.mjs` copies those blocks into each component's reference,
// which an agent reads as Markdown and copies from: it decoded a few entities by name and left
// `&#64;snippet item(c)` in twelve references. Every numeric entity is now decoded.
//
// Checked on the GENERATED references, which is what an agent reads.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SKILLS = join(__dirname, '../../../marketplace/plugins/pdxui/skills');

/** The component references `gen-catalog.mjs` writes: `pdx-<name>.md` under each area skill's `references`. */
function componentReferences(): string[] {
    const out: string[] = [];
    for (const skill of readdirSync(SKILLS).filter((n) => n.startsWith('pdxui-'))) {
        const refs = join(SKILLS, skill, 'references');
        if (!statSync(refs, { throwIfNoEntry: false })?.isDirectory()) continue;
        for (const f of readdirSync(refs)) if (/^pdx-.*\.md$/.test(f)) out.push(join(refs, f));
    }
    return out;
}

describe('the generated component references carry no HTML entity (#1055)', () => {
    const files = componentReferences();

    it('found the references, so the check is not vacuous', () => {
        expect(files.length).toBeGreaterThan(100);
    });

    it('no numeric entity is left in them', () => {
        const left: string[] = [];
        for (const f of files) {
            readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').forEach((line, i) => {
                // Match: a decimal or hexadecimal numeric character reference. Groups: none
                for (const m of line.matchAll(/&#(?:\d+|x[0-9a-f]+);/gi)) left.push(`${relative(SKILLS, f).replace(/\\/g, '/')}:${i + 1}: ${m[0]}`);
            });
        }
        expect(left, 'an agent reads these literally').toEqual([]);
    });

    it('a decoded backtick inside a code span keeps the span: a double fence, padded', () => {
        // pdx-rich-text's demo names the Markdown shortcut `code` in a <code>: decoded into a single
        // fence it read ``code``, a span of `code` that lost its backticks.
        const richText = files.find((f) => f.endsWith('pdx-rich-text.md'))!;
        expect(readFileSync(richText, 'utf8').replace(/\r\n/g, '\n')).toContain('`` `code` ``');
    });
});
