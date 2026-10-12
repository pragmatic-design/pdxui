/**
 * How the certification folder is split for CI: by spec, not by test count (#321).
 *
 * Playwright's `--shard` splits the ordered list of tests into equal COUNTS. Here the counts do not
 * match the cost: `axe-runner` takes ~0.5 s a test, `manifest-contract` ~0.16 s (it shares one page
 * across a scenario's themes), and in file order the cheap one filled a shard by itself — 1 min
 * against 9 for the shard next to it. So the folder is split into projects first, and each project
 * is sharded on its own, as many times as its cost asks (`shards`).
 *
 * The last project, `rest`, has no file list: it is everything the others do not name, so a spec
 * added to the folder is always run by exactly one project. `packages/core/tests/ci-certification.test.ts`
 * checks that the CI matrix runs every project with its shard count.
 */
export interface CertifyProject {
    name: string;
    /** The spec files this project runs; `rest` takes every file no other project names. */
    files: string[] | 'rest';
    /** How many CI jobs share it. */
    shards: number;
}

export const CERTIFY_PROJECTS: CertifyProject[] = [
    { name: 'axe', files: ['axe-runner.spec.ts'], shards: 2 },
    { name: 'contracts', files: ['manifest-contract.spec.ts'], shards: 1 },
    { name: 'guards', files: 'rest', shards: 2 },
];
