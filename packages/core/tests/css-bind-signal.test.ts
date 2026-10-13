// `bind()` in a style follows a `$signal` and a `$derived`, not only a `@prop` (#205).
//
// The setup emitted `ctx.track(() => ctx.el.style.setProperty(…, String(ctx.width())))`, which runs
// inside setup, before setup has returned its names: `ctx.width` was not a function yet and the
// component did not mount (`setup failed: TypeError: ctx.width is not a function`).
//
// In core, because the compiled component runs on core in happy-dom — the same bridge as
// render-parity.test.ts.

import { describe, it, expect } from 'vitest';
import * as core from '../src/index';
import { compile } from '../../compiler/src/plugin';
import { hash } from '../../compiler/src/compiler/codegen-styles';

const settle = async () => { for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0)); };

describe('bind() in a style', () => {
    for (const build of [false, true]) {
        it(`follows a $signal, a $derived and a @prop (${build ? 'build' : 'dev'})`, async () => {
            const name = `cssbind${build ? 'b' : 'd'}`;
            const src = '<template><button @click="w = w + 10">+</button></template>\n'
                + "<script setup>\n@prop tone: string = 'red';\nlet w = $signal(40);\nconst half = $derived(w / 2 + 'px');\n</script>\n"
                + '<style scoped>button { width: calc(bind(w) * 1px); height: bind(half); color: bind(tone); }</style>\n';
            const file = `${name}.pdx`;
            const { code } = compile(src, file, [], undefined, build ? { production: true } : {});
            const body = code
                .replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'@pdxui\/core';?\s*$/gm, 'const {$1} = __core;')
                .replace(/^\s*import\s*'virtual:pdx-style[^']*';?\s*$/gm, '');
            new Function('__core', body)(core);
            const el = document.createElement(`pdx-${name}`);
            document.body.appendChild(el);
            await settle();
            const prop = (n: string) => el.style.getPropertyValue(`--pdx-${hash(file)}-${n}`);
            expect(el.querySelector('button'), 'the component did not mount').not.toBeNull();
            expect([prop('w'), prop('half'), prop('tone')]).toEqual(['40', '20px', 'red']);
            el.querySelector('button')!.click();
            await settle();
            expect([prop('w'), prop('half')]).toEqual(['50', '25px']);
        });
    }
});
