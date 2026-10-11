// The site's markdown plugin creates ONE Shiki highlighter, however many .md files Vite transforms
// at once. The first request started the creation and the next ones, arriving before it finished,
// each started another: the site's browser suite logged «30 instances have been created».
import { describe, it, expect, vi } from 'vitest';

const shiki = vi.hoisted(() => ({ created: 0 }));

// The plugin resolves `shiki` from the site package, not from core: mock that module.
vi.mock('../../site/node_modules/shiki', () => ({
    createHighlighter: async () => {
        shiki.created++;
        await new Promise((r) => setTimeout(r, 20)); // creation takes time: the window the race needs
        return { codeToHtml: (code: string) => `<pre>${code}</pre>` };
    },
}));

import { markdownPlugin } from '../../site/src/lib/markdown/vite-markdown';

describe('the site markdown plugin', () => {
    it('creates one highlighter for ten documents transformed at once', async () => {
        const plugin = markdownPlugin();
        const transform = plugin.transform as (src: string, id: string) => Promise<{ code: string } | undefined>;

        const results = await Promise.all(
            Array.from({ length: 10 }, (_, i) => transform.call({}, `# Doc ${i}\n\n\`\`\`ts\nconst x = ${i};\n\`\`\`\n`, `/docs/doc-${i}.md`)),
        );

        expect(results.every((r, i) => r?.code.includes(`Doc ${i}`))).toBe(true);
        expect(shiki.created).toBe(1);
    });
});
