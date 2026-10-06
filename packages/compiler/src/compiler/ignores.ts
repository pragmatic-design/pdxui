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

// Match: a `pdx-ignore` / `pdx-ignore-file` comment in any of the three forms.
// Groups: [1]=`-file` or nothing [2]=the code [3]=the reason, up to the comment's end.
const IGNORE = /(?:<!--|\/\*|\/\/)\s*pdx-ignore(-file)?\s+(PDX_[A-Z0-9_]+)\s*(?::\s*(.*?))?\s*(?:-->|\*\/|$)/;

/** The exemptions a file declares, in order. */
export function parseIgnores(source: string): Ignore[] {
    const out: Ignore[] = [];
    source.split('\n').forEach((text, i) => {
        const m = IGNORE.exec(text);
        if (!m) return;
        out.push({ code: m[2], reason: (m[3] ?? '').trim(), line: i + 1, column: m.index + 1, scope: m[1] ? 'file' : 'next-line' });
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
