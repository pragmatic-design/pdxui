// `@try { maxRetries: n, … } { … } @catch (err, retry) { … }` (#1365): the options of core's
// errorBoundary, in a block right after `@try`, as `@await` takes its timing. Without them a component
// that needs a retry limit or an error callback wrote its boundary in the script.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { parseTemplate } from '../src/parser/template';

const SCRIPT = [
    '@prop maxRetries: number = 3;',
    '@prop autoRetry: boolean = false;',
    '@prop retryDelay: number = 1000;',
    'function failed(error: Error, count: number) { void error; void count; }',
    'function recovered() {}',
].join('\n');

function compiled(template: string, script = SCRIPT): string {
    const src = `<template>\n${template}\n</template>\n<script>\n${script}\n</script>\n`;
    return compile(src, 'try-options.pdx', [], undefined, { production: true }).code;
}

const CATCH = '@catch (err, retry) { <button @click="retry()">Retry</button> }';

describe('@try options', () => {
    it('the block after @try is errorBoundary\'s options, each value read as the block renders', () => {
        const code = compiled(`@try { maxRetries: maxRetries, autoRetry: autoRetry, retryDelay: retryDelay, onError: failed, onRecover: recovered } { <p>body</p> } ${CATCH}`);
        expect(code, code).toMatch(/errorBoundary\(\(\)=>\{.*\},\(err,retry\)=>\{.*\},\{maxRetries:ctx\.maxRetries\(\),autoRetry:ctx\.autoRetry\(\),retryDelay:ctx\.retryDelay\(\),onError:ctx\.failed,onRecover:ctx\.recovered\}\)/s);
    });

    it('a literal value, and only some of the keys', () => {
        const code = compiled(`@try { maxRetries: 2 } { <p>body</p> } ${CATCH}`);
        expect(code, code).toMatch(/errorBoundary\(.*,\{maxRetries:2\}\)/s);
    });

    it('with no options block, errorBoundary takes two arguments, as before', () => {
        const code = compiled(`@try { <p>body</p> } ${CATCH}`);
        expect(code).toMatch(/errorBoundary\(\(\)=>\{.*\},\(err,retry\)=>\{.*\}\);/s);
        expect(code).not.toMatch(/errorBoundary\(.*,\{max/s);
    });

    it('a body that reads like a key is still the body when no second block follows', () => {
        const [node] = parseTemplate(`@try { maxRetries: shown as text } ${CATCH}`);
        expect(node.type).toBe('try');
        expect(node.type === 'try' ? node.options : 'not a try').toBeUndefined();
    });

    it('an unknown key stops the compile at its line', () => {
        expect(() => parseTemplate(`<p>a</p>\n@try { maxRetry: 3 } { <p>body</p> } ${CATCH}`))
            .toThrow(/@try option 'maxRetry' at line 2.*maxRetries, autoRetry, retryDelay, onError, onRecover/s);
    });

    it('a key twice stops the compile', () => {
        expect(() => parseTemplate(`@try { maxRetries: 1, maxRetries: 2 } { <p>body</p> } ${CATCH}`))
            .toThrow(/@try option 'maxRetries' is given twice/);
    });

    it('a key with no value stops the compile', () => {
        expect(() => parseTemplate(`@try { maxRetries } { <p>body</p> } ${CATCH}`))
            .toThrow(/@try option 'maxRetries' at line 1 has no value/);
    });
});
