// Regression tests for the verified codegen/plugin bug-fix batch.
// Covers the production-only critical fixes (#1, #2, #3) plus #5, #6, #7, #11.
// ⚠️ `inlineBindings: false` throughout, and it is not a workaround: it names the path this
// file measures. A production build takes the INLINE path, and that path applies the
// loop-invariant hoist too — the transform both paths share is asserted on both,
// in `loop-invariant-both-paths.test.ts`. What is the template path's own is the binding
// deduplication and the escaping of the tagged template, which is what the flag pins here.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

describe('#1 loop-invariant hoisting (production)', () => {
    it('hoists a real signal read but never ctx.el or an event handler', () => {
        const source = `<template>
@for (items as e; track e.id) {
  <button @click="save">{{ e.count ?? count }}</button>
}
</template>
<script setup>
let items = $signal([]);
let count = $signal(0);
function save() {}
</script>`;
        const { code } = compile(source, 'hoist.pdx', [], undefined, { production: true, inlineBindings: false });
        // The signal read IS hoisted.
        expect(code).toContain('__li_count');
        // ctx.el is never wrapped in a computed.
        expect(code).not.toContain('computed(() => ctx.el())');
        expect(code).not.toContain('__li_el');
        // The handler is never hoisted/invoked at render.
        expect(code).not.toContain('__li_save');
        expect(code).toContain('safeHandler');
    });

    // Regression: nested @for loops both reading the same signal must not produce a
    // self-referential hoist. The inner loop hoists `const __li_tag = computed(() => ctx.tag())`;
    // the outer loop must NOT re-hoist `tag` (which would rewrite the inner initializer to
    // `computed(() => __li_tag())` → TDZ "Cannot access '__li_tag' before initialization").
    it('does NOT re-hoist a signal already hoisted by a nested each (self-reference TDZ)', () => {
        const source = `<template>
@for (groups as g; track g.id) {
  <h3>{{ g.title }}</h3>
  @for (g.items as it; track it.id) {
    <a :class="it.id === sel ? 'active' : ''">{{ it.name }}</a>
  }
}
</template>
<script setup>
let groups = $signal([]);
let sel = $signal(null);
</script>`;
        const { code } = compile(source, 'nested-hoist.pdx', [], undefined, { production: true, inlineBindings: false });
        // sel is hoisted exactly once (by the inner loop), reading ctx.sel() — never itself.
        expect(code).toContain('const __li_sel = computed(() => ctx.sel())');
        expect(code).not.toContain('computed(() => __li_sel())');
        // Exactly one __li_sel declaration (no duplicate outer hoist).
        expect(code.match(/const __li_sel =/g)?.length).toBe(1);
    });
});

describe('#2 binding dedup (production)', () => {
    it('does NOT hoist an expression that references a loop-local var', () => {
        const source = `<template>
@for (items as entry; track entry.id) {
  <span :title="entry.name + '!'" :aria-label="entry.name + '!'">{{ entry.name }}</span>
}
</template>
<script setup>
let items = $signal([]);
</script>`;
        const { code } = compile(source, 'dedup-loop.pdx', [], undefined, { production: true, inlineBindings: false });
        // entry is loop-local → must not be hoisted into a top-level computed.
        expect(code).not.toContain('__bd_');
        // The original interpolations remain in the row body — read through the row getter.
        expect(code).toContain('entry().name');
    });

    it('still deduplicates ctx-only expressions', () => {
        const source = `<template>
<button :disabled="count > 0" :hidden="count > 0">Save</button>
</template>
<script setup>
let count = $signal(0);
</script>`;
        const { code } = compile(source, 'dedup-ok.pdx', [], undefined, { production: true, inlineBindings: false });
        expect(code).toContain('__bd_0');
    });
});

describe('#3 template-literal escaping', () => {
    it('escapes author backticks and ${ in literal text (no execution)', () => {
        const source = '<template><p>premi ` e ${x}</p></template>\n<script setup>\nlet x = $signal(1);\n</script>';
        const { code } = compile(source, 'esc.pdx', [], undefined, { production: false });
        // The literal text is escaped: backtick and ${ are backslash-escaped.
        expect(code).toContain('premi \\` e \\${x}');
        // The render module body parses without throwing (no stray template break).
        const render = code.match(/render:[^\n]*html`[\s\S]*?`/);
        expect(render).not.toBeNull();
    });

    it('escapes in production too', () => {
        const source = '<template><p>a ` b ${y}</p></template>\n<script setup>\nlet y = $signal(2);\n</script>';
        const { code } = compile(source, 'esc-prod.pdx', [], undefined, { production: true, inlineBindings: false });
        expect(code).toContain('a \\` b \\${y}');
    });
});

describe('#5 @expose maps signals to internal var', () => {
    it('exposes a signal as __name and a function bare', () => {
        const source = `<template><div>{{ count }}</div></template>
<script setup>
let count = $signal(0);
function reset() { count = 0; }
@expose count, reset;
</script>`;
        const { code } = compile(source, 'expose.pdx', [], undefined, { production: false });
        expect(code).toContain('ctx.expose({ count: __count, reset })');
    });
});

describe('#6 prop .peek() rewrite is string/key-aware', () => {
    it('rewrites only the value, not the object key or string contents', () => {
        const source = `<template><div>{{ s.label }}</div></template>
<script setup>
@prop label: string = '';
let s = $signal({ label: label, text: 'label: x' });
</script>`;
        const { code } = compile(source, 'peek.pdx', [], undefined, { production: false });
        // Value rewritten to .peek()
        expect(code).toContain('label: ctx.label.peek()');
        // Object key 'label:' and string 'label: x' untouched
        expect(code).toContain("text: 'label: x'");
        expect(code).not.toContain("'ctx.label.peek(): x'");
    });
});

describe('#7 ternary then-branch is prefixed (not treated as object key)', () => {
    it('prefixes both branches of a ternary in a binding', () => {
        const source = `<template><div :data-x="flag ? yes : no">Hi</div></template>
<script setup>
let flag = $signal(true);
let yes = $signal('Y');
let no = $signal('N');
</script>`;
        const { code } = compile(source, 'ternary.pdx', [], undefined, { production: false });
        // The 'then' identifier must be prefixed, not left bare.
        expect(code).toContain('ctx.yes');
        expect(code).toContain('ctx.no');
        expect(code).not.toMatch(/\?\s*yes\s*:/);
    });
});

describe('#4 TDZ-safe declaration ordering', () => {
    it('emits a signal that depends on a body const AFTER that const', () => {
        const source = `<template><div>{{ c }}</div></template>
<script setup>
const base = 10;
let c = $signal(base);
</script>`;
        const { code } = compile(source, 'tdz1.pdx', [], undefined, { production: false });
        const baseIdx = code.indexOf('const base = 10');
        const sigIdx = code.indexOf('__c = signal(');
        expect(baseIdx).toBeGreaterThanOrEqual(0);
        expect(sigIdx).toBeGreaterThan(baseIdx);
    });

    it('emits a derived used by the body BEFORE the body statement', () => {
        const source = `<template><div>{{ d }}</div></template>
<script setup>
let n = $signal(2);
const d = $derived(n * 2);
const usesD = d + 1;
</script>`;
        const { code } = compile(source, 'tdz2.pdx', [], undefined, { production: false });
        const derivedIdx = code.indexOf('const d = computed(');
        const useIdx = code.indexOf('usesD');
        expect(derivedIdx).toBeGreaterThanOrEqual(0);
        expect(useIdx).toBeGreaterThan(derivedIdx);
    });

    // Regression: a derived that reads a body-local const must NOT be hoisted before the body,
    // even when a LATER derived is referenced inside a deferred closure (effect/onMount) in the
    // body. The closure's reference must not drag the body-local-dependent derived before its
    // dependency.
    it('does NOT hoist a derived that reads a body-local const, despite an effect referencing a later derived', () => {
        const source = `<template><div :ref="r">{{ list }}</div></template>
<script setup>
import { effect } from '@pdxui/core';
let r = $signal(null);
const items = [1, 2, 3];
const list = $derived(items.map(x => x * 2));
const sel = $derived(list[0]);
effect(() => { const el = r; if (!el) return; const s = sel; el.textContent = String(s); });
</script>`;
        const { code } = compile(source, 'tdz3.pdx', [], undefined, { production: false });
        const itemsIdx = code.indexOf('const items = [1, 2, 3]');
        const listIdx = code.indexOf('const list = computed(');
        const selIdx = code.indexOf('const sel = computed(');
        expect(itemsIdx).toBeGreaterThanOrEqual(0);
        // `list` reads body-local `items` → must come AFTER it (no TDZ).
        expect(listIdx).toBeGreaterThan(itemsIdx);
        // `sel` reads `list` → must come after `list`.
        expect(selIdx).toBeGreaterThan(listIdx);
    });

    // The asymmetry to guard: a SIGNAL whose initializer reads a body-local emits after the
    // body, and a DERIVED referenced by the body emits before it. A derived that reads one of those
    // signals must wait too — otherwise `const label = computed(() => __name())` is emitted
    // above `const __name = signal(...)` and the component dies at mount with
    // "Cannot access '__name' before initialization", naming a variable the author never wrote.
    it('does NOT hoist a derived above a signal that itself waits for a body-local', () => {
        const source = `<template><div>{{ label }}</div></template>
<script setup>
const params = new URLSearchParams(location.search);
let name = $signal(params.get('name') ?? '');
const label = $derived(name.toUpperCase());
function refresh() { return label; }
</script>`;
        const { code } = compile(source, 'tdz4.pdx', [], undefined, { production: false });
        const paramsIdx = code.indexOf('const params = new URLSearchParams');
        const signalIdx = code.indexOf('__name = signal(');
        const derivedIdx = code.indexOf('const label = computed(');

        expect(paramsIdx).toBeGreaterThanOrEqual(0);
        // The signal waits for the body-local, as it must.
        expect(signalIdx).toBeGreaterThan(paramsIdx);
        // …and the derived that reads it has to wait for the signal. computed() runs its
        // expression at creation, so "declared after" is not a formality here.
        expect(derivedIdx, 'the derived reads __name and is emitted before it — TDZ at mount')
            .toBeGreaterThan(signalIdx);
    });

    it('still hoists a derived used by the body when its signal does not wait', () => {
        // The control. The rule above must not move every derived after the body: a derived read by
        // an eagerly-executing body statement still has to be declared before it, which is the
        // rule the partition exists for in the first place.
        const source = `<template><div>{{ label }}</div></template>
<script setup>
let name = $signal('x');
const label = $derived(name.toUpperCase());
const shout = label + '!';
</script>`;
        const { code } = compile(source, 'tdz5.pdx', [], undefined, { production: false });
        const derivedIdx = code.indexOf('const label = computed(');
        const useIdx = code.indexOf('const shout =');
        expect(derivedIdx).toBeGreaterThanOrEqual(0);
        expect(useIdx).toBeGreaterThan(derivedIdx);
    });
});

describe('form auto-binding — all injected ${} bindings stay live', () => {
    // Regression: the form auto-binding injects multiple unquoted ${...} bindings into a tag
    // (:error/:touched/:warning on pdx-form-field; :value/@change/@blur on controls). A findTagEnd
    // that tracks only quotes stops at the '>' inside the FIRST arrow (=>), truncating the
    // tag — every binding after the first spills into a text run and gets escaped to \${...},
    // rendering as literal code under the labels. findTagEnd is brace-aware.
    it('does not escape the 2nd+ injected binding on a form-field / control', () => {
        const source = `<template>
<pdx-form :form="userForm">
  <pdx-form-field name="name" label="Name">
    <pdx-input name="name" />
  </pdx-form-field>
</pdx-form>
</template>
<script setup>
@form userForm { name: string }
</script>`;
        const { code } = compile(source, 'formbind.pdx', [], undefined, { production: false });
        // The injected bindings must be LIVE interpolations, never escaped (\${...} = literal text).
        expect(code).not.toContain('\\${');
        expect(code).toContain(':touched=${');
        expect(code).toContain(':warning=${');
        expect(code).toContain('@pdx-blur=${');
    });
});

describe('#16 @fetch URL is escaped', () => {
    it('JSON-stringifies a static URL (double-quoted, not raw single-quoted)', () => {
        const source = `<template><div>{{ data }}</div></template>
<script setup>
@fetch data: 'GET /api/users' as User[];
</script>`;
        const { code } = compile(source, 'fetch.pdx', [], undefined, { production: false });
        // The URL is emitted via JSON.stringify → a double-quoted string literal.
        expect(code).toContain('__httpClient.get("/api/users")');
        // The cache key is also a structurally-escaped string, not raw single quotes.
        expect(code).toContain('key: "GET:/api/users"');
    });
});

describe('#11 form-binding accepts single-quoted :form', () => {
    it('wires bindings when :form uses single quotes', () => {
        const source = `<template>
<pdx-form :form='userForm'>
  <pdx-input name="email" />
</pdx-form>
</template>
<script setup>
@form userForm { email: string }
</script>`;
        const { code } = compile(source, 'sqform.pdx', [], undefined, { production: false });
        // The control got auto-wired bindings from the form.
        expect(code).toContain('userForm');
        expect(code).toMatch(/onChange|\.value\(\)/);
    });
});
