// The playground runs user code with `new Function` on the site's own origin.
//
// That is safe today, and this test exists to say why: the source comes from the textarea and from
// nowhere else. `playground.pdx` reads `e.target.value` and nothing more — no URL, no storage, no
// message. The user runs their own code, which is what a playground is for.
//
// The safety is therefore an INVARIANT, not a property of the code. The single most obvious feature
// to add — "share this snippet" via the URL, which every playground has — would break it, and in
// breaking it would turn `new Function` on the site's own origin into a same-origin XSS reachable by
// sending someone a link. Nothing warned about that, and nothing failed if you did it.
//
// This is the thing that fails. If sharing is wanted, the answer is not to sanitise the snippet: it
// is to execute on a separate origin, the way CodePen and JSFiddle do. That is written at the
// `new Function` call site too, so it is read by whoever is about to add it.
//
// It lives in core because packages/site has no suite of its own — the same reason docs-imports and
// the design-token checks are here.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SITE = join(__dirname, '..', '..', 'site', 'src');
const GUARDED = [
    join(SITE, 'routes', 'playground.pdx'),
    join(SITE, 'lib', 'playground-compile.ts'),
];

/**
 * Ways source could arrive from somewhere other than the textarea. Each is a real channel, not a
 * keyword: a URL, browser storage, another frame, the referrer, or base64 hiding one of those.
 */
const EXTERNAL_INPUT: [string, RegExp][] = [
    ['the URL', /\blocation\s*\.\s*(search|hash|href|pathname)/],
    ['the URL', /\bwindow\s*\.\s*location\b/],
    ['query parameters', /\bURLSearchParams\b/],
    ['a parsed URL', /\bnew\s+URL\s*\(/],
    ['localStorage', /\blocalStorage\b/],
    ['sessionStorage', /\bsessionStorage\b/],
    ['the referrer', /\bdocument\s*\.\s*referrer\b/],
    ['another frame', /\baddEventListener\s*\(\s*['"`]message['"`]/],
    ['base64, which usually carries one of the above', /\batob\s*\(/],
    ['the network', /\bfetch\s*\(/],
];

/** A mention in a comment is not a read — and this file's own warning names several of them. */
function codeLines(text: string): { n: number; line: string }[] {
    return text.split(/\r?\n/)
        .map((line, i) => ({ n: i + 1, line }))
        .filter(({ line }) => {
            const t = line.trim();
            return t !== '' && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && !t.startsWith('<!--');
        });
}

describe('the playground compiles only what the user typed', () => {
    it('finds the files it is guarding', () => {
        // A renamed or moved playground must break this test, not silently pass it.
        for (const f of GUARDED) expect(existsSync(f), f).toBe(true);
    });

    it('reads the source from the textarea', () => {
        // The positive half: if this stops being true the guard below is guarding nothing.
        const pdx = readFileSync(GUARDED[0], 'utf-8');
        expect(pdx).toMatch(/_src\s*=\s*e\.target\.value/);
    });

    it('takes source from no external input', () => {
        const found: string[] = [];
        for (const file of GUARDED) {
            const name = file.split(/[\\/]/).pop()!;
            for (const { n, line } of codeLines(readFileSync(file, 'utf-8'))) {
                for (const [what, re] of EXTERNAL_INPUT) {
                    if (re.test(line)) found.push(`${name}:${n} reads ${what} — ${line.trim()}`);
                }
            }
        }
        expect(
            found,
            'the playground executes its source with new Function on the site origin. Source from ' +
            'anywhere but the textarea makes that a same-origin XSS. To add sharing, run the snippet ' +
            'on a SEPARATE origin instead.',
        ).toEqual([]);
    });

    it('still executes with new Function — the reason the rule exists', () => {
        // If the execution model changes, this test's premise changes with it and it should be
        // rewritten rather than left asserting a rule that no longer protects anything.
        expect(readFileSync(GUARDED[1], 'utf-8')).toContain('new Function');
    });

    it('says all of this at the call site, not only here', () => {
        // A rule a reader has to already know is not a rule. The next person to add sharing opens
        // playground-compile.ts, not this file.
        const compile = readFileSync(GUARDED[1], 'utf-8');
        expect(compile).toMatch(/separate origin/i);
    });
});
