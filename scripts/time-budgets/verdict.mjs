// How a timed pass is judged (#593): its fastest run on the branch over its fastest on `main` (the
// median until #789), both measured on the same runner, against the pass's `maxRatio` in budgets.json. A slow runner slows
// both sides alike, so the ratio judges the change; an absolute budget judged the runner.

/**
 * What a side's samples of one pass count as: the fastest (#789). Noise on a shared runner only ever
 * adds time, so the fastest sample is the one nearest the pass's cost. The median was not: in #788's
 * CI one slow sample of `pdx analyze`, a half-second pass, moved it 18% on a change the pass does not
 * run, over the 15% margin. A change that slows the pass slows every sample, the fastest included.
 *
 * @param {number[]} samples one pass's times in ms on one side
 */
export function summarize(samples) {
    return Math.min(...samples);
}

/**
 * One row per pass of `branch`: its summarized times in ms on each side, the ratio (two decimals), and
 * the verdict — 'ok', 'OVER', 'no base' when `main` was not timed, 'no budget yet' when the
 * pass has no `maxRatio`.
 *
 * @param {Record<string, number>} branch the branch's time per pass, by `summarize`, in ms
 * @param {Record<string, number>} base `main`'s time per pass, by `summarize`, in ms, on the same runner
 * @param {Record<string, { maxRatio?: number }>} budgets
 */
export function judge(branch, base, budgets) {
    return Object.entries(branch).map(([command, ms]) => {
        const baseMs = base[command];
        const maxRatio = budgets[command]?.maxRatio ?? null;
        const ratio = baseMs ? Math.round((ms / baseMs) * 100) / 100 : null;
        const verdict = ratio === null ? 'no base' : maxRatio === null ? 'no budget yet' : ratio > maxRatio ? 'OVER' : 'ok';
        return { command, branch: ms, base: baseMs ?? null, ratio, maxRatio, verdict };
    });
}
