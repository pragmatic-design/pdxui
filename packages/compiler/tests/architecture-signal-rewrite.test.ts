// docs/architecture/compiler.md, «Stage 4 — signal rewrite», describes the rewrite the compiler runs
// (#327).
//
// The page described ordered regexes and a «10x faster than an AST walk» choice, long after the
// rewrite became one TypeScript-AST walk (`signal-rewrite-ast.ts`). Its example showed
// `__count.set(v => v + 1)`, which the compiler does not emit. Here the section is held to the code:
// it names the AST rewriter, claims no regex, and every line of its example is what `rewriteAst`
// returns for the line written.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rewriteAst } from '../src/compiler/signal-rewrite-ast';

const PAGE = readFileSync(join(__dirname, '..', '..', '..', 'docs', 'architecture', 'compiler.md'), 'utf-8');

/** The «Stage 4» section, up to the next stage. */
function stage4(): string {
    const start = PAGE.indexOf('### Stage 4');
    const end = PAGE.indexOf('### Stage 5', start);
    expect(start, 'no «Stage 4» section').toBeGreaterThanOrEqual(0);
    return PAGE.slice(start, end < 0 ? undefined : end);
}

/**
 * The example's pairs: each line of the first code block is «written» and «generated», two columns
 * apart; a trailing `// comment` is not code. The declaration line is the analyzer's, not the
 * rewrite's, and is left out.
 */
function examplePairs(section: string): Array<[string, string]> {
    const block = /```javascript\n([\s\S]*?)```/.exec(section)?.[1] ?? '';
    return block.split('\n')
        .map((line) => line.replace(/\s+\/\/[^']*$/, '').trimEnd())
        .filter((line) => line && !line.trimStart().startsWith('//') && !line.includes('$signal'))
        .map((line) => line.split(/\s{2,}/) as [string, string]);
}

describe('the architecture page describes the signal rewrite the compiler runs', () => {
    it('names the AST rewriter, and says nothing of a regex rewrite', () => {
        const section = stage4();
        expect(section).toContain('signal-rewrite-ast.ts');
        expect(section, 'the section still describes a regex rewrite').not.toMatch(/regex/i);
    });

    it('every line of its example is what the compiler generates', () => {
        const pairs = examplePairs(stage4());
        expect(pairs.length, 'no example read: nothing is checked').toBeGreaterThan(3);
        for (const [written, generated] of pairs) {
            expect(rewriteAst(written, new Set(['count']), new Set(), 'f.pdx'), `the page says ${written} → ${generated}`).toBe(generated);
        }
    });
});
