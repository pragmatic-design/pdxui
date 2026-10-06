// Integration tests: compile real .pdx files end-to-end and verify generated JS.
// These tests caught 9 bugs that unit tests missed during demo validation.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadDemo(name: string): string {
    return readFileSync(resolve(__dirname, `../demo/${name}`), 'utf8');
}

function compileDemo(name: string) {
    const source = loadDemo(name);
    return compile(source, name);
}

// ─── Basic compilation: no crashes, valid JS structure ─────────────

describe('integration — all demos compile without error', () => {
    const demos = ['counter.pdx', 'todo-list.pdx', 'user-list.pdx', 'contact-form.pdx', 'color-card.pdx', 'paginated-list.pdx'];

    for (const name of demos) {
        it(`${name} compiles successfully`, () => {
            const { code, warnings } = compileDemo(name);
            // The block is named "without error", so `warnings` is read: destructured and dropped,
            // an error-severity diagnostic would go by unseen.
            expect(warnings.filter(w => w.severity === 'error'), `${name} compiled with errors`).toEqual([]);
            expect(code).toBeTruthy();
            expect(code).toContain("component('pdx-");
            expect(code).toContain("import {");
            expect(code).toContain("from '@pdxui/core'");
        });
    }
});

// ─── Imports correctness ───────────────────────────────────────────

describe('integration — correct imports', () => {
    it('counter.pdx imports signal, computed, when, component, html', () => {
        const { code } = compileDemo('counter.pdx');
        expect(code).toContain('signal');
        expect(code).toContain('computed');
        expect(code).toContain('component');
        expect(code).toContain('html');
    });

    it('todo-list.pdx imports each for @for directive', () => {
        const { code } = compileDemo('todo-list.pdx');
        expect(code).toContain('each');
    });

    it('user-list.pdx imports resource for data fetching', () => {
        const { code } = compileDemo('user-list.pdx');
        expect(code).toContain('resource');
    });

    it('contact-form.pdx imports createForm + validators', () => {
        const { code } = compileDemo('contact-form.pdx');
        expect(code).toContain('createForm');
        expect(code).toContain('required');
        expect(code).toContain('minLength');
        expect(code).toContain('email');
    });

    it('paginated-list.pdx imports linkedSignal', () => {
        const { code } = compileDemo('paginated-list.pdx');
        expect(code).toContain('linkedSignal');
    });
});

// ─── Scoped CSS ────────────────────────────────────────────────────

describe('integration — scoped CSS', () => {
    it('generates descendant selector [data-pdx-HASH] .class', () => {
        const { code } = compileDemo('counter.pdx');
        expect(code).toMatch(/\[data-pdx-\w+\] \.counter-card/);
        expect(code).toMatch(/\[data-pdx-\w+\] \.value/);
    });

    it('generates setAttribute in setup for scope', () => {
        const { code } = compileDemo('counter.pdx');
        expect(code).toMatch(/ctx\.el\.setAttribute\('data-pdx-\w+', ''\)/);
    });

    it('all scoped demos have setAttribute', () => {
        for (const name of ['counter.pdx', 'todo-list.pdx', 'user-list.pdx', 'contact-form.pdx', 'color-card.pdx', 'paginated-list.pdx']) {
            const { code } = compileDemo(name);
            expect(code).toContain("ctx.el.setAttribute('data-pdx-");
        }
    });
});

// ─── Signal rewrite correctness ────────────────────────────────────

describe('integration — signal rewrite', () => {
    it('counter.pdx: count++ → __count.set(v => v + 1)', () => {
        const { code } = compileDemo('counter.pdx');
        expect(code).toContain('__count.set(__v => __v + 1)');
        expect(code).toContain('__count.set(__v => __v - 1)');
    });

    it('color-card.pdx: border-radius NOT rewritten (CSS property, not signal)', () => {
        const { code } = compileDemo('color-card.pdx');
        // The derived expression should have border-radius intact
        expect(code).toContain('border-radius');
        expect(code).not.toContain('border-__radius');
    });

    it('color-card.pdx: radius signal IS rewritten in JS context', () => {
        const { code } = compileDemo('color-card.pdx');
        // Signal read: radius → __radius()
        expect(code).toContain('__radius()');
    });
});

// ─── Variable ordering (regression for bugs #3, #6) ────────────────

describe('integration — variable ordering', () => {
    it('user-list.pdx: resource declared before derived that references it', () => {
        const { code } = compileDemo('user-list.pdx');
        const resourceIdx = code.indexOf('resource(');
        const derivedIdx = code.indexOf('computed(() =>');
        expect(resourceIdx).toBeLessThan(derivedIdx);
    });

    it('contact-form.pdx: createForm declared before derived that references it', () => {
        const { code } = compileDemo('contact-form.pdx');
        const formIdx = code.indexOf('createForm(');
        const derivedIdx = code.indexOf('computed(() =>');
        expect(formIdx).toBeLessThan(derivedIdx);
    });

    it('user-list.pdx: derived-referencing-derived gets () call', () => {
        const { code } = compileDemo('user-list.pdx');
        // userCount = $derived(userData.length) → computed(() => userData().length)
        expect(code).toContain('userData().length');
        expect(code).not.toMatch(/computed\(\(\) => userData\.length\)/);
    });
});

// ─── Template codegen: ctx prefix and signal calls ─────────────────

describe('integration — template codegen', () => {
    it('contact-form.pdx: form object NOT called as signal (ctx.contact, not ctx.contact())', () => {
        const { code } = compileDemo('contact-form.pdx');
        // In template, contact should NOT have () — it's a form object
        expect(code).not.toContain('ctx.contact()');
        // But contact.state() is valid — state is a signal on the form object
        expect(code).toContain('ctx.contact.state()');
    });

    it('user-list.pdx: resource object NOT called as signal', () => {
        const { code } = compileDemo('user-list.pdx');
        expect(code).not.toContain('ctx.users()');
        expect(code).toContain('ctx.users.state()');
        expect(code).toContain('ctx.users.loading()');
    });

    it('counter.pdx: signals called in reactive expressions (when/binding)', () => {
        const { code } = compileDemo('counter.pdx');
        // In @if conditions, signals are called: ctx.count() > 5
        expect(code).toContain('ctx.count() > 5');
        // In {{ }} interpolation, signals are passed as functions to html`` (template engine calls them)
        expect(code).toContain('ctx.count');
        expect(code).toContain('ctx.doubled');
    });

    it('user-list.pdx: @for loop variable NOT prefixed with ctx.', () => {
        const { code } = compileDemo('user-list.pdx');
        // Inside eachRow(), user is the loop callback param — a row getter —
        // and should NOT be ctx.user
        expect(code).toContain('(user) =>');
        expect(code).toContain('user().name');
        expect(code).not.toMatch(/ctx\.user\b/); // ctx.user — not ctx.users / ctx.userData
    });

    it('todo-list.pdx: @for loop variable NOT prefixed with ctx.', () => {
        const { code } = compileDemo('todo-list.pdx');
        expect(code).toContain('(item) =>');
        expect(code).toContain('item().text');
        expect(code).not.toMatch(/ctx\.item\b(?!s)/);
    });

    it('functions NOT called as signals in template', () => {
        const { code } = compileDemo('user-list.pdx');
        // doRefetch is a function, should be ctx.doRefetch not ctx.doRefetch()
        expect(code).not.toContain('ctx.doRefetch()');
        expect(code).toContain('ctx.doRefetch');
    });
});

// ─── @form codegen ─────────────────────────────────────────────────

describe('integration — @form codegen', () => {
    it('contact-form.pdx: generates createForm with validators', () => {
        const { code } = compileDemo('contact-form.pdx');
        expect(code).toContain("createForm({");
        expect(code).toContain("initialValues:");
        expect(code).toContain("validators:");
        expect(code).toContain("required()");
        expect(code).toContain("minLength(3)");
        expect(code).toContain("email()");
    });

    it('contact-form.pdx: form variable in auto-return', () => {
        const { code } = compileDemo('contact-form.pdx');
        expect(code).toMatch(/return \{[^}]*contact[^}]*\}/);
    });
});

// ─── Signal rewrite in $effect and onMount ─────────────────────────

describe('integration — signal rewrite in callbacks', () => {
    it('effect-test.pdx: onMount rewrites signal assignments', () => {
        const { code } = compileDemo('effect-test.pdx');
        // onMount body: count = initial → __count.set(initial())
        // The ctx.track wrapper should contain rewritten signal assignments
        expect(code).toContain('__count.set(');
        // mountMsg = 'mounted...' → __mountMsg.set(...)
        expect(code).toContain('__mountMsg.set(');
    });

    it('effect-test.pdx: $effect rewrites signal reads', () => {
        const { code } = compileDemo('effect-test.pdx');
        // Inside $effect: count should be __count() and initial should be initial()
        // The effect body should have signal reads rewritten
        expect(code).toContain('__count()');
    });

    it('effect-test.pdx: prop reads in onMount rewritten with ()', () => {
        const { code } = compileDemo('effect-test.pdx');
        // initial is a prop — in onMount body, initial → initial()
        expect(code).toContain('initial()');
    });

    it('effect-test.pdx: compiles without warnings', () => {
        const { warnings } = compileDemo('effect-test.pdx');
        expect(warnings).toEqual([]);
    });
});

// ─── @store compilation ───────────────────────────────────────────

describe('integration — @store compilation', () => {
    it('task-store.pdx compiles as store module', () => {
        const { code } = compileDemo('task-store.pdx');
        expect(code).toContain("createGlobalStore('tasks'");
        expect(code).toContain("persist: 'local'");
        expect(code).toContain('useTasks');
        expect(code).not.toContain("component('pdx-");
    });

    it('task-store.pdx: signals are rewritten inside store factory', () => {
        const { code } = compileDemo('task-store.pdx');
        expect(code).toContain('__items.set(');
        expect(code).toContain('__filter');
    });

    it('task-store.pdx: auto-return includes all exports', () => {
        const { code } = compileDemo('task-store.pdx');
        expect(code).toMatch(/return \{[^}]*items/);
        expect(code).toMatch(/return \{[^}]*filtered/);
        expect(code).toMatch(/return \{[^}]*addTask/);
        expect(code).toMatch(/return \{[^}]*toggleTask/);
    });
});

// ─── @title/@meta compilation ─────────────────────────────────────

describe('integration — @title/@meta compilation', () => {
    it('head-test.pdx compiles with head management', () => {
        const { code } = compileDemo('head-test.pdx');
        expect(code).toContain('useHead({ title: "Products — TaskMgr" })');
    });

    it('head-test.pdx: @meta generates useHead call', () => {
        const { code } = compileDemo('head-test.pdx');
        expect(code).toContain('name: "description"');
        expect(code).toContain('property: "og:title"');
    });

    it('head-test.pdx: imports useHead from @pdxui/core', () => {
        const { code } = compileDemo('head-test.pdx');
        expect(code).toContain('useHead');
        expect(code).toContain("from '@pdxui/core'");
    });

    it('head-test.pdx: compiles without warnings', () => {
        const { warnings } = compileDemo('head-test.pdx');
        expect(warnings).toEqual([]);
    });
});

// ─── _404.pdx compilation ──────────────────────────────────────

describe('integration — _404.pdx compilation', () => {
    it('showcase/_404.pdx compiles successfully', () => {
        const { code } = compileDemo('showcase/_404.pdx');
        expect(code).toBeTruthy();
        // Tag includes parent dir for uniqueness: showcase/_404.pdx → pdx-showcase-404
        expect(code).toContain("component('pdx-showcase-404'");
    });

    it('showcase/_404.pdx: has code and path props', () => {
        const { code } = compileDemo('showcase/_404.pdx');
        expect(code).toContain('code');
        expect(code).toContain('path');
    });

    it('showcase/_404.pdx: registers as error page', () => {
        const { code } = compileDemo('showcase/_404.pdx');
        expect(code).toContain('__pdx_error_pages');
    });
});

// ─── Showcase with shared @store ──────────────────────────────────

describe('integration — showcase @store wiring', () => {
    it('showcase/task-store.pdx compiles as store module', () => {
        const { code } = compileDemo('showcase/task-store.pdx');
        expect(code).toContain("createGlobalStore('tasks'");
        expect(code).toContain("persist: 'local'");
        expect(code).toContain('useTasks');
        expect(code).not.toContain("component('pdx-");
    });

    it('showcase/task-store.pdx: has CRUD functions in auto-return', () => {
        const { code } = compileDemo('showcase/task-store.pdx');
        expect(code).toMatch(/return \{[^}]*addTask/);
        expect(code).toMatch(/return \{[^}]*toggleTask/);
        expect(code).toMatch(/return \{[^}]*removeTask/);
        expect(code).toMatch(/return \{[^}]*setFilter/);
        expect(code).toMatch(/return \{[^}]*filtered/);
        expect(code).toMatch(/return \{[^}]*stats/);
    });

    it('showcase/app-shell.pdx compiles with router imports', () => {
        const { code } = compileDemo('showcase/app-shell.pdx');
        expect(code).toContain("import { navigate, currentPath, onBeforeNavigate, onAfterNavigate }");
    });

    it('showcase/app-shell.pdx: has @meta tags', () => {
        const { code } = compileDemo('showcase/app-shell.pdx');
        expect(code).toContain('name: "description"');
    });

    it('showcase/app-shell.pdx: uses router-outlet (no manual pages())', () => {
        const { code } = compileDemo('showcase/app-shell.pdx');
        expect(code).toContain('pdx-router-outlet');
        expect(code).not.toContain('pages(');
    });

    it('showcase/dashboard-page.pdx compiles with @page and store', () => {
        const { code } = compileDemo('showcase/dashboard-page.pdx');
        expect(code).toContain("import { useTasks }");
        expect(code).toContain('useTasks()');
        expect(code).toContain('useHead({ title: "Dashboard');
    });

    it('components with @page are still reusable AND auto-register route', () => {
        // theme-picker has @page '/settings' but compiles as regular component
        const { code: picker } = compileDemo('showcase/theme-picker.pdx');
        expect(picker).toContain("component('pdx-theme-picker'");
        expect(picker).toContain('useHead({ title: "Settings');
        // Auto-route registration appended after component()
        expect(picker).toContain("__pdx_routes");
        expect(picker).toContain('path:"/settings"');
        expect(picker).toContain('tag:"pdx-theme-picker"');

        // task-form has @page '/create' but compiles as regular component
        const { code: form } = compileDemo('showcase/task-form.pdx');
        expect(form).toContain("component('pdx-task-form'");
        expect(form).toContain('useHead({ title: "New Task');
        expect(form).toContain('path:"/create"');
    });

    it('showcase/task-list.pdx: calls store methods in script body', () => {
        const { code } = compileDemo('showcase/task-list.pdx');
        expect(code).toContain('store.setFilter');
        expect(code).toContain('store.toggleTask');
        expect(code).toContain('store.removeTask');
    });

    it('showcase/task-form.pdx: calls store.addTask on submit', () => {
        const { code } = compileDemo('showcase/task-form.pdx');
        expect(code).toContain('store.addTask');
    });

    it('all showcase files compile without warnings', () => {
        const files = [
            'showcase/app-shell.pdx',
            'showcase/dashboard-page.pdx',
            'showcase/task-list.pdx',
            'showcase/task-form.pdx',
            'showcase/stats-card.pdx',
            'showcase/theme-picker.pdx',
            'showcase/_404.pdx',
            'showcase/_layout.pdx',
            'showcase/task-store.pdx',
        ];
        for (const name of files) {
            const { warnings } = compileDemo(name);
            expect(warnings, `${name} should have no warnings`).toEqual([]);
        }
    });
});

// ─── @page options ────────────────────────────────────────────────

describe('integration — @page options', () => {
    it('parses @page with keepAlive option', () => {
        const { code } = compile(`
<template><div>Page</div></template>
<script setup>
@page '/dashboard' { keepAlive };
</script>`, 'dashboard.pdx');
        expect(code).toContain("keepAlive:true");
    });

    it('parses @page with keepAlive timeout', () => {
        const { code } = compile(`
<template><div>Page</div></template>
<script setup>
@page '/dashboard' { keepAlive: 300000 };
</script>`, 'dashboard.pdx');
        expect(code).toContain("keepAlive:300000");
    });

    it('parses @page with preload', () => {
        const { code } = compile(`
<template><div>Page</div></template>
<script setup>
@page '/dashboard' { preload };
</script>`, 'dashboard.pdx');
        expect(code).toContain("preload:true");
        expect(code).not.toContain("lazy:true");
    });

    it('parses @page with prefetch option', () => {
        const { code } = compile(`
<template><div>Page</div></template>
<script setup>
@page '/products' { prefetch: 'hover' };
</script>`, 'products.pdx');
        expect(code).toContain('prefetch:"hover"');
    });

    it('parses @page with multiple options', () => {
        const { code } = compile(`
<template><div>Page</div></template>
<script setup>
@page '/admin' { keepAlive, prefetch: 'eager' };
</script>`, 'admin.pdx');
        expect(code).toContain("keepAlive:true");
        expect(code).toContain('prefetch:"eager"');
    });

    it('default @page has lazy:true, no keepAlive', () => {
        const { code } = compile(`
<template><div>Page</div></template>
<script setup>
@page '/products';
</script>`, 'products.pdx');
        expect(code).toContain("lazy:true");
        expect(code).not.toContain("keepAlive");
    });
});

// ─── Validator warnings ────────────────────────────────────────────

describe('integration — zero false-positive warnings', () => {
    it('all demos produce no warnings', () => {
        const demos = ['counter.pdx', 'todo-list.pdx', 'user-list.pdx', 'contact-form.pdx', 'color-card.pdx', 'paginated-list.pdx'];
        for (const name of demos) {
            const { warnings } = compileDemo(name);
            expect(warnings, `${name} should have no warnings`).toEqual([]);
        }
    });
});
