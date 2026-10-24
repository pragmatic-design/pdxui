// Golden safety net — locks the CURRENT output of compile() across the whole demo corpus,
// BEFORE the signal-rewrite regex→AST migration. Any unintended drift in generated code or
// diagnostics flips a snapshot, so the migration can be validated as behavior-preserving
// (the intended bug-fix divergences are reviewed + re-recorded with --update-snapshots).
//
// Scope: every .pdx under demo/ (root + infra + showcase + showcase-new/pages). The filename
// passed to compile() is the stable relative path (drives deriveTag), so snapshots are
// deterministic and machine-independent. Files that need a file resolver (<style src=…>) or
// otherwise throw have their error captured verbatim — that is also current behavior.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, relative, join } from 'path';

const DEMO_ROOT = resolve(__dirname, '../demo');

function collectPdx(dir: string): string[] {
    const out: string[] = [];
    for (const item of readdirSync(dir)) {
        const full = join(dir, item);
        if (statSync(full).isDirectory()) out.push(...collectPdx(full));
        else if (item.endsWith('.pdx')) out.push(full);
    }
    return out;
}

const files = collectPdx(DEMO_ROOT).sort();

describe('compile golden — demo corpus', () => {
    for (const file of files) {
        const rel = relative(DEMO_ROOT, file).replace(/\\/g, '/');
        it(rel, () => {
            const source = readFileSync(file, 'utf8');
            let snapshot: string;
            try {
                const { code, warnings } = compile(source, rel);
                // Sort warnings for determinism; they are part of the locked behavior.
                const warnLines = warnings.map((w) => `${w.code}: ${w.message}`).sort();
                snapshot = `// ${warnLines.length} warning(s)\n${warnLines.join('\n')}\n${'='.repeat(60)}\n${code}`;
            } catch (e) {
                snapshot = `THREW: ${(e as Error).message}`;
            }
            expect(snapshot).toMatchSnapshot();
        });
    }
});
