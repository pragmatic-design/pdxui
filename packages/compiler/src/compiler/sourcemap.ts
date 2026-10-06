// Source Map v3 builder — zero dependencies.
// Generates source maps that map compiled JS back to .pdx source files.
// Format: https://sourcemaps.info/spec.html

// ─── Types ─────────────────────────────────────────────────────────

export interface SourceMapping {
    /** Generated line (1-based) */
    genLine: number;
    /** Generated column (0-based) */
    genCol: number;
    /** Source line (1-based) */
    srcLine: number;
    /** Source column (0-based) */
    srcCol: number;
}

export interface SourceMapJSON {
    version: 3;
    file: string;
    sourceRoot: string;
    sources: string[];
    sourcesContent: (string | null)[];
    names: string[];
    mappings: string;
}

// ─── Builder ───────────────────────────────────────────────────────

/**
 * Builds a v3 source map incrementally.
 * Usage:
 *   const map = new SourceMapBuilder('counter.pdx', pdxSource);
 *   map.addMapping(1, 0, 5, 0);  // gen line 1 col 0 → src line 5 col 0
 *   map.addMapping(2, 4, 6, 2);
 *   return map.toJSON();
 */
export class SourceMapBuilder {
    private mappings: SourceMapping[] = [];
    private sourceFile: string;
    private sourceContent: string;

    constructor(sourceFile: string, sourceContent: string) {
        this.sourceFile = sourceFile;
        this.sourceContent = sourceContent;
    }

    /** Add a mapping from generated position to source position. Lines are 1-based, columns 0-based. */
    addMapping(genLine: number, genCol: number, srcLine: number, srcCol: number): void {
        this.mappings.push({ genLine, genCol, srcLine, srcCol });
    }

    /**
     * Add line-by-line mappings for a block of code.
     * Maps generated lines [genStartLine..genStartLine+lineCount] → source lines [srcStartLine..].
     * Useful for script blocks where lines map 1:1.
     */
    addLineBlock(genStartLine: number, srcStartLine: number, lineCount: number): void {
        for (let i = 0; i < lineCount; i++) {
            this.addMapping(genStartLine + i, 0, srcStartLine + i, 0);
        }
    }

    /** Generate the v3 source map JSON object. */
    toJSON(): SourceMapJSON {
        // Sort by generated position
        const sorted = [...this.mappings].sort((a, b) =>
            a.genLine - b.genLine || a.genCol - b.genCol
        );

        return {
            version: 3,
            file: this.sourceFile.replace(/\.pdx$/, '.js'),
            sourceRoot: '',
            sources: [this.sourceFile],
            sourcesContent: [this.sourceContent],
            names: [],
            mappings: encodeMappings(sorted),
        };
    }
}

// ─── VLQ Encoding ──────────────────────────────────────────────────

/**
 * Encode an array of SourceMapping into the v3 "mappings" string.
 * Format: semicolon-separated lines, comma-separated segments, VLQ-encoded fields.
 *
 * Each segment has 4 fields (all relative to previous):
 *   [genCol, sourceIndex, srcLine, srcCol]
 * sourceIndex is always 0 (single source file).
 */
function encodeMappings(mappings: SourceMapping[]): string {
    if (mappings.length === 0) return '';

    // One entry per generated line, indexed by line. Pushing an empty line per line skipped and then
    // writing into the last one would put a map whose first segment is on line k on line k-1, and
    // every line after it one line early.
    const lines: string[][] = [];
    let prevSrcLine = 0;
    let prevSrcCol = 0;
    let prevGenCol = 0;
    let currentLine = 0;

    for (const m of mappings) {
        while (lines.length < m.genLine) lines.push([]);
        if (m.genLine !== currentLine) { currentLine = m.genLine; prevGenCol = 0; }

        // Encode segment: [genCol, srcIdx=0, srcLine, srcCol] — genCol relative within the line,
        // the source fields relative to the previous segment, whatever its line.
        const segment =
            vlqEncode(m.genCol - prevGenCol) +
            vlqEncode(0) +  // source index (always 0)
            vlqEncode((m.srcLine - 1) - prevSrcLine) +  // srcLine: convert 1-based to 0-based
            vlqEncode(m.srcCol - prevSrcCol);

        lines[m.genLine - 1].push(segment);

        prevGenCol = m.genCol;
        prevSrcLine = m.srcLine - 1; // store as 0-based
        prevSrcCol = m.srcCol;
    }

    return lines.map(segs => segs.join(',')).join(';');
}

// ─── Origins carried in the generated text ─────────────

// The generated module is assembled by string concatenation across the code generator, and the
// setup body goes through an AST rewrite in between. An origin travels WITH the text it belongs to,
// as a comment at the start of a generated line: comments are trivia, so the rewrite and every
// concatenation keep it, and `collectOrigins` reads and removes them once the module is final.

/** How every origin mark starts: a module that holds one is a module that wants a map. */
export const ORIGIN_PREFIX = '/*@pdx-at:';

/** The comment that says "the code after me was written at this offset of the .pdx". */
export function originMark(offset: number): string {
    return `${ORIGIN_PREFIX}${offset}*/`;
}

// Match: an origin mark. Groups: [1]=the offset into the .pdx
const ORIGIN_MARK = /\/\*@pdx-at:(\d+)\*\//g;

/** `code` as a reader should see it: a diagnostic quotes the code, not its origin marks. */
export function withoutOrigins(code: string): string {
    return code.replace(ORIGIN_MARK, '');
}

/** One origin read from the generated text: where it was (1-based line, 0-based column) and its offset. */
export interface OriginMark { genLine: number; genCol: number; offset: number }

/**
 * `code` without its origin marks, and where each one was. A position is the one the code after
 * the mark has once every mark before it on its line is gone.
 */
export function collectOrigins(code: string): { code: string; marks: OriginMark[] } {
    const marks: OriginMark[] = [];
    const out: string[] = [];
    code.split('\n').forEach((line, i) => {
        let removed = 0;
        out.push(line.replace(ORIGIN_MARK, (mark, offset: string, at: number) => {
            marks.push({ genLine: i + 1, genCol: at - removed, offset: Number(offset) });
            removed += mark.length;
            return '';
        }));
    });
    return { code: out.join('\n'), marks };
}

/** The map of a module from the origins read out of it: each mark is one segment. */
export function mapFromOrigins(sourceFile: string, source: string, marks: OriginMark[]): SourceMapJSON {
    const builder = new SourceMapBuilder(sourceFile, source);
    const lineStarts = [0];
    for (let i = 0; i < source.length; i++) if (source[i] === '\n') lineStarts.push(i + 1);
    for (const m of marks) {
        let lo = 0, hi = lineStarts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (lineStarts[mid] <= m.offset) lo = mid; else hi = mid - 1;
        }
        builder.addMapping(m.genLine, m.genCol, lo + 1, m.offset - lineStarts[lo]);
    }
    return builder.toJSON();
}

/**
 * The map after `count` whole lines were inserted before generated line `at` (0-based), as the
 * auto-import injection does once the module is compiled. A line with no segment carries no field,
 * so inserting empty lines leaves every relative field of the lines after them intact.
 */
export function insertMapLines(map: SourceMapJSON, at: number, count: number): SourceMapJSON {
    if (count <= 0) return map;
    const lines = map.mappings.split(';');
    while (lines.length < at) lines.push('');
    lines.splice(at, 0, ...new Array<string>(count).fill(''));
    return { ...map, mappings: lines.join(';') };
}

/** VLQ encode a single integer. Supports negative values via sign bit. */
function vlqEncode(value: number): string {
    let vlq = value < 0 ? ((-value) << 1) | 1 : value << 1;
    let encoded = '';

    do {
        let digit = vlq & 0x1f; // 5 bits
        vlq >>>= 5;
        if (vlq > 0) digit |= 0x20; // continuation bit
        encoded += VLQ_CHARS[digit];
    } while (vlq > 0);

    return encoded;
}

/** Base64 VLQ character set. */
const VLQ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
