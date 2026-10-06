// The site's diagnostics page, rendered from the catalog. The committed copy,
// packages/site/content/docs/diagnostics.md, is held to this output by
// packages/compiler/tests/diagnostics-page.test.ts: `vitest -u` on that test rewrites it.

import { DIAGNOSTICS, type DiagnosticEntry } from './catalog';

function section(title: string, intro: string, codes: [string, DiagnosticEntry][]): string[] {
    const out = [`## ${title}`, '', intro, ''];
    for (const [code, e] of codes) {
        // A bare heading: the site's slug keeps underscores, so its anchor is diagnosticUrl()'s.
        out.push(`### ${code}`, '', `*${e.severity}* — ${e.summary}`, '', e.explanation, '', `**Fix.** ${e.fix}${e.fixable ? ' `pdx check --fix` and the editor apply it.' : ''}`, '');
        if (e.example) {
            out.push('Instead of:', '', '```html', e.example.bad.trimEnd(), '```', '', 'write:', '', '```html', e.example.good.trimEnd(), '```', '');
        }
    }
    return out;
}

/** The whole page, frontmatter included. */
export function renderDiagnosticsPage(): string {
    const all = Object.entries(DIAGNOSTICS).sort(([a], [b]) => a.localeCompare(b));
    const defects = all.filter(([, e]) => e.category === 'defect');
    const design = all.filter(([, e]) => e.category === 'design');
    return [
        '---',
        'title: Diagnostics',
        `description: "Every PDX_* code the compiler, pdx check and the editor report: what it means and what to write instead. Generated from the catalog."`,
        'order: 25',
        '---',
        '',
        '# Diagnostics',
        '',
        `Every finding the compiler, \`pdx check\` and the editor report carries a \`PDX_*\` code — ${all.length} of them. `
        + 'Each is listed here with what it means and what to write instead, generated from the catalog in '
        + '`packages/compiler/src/diagnostics/`. From a terminal, `pdx explain <CODE>` prints the same entry; `--json` '
        + 'prints it for an agent. A finding in `pdx check --json` links its entry with `url`.',
        '',
        ...section('Defects', 'Something is wrong: the output differs from what was written, or nothing is generated for it.', defects),
        ...section('Design questions', 'Heuristics for a review, and the rules that read several files at once. They ask; they do not decide.', design),
    ].join('\n');
}
