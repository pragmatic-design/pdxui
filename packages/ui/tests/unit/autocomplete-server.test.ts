// @vitest-environment node
// pdx-autocomplete rendered on the server (#160), in Node with the server DOM a build installs. With
// a value and suggestions, its list holds the matches — highlighted — and a build that generates a
// page with one (the showcase's records) has to write it, not stop on elements built by hand.
//
// The server DOM is installed by the first import, and the rest are static: imported in a hook, the
// component's whole graph had to load inside the hook's timeout, which it missed under the pre-push
// gate's load.

import './server-dom';
import { describe, it, expect } from 'vitest';
import { html } from '@pdxui/core';
import { renderToStringWithReport } from '@pdxui/core/server';
import '../../src/autocomplete/pdx-autocomplete';

describe('pdx-autocomplete on the server', () => {
    it('renders its matches, highlighted, with nothing left as an empty host', () => {
        expect(typeof document, 'this suite runs with no DOM').toBe('undefined');
        const { html: markup, skipped } = renderToStringWithReport(() =>
            html`<pdx-autocomplete value="mil" :suggestions=${['Milan', 'Rome']}></pdx-autocomplete>`);
        expect(skipped).toEqual([]);
        expect(markup).toContain('<mark>');
        expect(markup).toContain('Mil');
    });
});
