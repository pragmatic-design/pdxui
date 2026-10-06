// Generate THEMING.md §11 — the token reference — from tokens.css.
//
// A hand-copied reference of a machine-readable source drifts by construction: rows fall behind the
// source, and a designer reading it concludes that a token family missing from it is not themeable.
// The only fix that holds is to stop copying.
//
// Two rules the generator follows:
//
//   · COLOUR RAMPS ARE ABBREVIATED. `--pdx-primary-50 … -950` is one row, `--pdx-primary-*`, with
//     the scale as its value. Twelve rows per ramp × seven ramps is noise, and the ramp is
//     generated from a hue token anyway.
//   · TOKENS NOTHING READS ARE SKIPPED. Listing them would be documentation promising a knob that
//     moves nothing. `unreadTokens()` already computes that set and
//     `packages/core/tests/design-tokens.test.ts` asserts its ceiling, so this reuses it rather
//     than deciding for itself.
//
// Usage:
//   node scripts/gen-theming-reference.mjs           rewrite the region in THEMING.md
//   node scripts/gen-theming-reference.mjs --check   exit 1 if the file disagrees with the source
//
// The region is delimited by HTML comments. Prose ABOUT the tokens — the notes pointing at §10 for
// the levers nothing reads — lives outside them and is not the generator's business.

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { unreadTokens } from './lint-tokens.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..');
const TOKENS_CSS = join(HERE, '..', 'src', 'tokens.css');
const THEMING_MD = join(HERE, '..', 'THEMING.md');

export const BEGIN = '<!-- BEGIN GENERATED token-reference — node scripts/gen-theming-reference.mjs -->';
export const END = '<!-- END GENERATED token-reference -->';

/** Read a text file with its line endings normalised to `\n` — a `\r` is not content. */
function readText(path) {
    return readFileSync(path, 'utf-8').replace(/\r\n/g, '\n');
}

/** The seven ramps, collapsed to one row each. A ramp is `--pdx-<name>-<step>`. */
const RAMPS = ['primary', 'secondary', 'accent', 'danger', 'warning', 'success', 'info', 'gray'];
const RAMP_STEP = /-(?:50|100|200|300|400|500|600|700|800|900|950)$/;

/** Section titles in tokens.css that say nothing a reader of the table needs. */
const SKIP_HEADINGS = new Set(['', 'Pragmatic Design Tokens']);

/**
 * Read tokens.css into ordered sections: `{ title, rows: [[token, value]] }`.
 *
 * The file is already sectioned by comments, and those comments are the grouping a reader of
 * THEMING.md sees — so the source's own structure is the document's, rather than a second one
 * maintained beside it. A comment becomes a heading when a declaration follows it.
 */
export function readSections(css) {
    const sections = [];
    let current = null;
    // Split on either ending. The declaration pattern below ends in `(?:\/\*.*)?$` and JS `.` does
    // not match `\r`, so on a CRLF checkout — git's default on Windows — every declaration with a
    // trailing block comment would fail to match. Rows would vanish and the output would still look
    // like a plausible table: the only symptom would be the check calling the correct committed
    // file out of date.
    const lines = css.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // A heading comment: `/* Title */`, or the first line of a `/* ==== \n Title \n ==== */`
        // banner. Both forms appear in tokens.css.
        const banner = /^\s*\/\*\s*=+\s*$/.test(line);
        if (banner) {
            const title = (lines[i + 1] ?? '').replace(/^\s*/, '').trim();
            if (title && !SKIP_HEADINGS.has(title)) current = pushSection(sections, title);
            continue;
        }
        const inline = line.match(/^\s*\/\*\s*(.+?)\s*(?:\*\/)?\s*$/);
        if (inline && !inline[1].startsWith('=')) {
            const title = inline[1].replace(/\s*-+\s*$/, '').trim();
            if (title && !SKIP_HEADINGS.has(title)) current = pushSection(sections, title);
            continue;
        }

        const decl = line.match(/^\s*(--pdx-[A-Za-z0-9_-]+)\s*:\s*(.+?);\s*(?:\/\*.*)?$/);
        // Runs of spaces in the value are column alignment in the stylesheet, not part of the
        // value — they would read as a typo in a table cell.
        if (decl && current) current.rows.push([decl[1], decl[2].trim().replace(/\s+/g, ' ')]);
    }
    return sections.filter(s => s.rows.length > 0);
}

function pushSection(sections, title) {
    const section = { title, rows: [] };
    sections.push(section);
    return section;
}

/** Collapse a ramp's twelve steps into one `--pdx-<name>-*` row, keeping source order. */
function collapseRamps(rows) {
    const out = [];
    const seen = new Set();
    for (const [token, value] of rows) {
        const ramp = RAMPS.find(r => token.startsWith(`--pdx-${r}-`) && RAMP_STEP.test(token));
        if (!ramp) { out.push([token, value]); continue; }
        if (seen.has(ramp)) continue;
        seen.add(ramp);
        out.push([`--pdx-${ramp}-*`, 'scale (50…900/950)']);
    }
    return out;
}

/** The markdown for the generated region. */
export function renderReference(css, unread) {
    const parts = [];
    for (const section of readSections(css)) {
        const rows = collapseRamps(section.rows)
            .filter(([token]) => token.endsWith('-*') || !unread.has(token));
        if (rows.length === 0) continue;

        // A section comment in tokens.css often carries an explanation after an em dash. It is
        // kept — that sentence is the reason the token exists — but below the heading rather than
        // inside it, so the table of contents stays readable.
        const [heading, ...rest] = section.title.split(' — ');
        parts.push(`### ${heading.replace(/\.$/, '')}`, '');
        if (rest.length > 0) {
            // The tail of a source comment continues its heading, so it starts lower-case; as a
            // sentence of its own it needs a capital and a full stop.
            const note = rest.join(' — ').replace(/\.$/, '');
            parts.push(note.charAt(0).toUpperCase() + note.slice(1) + '.', '');
        }
        parts.push('| Token | Default |', '|---|---|');
        for (const [token, value] of rows) parts.push(`| \`${token}\` | \`${value}\` |`);
        parts.push('');
    }
    return parts.join('\n').trimEnd();
}

/** Replace the delimited region of a markdown document. */
export function replaceRegion(markdown, body) {
    const start = markdown.indexOf(BEGIN);
    const end = markdown.indexOf(END);
    if (start === -1 || end === -1) {
        throw new Error(`[gen-theming-reference] markers not found in THEMING.md — expected ${BEGIN}`);
    }
    return markdown.slice(0, start + BEGIN.length) + '\n\n' + body + '\n\n' + markdown.slice(end);
}

/**
 * Regenerate the region from the current tokens.css. Exported so a test can call it.
 *
 * `unread` may be supplied by the caller. `unreadTokens` walks `packages/` and `templates/`, and a
 * caller that computes it a second time to compare against gets a DIFFERENT answer whenever
 * something writes to those trees in between — which is exactly what happens inside a six-package
 * parallel test run. One scan, shared, or the comparison measures the filesystem's timing.
 */
export function generate(repoRoot = REPO_ROOT, unread = unreadTokens(repoRoot).unread) {
    const css = readText(join(repoRoot, 'packages', 'design', 'src', 'tokens.css'));
    return renderReference(css, new Set(unread));
}

function main() {
    const check = process.argv.includes('--check');
    const md = readText(THEMING_MD);
    const next = replaceRegion(md, generate());

    if (check) {
        if (next === md) {
            console.log('[gen-theming-reference] THEMING.md §11 matches tokens.css.');
            return;
        }
        console.error('[gen-theming-reference] THEMING.md §11 is out of date. Run:\n'
            + '  node packages/design/scripts/gen-theming-reference.mjs');
        process.exit(1);
    }

    writeFileSync(THEMING_MD, next);
    const rows = next.split('\n').filter(l => /^\| `--pdx-/.test(l)).length;
    console.log(`[gen-theming-reference] wrote ${rows} token rows into THEMING.md §11.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
