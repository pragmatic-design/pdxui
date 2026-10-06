// An async beforeHook from a SUPERSEDED navigation must not win after a newer
// navigation has already started. Otherwise the stale navigation resumes after
// its `await hook(...)` and clobbers the current path.

import { describe, it, expect, beforeEach } from 'vitest';
import { createRouter, navigate, currentPath, onBeforeNavigate } from '../src/runtime';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('runtime router — async beforeHook race',() => {
    beforeEach(() => {
        history.replaceState(null, '', '/');
    });

    it('a superseded navigation does not overwrite the newer one after its hook resolves', async () => {
        createRouter([
            { path: '/', component: () => document.createElement('div') },
            { path: '/a', component: () => document.createElement('div') },
            { path: '/b', component: () => document.createElement('div') },
        ]);

        // Slow hook ONLY for '/a' so B (fast) finishes first while A is still awaiting.
        const cleanup = onBeforeNavigate(async (_from, to) => {
            if (to === '/a') await delay(40);
            return true;
        });

        navigate('/a'); // starts, awaits 40ms inside the hook
        navigate('/b'); // newer navigation, resolves immediately

        await delay(80); // let A's hook resolve LAST

        // B is the latest navigation → it must remain the current path.
        expect(currentPath()).toBe('/b');
        cleanup();
    });
});
