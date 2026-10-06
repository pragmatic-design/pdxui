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
