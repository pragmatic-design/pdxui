// @vitest-environment node
// pdx-autocomplete rendered on the server (#160), in Node with the server DOM a build installs. With
// a value and suggestions, its list holds the matches — highlighted — and a build that generates a
// page with one (the showcase's records) has to write it, not stop on elements built by hand.

import { describe, it, expect, beforeAll } from 'vitest';
import { installServerDom } from '@pdxui/core/server-dom';

type Server = typeof import('@pdxui/core/server');
type Core = typeof import('@pdxui/core');
let server: Server;
let core: Core;

beforeAll(async () => {
    expect(typeof document, 'this suite runs with no DOM').toBe('undefined');
    installServerDom();
    core = await import('@pdxui/core');
    server = await import('@pdxui/core/server');
    await import('../../src/autocomplete/pdx-autocomplete');
});

describe('pdx-autocomplete on the server', () => {
    it('renders its matches, highlighted, with nothing left as an empty host', () => {
        const { html, skipped } = server.renderToStringWithReport(() =>
            core.html`<pdx-autocomplete value="mil" :suggestions=${['Milan', 'Rome']}></pdx-autocomplete>`);
        expect(skipped).toEqual([]);
        expect(html).toContain('<mark>');
        expect(html).toContain('Mil');
    });
});
