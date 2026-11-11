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
    onBegin(config: { configFile?: string; projects: { outputDir: string }[] }): void;
    /** A test begun: the run's global timeout cuts off the ones still running without an onTestEnd (#1025). */
    onTestBegin(test: { id: string; location: { file: string }; title: string }): void;
    /** An error outside any test, the run's global timeout among them, matched as a failure of the config (#1025). */
    onError(error: { message?: string; value?: string }): void;
    /** A failed test, matched against the known intermittent failures when the run ends (#1013). */
    onTestEnd(
        test: { id?: string; location: { file: string }; title: string; expectedStatus: string },
        result: { status: string; errors?: { message?: string; value?: string }[]; attachments?: { name: string; body?: Buffer }[] },
    ): void;
    onEnd(result: { status: RunStatus }): void;
    printsToStdio(): boolean;
}
