// pdx explain <CODE> — what a diagnostic means, from the compiler's catalog.
// Human output by default; --json prints the entry for an agent. `explainCode` is the lookup, which
// the MCP server calls too.

import { defineCommand } from 'citty';
import { DIAGNOSTICS, diagnosticUrl, explainDiagnostic } from '@pdxui/compiler';

/** Edit distance, for "did you mean" on a misspelt code. */
function distance(a: string, b: string): number {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let prev = row[0];
        row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cur = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = cur;
        }
    }
    return row[b.length];
}

/** A code's catalog entry with its URL, or — for a code that does not exist — the closest one. */
export function explainCode(raw: string):
    | { found: true; entry: { code: string; url: string } & NonNullable<ReturnType<typeof explainDiagnostic>> }
    | { found: false; code: string; closest?: string } {
    const code = String(raw).trim().toUpperCase();
    const entry = explainDiagnostic(code);
    if (!entry) {
        const closest = Object.keys(DIAGNOSTICS).sort((x, y) => distance(code, x) - distance(code, y))[0];
        return { found: false, code, closest };
    }
    return { found: true, entry: { code, ...entry, url: diagnosticUrl(code) } };
}

export default defineCommand({
    meta: { name: 'explain', description: 'Explain a PDX_* diagnostic code' },
    args: {
        code: { type: 'positional', required: true, description: 'The code, e.g. PDX_RAW_INTERPOLATION' },
        json: { type: 'boolean', default: false, description: 'Output the catalog entry as JSON' },
    },
    run({ args }) {
        const result = explainCode(String(args.code));
        if (!result.found) {
            console.log(`Unknown diagnostic code: ${result.code}.${result.closest ? ` Did you mean ${result.closest}?` : ''}`);
            process.exit(1);
            return;
        }
        const { entry } = result;
        if (args.json) {
            console.log(JSON.stringify(entry, null, 2));
            return;
        }
        console.log(`${entry.code}  (${entry.severity}, ${entry.category})`);
        console.log(`\n${entry.summary}\n\n${entry.explanation}\n\nFix: ${entry.fix}`);
        console.log(`\n${entry.url}`);
    },
});
