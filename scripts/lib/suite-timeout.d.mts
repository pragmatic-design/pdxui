// The types of suite-timeout.mjs, for the Playwright configs and tests that import it without
// `allowJs`. The module is the source; keep the two in step.

/** The global timeout, in milliseconds, of a suite whose slowest measured run took `slowestSeconds` (#1040). */
export function suiteTimeout(slowestSeconds: number): number;
