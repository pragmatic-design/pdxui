// How far a pixel's colour may move before Dimension 5 counts it as changed.
//
// `toHaveScreenshot` compares each pixel with pixelmatch, whose `threshold` is a colour distance from
// 0 to 1. Left unset it is Playwright's 0.2, and `maxDiffPixelRatio: 0` then only counts pixels that
// moved by MORE than that: a dialog backdrop going from 0.4 to 0.5 alpha — a grey moving from about
// 148 to about 125 — passes all 1708 screenshots. A tint, a shadow's alpha, a muted text colour: the
// changes a design system makes most often would be invisible.
//
// 0, and that is a measurement, on the Docker image (Playwright 1.58.2):
//
//   threshold 0, stale baselines           the same failures twice, with the same pixel counts
//                                          both times: deterministic, not noise
//   threshold 0, current baselines         1708 passed, twice
//   backdrop put back to 0.4, threshold 0  dialog-open red in all 13 themes (~94 000 pixels)
//   the same at 0.2                        13 passed — the defect this file exists for
//
// With 0 there is no margin left for noise to hide in, so any colour change fails here — which is
// the point.
//
// One value, for the config's floor and for the runner's two calls.
export const PIXEL_THRESHOLD = 0;

// How many pixels may differ at all — not by how much, which stays 0 above.
//
// The baselines are made in the Docker image on a developer's machine and compared on GitHub's
// runners, and the same image and the same Chromium do not rasterise every edge alike on every CPU:
// Skia picks its SIMD path from the processor. Measured on the runner: slider-basic [neutral] 6
// pixels off and split-open [neumorphic] 3, identical in every run on any commit (deterministic,
// not noise), and tabs-bordered [neutral] 3 once, on one runner. All of it antialiasing at an edge
// or a rounded corner.
//
// 10 lets that through and nothing a design change makes: a tint, a shadow or a backdrop moves
// thousands of pixels, and a focus ring a pixel wider a few hundred. What it gives up is a change
// of ten pixels or fewer.
export const MAX_DIFF_PIXELS = 10;

/**
 * The pixel tolerance of one screenshot: MAX_DIFF_PIXELS, or the ratio a manifest declares for a
 * scenario that carries state or movement. One or the other, never both — Playwright takes the
 * SMALLER of the two, so a ratio of 0 next to a count would leave nothing.
 */
export function pixelTolerance(ratio?: number): { maxDiffPixels?: number; maxDiffPixelRatio?: number } {
    return ratio === undefined
        ? { maxDiffPixels: MAX_DIFF_PIXELS, maxDiffPixelRatio: undefined }
        : { maxDiffPixels: undefined, maxDiffPixelRatio: ratio };
}
