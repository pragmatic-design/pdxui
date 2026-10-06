// An entry that imports a name @pdxui/core does not export, and never uses it. Built by
// missing-export.spec.ts. Unused is the case that matters: Rollup already fails on a missing name
// that is read, and only warns on one that is not — the shape `import type { DataSource }` takes
// once merged into the runtime import.
import { NotThere } from '@pdxui/core';

export const unrelated = 1;
