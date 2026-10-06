// Tests for responsive() CSS → clamp() compiler transform.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

describe('responsive() CSS transform', () => {
    it('transforms responsive(min, max) to clamp()', () => {
        const source = `
<template><div>hello</div></template>
<style scoped>
.container {
  padding: responsive(16px, 64px);
}
</style>`;

        const result = compile(source, 'test.pdx');
        // Should contain clamp() with default viewport range 320-1920 (delta=1600)
        expect(result.code).toContain('clamp(16px');
        expect(result.code).toContain('320px');
        expect(result.code).toContain('1600');  // 1920-320
        expect(result.code).not.toContain('responsive(');
    });

    it('transforms responsive(min, max, vMin, vMax) with custom range', () => {
        const source = `
<template><div>hello</div></template>
<style scoped>
h1 {
  font-size: responsive(14px, 18px, 480, 1200);
}
</style>`;

        const result = compile(source, 'test.pdx');
        expect(result.code).toContain('clamp(14px');
        expect(result.code).toContain('480px');
        expect(result.code).toContain('720');  // 1200-480
    });

    it('supports rem units', () => {
        const source = `
<template><div>hello</div></template>
<style scoped>
.text {
  font-size: responsive(1rem, 2rem);
}
</style>`;

        const result = compile(source, 'test.pdx');
        expect(result.code).toContain('clamp(1rem');
        expect(result.code).toContain('2rem)');
    });

    it('transforms multiple responsive() calls in same rule', () => {
        const source = `
<template><div>hello</div></template>
<style scoped>
.box {
  padding: responsive(8px, 32px);
  margin: responsive(4px, 16px);
}
</style>`;

        const result = compile(source, 'test.pdx');
        const clampCount = (result.code.match(/clamp\(/g) || []).length;
        expect(clampCount).toBe(2);
    });

    it('leaves non-responsive CSS untouched', () => {
        const source = `
<template><div>hello</div></template>
<style scoped>
.normal {
  padding: 16px;
  color: red;
}
</style>`;

        const result = compile(source, 'test.pdx');
        expect(result.code).toContain('padding: 16px');
        expect(result.code).toContain('color: red');
        expect(result.code).not.toContain('clamp(');
    });
});
