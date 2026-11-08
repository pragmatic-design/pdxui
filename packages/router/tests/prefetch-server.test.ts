// @vitest-environment node
// A prefetch on the server (#160). An app warms the next route from a before-navigation hook — its
// chunk, and its data — and a build runs that hook for every path it generates. On the server there
// is no next click to make faster: the build has already imported every page, and a loader started
// here would be a request made for no visitor. So a prefetch there does nothing, and says so.

import { describe, it, expect, vi } from 'vitest';

const load = vi.fn(async () => {});
(globalThis as Record<string, unknown>).__pdx_route_table = {
    routes: [{ path: '/a', tag: 'pf-a', prefetch: 'hover' }],
    pageModules: { '/a': load },
};

const { prefetchRoute } = await import('../src/prefetch');

describe('a prefetch on the server', () => {
    it('queues nothing: no chunk, no data', () => {
        expect(prefetchRoute('/a')).toBe(false);
        expect(load).not.toHaveBeenCalled();
    });
});
