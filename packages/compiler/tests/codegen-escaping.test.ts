// Text an author writes must not become code the browser runs.
//
// A backtick in a reactive `@fetch` URL closed the generated template literal and everything after
// it became an executed expression — twice, in the fetcher and in the cache key. The module still
// PARSED, so nothing complained: no syntax error, no diagnostic, no failing test. The escape helper
// was correct; it was applied to `f.method` (which can never need it) and not to `f.url` (which
// does), and the comment above described the opposite of what the code did.
//
// Parsing is not the assertion. Case B below parses. The assertion is that the payload did not
// escape its string.

import { describe, it, expect } from 'vitest';
import { parseSFC } from '../src/parser/sfc';
import { parseTemplate } from '../src/parser/template';
import { compileSFC } from '../src/compiler/codegen';
import ts from 'typescript';

const BACKTICK = '`';

function compile(setupLine: string): string {
    const src = [
        '<template>', '  <div>{{ id }}</div>', '</template>', '',
        '<script setup>', 'let id = $signal(1);', setupLine, '</script>',
    ].join('\n');
    const d = parseSFC(src);
    return compileSFC(d, parseTemplate(d.template?.content ?? ''), 'probe.pdx');
}

/**
 * Does the payload sit OUTSIDE a string in the generated module?
 *
 * Parsed, not grepped. A regex cannot tell `"a`+(x)+`b"` (text, inside one JSON string) from
 * `` `a`+(x)+`b` `` (three tokens, the middle one executed) — the characters are identical. The
 * first version of this check did exactly that and accused the static branch, which is correct.
 * So: parse the module and assert the marker appears only inside string or template literals.
 */
function payloadIsCode(code: string): boolean {
    const body = code.replace(/^import .*$/gm, '');
    const sf = ts.createSourceFile('gen.ts', body, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let asCode = false;
    const visit = (n: ts.Node): void => {
        if (asCode) return;
        if (ts.isIdentifier(n) && n.text === '__PWNED') {
            // An identifier node named __PWNED means the payload was parsed as an expression.
            asCode = true;
            return;
        }
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return asCode;
}

describe('author text stays text in the generated module', () => {
    const PAYLOAD = `${BACKTICK}+(globalThis.__PWNED=1)+${BACKTICK}`;

    const cases: { name: string; setup: string }[] = [
        {
            name: 'reactive @fetch URL — backtick',
            setup: `@fetch users: 'GET /api/u${PAYLOAD}/\${id}';`,
        },
        {
            name: 'static @fetch URL — backtick',
            setup: `@fetch users: 'GET /api/u${PAYLOAD}/all';`,
        },
        {
            name: 'reactive @fetch URL — backslash before a backtick',
            setup: `@fetch users: 'GET /api/u\\\\${BACKTICK}x/\${id}';`,
        },
    ];

    for (const c of cases) {
        it(`${c.name}: the module parses`, () => {
            const code = compile(c.setup);
            const body = code.replace(/^import .*$/gm, '');
            expect(() => new Function(body), `generated module is not valid JS`).not.toThrow();
        });

        it(`${c.name}: the payload did not become an expression`, () => {
            const code = compile(c.setup);
            expect(
                payloadIsCode(code),
                `author text escaped its literal:\n${code.split('\n').find(l => l.includes('resource(')) ?? ''}`,
            ).toBe(false);
        });
    }

    it('a clean reactive URL still interpolates — the fix must not kill the feature', () => {
        const code = compile(`@fetch users: 'GET /api/users/\${id}';`);
        const line = code.split('\n').find(l => l.includes('resource(')) ?? '';
        // The ${id} interpolation is the whole point of a reactive URL: it must survive.
        expect(line).toContain('${id}');
        expect(line).toContain('/api/users/');
    });
});
