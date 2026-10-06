// Logger — consola instance with pdx branding.

import { createConsola } from 'consola';

// The level is set here rather than inherited, for the same reason index.ts sets it on the default
// instance: consola drops below `log` when the environment says test, and a command's progress
// output disappearing because a CI job exported TEST=true for an unrelated step is not a choice
// anybody made. 3 is consola's own interactive default.
export const logger = createConsola({
    level: 3,
    defaults: { tag: 'pdx' },
});
