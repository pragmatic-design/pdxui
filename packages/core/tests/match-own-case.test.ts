// `match()` takes a case only from the cases it was given (#927). The lookup went through the
// prototype: a value such as 'toString' or 'constructor' — ordinary words in data a `@switch` reads —
// found Object.prototype's method, called it as a case, and handed its string to the DOM, which threw:
// the default case never rendered. On the server the same lookup wrote the method's result.

import { describe, it, expect, afterEach } from 'vitest';
import { html } from '../src/renderer/template';
import { match } from '../src/renderer/helpers';
import { renderToString } from '../src/server/render-string';

const cases = { a: () => html`<i>a</i>`, _: () => html`<b>default</b>` };

afterEach(() => { document.body.innerHTML = ''; });

describe('match() with a key the cases do not have', () => {
    for (const key of ['toString', 'constructor', 'valueOf', 'hasOwnProperty']) {
        it(`'${key}' renders the default case, in the DOM and on the server`, () => {
            const host = document.createElement('div');
            host.appendChild(html`<p>${match(() => key, cases)}</p>` as unknown as Node);
            document.body.appendChild(host);
            expect(host.querySelector('p')?.innerHTML.replace(/<!--[^>]*-->/g, '')).toBe('<b>default</b>');
            expect(renderToString(() => html`<p>${match(() => key, cases)}</p>`)).toContain('<b>default</b>');
        });
    }

    it('a case the cases do have under such a name is that case', () => {
        const own = { toString: () => html`<i>own</i>`, _: () => html`<b>default</b>` };
        const host = document.createElement('div');
        host.appendChild(html`<p>${match(() => 'toString', own)}</p>` as unknown as Node);
        expect(host.querySelector('p')?.innerHTML.replace(/<!--[^>]*-->/g, '')).toBe('<i>own</i>');
        expect(renderToString(() => html`<p>${match(() => 'toString', own)}</p>`)).toContain('<i>own</i>');
    });
});
