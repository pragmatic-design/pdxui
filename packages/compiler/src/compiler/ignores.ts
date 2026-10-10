// A declared exemption for one finding.
//
// Some findings are intended where they are — a palette swatch IS a colour literal — and without an
// exemption the only choices are to live with the warning or to rewrite the page into something
// wrong. An exemption
// is written in the file, in the comment form of the block it sits in, with a reason:
//
//     <!-- pdx-ignore <CODE>: reason -->        the next line of the template
//     /* pdx-ignore <CODE>: reason */           the next line of a style
//     // pdx-ignore <CODE>: reason              the next line of the script
//     … pdx-ignore-file <CODE>: reason …        that code, anywhere in the file
//
// No reason, no exemption: PDX_IGNORE_WITHOUT_REASON. An exemption that silenced nothing is
// PDX_IGNORE_UNUSED, so it cannot outlive what it was for — reported only by a caller that ran
// every check (`pdx check`), since a partial run cannot tell unused from not-yet-checked.

import type { ValidationWarning } from './validate';

/** What an exemption matches on: the code, and the line. */
export type Finding = Pick<ValidationWarning, 'code' | 'line'>;

export interface Ignore {
    code: string;
    reason: string;
    /** 1-based line of the comment. */
    line: number;
    column: number;
    /** The whole file, or the line after the comment. */
    scope: 'file' | 'next-line';
}

/**
 * A `pdx-ignore` / `pdx-ignore-file` comment on one line, in any of the three forms — `<!--`, `/*`,
 * `//` — then the code, then optionally `: reason` up to the comment's end or the line's.
 *
 * Read by hand, not by a pattern: `\s*(?::\s*(.*?))?\s*(?:-->|\*\/|$)` took quadratic time on a run of
 * whitespace that ends in neither (#70). Same rules: the first opener that starts a valid comment wins;
 * after the code comes `:`, or the comment's end, or the line's.
 */
function readIgnore(text: string): { file: boolean; code: string; reason: string; index: number } | null {
    const isSp = (ch: string | undefined) => ch === ' ' || ch === '\t' || ch === '\r' || ch === '\f' || ch === '\v';
    const skip = (i: number) => { while (isSp(text[i])) i++; return i; };
    for (let at = 0; at < text.length; at++) {
        const opener = text.startsWith('<!--', at) ? 4 : text.startsWith('/*', at) || text.startsWith('//', at) ? 2 : 0;
        if (!opener) continue;
        let i = skip(at + opener);
        if (!text.startsWith('pdx-ignore', i)) continue;
        i += 'pdx-ignore'.length;
        const file = text.startsWith('-file', i) && isSp(text[i + 5]);
        if (file) i += 5;
        if (!isSp(text[i])) continue;
        i = skip(i);
        if (!text.startsWith('PDX_', i)) continue;
        let j = i + 4;
        while (/[A-Z0-9_]/.test(text[j] ?? '')) j++;
        if (j === i + 4) continue;
        const code = text.slice(i, j);
        const k = skip(j);
        if (text[k] === ':') {
            // The reason runs to the first `-->` or `*/`, or to the end of the line.
            const ends = [text.indexOf('-->', k + 1), text.indexOf('*/', k + 1)].filter((e) => e !== -1);
            const end = ends.length > 0 ? Math.min(...ends) : text.length;
            return { file, code, reason: text.slice(k + 1, end).trim(), index: at };
        }
        if (k === text.length || text.startsWith('-->', k) || text.startsWith('*/', k)) {
            return { file, code, reason: '', index: at };
        }
    }
    return null;
}

/** The exemptions a file declares, in order. */
export function parseIgnores(source: string): Ignore[] {
    const out: Ignore[] = [];
    source.split('\n').forEach((text, i) => {
        const m = readIgnore(text);
        if (!m) return;
        out.push({ code: m.code, reason: m.reason, line: i + 1, column: m.index + 1, scope: m.file ? 'file' : 'next-line' });
    });
    return out;
}

/** The exemption that silences `w`, if one does. An exemption without a reason silences nothing. */
export function exemptionFor(ignores: readonly Ignore[], w: Finding): Ignore | undefined {
    return ignores.find((ig) => ig.reason && ig.code === w.code
        && (ig.scope === 'file' || (w.line !== undefined && w.line === ig.line + 1)));
}

export interface IgnoreResult<W extends Finding> {
    /** The findings left, plus the findings about the exemptions themselves. */
    warnings: (W | ValidationWarning)[];
    /** How many findings an exemption silenced. */
    ignored: number;
    /** The findings an exemption silenced. */
    silenced: W[];
}

/**
 * Drop the findings `source` declares exempt. `reportUnused` adds PDX_IGNORE_UNUSED for an
 * exemption that matched nothing — only for a caller whose `warnings` are every check's.
 */
export function applyIgnores<W extends Finding>(source: string, warnings: W[], options: { reportUnused?: boolean } = {}): IgnoreResult<W> {
    const ignores = parseIgnores(source);
    if (ignores.length === 0) return { warnings, ignored: 0, silenced: [] };
    const used = new Set<Ignore>();
    const kept: (W | ValidationWarning)[] = [];
    const silenced: W[] = [];
    for (const w of warnings) {
        const by = exemptionFor(ignores, w);
        if (by) { used.add(by); silenced.push(w); continue; }
        kept.push(w);
    }
    for (const ig of ignores) {
        if (!ig.reason) {
            kept.push({
                code: 'PDX_IGNORE_WITHOUT_REASON', severity: 'error',
                message: `pdx-ignore${ig.scope === 'file' ? '-file' : ''} ${ig.code} gives no reason, so it exempts nothing.`,
                hint: `Say why the finding is intended here: pdx-ignore ${ig.code}: <reason>.`,
                line: ig.line, column: ig.column,
            });
        } else if (options.reportUnused && !used.has(ig)) {
            kept.push({
                code: 'PDX_IGNORE_UNUSED', severity: 'warn',
                message: `pdx-ignore${ig.scope === 'file' ? '-file' : ''} ${ig.code} silences nothing${ig.scope === 'next-line' ? ' on the next line' : ''}.`,
                hint: 'Remove it: what it was for is gone, or it is on the wrong line.',
                line: ig.line, column: ig.column,
            });
        }
    }
    return { warnings: kept, ignored: silenced.length, silenced };
}
