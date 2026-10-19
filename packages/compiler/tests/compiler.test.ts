import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

describe('compile (end-to-end)', () => {
    it('compiles minimal .pdx file', () => {
        const source = `
<template>
  <div>Hello World</div>
</template>`;

        const { code } = compile(source, 'hello.pdx');
        // A file without a script goes through the one code generator (#158): its markup is a static
        // block, no html`` template.
        expect(code).toMatch(/import \{ component, staticBlock, staticMarkup \} from '@pdxui\/core'/);
        expect(code).toContain("component('app-hello'");
        expect(code).toContain('<div>Hello World</div>');
    });

    it('compiles interpolation', () => {
        const source = `
<template>
  <span>{{ name }}</span>
</template>

<script>
  const name = signal('World');
</script>`;

        const { code } = compile(source, 'greeting.pdx');
        expect(code).toMatch(/bindInterpolation\(__t\d+,\(\)=>ctx\.name\)/);
        expect(code).toContain("const name = signal('World');");
    });

    it('compiles piped interpolation', () => {
        const source = `
<template>
  <span>{{ price | currency }}</span>
</template>`;

        const { code } = compile(source, 'price.pdx');
        // core's value chain, `templatePipe` — `pipe` is its signal operator (#199).
        expect(code).toMatch(/import \{[^}]*\btemplatePipe\b[^}]*\} from '@pdxui\/core'/);
        expect(code).toContain('templatePipe(ctx.price(), ctx.currency)');
    });

    it('compiles @if/@else', () => {
        const source = `
<template>
  @if (open) {
    <div>Visible</div>
  } @else {
    <div>Hidden</div>
  }
</template>`;

        const { code } = compile(source, 'toggle.pdx');
        expect(code).toContain('when');
        expect(code).toContain('ctx.open()');
        expect(code).toContain('Visible');
        expect(code).toContain('Hidden');
    });

    it('compiles @for', () => {
        const source = `
<template>
  @for (items as item; track item.id) {
    <li>{{ item.name }}</li>
  }
</template>`;

        const { code } = compile(source, 'list.pdx');
        expect(code).toContain('each');
        expect(code).toContain('ctx.items()');
        expect(code).toContain("'id'");
        expect(code).toContain('(item)');
    });

    it('compiles @switch', () => {
        const source = `
<template>
  @switch (status) {
    @case ('active') { <span>Active</span> }
    @case ('error') { <span>Error</span> }
    @default { <span>Unknown</span> }
  }
</template>`;

        const { code } = compile(source, 'status.pdx');
        expect(code).toContain('match');
        expect(code).toContain('"active"');
        expect(code).toContain('"error"');
        expect(code).toContain('_:');
    });

    it('compiles @require', () => {
        const source = `
<template>
  @require ('admin.panel') {
    <nav>Admin</nav>
  } @else {
    <span>No access</span>
  }
</template>`;

        const { code } = compile(source, 'admin.pdx');
        expect(code).toContain('requirePermission');
        expect(code).toContain("'admin.panel'");
    });

    it('compiles @if with @transition', () => {
        const source = `
<template>
  @if (open) @transition('slide-right', 'fade-out') {
    <div class="drawer">Content</div>
  }
</template>`;

        const { code } = compile(source, 'drawer.pdx');
        expect(code).toContain("enter: 'slide-right'");
        expect(code).toContain("exit: 'fade-out'");
    });

    it('compiles with defineProps', () => {
        const source = `
<template>
  <span>{{ label }}</span>
</template>

<script>
  const props = defineProps({
    label: { type: String, default: 'Hello' },
    count: { type: Number, default: 0 },
  });
</script>`;

        const { code } = compile(source, 'counter.pdx');
        expect(code).toContain("label: { type: String, default: 'Hello' }");
        expect(code).toContain('count: { type: Number, default: 0 }');
    });

    it('compiles with scoped style', () => {
        const source = `
<template>
  <div>Styled</div>
</template>

<style scoped>
  div { color: red; }
</style>`;

        const { code } = compile(source, 'styled.pdx');
        expect(code).toContain('__pdx_style');
        expect(code).toContain('data-pdx-');
    });

    it('drops the reserved pdx- prefix of a file name for the app prefix (#136)', () => {
        const { code } = compile('<template><div>test</div></template>', 'pdx-drawer.pdx');
        expect(code).toContain("component('app-drawer'");
    });

    it('compiles script-only file (template optional)', () => {
        // Template is now optional — script-only .pdx files use empty template fallback
        const { code } = compile('<script>\nlet x = $signal(1);\n</script>', 'util.pdx');
        expect(code).toContain('signal(');
    });

    it('compiles full drawer example', () => {
        const source = `
<template>
  @if (open) @transition('slide-right', 'fade-out') {
    <div class="pdx-drawer-backdrop" @click="close"></div>
    <div class="pdx-drawer" :position :size data-open>
      <slot></slot>
    </div>
  }
</template>

<script>
  const props = defineProps({
    position: { type: String, default: 'right' },
    size: { type: String, default: 'md' },
    open: { type: Boolean, default: false },
  });

  function close() {
    ctx.open.set(false);
    ctx.emit('pdx-close');
  }
</script>`;

        const { code } = compile(source, 'drawer.pdx');
        expect(code).toContain("component('app-drawer'");
        expect(code).toContain('when');
        expect(code).toContain("enter: 'slide-right'");
        expect(code).toContain('close');
        expect(code).toContain("position: { type: String, default: 'right' }");
    });
});

// ─── @tag decorator ──────────────────────────────────────────────────

describe('@tag decorator', () => {
    it('overrides file-derived tag name', () => {
        const source = `<template><div>{{ label }}</div></template>
<script>
@tag 'app-my-widget';
@prop label: string = 'Hello';
</script>`;
        const { code } = compile(source, 'index.pdx');
        expect(code).toContain("component('app-my-widget'");
        expect(code).not.toContain("component('app-index'");
    });

    it('uses file-derived tag when @tag is absent', () => {
        const source = `<template><div>{{ count }}</div></template>
<script>
let count = $signal(0);
</script>`;
        const { code } = compile(source, 'counter.pdx');
        expect(code).toContain("component('app-counter'");
    });

    it('works with double quotes', () => {
        const source = `<template><div>test</div></template>
<script>
@tag "app-special-component";
</script>`;
        const { code } = compile(source, 'generic.pdx');
        expect(code).toContain("component('app-special-component'");
    });
});

// ─── Tag collision prevention ────────────────────────────────────────

describe('tag derivation', () => {
    const source = `<template><div>test</div></template>
<script>
let x = $signal(0);
</script>`;

    it('uses filename only, ignores parent dirs', () => {
        const { code } = compile(source, 'admin/index.pdx');
        expect(code).toContain("component('app-index'");
    });

    it('uses filename only for any path depth', () => {
        const { code } = compile(source, 'admin/button.pdx');
        expect(code).toContain("component('app-button'");
    });

    it('uses filename only for generic dirs (src/, pages/)', () => {
        const { code } = compile(source, 'src/dashboard.pdx');
        expect(code).toContain("component('app-dashboard'");
    });

    it('uses filename only for root-level files', () => {
        const { code } = compile(source, 'dashboard.pdx');
        expect(code).toContain("component('app-dashboard'");
    });

    it('handles absolute paths gracefully', () => {
        const { code } = compile(source, 'C:/Projects/my-app/src/pages/counter.pdx');
        expect(code).toContain("component('app-counter'");
    });

    it('respects @tag override', () => {
        const tagged = `<template><div>test</div></template>
<script>
@tag 'my-widget';
let x = $signal(0);
</script>`;
        const { code } = compile(tagged, 'anything/deep/widget.pdx');
        expect(code).toContain("component('my-widget'");
    });

    it('two files with same name derive same tag (collision detected by plugin)', () => {
        // Both derive app-button — the Vite plugin's tagRegistry catches this at transform time
        const { code: a } = compile(source, 'admin/button.pdx');
        const { code: b } = compile(source, 'settings/button.pdx');
        expect(a).toContain("component('app-button'");
        expect(b).toContain("component('app-button'");
    });

    it('special files (_layout) include parent dir', () => {
        const { code: a } = compile(source, 'admin/_layout.pdx');
        expect(a).toContain("component('app-admin-layout'");
        const { code: b } = compile(source, 'pages/_layout.pdx');
        // pages/ is generic — no parent included
        expect(b).toContain("component('app-layout'");
    });
});

describe('$derived arrow function handling', () => {
    it('$derived(expr) wraps in computed(() => expr)', () => {
        const source = `<template><div>{{ doubled }}</div></template>
<script>
let count = $signal(0);
const doubled = $derived(count * 2);
</script>`;
        const { code } = compile(source, 'expr-derived.pdx');
        // computed(() => __count() * 2) — expression wrapped in arrow
        expect(code).toContain('computed(() =>');
        expect(code).not.toContain('computed(() => () =>');
    });

    it('$derived(() => expr) passes arrow directly to computed()', () => {
        const source = `<template><div>{{ doubled }}</div></template>
<script>
let count = $signal(0);
const doubled = $derived(() => count * 2);
</script>`;
        const { code } = compile(source, 'arrow-derived.pdx');
        // computed(() => __count() * 2) — arrow passed directly, NOT double-wrapped
        expect(code).toContain('computed(()');
        expect(code).not.toContain('computed(() => () =>');
    });
});

describe('script-only compilation', () => {
    it('produces valid lowered code without component() wrapper', () => {
        const source = '<script>\nlet count = $signal(0);\nconst doubled = $derived(count * 2);\n</script>';
        const { code } = compile(source, 'util.pdx');
        expect(code).toContain('signal(');
        expect(code).toContain('computed(');
        expect(code).not.toContain("component(");
        expect(code).not.toContain('$signal');
        expect(code).not.toContain('$derived');
    });

    it('$effect compiles to effect() not ctx.track() in script-only', () => {
        const source = '<script>\nlet count = $signal(0);\n$effect(() => console.log(count));\n</script>';
        const { code } = compile(source, 'reactive-util.pdx');
        expect(code).toContain('effect(');
        expect(code).not.toContain('ctx.track');
        expect(code).not.toContain('ctx.');
    });

    it('onDestroy is skipped in script-only (modules do not unmount)', () => {
        const source = '<script>\nlet count = $signal(0);\nonDestroy(() => cleanup());\n</script>';
        const { code } = compile(source, 'cleanup-util.pdx');
        expect(code).not.toContain('ctx.track');
        expect(code).not.toContain('ctx.');
    });
});
