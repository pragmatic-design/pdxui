// Segment map — a two-way, segment-based map between SOURCE offsets (.pdx) and GENERATED
// offsets (the virtual TS file). Every segment is 1:1 (the expression's verbatim text);
// the generated scaffolding (for-of, `;`, wrappers) has no segment → it cannot be mapped,
// so completions and diagnostics outside the real expressions are dropped.

export interface Segment { genStart: number; srcStart: number; length: number; }

export class SegmentMap {
    private segs: Segment[] = [];

    /** Registra un tratto verbatim: `length` char a partire da srcStart (.pdx) ↔ genStart (virtuale). */
    add(genStart: number, srcStart: number, length: number): void {
        if (length > 0) this.segs.push({ genStart, srcStart, length });
    }

    /** A source offset → the generated offset, or -1 when it is in no segment. */
    toGen(srcOffset: number): number {
        for (const s of this.segs) {
            if (srcOffset >= s.srcStart && srcOffset <= s.srcStart + s.length) {
                return s.genStart + (srcOffset - s.srcStart);
            }
        }
        return -1;
    }

    /** A generated offset → the source offset, or -1 when it lands in the scaffolding (unmapped). */
    toSrc(genOffset: number): number {
        for (const s of this.segs) {
            if (genOffset >= s.genStart && genOffset <= s.genStart + s.length) {
                return s.srcStart + (genOffset - s.genStart);
            }
        }
        return -1;
    }

    get size(): number { return this.segs.length; }
}
