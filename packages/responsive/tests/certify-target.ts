/**
 * The browser target the certification pages are built for (#156, #509): `baseline-2026`, the
 * default, unless `PDX_TARGET` says `baseline-2024`, the frozen target that keeps a reduced run
 * (decision 16). The scenario pages' Vite config builds the design CSS in that target's form, and
 * Dim 1 leaves out the scenarios certified on the other target only — both read it from here, so the
 * pages and the contracts measured on them cannot disagree.
 */
export type CertifyTarget = 'baseline-2026' | 'baseline-2024';

export function certifyTarget(env: Record<string, string | undefined> = process.env): CertifyTarget {
    return env.PDX_TARGET === 'baseline-2024' ? 'baseline-2024' : 'baseline-2026';
}
