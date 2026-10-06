/**
 * Where the e2e suite's saved themes go: a directory of its own, never the working tree.
 *
 * By default the save endpoint writes into `packages/design/src/themes/custom/` — a directory the
 * design suite serves at the same time, in the same `pnpm test`. The spec's cleanup deletes the theme
 * file before rewriting the `_custom.css` that imports it; a request landing in between makes the
 * design suite's http-server crash on ENOENT, and its tests fail on a refused connection.
 *
 * A fixed path, not mkdtemp: the Playwright config is evaluated by the runner AND by every worker,
 * and the dev server (started from the config), the spec (in a worker) and the teardown must all
 * name the same directory.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The variable the builder's save plugin reads. */
export { CUSTOM_THEMES_ENV } from '../src/save-plugin';

export const CUSTOM_THEMES_DIR = join(tmpdir(), 'pdx-builder-e2e-custom-themes');
