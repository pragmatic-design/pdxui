// The stroke model of pdx-signature-pad: a signature is the list of strokes the pointer drew, each a list
// of points in the surface's CSS pixels. Kept as points, not as a bitmap, so a resize or a change of
// device pixel ratio redraws them sharp and in place, and an undo takes the last one off.

export interface SignaturePoint { x: number; y: number }
export type SignatureStroke = SignaturePoint[];

/** The length of the path through a stroke's points, in CSS pixels. */
export function strokeLength(stroke: SignatureStroke): number {
    let length = 0;
    for (let i = 1; i < stroke.length; i++) {
        length += Math.hypot(stroke[i].x - stroke[i - 1].x, stroke[i].y - stroke[i - 1].y);
    }
    return length;
}

/**
 * Whether the strokes count as a signature: with `minStroke` 0 any stroke does, a tap included;
 * otherwise their lengths together have to reach it.
 */
export function isSigned(strokes: readonly SignatureStroke[], minStroke: number): boolean {
    if (strokes.length === 0) return false;
    if (minStroke <= 0) return true;
    let total = 0;
    for (const s of strokes) total += strokeLength(s);
    return total >= minStroke;
}

/**
 * Add `point` to `stroke` unless it is closer than `minDistance` to the last point: a pointer reports
 * far more moves than a line needs. Says whether it was kept.
 */
export function addPoint(stroke: SignatureStroke, point: SignaturePoint, minDistance: number): boolean {
    const last = stroke[stroke.length - 1];
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < minDistance) return false;
    stroke.push(point);
    return true;
}

/** The part of a 2D context a redraw uses. */
export type StrokeTarget = Pick<CanvasRenderingContext2D, 'beginPath' | 'moveTo' | 'lineTo' | 'arc' | 'fill' | 'stroke'>;

/**
 * Trace the strokes on `ctx`, whose transform already maps CSS pixels to the canvas: a single point is a
 * dot of the pen's width, the others a line through their points. Colour, width and joins are the
 * caller's (`lineWidth`, `strokeStyle`, `fillStyle`, `lineCap`/`lineJoin` round).
 */
export function traceStrokes(ctx: StrokeTarget, strokes: readonly SignatureStroke[], width: number): void {
    for (const s of strokes) {
        if (s.length === 0) continue;
        ctx.beginPath();
        if (s.length === 1) {
            ctx.arc(s[0].x, s[0].y, width / 2, 0, Math.PI * 2);
            ctx.fill();
            continue;
        }
        ctx.moveTo(s[0].x, s[0].y);
        for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y);
        ctx.stroke();
    }
}
