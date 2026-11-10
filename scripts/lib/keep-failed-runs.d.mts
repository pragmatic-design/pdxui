// The types of keep-failed-runs.mjs, for the TypeScript that imports it without `allowJs` (the site's
// tests). The module is the source; keep the two in step.

/** A run's status, as Playwright's `onEnd` reports it. */
export type RunStatus = 'passed' | 'failed' | 'timedout' | 'interrupted';

/**
 * Copy `results` to `<keptRoot>/<stamp>` when the run did not pass and left the folder, drop the
 * oldest beyond the last ten, and return where it went; null when there was nothing to keep.
 */
export function keepFailures(results: string, keptRoot: string, stamp: string, status: RunStatus): string | null;

/** The reporter: each project's output folder, once, kept beside it as `<folder>-kept`. */
export default class KeepFailedRuns {
    onBegin(config: { projects: { outputDir: string }[] }): void;
    onEnd(result: { status: RunStatus }): void;
    printsToStdio(): boolean;
}
