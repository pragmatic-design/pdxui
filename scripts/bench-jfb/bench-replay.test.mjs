// node --test scripts/bench-jfb/bench-replay.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ratioOf, pooledSdLn, groupOf, replay } from './bench-replay.mjs';

test('ratioOf is PDX over vanillajs, and undefined when either is missing', () => {
    assert.equal(ratioOf({ pdx: { m: 3 }, vanillajs: { m: 2 } }, 'm'), 1.5);
    assert.equal(ratioOf({ pdx: { m: 3 } }, 'm'), undefined);
    assert.equal(ratioOf(undefined, 'm'), undefined);
});

test('pooledSdLn pools the spread within each group, not between them', () => {
    // Two groups at very different levels, each with the same spread: the pooled SD is that spread.
    const e = Math.E;
    const sd = pooledSdLn([[1, e], [100, 100 * e]]);
    // Each group: logs differ by 1, so the squares are 2 × 0.25 per group, 1 in all, over N − G = 2.
    assert.ok(Math.abs(sd - Math.sqrt(0.5)) < 1e-12, String(sd));
    // A group of one value adds nothing; no group of two is undefined.
    assert.ok(Math.abs(pooledSdLn([[1, e], [7]]) - Math.sqrt(0.5)) < 1e-12);
    assert.equal(pooledSdLn([[1], [2]]), undefined);
});

test('groupOf names an A/B round by its ref and a nightly by its commit', () => {
    assert.equal(groupOf('main-r3'), 'main');
    assert.equal(groupOf('mainws-r0'), 'mainws');
    assert.equal(groupOf('679b6de8-40838090544.json'), '679b6de8');
});

test('replay gives each statistic its own noise, and leaves out a run that did not record it', () => {
    const run = (group, sMed, bMed, sMean, bMean) => ({
        group,
        median: { pdx: { s: sMed }, vanillajs: { s: bMed } },
        mean: sMean === undefined ? undefined : { pdx: { s: sMean }, vanillajs: { s: bMean } },
    });
    const rows = replay([run('a', 2, 1, 2, 1), run('a', 4, 1, 2.2, 1), run('a', 3, 1)], ['s']);
    const median = rows.find((r) => r.stat === 'median');
    const mean = rows.find((r) => r.stat === 'mean');
    assert.equal(median.runs, 3);
    assert.equal(mean.runs, 2);
    assert.ok(mean.sd < median.sd);
});
