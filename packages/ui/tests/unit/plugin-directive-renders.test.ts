// A plugin's template directive renders what its generate() returns (#688).
//
// generate(expr, bodyCode) returns an expression whose value is what the directive renders. The inline
// path placed it as the body of a function, `(()=>{${generated}})()`, so an expression rendered
// nothing, and the only form that rendered was a `return` statement no documentation named.

import { describe, it, expect, afterEach } from 'vitest';
import * as core from '@pdxui/core';
import { compile } from '../../../compiler/src/plugin';
import type { CompilerPlugin } from '../../../compiler/src/plugin-system';
import { cleanup, tick } from './helpers';

afterEach(() => cleanup());

/** `@wrap ('box') { … }` puts its body in a div of that class: a helper the plugin's generate calls. */
const wrapPlugin: CompilerPlugin = {
    name: 'wrap-plugin',
    templateDirectives: {
        wrap: {
            generate(expr, bodyCode, imports) {
                imports.add('wrapIn');
                return `wrapIn(${expr}, ${bodyCode})`;
            },
        },
    },
};

function wrapIn(cls: string, content: Node): HTMLElement {
    const div = document.createElement('div');
    div.className = cls;
    div.append(content);
    return div;
}

describe('a plugin directive', () => {
    it('renders the value of the expression generate() returns', async () => {
        const src = "<template><section>@wrap ('box') { <b>hi</b> }</section></template>\n<script>\nlet n = $signal(1);\n</script>\n";
        const { code } = compile(src, 'wrap-probe.pdx', [wrapPlugin], undefined, {});
        const body = code.replace(/import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?/, 'const {$1} = __core;');
        new Function('__core', body)({ ...core, wrapIn });

        const el = document.createElement('app-wrap-probe');
        document.body.appendChild(el);
        await tick();
        expect(el.querySelector('section > div.box > b')?.textContent).toBe('hi');
    });
});
