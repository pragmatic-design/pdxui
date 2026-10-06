/**
 * Specs in `integration/ui-components/` that `pnpm certify` does NOT run, and why.
 *
 * Every other spec in that folder runs. A gate that runs its runners BY NAME leaves every other spec
 * in the folder in no gate at all — regression guards written to stop their defects coming back
 * included — so the default is to run everything, and an exception is written down here.
 *
 * An entry here is a spec that is knowingly not executed. It must say why and name the issue that
 * resolves it. `packages/core/tests/certify-reaches-every-spec.test.ts` fails if a spec is neither run
 * by certify nor listed here — and if an entry has no reason or no issue.
 */
export interface CertifyExclusion {
    /** Spec file name inside integration/ui-components/. */
    file: string;
    /** Why it is not run. */
    reason: string;
    /** The issue of this repository that decides it, as `#123`. */
    issue: string;
}

/**
 * Empty. What a contract spec checks lives in the component manifests, which certify runs.
 */
export const CERTIFY_EXCLUSIONS: CertifyExclusion[] = [];
