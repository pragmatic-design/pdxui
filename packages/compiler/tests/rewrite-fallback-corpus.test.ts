// How often does the signal rewriter actually give up?
//
// PDX_REWRITE_FALLBACK fires when the rewriter meets a fragment it cannot parse, or edits that
// overlap, and skips the rewrite — leaving generated code that reads a signal without calling it.
// Is this tidiness, or does it fire on ordinary files?
//
// Measured over every .pdx this repository ships: it fires on NONE of them. That is worth keeping
// rather than noting once, for two reasons. It is the control on the diagnostic — one
// that fired on ordinary code would be noise nobody reads — and it is the guard on the rewriter: the
// day a construct someone writes starts defeating it, this names the file instead of shipping a
// component whose signal quietly stopped being reactive.
//
// Asserted on the returned `warnings`, which is the diagnostic's channel, not on a console spy.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from '../src/plugin';

const ROOT = join(__dirname, '..', '..', '..');
const SKIP = new Set(['node_modules', 'dist', '.git', 'coverage', 'test-results', 'playwright-report']);

function pdxFiles(dir: string, out: string[] = []): string[] {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return out; }
    for (const name of entries) {
        if (SKIP.has(name)) continue;
        const p = join(dir, name);
        let st;
        try { st = statSync(p); } catch { continue; }
        if (st.isDirectory()) pdxFiles(p, out);
        else if (name.endsWith('.pdx')) out.push(p);
    }
    return out;
}

const FILES = pdxFiles(join(ROOT, 'packages')).concat(pdxFiles(join(ROOT, 'templates')));

describe('every .pdx in the repository', () => {
    it('is a corpus worth calling one', () => {
        // Without this the two assertions below would pass on an empty list.
        expect(FILES.length).toBeGreaterThan(300);
    });

    // 30s, declared rather than left to the 5s default. Compiling 361 files takes ~0.8s alone, ~2.3s
    // under v8 coverage instrumentation, and 5.5s when `pnpm coverage` runs four packages at once,
    // past the default. A wall-clock assertion that holds on an idle machine and not under load is a
    // defect; the fix is to state what the work costs, not to hope the default covers it.
    it('compiles, and none of them defeats the signal rewriter', { timeout: 30_000 }, () => {
        const fallbacks: string[] = [];
        const failed: string[] = [];

        for (const file of FILES) {
            const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
            try {
                const { warnings } = compile(readFileSync(file, 'utf8'), file);
                for (const w of warnings) {
                    if (w.code === 'PDX_REWRITE_FALLBACK') fallbacks.push(`${rel}: ${w.message.slice(0, 120)}`);
                }
            } catch (err) {
                failed.push(`${rel}: ${(err as Error).message.slice(0, 120)}`);
            }
        }

        expect(failed, 'these .pdx files do not compile at all').toEqual([]);
        expect(
            fallbacks,
            'the rewriter skipped these — the generated code reads a signal without calling it',
        ).toEqual([]);
    });
});
