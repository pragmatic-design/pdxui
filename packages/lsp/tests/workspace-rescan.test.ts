// The index must be rebuildable from disk so files created AFTER the server
// started are discovered (the server calls scanWorkspace again on watched-file changes / document
// open, and drops its project registries, instead of scanning only on init).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { scanWorkspace } from '../src/utils/project-scanner';
import { ProjectRegistries } from '../src/utils/project-registry';

const COMP = '<template><div>x</div></template>\n<script>\nlet n = $signal(0);\n</script>\n';

describe('workspace rescan',() => {
    const root = join(tmpdir(), `pdx-lsp-rescan-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);

    beforeAll(() => {
        mkdirSync(join(root, 'src'), { recursive: true });
        writeFileSync(join(root, 'package.json'), '{"name":"app"}');
        writeFileSync(join(root, 'src', 'first.pdx'), COMP);
    });
    afterAll(() => rmSync(root, { recursive: true, force: true }));

    it('picks up a component file created after the initial scan', () => {
        const registries = new ProjectRegistries();
        const tags = () => registries.forRoot(root).components.map(c => c.tag);
        const before = scanWorkspace(root);
        expect(tags()).toContain('pdx-first');
        expect(tags()).not.toContain('pdx-second');

        // Simulate a file created after startup.
        writeFileSync(join(root, 'src', 'second.pdx'), COMP);
        registries.clear();

        const after = scanWorkspace(root);
        expect(tags()).toContain('pdx-first');
        expect(tags()).toContain('pdx-second'); // newly discovered
        expect(after.pdxFiles.length).toBe(before.pdxFiles.length + 1);
    });
});
