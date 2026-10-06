import { it } from 'vitest';
import { compile } from '../src/plugin';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const demoDir = resolve(__dirname, '../demo');

it('print compiled counter.pdx', () => {
    const source = readFileSync(resolve(demoDir, 'counter.pdx'), 'utf-8');
    const { code } = compile(source, 'counter.pdx');
    console.log('=== COMPILED counter.pdx ===');
    console.log(code);
    console.log('=== END ===');
});

it('print compiled todo-list.pdx', () => {
    const source = readFileSync(resolve(demoDir, 'todo-list.pdx'), 'utf-8');
    const { code } = compile(source, 'todo-list.pdx');
    console.log('=== COMPILED todo-list.pdx ===');
    console.log(code);
    console.log('=== END ===');
});
