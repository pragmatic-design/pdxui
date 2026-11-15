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
    // One shard took 12m53s–15m07s on 2026-11-14, the longest job of a pull request (#1075). Its
    // tests share a page per scenario (beforeAll), and fullyParallel splits them within the file: a
    // scenario cut by a shard opens its page once more, nothing else.
    { name: 'contracts', files: ['manifest-contract.spec.ts'], shards: 3 },
    { name: 'guards', files: 'rest', shards: 2 },
];
