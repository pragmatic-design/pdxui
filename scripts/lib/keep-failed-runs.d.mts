// The types of keep-failed-runs.mjs, for the TypeScript that imports it without `allowJs` (the site's
// tests). The module is the source; keep the two in step.

/**
 * Copy `results` to `<keptRoot>/<stamp>` when the run left a failure in it, drop the oldest beyond the
 * last ten, and return where it went; null when there was nothing to keep.
 */
export function keepFailures(results: string, keptRoot: string, stamp: string): string | null;

/** The global teardown: each project's output folder, once, kept beside it as `<folder>-kept`. */
export default function keepFailedRuns(config: { projects: { outputDir: string }[] }): void;
