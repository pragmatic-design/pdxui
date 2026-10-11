// The formal language reference in docs/language covers the language the compiler reads (#120).
//
// The grammar lived in the parser, the rune list, the site's guide pages and the skills, and they
// disagreed. The reference is the one place that says what each construct accepts, and this holds
// it to the compiler: a rune or a directive the compiler knows and the reference has no section for
// fails here by name; a section without its five parts fails; an example that does not compile
// cleanly fails; a rune whose analyzer hint (`shape` in runes.ts) the reference does not show fails,
// so the two cannot drift. That the examples type-check and their imports resolve is
// packages/lsp's published-examples-types.test.ts, which reads the same fences.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from '../src/plugin';
import { RUNES } from '../src/compiler/runes';
import { DIRECTIVES } from '../src/parser/template';
import { DIAGNOSTICS } from '../src/diagnostics/catalog';
import { LANGUAGE, languageExamples, resolveStub } from './support/published-examples';

const PAGES = ['overview.md', 'script.md', 'template.md', 'styles.md', 'routing.md', 'data.md', 'diagnostics.md'];
/** The pages whose `###` sections are constructs, each with the five parts. */
const CONSTRUCT_PAGES = ['script.md', 'template.md', 'styles.md', 'routing.md', 'data.md'];
const PARTS = ['Syntax', 'Semantics', 'Rules', 'Examples', 'Since'];

const read = (page: string): string => readFileSync(join(LANGUAGE, page), 'utf-8').replace(/\r\n/g, '\n');

interface Section { page: string; heading: string; body: string }

/** Every `### heading` of the construct pages, with its text up to the next `##` or `###`. */
function sections(): Section[] {
    const out: Section[] = [];
    for (const page of CONSTRUCT_PAGES.filter(p => existsSync(join(LANGUAGE, p)))) {
        const text = read(page);
        // Match: a level-3 heading, then everything up to the next level-2 or level-3 heading.
        // Groups: [1]=heading text [2]=section body
        for (const m of text.matchAll(/^### (.+)\n([\s\S]*?)(?=^##{1,2} |(?![\s\S]))/gm)) out.push({ page, heading: m[1], body: m[2] });
    }
    return out;
}

/** Whether a heading names `token` (`@for`, `$signal`) as a whole word, not `@for-x` or `@format`. */
const names = (heading: string, token: string): boolean =>
    new RegExp(`(^|[^\\w$@-])${escapeRegExp(token)}(?![\\w-])`).test(heading);

/** `text` as a literal inside a RegExp: every metacharacter escaped, the backslash included. */
const escapeRegExp = (text: string): string => text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');

describe('docs/language, the formal reference', () => {
    it('has its seven pages', () => {
        const missing = PAGES.filter(p => !existsSync(join(LANGUAGE, p)));
        expect(missing, 'pages the reference is missing').toEqual([]);
        const extra = existsSync(LANGUAGE) ? readdirSync(LANGUAGE).filter(f => f.endsWith('.md') && !PAGES.includes(f)) : [];
        expect(extra, 'a page the test does not know: add it to PAGES').toEqual([]);
    });

    it('has a section for every rune the compiler knows', () => {
        const all = sections();
        const missing = RUNES
            .map(r => (r.kind === 'decorator' ? '@' : '$') + r.name)
            .filter(token => !all.some(s => names(s.heading, token)));
        expect(missing, 'runes with no ### section in docs/language').toEqual([]);
    });

    it('has a section for every block directive the parser reads', () => {
        const all = sections();
        const missing = DIRECTIVES.map(d => '@' + d).filter(token => !all.some(s => s.page === 'template.md' && names(s.heading, token)));
        expect(missing, 'directives with no ### section in docs/language/template.md').toEqual([]);
    });

    it('gives every construct its five parts, an EBNF grammar and an example', () => {
        const found: string[] = [];
        for (const s of sections()) {
            for (const part of PARTS) if (!new RegExp(`^#### ${part}\\b`, 'm').test(s.body)) found.push(`${s.page} "${s.heading}": no #### ${part}`);
            if (!/^```ebnf\n/m.test(s.body)) found.push(`${s.page} "${s.heading}": no ebnf grammar`);
            if (!/^```pdx\n/m.test(s.body)) found.push(`${s.page} "${s.heading}": no pdx example`);
            const since = /^#### Since\n+([^\n]+)/m.exec(s.body)?.[1] ?? '';
            if (since && !/\b(alpha|beta)\b/.test(since)) found.push(`${s.page} "${s.heading}": Since names no level (alpha or beta)`);
        }
        expect(found, 'sections that miss part of the construct format').toEqual([]);
    });

    it('shows every rune in the form the analyzer\'s hint gives, and uses it in an example', () => {
        const all = sections();
        const found: string[] = [];
        for (const r of RUNES) {
            const token = (r.kind === 'decorator' ? '@' : '$') + r.name;
            const mine = all.filter(s => names(s.heading, token));
            if (mine.length === 0) continue; // reported by the coverage case
            const text = mine.map(s => s.body).join('\n');
            // The shape without its trailing teaching comment: what `Use:` prints.
            const shape = r.shape.replace(/\s+\/\/.*$/, '').trim();
            if (!text.includes(shape)) found.push(`${token}: the reference does not show the analyzer's form \`${shape}\``);
            const examples = [...text.matchAll(/^```pdx\n([\s\S]*?)^```/gm)].map(m => m[1]);
            const used = r.kind === 'decorator'
                ? examples.some(e => new RegExp(`^\\s*@${r.name}\\b`, 'm').test(e))
                : examples.some(e => e.includes(`$${r.name}(`));
            if (!used) found.push(`${token}: no example in its section uses it`);
        }
        expect(found, 'runes the reference and runes.ts disagree on').toEqual([]);
    });

    it('indexes every diagnostic code', () => {
        if (!existsSync(join(LANGUAGE, 'diagnostics.md'))) return; // reported by the pages case
        const page = read('diagnostics.md');
        const missing = Object.keys(DIAGNOSTICS).filter(code => !new RegExp(`\\b${code}\\b`).test(page));
        expect(missing, 'codes docs/language/diagnostics.md does not index').toEqual([]);
        const unknown = [...new Set(page.match(/\bPDX_[A-Z0-9_]+\b/g) ?? [])].filter(code => !(code in DIAGNOSTICS));
        expect(unknown, 'codes the catalogue does not have').toEqual([]);
    });

    it('names only diagnostic codes that exist, on every page', () => {
        const found: string[] = [];
        for (const page of PAGES.filter(p => existsSync(join(LANGUAGE, p)))) {
            for (const code of new Set(read(page).match(/\bPDX_[A-Z0-9_]+\b/g) ?? [])) if (!(code in DIAGNOSTICS)) found.push(`${page}: ${code}`);
        }
        expect(found, 'codes the catalogue does not have').toEqual([]);
    });
});

describe('the reference\'s examples', () => {
    const all = existsSync(LANGUAGE) ? languageExamples() : [];
    const compileOf = (f: { source: string; filename: string }) => compile(f.source, `C:/docs/language/${f.filename}`, [], resolveStub);

    it('are whole files', () => {
        const partial = all.filter(f => !/<template[\s>]/i.test(f.source) && !/<script[\s>]/i.test(f.source)).map(f => f.where);
        expect(partial, 'a pdx fence in the reference is a whole .pdx, not a fragment').toEqual([]);
    });

    it('compile without a warning or an error', () => {
        const found: string[] = [];
        for (const f of all) {
            try {
                for (const w of compileOf(f).warnings) {
                    if (w.severity === 'warn' || w.severity === 'error') found.push(`${f.where}: ${w.code} — ${w.message.slice(0, 100)}`);
                }
            } catch (e) {
                found.push(`${f.where}: does not compile — ${String(e).split('\n')[0].slice(0, 100)}`);
            }
        }
        expect(found, 'reference examples that raise diagnostics').toEqual([]);
    });

    it('emit a module that parses', () => {
        const broken: string[] = [];
        for (const f of all) {
            let code: string;
            try {
                code = compileOf(f).code;
            } catch {
                continue; // reported above
            }
            const body = code.split('\n').filter(l => !/^\s*(import|export)\s/.test(l)).join('\n');
            try {
                new Function(body);
            } catch (e) {
                broken.push(`${f.where}: ${(e as Error).message}`);
            }
        }
        expect(broken, 'reference examples that compile to a module that does not parse').toEqual([]);
    });
});
