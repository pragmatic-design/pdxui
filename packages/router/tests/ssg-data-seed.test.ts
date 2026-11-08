// A generated page carries its loaders' results (#239), and the client keeps them as those levels'
// results before the first navigation: the page is taken over with the data the server rendered, and a
// level runs its loader again only when its staleTime, counted from the build, has passed.

import { describe, it, expect, afterEach } from 'vitest';
import { ssgDataScript } from '../src/ssg-data';
import { installRouteAdoption } from '../src/hydrate';
import { keptResult } from '../src/loader-cache';

const RESULT = { key: '/tickets/:id|id=1|', pattern: '/tickets/:id', staleTime: 30_000, value: { title: 'Ticket 1', note: '</script><b>x</b>' } };

afterEach(() => { document.body.innerHTML = ''; });

describe('the data a generated page carries', () => {
    it('is written as JSON a page cannot end early, and read back the same', () => {
        const script = ssgDataScript([RESULT], 1_000);
        expect(script).toMatch(/^<script type="application\/json" id="pdx-ssg-data">/);
        expect(script.slice(0, -'</script>'.length)).not.toContain('</script');
        document.body.innerHTML = script;
        const parsed = JSON.parse(document.getElementById('pdx-ssg-data')!.textContent!) as { builtAt: number; results: unknown[] };
        expect(parsed).toEqual({ builtAt: 1_000, results: [RESULT] });
    });

    it('is kept as each level\'s result at boot, fresh while the build is younger than its staleTime', () => {
        document.body.innerHTML = ssgDataScript([RESULT], Date.now() - 1_000);
        installRouteAdoption();
        expect(keptResult(RESULT.key)).toEqual({ data: RESULT.value, fresh: true });
        expect(document.getElementById('pdx-ssg-data'), 'the script stays in the page').toBeNull();
    });

    it('and stale once the build is older than it', () => {
        const old = { ...RESULT, key: '/tickets/:id|id=2|' };
        document.body.innerHTML = ssgDataScript([old], Date.now() - 60_000);
        installRouteAdoption();
        expect(keptResult(old.key)).toEqual({ data: old.value, fresh: false });
    });
});
