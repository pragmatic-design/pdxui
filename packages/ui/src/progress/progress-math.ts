// The numbers pdx-progress draws from (#1210): pure, and written once for the module, not per instance.

/** The radius of the circular ring, in its 100×100 viewBox. */
const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** The value as a percentage of `max`, clamped to 0–100, or -1 when indeterminate (no value, or no range). */
export function percentOf(value: number, max: number): number {
    if (value < 0 || max <= 0) return -1;
    return Math.max(0, Math.min(100, (value / max) * 100));
}

/** The ring's dash: the whole circle. */
export const RING_DASH = String(CIRCUMFERENCE);

/**
 * The part of the ring left undrawn — three quarters while indeterminate, where progress.css spins
 * the quarter drawn.
 */
export function ringOffsetOf(percent: number): string {
    return String(percent < 0 ? CIRCUMFERENCE * 0.75 : CIRCUMFERENCE * (1 - percent / 100));
}
