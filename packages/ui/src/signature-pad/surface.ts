// The drawing surface of pdx-signature-pad: the canvas, the pointer that draws on it, and the PNG the
// form receives. The component owns the state (its model, its mode); this owns the imperative part —
// a canvas sized to its box at the device pixel ratio, strokes kept as points and redrawn on a resize,
// and the export.
//
// The exported image has a transparent background and the ink's colour: it is pasted on documents. The
// surface on screen is "paper" (the design CSS), so the ink reads the same on it in a dark scheme.
import { addPoint, isSigned, traceStrokes, type SignatureStroke } from './strokes';

/** What the component tells the surface, read again at every redraw. */
export interface SurfaceOptions {
    /** The pen's width in CSS pixels. */
    penWidth: number;
    /** The path length, in CSS pixels, under which the strokes do not count as signed (0: any). */
    minStroke: number;
    /** `type`: the surface shows `typed` in the signature face, and the pointer draws nothing. */
    mode: 'draw' | 'type';
    typed: string;
    /** Whether the pointer may draw: not disabled, not readonly, in the draw mode. */
    drawing: boolean;
}

/** The export's scale over CSS pixels: the same image on every screen, sharp enough to print. */
const EXPORT_SCALE = 2;
/** Points closer than this to the last one, in CSS pixels, are not kept. */
const MIN_DISTANCE = 1;
/** Where the signing line sits, as a share of the height: the design CSS draws it at the same place. */
export const BASELINE = 0.72;

export class SignatureSurface {
    /** The strokes drawn in the draw mode, oldest first. */
    strokes: SignatureStroke[] = [];
    /** An image the value was set to from outside (an attribute, a reset): drawn under the strokes. */
    private image: HTMLImageElement | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private current: SignatureStroke | null = null;
    private fontReady = false;

    /**
     * `commit` receives what the form should hold after a change the user made: the PNG, or '' when
     * the strokes do not count as signed. `changed` is called after every change of what is drawn.
     */
    constructor(
        private readonly options: () => SurfaceOptions,
        private readonly commit: (value: string) => void,
        private readonly changed: () => void,
    ) {}

    /** The attachment: `attach:` calls it with the canvas, and its return is the cleanup. */
    attach(canvas: HTMLCanvasElement): () => void {
        this.canvas = canvas;
        const ro = new ResizeObserver(() => this.redraw());
        ro.observe(canvas);
        const down = (e: PointerEvent): void => this.down(e);
        const move = (e: PointerEvent): void => this.move(e);
        const up = (e: PointerEvent): void => this.up(e);
        canvas.addEventListener('pointerdown', down);
        canvas.addEventListener('pointermove', move);
        canvas.addEventListener('pointerup', up);
        canvas.addEventListener('pointercancel', up);
        this.redraw();
        return () => {
            ro.disconnect();
            canvas.removeEventListener('pointerdown', down);
            canvas.removeEventListener('pointermove', move);
            canvas.removeEventListener('pointerup', up);
            canvas.removeEventListener('pointercancel', up);
            this.canvas = null;
        };
    }

    /** Whether what is shown counts as a signature. */
    signed(): boolean {
        const o = this.options();
        if (o.mode === 'type') return o.typed.trim() !== '';
        return this.image !== null || isSigned(this.strokes, o.minStroke);
    }

    /** Take everything off. The caller writes the model. */
    clear(): void {
        this.strokes = [];
        this.image = null;
        this.current = null;
        this.redraw();
        this.changed();
    }

    /** Take the last stroke off, and commit what is left. */
    undo(): void {
        if (this.strokes.length === 0) return;
        this.strokes.pop();
        this.redraw();
        this.changed();
        this.commit(this.exported());
    }

    /**
     * Show `url`, a value set from outside: the strokes go, the image is drawn. '' shows nothing. No
     * commit: the value is already this.
     */
    show(url: string): void {
        this.strokes = [];
        this.current = null;
        if (!url) {
            this.image = null;
            this.redraw();
            this.changed();
            return;
        }
        const img = new Image();
        img.onload = () => {
            if (this.image !== img) return;
            this.redraw();
            this.changed();
        };
        this.image = img;
        img.src = url;
        this.changed();
    }

    /** The mode or the typed text changed: redraw, loading the face first for a typed name. */
    async retype(): Promise<void> {
        const o = this.options();
        // Every time, not once: a name that reaches latin-ext loads that subset then.
        if (o.mode === 'type' && this.canvas && this.usesOwnFace(this.canvas)) {
            const { loadSignatureFont } = await import('./signature-font');
            // Drawn either way: a face that does not load (offline, a blocked request) leaves the
            // token's next family, `cursive`, to draw the name — never an empty image under a value
            // that says signed. The rejection is the fallback, not an error to raise.
            await loadSignatureFont(o.typed).then(() => undefined, () => undefined);
            this.fontReady = true;
        }
        this.redraw();
        this.changed();
    }

    /** What the form receives for what is shown: the PNG, or '' when it does not count as signed. */
    exported(): string {
        const canvas = this.canvas;
        if (!canvas || !this.signed()) return '';
        const { width, height } = canvas.getBoundingClientRect();
        if (width === 0 || height === 0) return '';
        const out = document.createElement('canvas');
        out.width = Math.round(width * EXPORT_SCALE);
        out.height = Math.round(height * EXPORT_SCALE);
        const ctx = out.getContext('2d');
        if (!ctx) return '';
        this.paint(ctx, EXPORT_SCALE, width, height);
        return out.toDataURL('image/png');
    }

    /** Redraw the whole canvas, sized to its box at the device pixel ratio. */
    redraw(): void {
        const canvas = this.canvas;
        if (!canvas) return;
        const { width, height } = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = Math.round(width * dpr);
        const h = Math.round(height * dpr);
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w, h);
        this.paint(ctx, dpr, width, height);
    }

    /** Draw what is shown on `ctx`, at `scale` device pixels per CSS pixel. */
    private paint(ctx: CanvasRenderingContext2D, scale: number, width: number, height: number): void {
        const canvas = this.canvas;
        if (!canvas) return;
        const style = getComputedStyle(canvas);
        const o = this.options();
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.fillStyle = style.color;
        ctx.strokeStyle = style.color;
        if (o.mode === 'type') {
            const text = o.typed.trim();
            if (!text) return;
            if (this.usesOwnFace(canvas) && !this.fontReady) return;
            let size = height * 0.5;
            ctx.font = `${size}px ${style.fontFamily}`;
            const measured = ctx.measureText(text).width;
            const room = width * 0.9;
            if (measured > room) {
                size = size * (room / measured);
                ctx.font = `${size}px ${style.fontFamily}`;
            }
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(text, width / 2, height * BASELINE);
            return;
        }
        if (this.image && this.image.complete && this.image.naturalWidth > 0) {
            // Contained, centred: an image of another size is never stretched.
            const k = Math.min(width / this.image.naturalWidth, height / this.image.naturalHeight);
            const iw = this.image.naturalWidth * k;
            const ih = this.image.naturalHeight * k;
            ctx.drawImage(this.image, (width - iw) / 2, (height - ih) / 2, iw, ih);
        }
        ctx.lineWidth = o.penWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        traceStrokes(ctx, this.strokes, o.penWidth);
    }

    /** Whether the canvas's face is the one this package ships (and so has to be loaded). */
    private usesOwnFace(canvas: HTMLCanvasElement): boolean {
        return getComputedStyle(canvas).fontFamily.includes('pdx-signature');
    }

    private point(e: PointerEvent): { x: number; y: number } {
        const r = (this.canvas as HTMLCanvasElement).getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    private down(e: PointerEvent): void {
        if (!this.options().drawing || e.button !== 0 || !this.canvas) return;
        e.preventDefault();
        this.canvas.focus();
        this.canvas.setPointerCapture(e.pointerId);
        this.current = [this.point(e)];
        this.strokes.push(this.current);
        this.redraw();
    }

    private move(e: PointerEvent): void {
        if (!this.current) return;
        const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
        let kept = false;
        for (const c of events.length > 0 ? events : [e]) {
            if (addPoint(this.current, this.point(c), MIN_DISTANCE)) kept = true;
        }
        if (kept) this.redraw();
    }

    private up(e: PointerEvent): void {
        if (!this.current) return;
        if (this.canvas?.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
        this.current = null;
        this.changed();
        this.commit(this.exported());
    }
}
