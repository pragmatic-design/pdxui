// Canvas renderer — thin abstraction over CanvasRenderingContext2D.
// Handles HiDPI, drawing primitives, and smooth paths.

export class CanvasRenderer {
    readonly canvas: HTMLCanvasElement;
    readonly ctx: CanvasRenderingContext2D;
    private dpr = 1;
    width = 0;
    height = 0;

    constructor(container: HTMLElement) {
        this.canvas = document.createElement('canvas');
        this.canvas.style.display = 'block';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d')!;
    }

    /** Resize canvas to match container. Returns true if size changed. */
    resize(): boolean {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        if (w === this.width && h === this.height && dpr === this.dpr) return false;

        this.width = w;
        this.height = h;
        this.dpr = dpr;
        this.canvas.width = w * dpr;
        this.canvas.height = h * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return true;
    }

    clear(): void {
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    // ─── Drawing primitives ──────────────────────

    line(x1: number, y1: number, x2: number, y2: number, color: string, width = 1, dash?: number[]): void {
        const c = this.ctx;
        c.beginPath();
        c.strokeStyle = color;
        c.lineWidth = width;
        c.setLineDash(dash ?? []);
        c.moveTo(x1, y1);
        c.lineTo(x2, y2);
        c.stroke();
        c.setLineDash([]);
    }

    /** Draw a polyline through points. */
    polyline(pts: { x: number; y: number }[], color: string, width = 2, dash?: number[]): void {
        if (pts.length < 2) return;
        const c = this.ctx;
        c.beginPath();
        c.strokeStyle = color;
        c.lineWidth = width;
        c.lineJoin = 'round';
        c.lineCap = 'round';
        c.setLineDash(dash ?? []);
        c.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
        c.stroke();
        c.setLineDash([]);
    }

    /** Draw a smooth curve through points (Catmull-Rom → cubic bezier). */
    smoothLine(pts: { x: number; y: number }[], color: string, width = 2): void {
        if (pts.length < 2) return;
        const c = this.ctx;
        c.beginPath();
        c.strokeStyle = color;
        c.lineWidth = width;
        c.lineJoin = 'round';
        c.lineCap = 'round';
        c.moveTo(pts[0].x, pts[0].y);

        if (pts.length === 2) {
            c.lineTo(pts[1].x, pts[1].y);
        } else {
            for (let i = 0; i < pts.length - 1; i++) {
                const p0 = pts[Math.max(0, i - 1)];
                const p1 = pts[i];
                const p2 = pts[i + 1];
                const p3 = pts[Math.min(pts.length - 1, i + 2)];
                const cp1x = p1.x + (p2.x - p0.x) / 6;
                const cp1y = p1.y + (p2.y - p0.y) / 6;
                const cp2x = p2.x - (p3.x - p1.x) / 6;
                const cp2y = p2.y - (p3.y - p1.y) / 6;
                c.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
            }
        }
        c.stroke();
    }

    /** Fill area under a line (down to baseline y). */
    fillArea(pts: { x: number; y: number }[], baseY: number, color: string, opacity = 0.15, smooth = false): void {
        if (pts.length < 2) return;
        const c = this.ctx;
        c.beginPath();
        c.globalAlpha = opacity;
        c.fillStyle = color;

        c.moveTo(pts[0].x, baseY);
        if (smooth && pts.length > 2) {
            c.lineTo(pts[0].x, pts[0].y);
            for (let i = 0; i < pts.length - 1; i++) {
                const p0 = pts[Math.max(0, i - 1)];
                const p1 = pts[i];
                const p2 = pts[i + 1];
                const p3 = pts[Math.min(pts.length - 1, i + 2)];
                c.bezierCurveTo(
                    p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
                    p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
                    p2.x, p2.y,
                );
            }
        } else {
            for (const p of pts) c.lineTo(p.x, p.y);
        }
        c.lineTo(pts[pts.length - 1].x, baseY);
        c.closePath();
        c.fill();
        c.globalAlpha = 1;
    }

    circle(cx: number, cy: number, r: number, fill: string, stroke?: string): void {
        const c = this.ctx;
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        if (fill) { c.fillStyle = fill; c.fill(); }
        if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.5; c.stroke(); }
    }

    rect(x: number, y: number, w: number, h: number, fill: string, radius = 0): void {
        const c = this.ctx;
        c.fillStyle = fill;
        if (radius > 0) {
            c.beginPath();
            c.roundRect(x, y, w, h, radius);
            c.fill();
        } else {
            c.fillRect(x, y, w, h);
        }
    }

    text(str: string, x: number, y: number, color: string, font: string, align: CanvasTextAlign = 'left', baseline: CanvasTextBaseline = 'middle'): void {
        const c = this.ctx;
        c.fillStyle = color;
        c.font = font;
        c.textAlign = align;
        c.textBaseline = baseline;
        c.fillText(str, x, y);
    }

    measureText(str: string, font: string): number {
        this.ctx.font = font;
        return this.ctx.measureText(str).width;
    }

    destroy(): void {
        this.canvas.remove();
    }
}
